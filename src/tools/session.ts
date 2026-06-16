import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { textResult, toolAnnotations } from '@chrischall/mcp-utils';
import { client } from '../client.js';
import { captureViboSession } from '../auth.js';
import { saveSession } from '../session-store.js';
import { GET_ME } from '../gql.js';

export function registerSessionTools(server: McpServer): void {
  server.registerTool(
    'vibo_capture_session',
    {
      description:
        "Capture your Vibo login from a signed-in web.vibodj.com browser tab via the fetchproxy bridge — for accounts that sign in with Apple/Google/Facebook (no password). Requires the fetchproxy browser extension installed and you signed into https://web.vibodj.com; approve the pair code shown on first use. The token is saved locally and reused on future calls.",
      annotations: toolAnnotations({ title: 'Capture Vibo session (SSO)', readOnly: false }),
    },
    async () => {
      const { accessToken, refreshToken } = await captureViboSession();
      client.setTokens(accessToken, refreshToken);
      // Confirm the captured token actually authenticates BEFORE persisting it,
      // so a stale snapshot never lands in session.json.
      const data = await client.gql<{ me: { _id: string; email?: string } }>(GET_ME);
      saveSession({ accessToken, refreshToken });
      return textResult({
        captured: true,
        hasRefreshToken: Boolean(refreshToken),
        userId: data.me._id,
        email: data.me.email,
      });
    },
  );
}
