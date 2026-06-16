// SSO browser token auto-capture (fetchproxy bootstrap).
//
// Accounts that sign into Vibo only via Apple/Google/Facebook have no password
// to put in VIBO_PASSWORD. Instead of asking the user to dig the token out of
// DevTools and paste VIBO_ACCESS_TOKEN, this captures it once from their
// signed-in web.vibodj.com tab via the fetchproxy browser bridge, then operates
// from Node thereafter (the bridge touches only the one-time handshake).
//
// The Vibo web app stores its tokens as plain localStorage keys `token`
// (access) and `refreshToken` on the web.vibodj.com origin (verified from the
// web bundle). We snapshot those two keys, persist them via session-store, and
// the client uses them like any other token pair (with refresh-on-expiry).
//
// `@fetchproxy/bootstrap` is imported lazily so the default credential paths
// never load it — the .mcpb bundle externalizes it, and an eager import would
// crash the server at load. Tests inject a fake `bootstrap` via `deps`.

import { McpToolError } from '@chrischall/mcp-utils';
import { VERSION } from './version.js';
import { saveSession, type ViboSession } from './session-store.js';

const SERVER_NAME = 'vibo-mcp';

// Minimal shape of the `@fetchproxy/bootstrap` result we consume.
interface BootstrapResult {
  localStorage: Record<string, string>;
}
type BootstrapFn = (opts: Record<string, unknown>) => Promise<BootstrapResult>;

export interface CaptureDeps {
  /** Test seam: inject a fake bootstrap. Production lazy-imports the real one. */
  bootstrap?: BootstrapFn;
}

/**
 * Capture the signed-in user's Vibo token pair from their browser via the
 * fetchproxy bridge and persist it. Preconditions: the fetchproxy browser
 * extension is installed and the user is signed into https://web.vibodj.com.
 */
export async function captureViboSession(deps: CaptureDeps = {}): Promise<ViboSession> {
  let bootstrap = deps.bootstrap;
  if (!bootstrap) {
    try {
      const mod = (await import('@fetchproxy/bootstrap')) as unknown as { bootstrap: BootstrapFn };
      bootstrap = mod.bootstrap;
    } catch (err) {
      throw new McpToolError('Browser token capture is unavailable in this build.', {
        hint: 'Run vibo-mcp from npm (npx vibo-mcp) — the packaged .mcpb omits @fetchproxy/bootstrap. Or set VIBO_ACCESS_TOKEN instead.',
        cause: err,
      });
    }
  }

  let session: BootstrapResult;
  try {
    session = await bootstrap({
      serverName: SERVER_NAME,
      version: VERSION,
      domains: ['vibodj.com'],
      storageSubdomain: 'web', // tokens live on web.vibodj.com
      declare: { cookies: [], localStorage: ['token', 'refreshToken'], sessionStorage: [], captureHeaders: [] },
      onPairCode: (code: string) => process.stderr.write(`[vibo-mcp] fetchproxy pair code: ${code}\n`),
      onWaiting: (hint: string) => process.stderr.write(`[vibo-mcp] ${hint}\n`),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new McpToolError(`Vibo browser token capture failed: ${msg}`, {
      hint: 'Install the fetchproxy browser extension, sign into https://web.vibodj.com, approve the pair code, then retry.',
      cause: err,
    });
  }

  const accessToken = session.localStorage?.token;
  const refreshToken = session.localStorage?.refreshToken ?? null;
  if (!accessToken) {
    throw new McpToolError('No Vibo token found in the signed-in browser tab.', {
      hint: 'Make sure you are signed into https://web.vibodj.com in the browser with the fetchproxy extension, then retry.',
    });
  }

  const captured: ViboSession = { accessToken, refreshToken };
  saveSession(captured);
  return captured;
}
