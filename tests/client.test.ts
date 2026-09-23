import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { withCallSignal } from '@chrischall/mcp-utils';
import { ViboClient } from '../src/client.js';
import { saveSession } from '../src/session-store.js';
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

  it('treats a FORBIDDEN mutation as a permission denial: no refresh, no replay, no sign-in advice', async () => {
    process.env.VIBO_ACCESS_TOKEN = 'AT0';
    process.env.VIBO_REFRESH_TOKEN = 'RT0';
    const calls = installFetch(({ query }) => {
      if (isOp(query, 'mutation refreshToken')) return { data: { refreshToken: { accessToken: 'AT2', refreshToken: 'RT2' } } };
      return { errors: [{ code: 'FORBIDDEN', message: 'You do not have permission to remove users' }] };
    });
    const client = new ViboClient();
    const err = await client.gql('mutation removeUser { removeUser }').catch((e: unknown) => e as Error);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toMatch(/permission/i);
    expect(err.message).not.toMatch(/sign in|not signed in|log in/i);
    expect(calls).toHaveLength(1); // no refresh-token grant, no replay
  });

  it('treats an HTTP 403 as a permission denial, not an expired session', async () => {
    process.env.VIBO_ACCESS_TOKEN = 'AT0';
    process.env.VIBO_REFRESH_TOKEN = 'RT0';
    const calls = installFetch(() => ({ status: 403 }));
    const client = new ViboClient();
    await expect(client.gql('mutation updateSection { x }')).rejects.toThrow(/permission/i);
    expect(calls).toHaveLength(1);
  });

  it('does not treat an unrelated error mentioning "login" as an expired session', async () => {
    process.env.VIBO_ACCESS_TOKEN = 'AT0';
    process.env.VIBO_REFRESH_TOKEN = 'RT0';
    const calls = installFetch(() => ({ errors: [{ code: 'BAD_USER_INPUT', message: 'Invalid login email for invitee' }] }));
    const client = new ViboClient();
    await expect(client.gql('mutation inviteUsers { x }')).rejects.toThrow(/Invalid login email/);
    expect(calls).toHaveLength(1);
  });

  it('loads a persisted browser-captured session when no env credentials', async () => {
    saveSession({ accessToken: 'SAVED', refreshToken: 'SR' });
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

  it('ignores a saved session when email/password are set (preferred path wins)', async () => {
    // A stale capture exists on disk...
    saveSession({ accessToken: 'STALE', refreshToken: 'SR' });
    process.env.VIBO_EMAIL = 'a@b.com';
    process.env.VIBO_PASSWORD = 'pw';
    const calls = installFetch(({ query, token }) => {
      if (isOp(query, 'mutation signIn')) return { data: { signIn: { accessToken: 'FRESH', refreshToken: 'FR' } } };
      if (token === 'FRESH') return { data: { me: { _id: 'u1' } } };
      return { errors: [{ code: 'UNAUTHORIZED' }] };
    });
    const client = new ViboClient();
    const data = await client.gql<{ me: { _id: string } }>(GET_ME);
    expect(data.me._id).toBe('u1');
    // logged in fresh; never sent the STALE saved token
    expect(calls.some((c) => isOp(c.query, 'mutation signIn'))).toBe(true);
    expect(calls.every((c) => c.token !== 'STALE')).toBe(true);
  });

  it('an env-token session resumes from the rotated pair after a restart', async () => {
    process.env.VIBO_ACCESS_TOKEN = 'AT0';
    process.env.VIBO_REFRESH_TOKEN = 'RT0';
    // Vibo rotates on refresh: RT0 is single-use, and AT0 is expired.
    let rt0Used = false;
    const calls = installFetch(({ query, variables, token }) => {
      if (isOp(query, 'mutation refreshToken')) {
        if (variables.refreshToken === 'RT0' && !rt0Used) {
          rt0Used = true;
          return { data: { refreshToken: { accessToken: 'AT2', refreshToken: 'RT2' } } };
        }
        return { errors: [{ code: 'UNAUTHORIZED', message: 'Not authorized. Try to log in' }] };
      }
      if (token === 'AT2') return { data: { me: { _id: 'u1' } } };
      return { errors: [{ code: 'UNAUTHORIZED', message: 'Not authorized. Try to log in' }] };
    });

    await new ViboClient().gql(GET_ME); // refreshes AT0/RT0 -> AT2/RT2

    // Restart: same env, fresh process.
    calls.length = 0;
    const data = await new ViboClient().gql<{ me: { _id: string } }>(GET_ME);
    expect(data.me._id).toBe('u1');
    expect(calls).toHaveLength(1);
    expect(calls[0].token).toBe('AT2');
  });

  it('a NEW pasted env pair wins over a saved session rotated from an older one', async () => {
    process.env.VIBO_ACCESS_TOKEN = 'OLD';
    process.env.VIBO_REFRESH_TOKEN = 'OLD_RT';
    installFetch(({ query, token }) => {
      if (isOp(query, 'mutation refreshToken')) return { data: { refreshToken: { accessToken: 'OLD2', refreshToken: 'OLD_RT2' } } };
      if (token === 'OLD') return { errors: [{ code: 'UNAUTHORIZED' }] };
      return { data: { me: { _id: 'u1' } } };
    });
    await new ViboClient().gql(GET_ME); // saves OLD2/OLD_RT2 with OLD lineage

    process.env.VIBO_ACCESS_TOKEN = 'NEW';
    process.env.VIBO_REFRESH_TOKEN = 'NEW_RT';
    const calls = installFetch(() => ({ data: { me: { _id: 'u2' } } }));
    await new ViboClient().gql(GET_ME);
    expect(calls[0].token).toBe('NEW');
  });

  it('an env token is not shadowed by an unrelated browser-captured session', async () => {
    saveSession({ accessToken: 'CAPTURED', refreshToken: 'CR' });
    process.env.VIBO_ACCESS_TOKEN = 'ENV';
    const calls = installFetch(() => ({ data: { me: { _id: 'u1' } } }));
    await new ViboClient().gql(GET_ME);
    expect(calls[0].token).toBe('ENV');
  });

  it('setTokens adopts a captured pair and clears the config error (no persist)', async () => {
    const calls = installFetch(({ token }) =>
      token === 'CAP' ? { data: { me: { _id: 'u2' } } } : { errors: [{ code: 'UNAUTHORIZED' }] },
    );
    const client = new ViboClient(); // no creds → config error
    await expect(client.gql(GET_ME)).rejects.toThrow(/credentials are not configured/i);
    expect(calls).toHaveLength(0);

    client.setTokens('CAP', 'CR');
    const data = await client.gql<{ me: { _id: string } }>(GET_ME);
    expect(data.me._id).toBe('u2');

    // setTokens does NOT persist (the session tool persists after GET_ME), so a
    // fresh client with no creds still has nothing to load.
    await expect(new ViboClient().gql(GET_ME)).rejects.toThrow(/credentials are not configured/i);
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

/**
 * The caller's cancellation reaching Vibo (mcp-utils `cancel`).
 *
 * Until this only the request timeout could stop a Vibo call, so a
 * cancelled tool call held it open for the full budget while the child
 * burned the CPU mcp-host meters it on. Measured on that fleet: claude.ai
 * sent 101 cancellations in the week to 2026-09-20.
 */
describe('cancellation', () => {
  it('hands fetch a signal the CALLER can trip, not just our timeout', async () => {
    process.env.VIBO_EMAIL = 'a@b.com';
    process.env.VIBO_PASSWORD = 'pw';
    const signals: (AbortSignal | null | undefined)[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      signals.push((init as RequestInit | undefined)?.signal);
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({ data: {} }),
        text: async () => '{}',
      } as unknown as Response;
    });
    try {
      const controller = new AbortController();
      await withCallSignal(controller.signal, () =>
        new ViboClient().gql('query { __typename }').catch(() => undefined),
      );
      expect(signals.length, 'no request was made').toBeGreaterThan(0);
      expect(signals[0]).toBeInstanceOf(AbortSignal);
      // The caller's, not merely the timeout's: one abort trips it.
      controller.abort(new Error('caller went away'));
      expect(signals[0]!.aborted, 'the request did not honour the caller').toBe(true);
    } finally {
      vi.restoreAllMocks();
    }
  });

  /**
   * The UPLOAD path, which got the identical change and had no test.
   *
   * It is the one that most deserves cancelling: a multipart upload is the
   * longest-running request this client makes, so it is the one a caller is
   * most likely to give up on and the one that wastes most by carrying on.
   */
  it('hands the multipart upload path the caller’s signal too', async () => {
    process.env.VIBO_EMAIL = 'a@b.com';
    process.env.VIBO_PASSWORD = 'pw';
    const signals: (AbortSignal | null | undefined)[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      signals.push((init as RequestInit | undefined)?.signal);
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({ data: { signIn: { accessToken: 'AT', refreshToken: 'RT' } } }),
        text: async () => '{}',
      } as unknown as Response;
    });
    try {
      const controller = new AbortController();
      await withCallSignal(controller.signal, () =>
        new ViboClient()
          .gqlUpload('mutation ($f: Upload!) { upload(file: $f) { _id } }', { f: null }, {
            f: { filename: 'a.txt', contentType: 'text/plain', data: Buffer.from('hi') } as never,
          })
          .catch(() => undefined),
      );
      expect(signals.length, 'no request was made').toBeGreaterThan(0);
      for (const [i, signal] of signals.entries()) {
        expect(signal, `leg ${i} was given no signal`).toBeInstanceOf(AbortSignal);
      }
      controller.abort(new Error('caller went away'));
      for (const [i, signal] of signals.entries()) {
        expect(signal!.aborted, `leg ${i} did not honour the caller`).toBe(true);
      }
    } finally {
      vi.restoreAllMocks();
    }
  });
});

