import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { textResult, toolAnnotations } from '@chrischall/mcp-utils';
import { client } from '../client.js';
import { GET_ME } from '../gql.js';

export function registerProfileTools(server: McpServer): void {
  server.registerTool(
    'vibo_get_me',
    {
      description:
        "Get the signed-in Vibo user's profile (id, name, email, phone, locale, and whether Spotify/Apple Music are connected). Use the returned _id to recognize your own songs/contacts.",
      annotations: toolAnnotations({ title: 'Get my Vibo profile', readOnly: true }),
    },
    async () => {
      const data = await client.gql<{ me: unknown }>(GET_ME);
      return textResult(data.me);
    },
  );

  server.registerTool(
    'vibo_healthcheck',
    {
      description:
        'Verify connectivity and authentication to the Vibo API by fetching the current user. Returns ok:true with your account id when credentials work.',
      annotations: toolAnnotations({ title: 'Vibo healthcheck', readOnly: true }),
    },
    async () => {
      const data = await client.gql<{ me: { _id: string; email?: string } }>(GET_ME);
      return textResult({ ok: true, userId: data.me._id, email: data.me.email });
    },
  );
}
