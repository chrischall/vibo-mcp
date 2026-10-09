import type { McpServer } from '@modelcontextprotocol/server';
import { minifiedResult, toolAnnotations } from '@chrischall/mcp-utils';
import type { ViboClient } from '../client.js';
import { captureViboSession } from '../auth.js';
import { saveSession } from '../session-store.js';
import { GET_ME } from '../gql.js';

// NB: vibo_capture_session needs the fetchproxy browser bridge and a signed-in
// browser tab on the same machine, so this registrar is only useful where both
// exist — a deployment without them should not wire it in.
export function registerSessionTools(server: McpServer, client: ViboClient): void {
  server.registerTool(
    'vibo_capture_session',
    {
      description:
        "Capture your Vibo login from a signed-in web.vibodj.com browser tab via ContextMint Bridge — for accounts that sign in with Apple/Google/Facebook (no password). Requires the ContextMint Bridge browser extension installed and you signed into https://web.vibodj.com; approve the pair code shown on first use. The token is saved locally and reused on future calls.",
      annotations: toolAnnotations({ title: 'Capture Vibo session (SSO)', readOnly: false, destructive: false }),
    },
    async () => {
      const captured = await captureViboSession();
      // Verify the captured pair on an isolated client BEFORE adopting or
      // persisting it: a stale snapshot never replaces the working in-memory
      // session and never lands in session.json (fleet-audit #794). What is
      // adopted and saved is the pair verification ended with — a refresh
      // during it rotates the captured one.
      const { data, accessToken, refreshToken } = await client.adoptVerifiedTokens<{
        me: { _id: string; email?: string };
      }>(captured.accessToken, captured.refreshToken, GET_ME);
      saveSession({ accessToken, refreshToken });
      return minifiedResult({
        captured: true,
        hasRefreshToken: Boolean(refreshToken),
        userId: data.me._id,
        email: data.me.email,
      });
    },
  );
}
