import { createHash } from 'crypto';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  loadDotenvSafely,
  readEnvVar,
  McpToolError,
  SessionNotAuthenticatedError,
  truncateErrorMessage,
  withAmbientCancellation,
} from '@chrischall/mcp-utils';
import { loadSession, saveSession } from './session-store.js';
import type { UploadFile } from './upload-source.js';

// Load .env for local dev; silently skip if dotenv is unavailable (e.g. the
// mcpb bundle, which externalizes dotenv). `override: false` means a
// host-provided env var always wins over .env. The try/catch additionally
// guards non-Node runtimes, where `import.meta.url`
// is undefined and `fileURLToPath(undefined)` would otherwise throw at module
// init (Worker startup validation) — there is no filesystem / .env there anyway.
try {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  await loadDotenvSafely({ path: join(__dirname, '..', '.env'), override: false });
} catch {
  /* v8 ignore next -- only reached in a non-Node runtime (Workers): no .env to load */
}

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
// missing session — these should trigger a token refresh + replay. FORBIDDEN
// is deliberately NOT here: it is a permission denial (a guest removing a
// user, a section whose host-edit permission is off), and refreshing cannot
// fix it — see PERMISSION_ERROR_CODES.
const AUTH_ERROR_CODES = new Set(['UNAUTHORIZED', 'UNAUTHENTICATED']);

// Codes for "you are signed in, but not allowed to do this".
const PERMISSION_ERROR_CODES = new Set(['FORBIDDEN']);

// Message fallback, consulted ONLY for an error that carries no code. Vibo's
// expired-session text is "Not authorized. Try to log in"; the patterns are
// anchored on session/token wording so an unrelated message that merely
// mentions "login" or "JWT" is not mistaken for an expired session.
const AUTH_MESSAGE_PATTERN =
  /not authoriz|unauthoriz|unauthenticated|invalid token|token (has )?expired|expired token|jwt (expired|malformed)|try to log ?in/i;
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
 *
 * Credentials can be INJECTED via the constructor (`new ViboClient({ email,
 * password })`) instead of read from the environment — a hosted per-user
 * deployment builds a client this way from each user's
 * stored email/password. Omitted fields fall back to the corresponding env var,
 * so the no-arg stdio construction is unchanged.
 */
export interface ViboClientOptions {
  email?: string;
  password?: string;
  accessToken?: string;
  refreshToken?: string;
  apiUrl?: string;
}

/**
 * The signal every Vibo request is made with: our timeout, and the caller's
 * cancellation if there is one (mcp-utils `cancel`).
 *
 * Until this, only the timeout could stop a request — a cancelled tool call
 * held it open for the full budget while the child burned the CPU mcp-host
 * meters it on. Measured on that fleet: claude.ai sent 101 cancellations in
 * the week to 2026-09-20.
 *
 * ONE definition for both request paths, which is not tidiness: the two are
 * the multipart upload and the plain query, they had the same seven lines
 * copied between them, and the next person to add a third path is the one
 * this saves. The `TimeoutError` checks at both call sites still name a real
 * timeout — an abort from the caller arrives as `AbortError` and falls
 * through to 'failed'.
 */
function requestSignal(): AbortSignal | undefined {
  return withAmbientCancellation(AbortSignal.timeout(REQUEST_TIMEOUT_MS));
}

