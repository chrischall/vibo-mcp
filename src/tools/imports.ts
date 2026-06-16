import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { textResult, toolAnnotations, schemaConfirm } from '@chrischall/mcp-utils';
import { client } from '../client.js';
import { IMPORT_PLAYLIST_TO_SECTION } from '../gql.js';
import { previewResult } from './shared.js';

export function registerImportTools(server: McpServer): void {
  server.registerTool(
    'vibo_import_playlist_to_section',
    {
      description:
        'Import selected tracks from a connected Spotify/Apple Music playlist into a section. Returns counts of added/existing/ignored. Confirm-gated.',
      annotations: toolAnnotations({ title: 'Import playlist to section', readOnly: false }),
      inputSchema: {
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
        confirm: schemaConfirm,
      },
    },
    async ({ eventId, sectionId, source, playlistId, tracksToAdd, tracksToIgnore, confirm }) => {
      const vars = {
        eventId,
        sectionId,
        playlistId: playlistId ?? null,
        source,
        tracksToAdd,
        tracksToIgnore: tracksToIgnore ?? [],
      };
      if (!confirm) return previewResult('importPlaylistToSectionWeb', vars);
      const data = await client.gql<{ importPlaylistToSectionWeb: unknown }>(
        IMPORT_PLAYLIST_TO_SECTION,
        vars,
      );
      return textResult(data.importPlaylistToSectionWeb);
    },
  );
}
