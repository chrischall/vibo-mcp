import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import { minifiedResult, confirmTokenParam, toolAnnotations } from '@chrischall/mcp-utils';
import type { ViboClient } from '../client.js';
import { IMPORT_PLAYLIST_TO_SECTION } from '../gql.js';
import { confirmWrite, CONFIRM_NOTE } from './shared.js';

export function registerImportTools(server: McpServer, client: ViboClient): void {
  server.registerTool(
    'vibo_import_playlist_to_section',
    {
      description:
        'Import selected tracks from a connected Spotify/Apple Music playlist into a section. Returns counts of added/existing/ignored. ' + CONFIRM_NOTE,
      annotations: toolAnnotations({ title: 'Import playlist to section', readOnly: false, destructive: false }),
      inputSchema: z.object({
        eventId: z.string().describe('Event id.'),
        sectionId: z.string().describe('Section id (from vibo_list_sections).'),
        source: z
          .enum(['spotify', 'appleMusic'])
          .describe('Streaming source — must be connected to your Vibo account.'),
        playlistId: z.string().optional().describe('Playlist id from vibo_get_playlists.'),
        tracksToAdd: z
          .array(z.string())
          .min(1)
          .describe('Track ids (from vibo_get_playlist_songs) to import.'),
        tracksToIgnore: z.array(z.string()).optional().describe('Track ids to skip.'),
        confirmToken: confirmTokenParam,
      }),
    },
    async ({ eventId, sectionId, source, playlistId, tracksToAdd, tracksToIgnore, confirmToken }, ctx) => {
      const vars = {
        eventId,
        sectionId,
        playlistId: playlistId ?? null,
        source,
        tracksToAdd,
        tracksToIgnore: tracksToIgnore ?? [],
      };
      const gate = await confirmWrite(ctx, {
        tool: 'vibo_import_playlist_to_section',
        mutation: 'importPlaylistToSectionWeb',
        message: 'Review and confirm this playlist import:',
        confirmToken,
        target: sectionId,
        willSend: vars,
      });
      if (gate) return gate;
      const data = await client.gql<{ importPlaylistToSectionWeb: unknown }>(
        IMPORT_PLAYLIST_TO_SECTION,
        vars,
      );
      return minifiedResult(data.importPlaylistToSectionWeb);
    },
  );
}
