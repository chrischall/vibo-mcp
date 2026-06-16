import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ViboClient } from '../src/client.js';
import { GET_ME } from '../src/gql.js';

type RouterResult = { status?: number; data?: unknown; errors?: unknown };
interface Call {
  query: string;
  variables: Record<string, unknown>;
  token: string | undefined;
}

function installFetch(router: (call: Call) => RouterResult): Call[] {
  const calls: Call[] = [];
  global.fetch = vi.fn(async (_url: unknown, init: { headers: Record<string, string>; body: string }) => {
    const body = JSON.parse(init.body) as { query: string; variables: Record<string, unknown> };
    const call: Call = { query: body.query, variables: body.variables, token: init.headers['x-token'] };
    calls.push(call);
    const r = router(call);
    return {
      status: r.status ?? 200,
      json: async () => ({ data: r.data, errors: r.errors }),
    } as unknown as Response;
  }) as unknown as typeof fetch;
  return calls;
}

const ENV_KEYS = ['VIBO_EMAIL', 'VIBO_PASSWORD', 'VIBO_ACCESS_TOKEN', 'VIBO_REFRESH_TOKEN', 'VIBO_API_URL', 'VIBO_SESSION_FILE'];
function clearEnv() {
  for (const k of ENV_KEYS) delete process.env[k];
}

const isOp = (q: string, name: string) => q.includes(name);

// Point the session store at a fresh empty dir each test so the client never
// picks up a real ~/.vibo-mcp/session.json.
let sessionDir: string;
beforeEach(() => {
  clearEnv();
  sessionDir = mkdtempSync(join(tmpdir(), 'vibo-client-'));
  process.env.VIBO_SESSION_FILE = join(sessionDir, 'session.json');
});
afterEach(() => {
  vi.restoreAllMocks();
  rmSync(sessionDir, { recursive: true, force: true });
  clearEnv();
});

