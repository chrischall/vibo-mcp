import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { textResult, toolAnnotations, schemaConfirm } from '@chrischall/mcp-utils';
import { client } from '../client.js';
import {
  GET_PLAYLISTS,
  GET_PLAYLIST_SONGS,
  EXPORT_EVENT_TO_SPOTIFY,
  EXPORT_EVENT_TO_APPLE_MUSIC,
} from '../gql.js';
import { limitSchema, skipSchema, pagination, previewResult } from './shared.js';

const sourceSchema = z
  .enum(['spotify', 'appleMusic'])
  .describe('Streaming source — must be connected to your Vibo account.');

export function registerPlaylistTools(server: McpServer): void {
  server.registerTool(
    'vibo_get_playlists',
    {
      description:
        "List your playlists from a connected streaming service (Spotify or Apple Music) so you can import songs from them. Requires that source to be connected (see vibo_get_me).",
      annotations: toolAnnotations({ title: 'List connected playlists', readOnly: true }),
      inputSchema: {
        source: sourceSchema,
        q: z.string().optional().describe('Filter playlists by name.'),
        limit: limitSchema,
        skip: skipSchema,
      },
    },
    async ({ source, q, limit, skip }) => {
      const data = await client.gql<{ getPlaylists: unknown }>(GET_PLAYLISTS, {
        source,
        pagination: pagination(limit, skip),
        ...(q ? { filter: { q } } : {}),
      });
      return textResult(data.getPlaylists);
    },
  );

  server.registerTool(
    'vibo_get_playlist_songs',
    {
      description: 'List the tracks in one of your connected-service playlists.',
      annotations: toolAnnotations({ title: 'Get playlist tracks', readOnly: true }),
      inputSchema: {
        playlistId: z.string().describe('Playlist id from vibo_get_playlists.'),
        source: sourceSchema,
        limit: limitSchema,
        skip: skipSchema,
      },
    },
    async ({ playlistId, source, limit, skip }) => {
      const data = await client.gql<{ getPlaylistSongs: unknown }>(GET_PLAYLIST_SONGS, {
        playlistId,
        source,
        pagination: pagination(limit, skip),
      });
      return textResult(data.getPlaylistSongs);
    },
  );

  server.registerTool(
    'vibo_export_event_to_spotify',
    {
      description:
        "Export an event's song selections to a new Spotify playlist (Spotify must be connected). Returns the playlist URL plus how many tracks exported / failed. Confirm-gated.",
      annotations: toolAnnotations({ title: 'Export event to Spotify', readOnly: false }),
      inputSchema: {
        eventId: z.string().describe('Event id.'),
        sectionIds: z.array(z.string()).min(1).describe('Section ids to include (from vibo_list_sections).'),
        title: z.string().optional().describe('Playlist title (defaults to the event title).'),
        onlyFlagged: z.boolean().optional().describe('Export only flagged/do-not-play songs (rarely needed).'),
        confirm: schemaConfirm,
      },
    },
    async ({ eventId, sectionIds, title, onlyFlagged, confirm }) => {
      const variables: Record<string, unknown> = { eventId, sectionIds };
      if (title !== undefined) variables.title = title;
      if (onlyFlagged !== undefined) variables.filter = { isFlagged: onlyFlagged };
      if (!confirm) return previewResult('exportEventToSpotify', variables);
      const data = await client.gql<{ exportEventToSpotify: unknown }>(EXPORT_EVENT_TO_SPOTIFY, variables);
      return textResult(data.exportEventToSpotify);
    },
  );

  server.registerTool(
    'vibo_export_event_to_apple_music',
    {
      description:
        "Export an event's song selections to a new Apple Music playlist (Apple Music must be connected). Returns the playlist URL plus how many tracks exported / failed. Confirm-gated.",
      annotations: toolAnnotations({ title: 'Export event to Apple Music', readOnly: false }),
      inputSchema: {
        eventId: z.string().describe('Event id.'),
        sectionIds: z.array(z.string()).min(1).describe('Section ids to include (from vibo_list_sections).'),
        title: z.string().optional().describe('Playlist title (defaults to the event title).'),
        onlyFlagged: z.boolean().optional().describe('Export only flagged/do-not-play songs (rarely needed).'),
        confirm: schemaConfirm,
      },
    },
    async ({ eventId, sectionIds, title, onlyFlagged, confirm }) => {
      const variables: Record<string, unknown> = { eventId, sectionIds };
      if (title !== undefined) variables.title = title;
      if (onlyFlagged !== undefined) variables.filter = { isFlagged: onlyFlagged };
      if (!confirm) return previewResult('exportEventToAppleMusic', variables);
      const data = await client.gql<{ exportEventToAppleMusic: unknown }>(EXPORT_EVENT_TO_APPLE_MUSIC, variables);
      return textResult(data.exportEventToAppleMusic);
    },
  );
}
