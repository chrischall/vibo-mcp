import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { minifiedResult, schemaConfirm, toolAnnotations } from '@chrischall/mcp-utils';
import { viewArg, viewResponse } from '../view.js';
import type { ViboClient } from '../client.js';
import { GET_SECTION_SONGS, SEARCH_SONGS, ADD_SONG_TO_SECTION, TOGGLE_LIKE } from '../gql.js';
import { annotateSearchResults, type SearchSong } from '../song-search.js';
import { limitSchema, skipSchema, pagination, previewResult } from './shared.js';

export function registerSongTools(server: McpServer, client: ViboClient): void {
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
      return minifiedResult(data.getSectionSongs);
    },
  );

  server.registerTool(
    'vibo_search_songs',
    {
      description:
        'Search for songs to add to a section. ALWAYS query as "<Artist> - <Title>" with a ' +
        'space-hyphen-space separator (e.g. "Ed Sheeran - Thinking Out Loud"). Vibo\'s default ' +
        "'searchField' index is a loose text match over a catalog full of YouTube covers, " +
        'karaoke tracks and re-uploads: the hyphenated form resolves to the official recording, ' +
        'while the same words unhyphenated rank covers and re-uploads above it (measured live — ' +
        '"Chris Stapleton - Tennessee Whiskey" returned only the official master; without the ' +
        'hyphen, none of the nine results was the original). Each result carries a `quality` ' +
        'verdict (likely-original / uncertain / likely-not-original) plus warnings — check it ' +
        'before adding, and never add a `likely-not-original` result without saying so. ' +
        "source 'spotify' searches your connected Spotify (a structured catalog, so the hyphen " +
        'matters less). Returns songUrl/viboSongId/title/artist for vibo_add_song_to_section.',
      annotations: toolAnnotations({ title: 'Search Vibo songs', readOnly: true }),
      inputSchema: {
        view: viewArg(),
        eventId: z.string().describe('Event id (search is scoped to an event/section).'),
        sectionId: z.string().describe('Section id the search is for.'),
        query: z
          .string()
          .describe(
            'Song to search for, as "<Artist> - <Title>" (space-hyphen-space). Use the artist\'s ' +
              'own stylization — the index does not fold variants together, and "Dan + Shay - ' +
              'Speechless" returns the official master while "Dan and Shay - Speechless" returns ' +
              'covers and live cuts without it. Artist alone returns only a short ' +
              'popularity-ranked subset of their catalog, so a specific track may be missing ' +
              'entirely. If the hyphenated query looks wrong, retry as "<Title> - <Artist>", ' +
              'then the title alone filtered by artist.',
          ),
        source: z.enum(['searchField', 'spotify']).optional().describe("Search source (default 'searchField')."),
        limit: z.number().int().min(1).max(50).optional().describe('Max results (default 20).'),
      },
    },
    async ({ eventId, sectionId, query, source, limit, view }) => {
      const resolvedSource = source ?? 'searchField';
      const data = await client.gql<{ getSongs: unknown }>(SEARCH_SONGS, {
        eventId,
        sectionId,
        filter: { q: query, source: resolvedSource },
        limit: limit ?? 20,
      });
      const songs = data.getSongs;
      // Vibo returns a bare array; if that ever changes, pass it through untouched
      // rather than guessing at a shape.
      //
      // BOTH exits answer through `viewResponse`. The array branch — the one
      // that actually runs on every call — used to end at `minifiedResult`,
      // which left `view` honoured only on the branch that never fires. The
      // annotated results SPREAD Vibo's own song objects (`{ ...song, quality }`
      // in `annotateSearchResults`), so the artwork and thumbnail URLs the
      // catalog carries per track were the very payload compact exists to drop,
      // and it dropped none of them.
      if (!Array.isArray(songs)) return viewResponse(view, songs);
      return viewResponse(view, annotateSearchResults(songs as SearchSong[], query, resolvedSource));
    },
  );

  server.registerTool(
    'vibo_add_song_to_section',
    {
      description:
        'Add a song to a section. Pass a song from vibo_search_songs (songUrl is required; ' +
        'include viboSongId/title/artist when known). Before adding, check that result\'s ' +
        '`quality.confidence`: adding a `likely-not-original` result puts a cover, karaoke ' +
        'track or junk-metadata re-upload in front of a live DJ. If nothing looks original, ' +
        'report the closest matches back rather than adding a best guess. Confirm-gated.',
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
      return minifiedResult(data.addSongToSection);
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
      return minifiedResult(data.toggleLike);
    },
  );
}
