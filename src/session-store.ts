import { homedir } from 'os';
import { dirname, join } from 'path';
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, chmodSync } from 'fs';
import { readEnvVar } from '@chrischall/mcp-utils';

// Where a browser-captured token pair is persisted so it survives MCP restarts.
// Override with VIBO_SESSION_FILE (used by tests). Written 0600 in a 0700 dir.
function sessionFile(): string {
  return readEnvVar('VIBO_SESSION_FILE') ?? join(homedir(), '.vibo-mcp', 'session.json');
}

export interface ViboSession {
  accessToken: string;
  refreshToken: string | null;
}

/** Load a previously-captured session, or null if none / unreadable. */
export function loadSession(): ViboSession | null {
  try {
    const file = sessionFile();
    if (!existsSync(file)) return null;
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<ViboSession>;
    if (parsed && typeof parsed.accessToken === 'string' && parsed.accessToken) {
      return { accessToken: parsed.accessToken, refreshToken: parsed.refreshToken ?? null };
    }
    return null;
  } catch {
    return null;
  }
}

/** Persist a captured/refreshed token pair (0600 file in a 0700 dir). */
export function saveSession(session: ViboSession): void {
  const file = sessionFile();
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  writeFileSync(
    file,
    JSON.stringify({ accessToken: session.accessToken, refreshToken: session.refreshToken ?? null }, null, 2),
    { mode: 0o600 },
  );
  // `mode` in writeFileSync only applies when the file is *created*; enforce
  // 0600 on overwrite too (a pre-existing file keeps its old, possibly looser perms).
  chmodSync(file, 0o600);
}

/** Remove any persisted session. */
export function clearSession(): void {
  try {
    const file = sessionFile();
    if (existsSync(file)) rmSync(file);
  } catch {
    // best-effort
  }
}
