import { homedir } from 'os';
import { join } from 'path';
import { readEnvVar } from '@chrischall/mcp-utils';
import { SessionStore } from '@chrischall/mcp-utils/session';

// Where a browser-captured token pair is persisted so it survives MCP restarts.
// Override with VIBO_SESSION_FILE (used by tests). Backed by mcp-utils
// SessionStore: 0600 file in a 0700 dir, on-disk JSON array of records, and a
// `.corrupt` backup on parse failure. Vibo persists exactly one token pair, so
// the store holds a single record under a fixed key; a stale pre-migration
// file (a bare {accessToken,...} object) degrades gracefully to "no session".

export interface ViboSession {
  accessToken: string;
  refreshToken: string | null;
}

const SESSION_KEY = 'vibo';

interface StoredSession extends Record<string, unknown> {
  key: string;
  accessToken: string;
  refreshToken: string | null;
}

// Constructed per call (it re-reads disk) so VIBO_SESSION_FILE is honored
// dynamically, matching the previous read-env-on-every-call behaviour.
function openStore(): SessionStore<StoredSession> {
  return new SessionStore<StoredSession>({
    filePath: readEnvVar('VIBO_SESSION_FILE') ?? join(homedir(), '.vibo-mcp', 'session.json'),
    keyOf: (s) => (typeof s.key === 'string' && s.key ? s.key : SESSION_KEY),
    normalizeKey: (k) => k, // fixed single key — no origin normalization
  });
}

/** Load a previously-captured session, or null if none / unreadable. */
export function loadSession(): ViboSession | null {
  try {
    const rec = openStore().get(SESSION_KEY);
    if (rec && typeof rec.accessToken === 'string' && rec.accessToken) {
      return {
        accessToken: rec.accessToken,
        refreshToken: typeof rec.refreshToken === 'string' ? rec.refreshToken : null,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/** Persist a captured/refreshed token pair (0600 file in a 0700 dir). */
export function saveSession(session: ViboSession): void {
  openStore().add({
    key: SESSION_KEY,
    accessToken: session.accessToken,
    refreshToken: session.refreshToken ?? null,
  });
}

/** Remove any persisted session. */
export function clearSession(): void {
  try {
    openStore().remove(SESSION_KEY);
  } catch {
    // best-effort
  }
}
