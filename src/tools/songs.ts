import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { textResult, toolAnnotations, schemaConfirm } from '@chrischall/mcp-utils';
import { client } from '../client.js';
import { GET_SECTION_SONGS, SEARCH_SONGS, ADD_SONG_TO_SECTION, TOGGLE_LIKE } from '../gql.js';
import { limitSchema, skipSchema, pagination, previewResult } from './shared.js';

export function registerSongTools(server: McpServer): void {
  server.registerTool(
    'vibo_get_section_songs',
    {
      description:
        "List the songs requested in a section, with who added each, like counts, must-play / do-not-play flags, comments, and streaming links. Sort by likesCount, createdAt, or title.",
      annotations: toolAnnotations({ title: 'Get Vibo section songs', readOnly: true }),
      inputSchema: {
        eventId: z.string().describe('Event id.'),
        sectionId: z.string().describe('Section id (from vibo_list_sections).'),
        q: z.string().optional().describe('Filter songs by text.'),
        isMustPlay: z.boolean().optional(),
        isFlagged: z.boolean().optional().describe('Filter to do-not-play / flagged songs.'),
        sortField: z.enum(['likesCount', 'createdAt', 'title']).optional(),
        sortDirection: z.enum(['asc', 'desc']).optional(),
        limit: limitSchema,
        skip: skipSchema,
      },
    },
    async ({ eventId, sectionId, q, isMustPlay, isFlagged, sortField, sortDirection, limit, skip }) => {
      const filter: Record<string, unknown> = {};
      if (q !== undefined) filter.q = q;
      if (isMustPlay !== undefined) filter.isMustPlay = isMustPlay;
      if (isFlagged !== undefined) filter.isFlagged = isFlagged;
      const variables: Record<string, unknown> = {
        eventId,
        sectionId,
        pagination: pagination(limit, skip),
        ...(Object.keys(filter).length ? { filter } : {}),
        ...(sortField ? { sort: { field: sortField, direction: sortDirection ?? 'desc' } } : {}),
      };
      const data = await client.gql<{ getSectionSongs: unknown }>(GET_SECTION_SONGS, variables);
      return textResult(data.getSectionSongs);
    },
  );

  server.registerTool(
    'vibo_search_songs',
    {
      description:
        "Search for songs to add to a section. source 'searchField' (default) searches Vibo's catalog; 'spotify' searches your connected Spotify. Returns songUrl/viboSongId/title/artist to pass to vibo_add_song_to_section.",
      annotations: toolAnnotations({ title: 'Search Vibo songs', readOnly: true }),
      inputSchema: {
        eventId: z.string().describe('Event id (search is scoped to an event/section).'),
        sectionId: z.string().describe('Section id the search is for.'),
        query: z.string().describe('Song or artist to search for.'),
        source: z.enum(['searchField', 'spotify']).optional().describe("Search source (default 'searchField')."),
        limit: z.number().int().min(1).max(50).optional().describe('Max results (default 20).'),
      },
    },
    async ({ eventId, sectionId, query, source, limit }) => {
      const data = await client.gql<{ getSongs: unknown }>(SEARCH_SONGS, {
        eventId,
        sectionId,
        filter: { q: query, source: source ?? 'searchField' },
        limit: limit ?? 20,
      });
      return textResult(data.getSongs);
    },
  );

  server.registerTool(
    'vibo_add_song_to_section',
    {
      description:
        'Add a song to a section. Pass a song from vibo_search_songs (songUrl is required; include viboSongId/title/artist when known). Confirm-gated.',
      annotations: toolAnnotations({ title: 'Add song to Vibo section', readOnly: false }),
      inputSchema: {
        eventId: z.string().describe('Event id.'),
        sectionId: z.string().describe('Section id to add the song to.'),
        songUrl: z.string().describe('The song URL from vibo_search_songs (required).'),
        viboSongId: z.string().optional().describe("The song's viboSongId from search, when available."),
        title: z.string().optional(),
        artist: z.string().optional(),
        confirm: schemaConfirm,
      },
    },
    async ({ eventId, sectionId, songUrl, viboSongId, title, artist, confirm }) => {
      const song: Record<string, unknown> = { songUrl };
      if (viboSongId !== undefined) song.viboSongId = viboSongId;
      if (title !== undefined) song.title = title;
      if (artist !== undefined) song.artist = artist;
      const payload = { song };
      if (!confirm) return previewResult('addSongToSection', { eventId, sectionId, payload });
      const data = await client.gql<{ addSongToSection: unknown }>(ADD_SONG_TO_SECTION, {
        eventId,
        sectionId,
        payload,
      });
      return textResult(data.addSongToSection);
    },
  );

  server.registerTool(
    'vibo_toggle_song_like',
    {
      description: 'Like or unlike a song in a section. Confirm-gated.',
      annotations: toolAnnotations({ title: 'Like/unlike Vibo song', readOnly: false }),
      inputSchema: {
        eventId: z.string().describe('Event id.'),
        sectionId: z.string().describe('Section id.'),
        songId: z.string().describe('Song _id (from vibo_get_section_songs).'),
        liked: z.boolean().describe('true to like, false to unlike.'),
        confirm: schemaConfirm,
      },
    },
    async ({ eventId, sectionId, songId, liked, confirm }) => {
      if (!confirm) return previewResult('toggleLike', { eventId, sectionId, songId, liked });
      const data = await client.gql<{ toggleLike: { liked: boolean } }>(TOGGLE_LIKE, {
        eventId,
        sectionId,
        songId,
        liked,
      });
      return textResult(data.toggleLike);
    },
  );
}