/**
 * A write that times out is an UNKNOWN outcome: Vibo may already have committed
 * it. Telling the model to "retry" duplicates invitations, exported playlists,
 * comments and imports — the confirm gate cannot stop it, the retry carries
 * confirm:true.
 */
describe('timeouts and dropped connections', () => {
  function failFetch(name: string) {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      const err = new Error('boom');
      err.name = name;
      throw err;
    });
  }

  it('a timed-out mutation says the change may have been applied and to check before retrying', async () => {
    process.env.VIBO_ACCESS_TOKEN = 'AT';
    failFetch('TimeoutError');
    const err = (await new ViboClient()
      .gql('mutation inviteUsers($x: String) { inviteUsers(x: $x) }')
      .catch((e: unknown) => e)) as Error & { hint?: string };
    expect(err.message).toMatch(/timed out/);
    expect(err.message).toMatch(/may (already )?have been applied|outcome is unknown/i);
    expect(err.hint).toMatch(/before retrying/i);
    expect(err.hint).not.toMatch(/check your connection and retry/i);
  });

  it('a dropped connection on a mutation is also an unknown outcome', async () => {
    process.env.VIBO_ACCESS_TOKEN = 'AT';
    failFetch('TypeError');
    const err = (await new ViboClient()
      .gql('  mutation addComment { x }')
      .catch((e: unknown) => e)) as Error & { hint?: string };
    expect(err.hint).toMatch(/before retrying/i);
  });

  it('a timed-out upload (always a write) is an unknown outcome', async () => {
    process.env.VIBO_ACCESS_TOKEN = 'AT';
    failFetch('TimeoutError');
    const err = (await new ViboClient()
      .gqlUpload('mutation uploadUserPhoto($photo: Upload!) { uploadUserPhoto(photo: $photo) }', { photo: null }, {
        'variables.photo': { blob: new Blob(['x']), filename: 'a.jpg' },
      })
      .catch((e: unknown) => e)) as Error & { hint?: string };
    expect(err.message).toMatch(/timed out/);
    expect(err.hint).toMatch(/before retrying/i);
  });

  it('a timed-out read is still safe to retry', async () => {
    process.env.VIBO_ACCESS_TOKEN = 'AT';
    failFetch('TimeoutError');
    const err = (await new ViboClient().gql(GET_ME).catch((e: unknown) => e)) as Error & { hint?: string };
    expect(err.message).toMatch(/timed out/);
    expect(err.hint).toMatch(/retry/i);
    expect(err.hint).not.toMatch(/before retrying/i);
  });
});
