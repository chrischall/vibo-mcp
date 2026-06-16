import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { captureViboSession } from '../src/auth.js';
import { loadSession, saveSession, clearSession } from '../src/session-store.js';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'vibo-auth-'));
  process.env.VIBO_SESSION_FILE = join(dir, 'session.json');
});
afterEach(() => {
  delete process.env.VIBO_SESSION_FILE;
  rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('session-store', () => {
  it('round-trips a captured session and persists 0600', () => {
    expect(loadSession()).toBeNull();
    saveSession({ accessToken: 'AT', refreshToken: 'RT' });
    expect(loadSession()).toEqual({ accessToken: 'AT', refreshToken: 'RT' });
    // file written, refreshToken nullable
    saveSession({ accessToken: 'AT2', refreshToken: null });
    expect(loadSession()).toEqual({ accessToken: 'AT2', refreshToken: null });
    clearSession();
    expect(loadSession()).toBeNull();
  });

  it('returns null on a malformed file', () => {
    saveSession({ accessToken: 'AT', refreshToken: 'RT' });
    const file = process.env.VIBO_SESSION_FILE as string;
    writeFileSync(file, '{not json'); // corrupt it
    expect(loadSession()).toBeNull();
  });
});

describe('captureViboSession', () => {
  it('reads token + refreshToken from the bridge and returns them WITHOUT persisting', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ localStorage: { token: 'AT', refreshToken: 'RT' } });
    const result = await captureViboSession({ bootstrap });

    expect(result).toEqual({ accessToken: 'AT', refreshToken: 'RT' });
    // Capture does NOT persist — the caller persists only after verifying.
    expect(loadSession()).toBeNull();

    // declared the right localStorage keys + web subdomain
    const opts = bootstrap.mock.calls[0][0];
    expect(opts.domains).toEqual(['vibodj.com']);
    expect(opts.storageSubdomain).toBe('web');
    expect(opts.declare.localStorage).toEqual(['token', 'refreshToken']);
  });

  it('treats a missing refreshToken as null', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ localStorage: { token: 'AT' } });
    const result = await captureViboSession({ bootstrap });
    expect(result).toEqual({ accessToken: 'AT', refreshToken: null });
  });

  it('throws (and persists nothing) when no token is found', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ localStorage: {} });
    await expect(captureViboSession({ bootstrap })).rejects.toThrow(/No Vibo token/);
    expect(loadSession()).toBeNull();
  });

  it('surfaces a helpful error when the bridge fails', async () => {
    const bootstrap = vi.fn().mockRejectedValue(new Error('pairing required'));
    await expect(captureViboSession({ bootstrap })).rejects.toThrow(/capture failed: pairing required/);
    expect(existsSync(process.env.VIBO_SESSION_FILE as string)).toBe(false);
  });
});
