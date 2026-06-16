import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  loadDotenvSafely,
  readEnvVar,
  McpToolError,
  SessionNotAuthenticatedError,
  truncateErrorMessage,
} from '@chrischall/mcp-utils';
import { loadSession, saveSession } from './session-store.js';

// Load .env for local dev; silently skip if dotenv is unavailable (e.g. the
// mcpb bundle, which externalizes dotenv). `override: false` means a
// host-provided env var always wins over .env.
const __dirname = dirname(fileURLToPath(import.meta.url));
await loadDotenvSafely({ path: join(__dirname, '..', '.env'), override: false });

const DEFAULT_API_URL = 'https://api.vibodj.com/v2/graphql';
const SERVICE = 'Vibo';
const SIGN_IN_HOST = 'https://web.vibodj.com';
const REQUEST_TIMEOUT_MS = 30_000;

/** `signIn` exchanges email + password for an access/refresh token pair. */
const SIGN_IN = `
  mutation signIn($email: String!, $password: String!) {
    signIn(email: $email, password: $password) {
      accessToken
      refreshToken
    }
  }
`;

/** `refreshToken` mints a fresh access token from a still-valid refresh token. */
const REFRESH = `
  mutation refreshToken($refreshToken: String!) {
    refreshToken(refreshToken: $refreshToken) {
      accessToken
      refreshToken
    }
  }
`;

interface GraphQLError {
  message?: string;
  // Vibo puts the error code at the top level (e.g. "UNAUTHORIZED"); some
  // GraphQL servers nest it under extensions, so check both.
  code?: string;
  extensions?: { code?: string };
}

// Error codes Vibo (and conventional GraphQL servers) use for an expired /
// missing session — these should trigger a token refresh + replay.
const AUTH_ERROR_CODES = new Set(['UNAUTHORIZED', 'UNAUTHENTICATED', 'FORBIDDEN']);
interface GraphQLResponse<T> {
  data?: T;
  errors?: GraphQLError[];
}

/**
 * Thin GraphQL client for the Vibo consumer API.
 *
 * Vibo authenticates with custom `x-token` / `x-refresh-token` headers (not
 * `Authorization: Bearer`), so this is a hand-written client rather than
 * `createApiClient`. Two credential paths are supported:
 *
 *   - VIBO_EMAIL + VIBO_PASSWORD  → server-side `signIn` mutation (preferred)
 *   - VIBO_ACCESS_TOKEN [+ VIBO_REFRESH_TOKEN] → use a captured token directly
 *     (for accounts that only sign in via Apple/Google/Facebook SSO)
 *
 * The config error is deferred: the constructor never throws, so the server
 * still boots and answers the host's install-time `tools/list` probe when no
 * credentials are set. The error surfaces on the first tool call.
 */
export class ViboClient {
  private readonly apiUrl: string;
  private readonly email: string | null;
  private readonly password: string | null;
  // Not readonly: cleared by setTokens() after a browser capture seeds a session.
  private configError: McpToolError | null;

  private accessToken: string | null;
  private refreshTokenValue: string | null;

  // Single-flight guards so concurrent tool calls never race two logins /
  // refreshes against each other (à la mcp-utils' TokenManager).
  private loginInFlight: Promise<string> | null = null;
  private reauthInFlight: Promise<string> | null = null;

  constructor() {
    this.apiUrl = readEnvVar('VIBO_API_URL') ?? DEFAULT_API_URL;

    const email = readEnvVar('VIBO_EMAIL');
    const password = readEnvVar('VIBO_PASSWORD');
    const accessToken = readEnvVar('VIBO_ACCESS_TOKEN');
    const refreshToken = readEnvVar('VIBO_REFRESH_TOKEN');

    this.email = email ?? null;
    this.password = password ?? null;
    this.accessToken = accessToken ?? null;
    this.refreshTokenValue = refreshToken ?? null;

    const haveLogin = Boolean(email && password);

    // Fall back to a previously browser-captured session (SSO accounts) ONLY
    // when there's no env token AND no email/password. Email/password is the
    // documented preferred path and must win over a (possibly stale) saved
    // session — otherwise an old session.json would silently shadow it.
    if (!this.accessToken && !haveLogin) {
      const saved = loadSession();
      if (saved) {
        this.accessToken = saved.accessToken;
        this.refreshTokenValue = saved.refreshToken;
      }
    }
    const haveToken = Boolean(this.accessToken);
    if (!haveLogin && !haveToken) {
      this.configError = new McpToolError(
        'Vibo credentials are not configured.',
        {
          hint:
            'Set VIBO_EMAIL and VIBO_PASSWORD (recommended); paste a captured ' +
            'VIBO_ACCESS_TOKEN (+ VIBO_REFRESH_TOKEN); or run vibo_capture_session to grab the ' +
            'token from your signed-in web.vibodj.com browser tab (Apple/Google/Facebook accounts).',
        },
      );
    } else {
      this.configError = null;
    }
  }