describe('ViboClient auth lifecycle', () => {
  it('throws a deferred config error (no network) when no credentials are set', async () => {
    const calls = installFetch(() => ({ data: {} }));
    const client = new ViboClient();
    await expect(client.gql(GET_ME)).rejects.toThrow(/credentials are not configured/i);
    expect(calls).toHaveLength(0);
  });

  it('logs in with email/password and attaches the access token as x-token', async () => {
    process.env.VIBO_EMAIL = 'a@b.com';
    process.env.VIBO_PASSWORD = 'pw';
    const calls = installFetch(({ query, token }) => {
      if (isOp(query, 'mutation signIn')) return { data: { signIn: { accessToken: 'AT', refreshToken: 'RT' } } };
      if (token === 'AT') return { data: { me: { _id: 'u1' } } };
      return { errors: [{ message: 'no token' }] };
    });

    const client = new ViboClient();
    const data = await client.gql<{ me: { _id: string } }>(GET_ME);

    expect(data.me._id).toBe('u1');
    expect(calls).toHaveLength(2);
    expect(isOp(calls[0].query, 'signIn')).toBe(true);
    expect(calls[0].token).toBeUndefined(); // login carries no auth header
    expect(calls[1].token).toBe('AT');
  });

  it('reuses the access token across calls (logs in only once)', async () => {
    process.env.VIBO_EMAIL = 'a@b.com';
    process.env.VIBO_PASSWORD = 'pw';
    const calls = installFetch(({ query }) => {
      if (isOp(query, 'mutation signIn')) return { data: { signIn: { accessToken: 'AT', refreshToken: 'RT' } } };
      return { data: { me: { _id: 'u1' } } };
    });
    const client = new ViboClient();
    await client.gql(GET_ME);
    await client.gql(GET_ME);
    expect(calls.filter((c) => isOp(c.query, 'mutation signIn'))).toHaveLength(1);
  });

  it('refreshes an expired token and replays the request once', async () => {
    process.env.VIBO_ACCESS_TOKEN = 'AT0';
    process.env.VIBO_REFRESH_TOKEN = 'RT0';
    const calls = installFetch(({ query, token }) => {
      if (isOp(query, 'mutation refreshToken')) return { data: { refreshToken: { accessToken: 'AT2', refreshToken: 'RT2' } } };
      if (isOp(query, 'query getMe')) {
        if (token === 'AT0') return { errors: [{ code: 'UNAUTHORIZED', message: 'Not authorized. Try to log in' }] };
        if (token === 'AT2') return { data: { me: { _id: 'u1' } } };
      }
      return { errors: [{ message: 'unexpected' }] };
    });

    const client = new ViboClient();
    const data = await client.gql<{ me: { _id: string } }>(GET_ME);

    expect(data.me._id).toBe('u1');
    const ops = calls.map((c) => (isOp(c.query, 'query getMe') ? `me(${c.token})` : 'refresh'));
    expect(ops).toEqual(['me(AT0)', 'refresh', 'me(AT2)']);
  });

  it('falls back to a fresh login when the refresh token is rejected', async () => {
    process.env.VIBO_EMAIL = 'a@b.com';
    process.env.VIBO_PASSWORD = 'pw';
    process.env.VIBO_ACCESS_TOKEN = 'AT0';
    process.env.VIBO_REFRESH_TOKEN = 'RT0';
    const calls = installFetch(({ query, token }) => {
      if (isOp(query, 'mutation refreshToken')) return { errors: [{ code: 'UNAUTHORIZED', message: 'Not authorized. Try to log in' }] };
      if (isOp(query, 'mutation signIn')) return { data: { signIn: { accessToken: 'AT9', refreshToken: 'RT9' } } };
      if (isOp(query, 'query getMe')) {
        if (token === 'AT9') return { data: { me: { _id: 'u9' } } };
        return { errors: [{ code: 'UNAUTHORIZED', message: 'Not authorized. Try to log in' }] };
      }
      return { errors: [{ message: 'unexpected' }] };
    });

    const client = new ViboClient();
    const data = await client.gql<{ me: { _id: string } }>(GET_ME);
    expect(data.me._id).toBe('u9');
    expect(calls.some((c) => isOp(c.query, 'mutation signIn'))).toBe(true);
  });

  it('surfaces a non-auth GraphQL error without retrying', async () => {
    process.env.VIBO_ACCESS_TOKEN = 'AT0';
    const calls = installFetch(() => ({ errors: [{ message: 'Section is locked' }] }));
    const client = new ViboClient();
    await expect(client.gql(GET_ME)).rejects.toThrow(/Section is locked/);
    expect(calls).toHaveLength(1); // no retry on a non-auth error
  });

  it('loads a persisted browser-captured session when no env credentials', async () => {
    writeFileSync(process.env.VIBO_SESSION_FILE as string, JSON.stringify({ accessToken: 'SAVED', refreshToken: 'SR' }));
    const calls = installFetch(({ token }) =>
      token === 'SAVED' ? { data: { me: { _id: 'u1' } } } : { errors: [{ code: 'UNAUTHORIZED' }] },
    );
    const client = new ViboClient();
    const data = await client.gql<{ me: { _id: string } }>(GET_ME);
    expect(data.me._id).toBe('u1');
    // used the saved token directly — no signIn needed
    expect(calls).toHaveLength(1);
    expect(calls[0].token).toBe('SAVED');
  });

  it('setTokens adopts a captured pair, clears the config error, and persists it', async () => {
    const calls = installFetch(({ token }) =>
      token === 'CAP' ? { data: { me: { _id: 'u2' } } } : { errors: [{ code: 'UNAUTHORIZED' }] },
    );
    const client = new ViboClient(); // no creds → config error
    await expect(client.gql(GET_ME)).rejects.toThrow(/credentials are not configured/i);
    expect(calls).toHaveLength(0);

    client.setTokens('CAP', 'CR');
    const data = await client.gql<{ me: { _id: string } }>(GET_ME);
    expect(data.me._id).toBe('u2');

    // setTokens persisted the pair, so a fresh client picks it up with no creds.
    const fresh = await new ViboClient().gql<{ me: { _id: string } }>(GET_ME);
    expect(fresh.me._id).toBe('u2');
  });

  it('only logs in once under concurrent calls (single-flight)', async () => {
    process.env.VIBO_EMAIL = 'a@b.com';
    process.env.VIBO_PASSWORD = 'pw';
    const calls = installFetch(({ query }) => {
      if (isOp(query, 'mutation signIn')) return { data: { signIn: { accessToken: 'AT', refreshToken: 'RT' } } };
      return { data: { me: { _id: 'u1' } } };
    });
    const client = new ViboClient();
    await Promise.all([client.gql(GET_ME), client.gql(GET_ME), client.gql(GET_ME)]);
    expect(calls.filter((c) => isOp(c.query, 'mutation signIn'))).toHaveLength(1);
  });
});
