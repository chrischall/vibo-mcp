import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import { minifiedResult, confirmTokenParam, toolAnnotations } from '@chrischall/mcp-utils';
import type { ViboClient } from '../client.js';
import {
  GET_PLAYLISTS,
  GET_PLAYLIST_SONGS,
  EXPORT_EVENT_TO_SPOTIFY,
  EXPORT_EVENT_TO_APPLE_MUSIC,
} from '../gql.js';
import { limitSchema, skipSchema, pagination, confirmWrite, CONFIRM_NOTE } from './shared.js';

const sourceSchema = z
  .enum(['spotify', 'appleMusic'])
  .describe('Streaming source — must be connected to your Vibo account.');

export function registerPlaylistTools(server: McpServer, client: ViboClient): void {
  server.registerTool(
    'vibo_get_playlists',
    {
      description:
        "List your playlists from a connected streaming service (Spotify or Apple Music) so you can import songs from them. Requires that source to be connected (see vibo_get_me).",
      annotations: toolAnnotations({ title: 'List connected playlists', readOnly: true }),
      inputSchema: z.object({
        source: sourceSchema,
        q: z.string().optional().describe('Filter playlists by name.'),
        limit: limitSchema,
        skip: skipSchema,
      }),
    },
    async ({ source, q, limit, skip }) => {
      const data = await client.gql<{ getPlaylists: unknown }>(GET_PLAYLISTS, {
        source,
        pagination: pagination(limit, skip),
        ...(q ? { filter: { q } } : {}),
      });
      return minifiedResult(data.getPlaylists);
    },
  );

  server.registerTool(
    'vibo_get_playlist_songs',
    {
      description: 'List the tracks in one of your connected-service playlists.',
      annotations: toolAnnotations({ title: 'Get playlist tracks', readOnly: true }),
      inputSchema: z.object({
        playlistId: z.string().describe('Playlist id from vibo_get_playlists.'),
        source: sourceSchema,
        limit: limitSchema,
        skip: skipSchema,
      }),
    },
    async ({ playlistId, source, limit, skip }) => {
      const data = await client.gql<{ getPlaylistSongs: unknown }>(GET_PLAYLIST_SONGS, {
        playlistId,
        source,
        pagination: pagination(limit, skip),
      });
      return minifiedResult(data.getPlaylistSongs);
    },
  );

  server.registerTool(
    'vibo_export_event_to_spotify',
    {
      description:
        "Export an event's song selections to a new Spotify playlist (Spotify must be connected). Returns the playlist URL plus how many tracks exported / failed. " + CONFIRM_NOTE,
      annotations: toolAnnotations({ title: 'Export event to Spotify', readOnly: false, destructive: false }),
      inputSchema: z.object({
        eventId: z.string().describe('Event id.'),
        sectionIds: z.array(z.string()).min(1).describe('Section ids to include (from vibo_list_sections).'),
        title: z.string().optional().describe('Playlist title (defaults to the event title).'),
        onlyFlagged: z.boolean().optional().describe('Export only flagged/do-not-play songs (rarely needed).'),
        confirmToken: confirmTokenParam,
      }),
    },
    async ({ eventId, sectionIds, title, onlyFlagged, confirmToken }, ctx) => {
      const variables: Record<string, unknown> = { eventId, sectionIds };
      if (title !== undefined) variables.title = title;
      if (onlyFlagged !== undefined) variables.filter = { isFlagged: onlyFlagged };
      const gate = await confirmWrite(ctx, {
        tool: 'vibo_export_event_to_spotify',
        mutation: 'exportEventToSpotify',
        message: 'Review and confirm this Spotify export:',
        confirmToken,
        target: eventId,
        willSend: variables,
      });
      if (gate) return gate;
      const data = await client.gql<{ exportEventToSpotify: unknown }>(EXPORT_EVENT_TO_SPOTIFY, variables);
      return minifiedResult(data.exportEventToSpotify);
    },
  );

  server.registerTool(
    'vibo_export_event_to_apple_music',
    {
      description:
        "Export an event's song selections to a new Apple Music playlist (Apple Music must be connected). Returns the playlist URL plus how many tracks exported / failed. " + CONFIRM_NOTE,
      annotations: toolAnnotations({ title: 'Export event to Apple Music', readOnly: false, destructive: false }),
      inputSchema: z.object({
        eventId: z.string().describe('Event id.'),
        sectionIds: z.array(z.string()).min(1).describe('Section ids to include (from vibo_list_sections).'),
        title: z.string().optional().describe('Playlist title (defaults to the event title).'),
        onlyFlagged: z.boolean().optional().describe('Export only flagged/do-not-play songs (rarely needed).'),
        confirmToken: confirmTokenParam,
      }),
    },
    async ({ eventId, sectionIds, title, onlyFlagged, confirmToken }, ctx) => {
      const variables: Record<string, unknown> = { eventId, sectionIds };
      if (title !== undefined) variables.title = title;
      if (onlyFlagged !== undefined) variables.filter = { isFlagged: onlyFlagged };
      const gate = await confirmWrite(ctx, {
        tool: 'vibo_export_event_to_apple_music',
        mutation: 'exportEventToAppleMusic',
        message: 'Review and confirm this Apple Music export:',
        confirmToken,
        target: eventId,
        willSend: variables,
      });
      if (gate) return gate;
      const data = await client.gql<{ exportEventToAppleMusic: unknown }>(EXPORT_EVENT_TO_APPLE_MUSIC, variables);
      return minifiedResult(data.exportEventToAppleMusic);
    },
  );
}