  /**
   * Adopt a browser-captured token pair (from vibo_capture_session): use it for
   * subsequent calls in this process, persist it, and clear the config error so
   * an account that started with no credentials becomes usable.
   */
  setTokens(accessToken: string, refreshToken: string | null): void {
    this.accessToken = accessToken;
    this.refreshTokenValue = refreshToken;
    this.configError = null;
    saveSession({ accessToken, refreshToken });
  }

  /** True when operating purely from a token (no email/password) — refreshed
   *  tokens should be persisted so they survive a restart. */
  private get tokenOnlyMode(): boolean {
    return !this.email || !this.password;
  }

  /** Run a GraphQL operation, transparently authenticating + retrying once on token expiry. */
  async gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    if (this.configError) throw this.configError;

    const token = await this.ensureAccessToken();
    let res = await this.post<T>(query, variables, token);

    if (this.isAuthError(res.status, res.body.errors)) {
      // Token expired/invalid — re-authenticate once and replay exactly once.
      const fresh = await this.reauthenticate();
      res = await this.post<T>(query, variables, fresh);
    }

    return this.unwrap(res.status, res.body);
  }

  /**
   * Run a GraphQL operation that uploads one or more files (the `Upload` scalar),
   * using the graphql-multipart-request spec. `fileMap` maps a dotted variable
   * path (e.g. "variables.photo" or "variables.payload.answer.images.0") to a
   * local file path; `variables` must carry `null` at each of those positions.
   * Same auth + single-retry-on-expiry behavior as `gql`.
   */
  async gqlUpload<T>(
    query: string,
    variables: Record<string, unknown>,
    fileMap: Record<string, string>,
  ): Promise<T> {
    if (this.configError) throw this.configError;

    const token = await this.ensureAccessToken();
    let res = await this.postMultipart<T>(query, variables, fileMap, token);

    if (this.isAuthError(res.status, res.body.errors)) {
      const fresh = await this.reauthenticate();
      res = await this.postMultipart<T>(query, variables, fileMap, fresh);
    }

    return this.unwrap(res.status, res.body);
  }

  private async postMultipart<T>(
    query: string,
    variables: Record<string, unknown>,
    fileMap: Record<string, string>,
    token: string | null,
  ): Promise<{ status: number; body: GraphQLResponse<T> }> {
    const { openAsBlob } = await import('node:fs');
    const { basename } = await import('node:path');

    const form = new FormData();
    form.append('operations', JSON.stringify({ query, variables }));

    // map: { "0": ["variables.photo"], "1": ["variables.payload.answer.images.0"] }
    const paths = Object.keys(fileMap);
    const map: Record<string, string[]> = {};
    paths.forEach((varPath, i) => {
      map[String(i)] = [varPath];
    });
    form.append('map', JSON.stringify(map));

    for (let i = 0; i < paths.length; i++) {
      const filePath = fileMap[paths[i]];
      let blob: Blob;
      try {
        blob = await openAsBlob(filePath);
      } catch (err) {
        throw new McpToolError(`Could not read file for upload: ${filePath}`, {
          hint: 'Provide an absolute path to a readable local file.',
          cause: err,
        });
      }
      form.append(String(i), blob, basename(filePath));
    }

    const headers: Record<string, string> = { 'apollo-require-preflight': 'true' };
    if (token) headers['x-token'] = token;

    let response: Response;
    try {
      response = await fetch(this.apiUrl, {
        method: 'POST',
        headers, // NB: no content-type — fetch sets the multipart boundary
        body: form,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      const reason = err instanceof Error && err.name === 'TimeoutError' ? 'timed out' : 'failed';
      throw new McpToolError(`Upload to ${SERVICE} ${reason}.`, {
        hint: 'The Vibo API may be unreachable — check your connection and retry.',
        cause: err,
      });
    }

    let body: GraphQLResponse<T>;
    try {
      body = (await response.json()) as GraphQLResponse<T>;
    } catch {
      body = {};
    }
    return { status: response.status, body };
  }

  /** Returns the current access token, performing a first login if we only have email/password. */
  private async ensureAccessToken(): Promise<string> {
    if (this.accessToken) return this.accessToken;
    return this.login();
  }

  /** Single-flight email/password login. */
  private login(): Promise<string> {
    if (this.loginInFlight) return this.loginInFlight;
    if (!this.email || !this.password) {
      // Only a (now-rejected) token was supplied and there's nothing to log in with.
      throw new SessionNotAuthenticatedError(SERVICE, SIGN_IN_HOST);
    }
    this.loginInFlight = (async () => {
      const res = await this.post<{ signIn: { accessToken: string; refreshToken: string } }>(
        SIGN_IN,
        { email: this.email, password: this.password },
        null,
      );
      const data = this.unwrap(res.status, res.body);
      if (!data.signIn?.accessToken) {
        throw new SessionNotAuthenticatedError(SERVICE, SIGN_IN_HOST);
      }
      this.accessToken = data.signIn.accessToken;
      this.refreshTokenValue = data.signIn.refreshToken;
      return this.accessToken;
    })().finally(() => {
      this.loginInFlight = null;
    });
    return this.loginInFlight;
  }

  /** Single-flight re-auth: try a refresh-token grant first, fall back to a fresh login. */
  private reauthenticate(): Promise<string> {
    if (this.reauthInFlight) return this.reauthInFlight;
    this.reauthInFlight = (async () => {
      if (this.refreshTokenValue) {
        try {
          const res = await this.post<{ refreshToken: { accessToken: string; refreshToken: string } }>(
            REFRESH,
            { refreshToken: this.refreshTokenValue },
            null,
          );
          if (!this.isAuthError(res.status, res.body.errors)) {
            const data = this.unwrap(res.status, res.body);
            if (data.refreshToken?.accessToken) {
              this.accessToken = data.refreshToken.accessToken;
              this.refreshTokenValue = data.refreshToken.refreshToken;
              // Persist the rotated pair so a captured/pasted session survives
              // a restart (no email/password to re-login with).
              if (this.tokenOnlyMode) {
                saveSession({ accessToken: this.accessToken, refreshToken: this.refreshTokenValue });
              }
              return this.accessToken;
            }
          }
        } catch {
          // fall through to a full login
        }
      }
      if (this.email && this.password) {
        this.accessToken = null;
        return this.login();
      }
      throw new SessionNotAuthenticatedError(SERVICE, SIGN_IN_HOST);
    })().finally(() => {
      this.reauthInFlight = null;
    });
    return this.reauthInFlight;
  }

  private async post<T>(
    query: string,
    variables: Record<string, unknown>,
    token: string | null,
  ): Promise<{ status: number; body: GraphQLResponse<T> }> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (token) headers['x-token'] = token;

    let response: Response;
    try {
      response = await fetch(this.apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      const reason = err instanceof Error && err.name === 'TimeoutError' ? 'timed out' : 'failed';
      throw new McpToolError(`Request to ${SERVICE} ${reason}.`, {
        hint: 'The Vibo API may be unreachable — check your connection and retry.',
        cause: err,
      });
    }

    let body: GraphQLResponse<T>;
    try {
      body = (await response.json()) as GraphQLResponse<T>;
    } catch {
      body = {};
    }
    return { status: response.status, body };
  }

  private isAuthError(status: number, errors?: GraphQLError[]): boolean {
    if (status === 401 || status === 403) return true;
    if (!errors?.length) return false;
    return errors.some((e) => {
      const code = e.code ?? e.extensions?.code ?? '';
      if (AUTH_ERROR_CODES.has(code)) return true;
      // Message fallback for servers that omit a code. Vibo's text is
      // "Not authorized. Try to log in".
      return /not authoriz|unauthor|unauthenticated|invalid token|token expired|expired token|jwt|log ?in/i.test(
        e.message ?? '',
      );
    });
  }

  private unwrap<T>(status: number, body: GraphQLResponse<T>): T {
    if (body.errors?.length) {
      if (this.isAuthError(status, body.errors)) {
        throw new SessionNotAuthenticatedError(SERVICE, SIGN_IN_HOST);
      }
      const message = body.errors.map((e) => e.message ?? 'Unknown error').join('; ');
      throw new McpToolError(`${SERVICE} API error: ${truncateErrorMessage(message)}`);
    }
    if (status >= 400) {
      throw new McpToolError(`${SERVICE} API returned HTTP ${status}.`);
    }
    if (body.data === undefined) {
      throw new McpToolError(`${SERVICE} API returned an empty response.`);
    }
    return body.data;
  }
}

/**
 * Module-level singleton shared by every tool module. Constructed here (not in
 * index.ts) so the deferred-config-error pattern holds: the server boots and
 * answers the install-time tools/list probe even when credentials are absent.
 */
export const client = new ViboClient();