/** Whether a GraphQL document is a mutation (a write with side effects). */
function isMutation(query: string): boolean {
  return /^\s*(?:#[^\n]*\n\s*)*mutation\b/.test(query);
}

/**
 * The error for a request that never produced a response (timeout, dropped
 * connection, caller abort). For a READ that is safely retryable. For a WRITE
 * the outcome is unknown — Vibo may already have committed it — and a blind
 * retry repeats the side effect (a second round of invitation emails, a
 * second exported playlist, a duplicate comment or import); the confirmation
 * gate cannot stop that, because a fresh preview earns a fresh approval and
 * token. So a write says so, and asks for a state check first.
 */
function transportError(what: string, err: unknown, isWrite: boolean): McpToolError {
  const reason = err instanceof Error && err.name === 'TimeoutError' ? 'timed out' : 'failed';
  if (isWrite) {
    return new McpToolError(
      `${what} ${SERVICE} ${reason} — the change may already have been applied (outcome is unknown).`,
      {
        hint:
          'Do not repeat this write blindly — check the current state before retrying: e.g. ' +
          'vibo_list_event_users after inviting, vibo_get_section_songs after adding, importing or commenting ' +
          'on songs, the Spotify/Apple Music account after an export. Retry only if the change is not there.',
        cause: err,
      },
    );
  }
  return new McpToolError(`${what} ${SERVICE} ${reason}.`, {
    hint: 'The Vibo API may be unreachable — check your connection and retry.',
    cause: err,
  });
}

/** One-way fingerprint of a configured token, so session.json never holds a
 *  second copy of the pasted secret just to record where a session came from. */
function tokenLineage(token: string): string {
  return createHash('sha256').update(token).digest('hex').slice(0, 32);
}

export class ViboClient {
  private readonly apiUrl: string;
  private readonly email: string | null;
  private readonly password: string | null;
  // Not readonly: cleared by setTokens() after a browser capture seeds a session.
  private configError: McpToolError | null = null;

  private accessToken: string | null;
  private refreshTokenValue: string | null;
  // Which configured token pair the current tokens descend from (see
  // ViboSession.lineage); stamped on every persisted rotation.
  private sessionLineage: string | null = null;

  // The constructor is PURE — it does no filesystem / homedir / async-I/O /
  // random op — so it is safe to run at Worker global scope (where the
  // module-level `export const client` singleton below is constructed). The
  // saved-session fallback and the config-error determination both touch
  // homedir()/the filesystem via loadSession(), so they are deferred to the
  // first request through `ensureConfigResolved()`. No effect on the stdio path.
  private configResolved = false;

  // Single-flight guards so concurrent tool calls never race two logins /
  // refreshes against each other (à la mcp-utils' TokenManager).
  private loginInFlight: Promise<string> | null = null;
  private reauthInFlight: Promise<string> | null = null;

  constructor(opts: ViboClientOptions = {}) {
    this.apiUrl = opts.apiUrl ?? readEnvVar('VIBO_API_URL') ?? DEFAULT_API_URL;
    this.email = opts.email ?? readEnvVar('VIBO_EMAIL') ?? null;
    this.password = opts.password ?? readEnvVar('VIBO_PASSWORD') ?? null;
    this.accessToken = opts.accessToken ?? readEnvVar('VIBO_ACCESS_TOKEN') ?? null;
    this.refreshTokenValue = opts.refreshToken ?? readEnvVar('VIBO_REFRESH_TOKEN') ?? null;
  }

  /**
   * Resolve the saved-session fallback and the deferred config error on first
   * use. Kept out of the constructor so construction is pure (Worker-safe):
   * `loadSession()` reads homedir()/the filesystem, which a sandboxed runtime
   * forbids at global scope. Runs its body at most once.
   */
  private ensureConfigResolved(): void {
    if (this.configResolved) return;
    this.configResolved = true;

    const haveLogin = Boolean(this.email && this.password);

    // Fall back to a previously browser-captured session (SSO accounts) ONLY
    // when there's no env/injected token AND no email/password. Email/password
    // is the documented preferred path and must win over a (possibly stale)
    // saved session — otherwise an old session.json would silently shadow it.
    if (!this.accessToken && !haveLogin) {
      const saved = loadSession();
      if (saved) {
        this.accessToken = saved.accessToken;
        this.refreshTokenValue = saved.refreshToken;
        this.sessionLineage = saved.lineage ?? null;
      }
    } else if (this.accessToken && !haveLogin) {
      // A configured (pasted) token pair. Vibo rotates the refresh token on
      // every refresh, so after the first refresh the pasted pair is dead and
      // only the persisted rotated pair works. Resume from it when it descends
      // from THIS configured pair; a newly pasted pair (different lineage) or a
      // browser capture (no lineage) never shadows the configured tokens.
      const lineage = tokenLineage(this.refreshTokenValue ?? this.accessToken);
      this.sessionLineage = lineage;
      const saved = loadSession();
      if (saved?.lineage === lineage) {
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
    }
  }

  /**
   * Adopt a browser-captured token pair (from vibo_capture_session) for
   * subsequent calls in this process and clear the config error so an account
   * that started with no credentials becomes usable. Does NOT persist — the
   * caller persists only after verifying the token authenticates (GET_ME).
   */
  setTokens(accessToken: string, refreshToken: string | null): void {
    this.accessToken = accessToken;
    this.refreshTokenValue = refreshToken;
    this.sessionLineage = null; // a browser capture descends from no configured pair
    this.configError = null;
  }

  /** True when operating purely from a token (no email/password) — refreshed
   *  tokens should be persisted so they survive a restart. */
  private get tokenOnlyMode(): boolean {
    return !this.email || !this.password;
  }

  /** Run a GraphQL operation, transparently authenticating + retrying once on token expiry. */
  async gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    this.ensureConfigResolved();
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
   * using the graphql-multipart-request spec. `files` maps a dotted variable
   * path (e.g. "variables.photo" or "variables.payload.answer.images.0") to an
   * in-memory {@link UploadFile} (blob + filename); `variables` must carry
   * `null` at each of those positions. The bytes arrive already resolved (from
   * a local file, or inline base64 when the caller has no filesystem to name —
   * see src/upload-source.ts), so this method never touches the filesystem
   * itself. Same auth + single-retry-on-expiry behavior as `gql`.
   */
  async gqlUpload<T>(
    query: string,
    variables: Record<string, unknown>,
    files: Record<string, UploadFile>,
  ): Promise<T> {
    this.ensureConfigResolved();
    if (this.configError) throw this.configError;

    const token = await this.ensureAccessToken();
    let res = await this.postMultipart<T>(query, variables, files, token);

    if (this.isAuthError(res.status, res.body.errors)) {
      const fresh = await this.reauthenticate();
      res = await this.postMultipart<T>(query, variables, files, fresh);
    }

    return this.unwrap(res.status, res.body);
  }

  private async postMultipart<T>(
    query: string,
    variables: Record<string, unknown>,
    files: Record<string, UploadFile>,
    token: string | null,
  ): Promise<{ status: number; body: GraphQLResponse<T> }> {
    const form = new FormData();
    form.append('operations', JSON.stringify({ query, variables }));

    // map: { "0": ["variables.photo"], "1": ["variables.payload.answer.images.0"] }
    const paths = Object.keys(files);
    const map: Record<string, string[]> = {};
    paths.forEach((varPath, i) => {
      map[String(i)] = [varPath];
    });
    form.append('map', JSON.stringify(map));

    for (let i = 0; i < paths.length; i++) {
      const file = files[paths[i]];
      form.append(String(i), file.blob, file.filename);
    }

    const headers: Record<string, string> = { 'apollo-require-preflight': 'true' };
    if (token) headers['x-token'] = token;

    let response: Response;
    try {
      response = await fetch(this.apiUrl, {
        method: 'POST',
        headers, // NB: no content-type — fetch sets the multipart boundary
        body: form,
        signal: requestSignal(),
      });
    } catch (err) {
      // An upload is always a write (the multipart path only carries mutations).
      throw transportError('Upload to', err, true);
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
                saveSession({
                  accessToken: this.accessToken,
                  refreshToken: this.refreshTokenValue,
                  ...(this.sessionLineage ? { lineage: this.sessionLineage } : {}),
                });
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
        signal: requestSignal(),
      });
    } catch (err) {
      // signIn / refreshToken are mutations too, but repeating them is harmless.
      const isWrite = query !== SIGN_IN && query !== REFRESH && isMutation(query);
      throw transportError('Request to', err, isWrite);
    }

    let body: GraphQLResponse<T>;
    try {
      body = (await response.json()) as GraphQLResponse<T>;
    } catch {
      body = {};
    }
    return { status: response.status, body };
  }

  /** An expired / missing session — the only case a refresh + replay can fix. */
  private isAuthError(status: number, errors?: GraphQLError[]): boolean {
    if (status === 401) return true;
    if (!errors?.length) return false;
    return errors.some((e) => {
      const code = e.code ?? e.extensions?.code;
      if (code) return AUTH_ERROR_CODES.has(code);
      return AUTH_MESSAGE_PATTERN.test(e.message ?? '');
    });
  }

  /** Signed in, but not allowed to do this (HTTP 403 / FORBIDDEN). */
  private isPermissionError(status: number, errors?: GraphQLError[]): boolean {
    if (status === 403) return true;
    return (errors ?? []).some((e) => PERMISSION_ERROR_CODES.has(e.code ?? e.extensions?.code ?? ''));
  }

  private unwrap<T>(status: number, body: GraphQLResponse<T>): T {
    if (this.isPermissionError(status, body.errors)) {
      const detail = body.errors?.map((e) => e.message).filter(Boolean).join('; ');
      throw new McpToolError(
        `You don't have permission to do this in this ${SERVICE} event${detail ? `: ${truncateErrorMessage(detail)}` : '.'}`,
        {
          hint:
            'This is a permission denial, not an expired session — signing in again will not help. ' +
            'Your role in the event (e.g. guest vs. host) or the DJ\'s section settings do not allow this change; ' +
            'ask the event host or DJ.',
        },
      );
    }
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
