import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { textResult, toolAnnotations } from '@chrischall/mcp-utils';
import { client } from '../client.js';
import { LIST_SECTION_SONG_IDEAS, LIST_SONG_IDEAS_SONGS } from '../gql.js';
import { limitSchema, skipSchema, pagination } from './shared.js';

export function registerIdeasTools(server: McpServer): void {
  server.registerTool(
    'vibo_list_section_song_ideas',
    {
      description:
        "List the DJ's suggested song-idea collections for a section (each with a title, songsCount and _id). Use a song-ideas _id with vibo_list_song_ideas_songs to see the suggested songs, then add the ones you like with vibo_add_song_to_section.",
      annotations: toolAnnotations({ title: 'List Vibo section song ideas', readOnly: true }),
      inputSchema: {
        eventId: z.string().describe('Event id.'),
        sectionId: z.string().describe('Section id (from vibo_list_sections).'),
        limit: limitSchema,
        skip: skipSchema,
      },
    },
    async ({ eventId, sectionId, limit, skip }) => {
      const data = await client.gql<{ getEventSectionSongIdeas: unknown }>(LIST_SECTION_SONG_IDEAS, {
        eventId,
        sectionId,
        pagination: pagination(limit, skip),
      });
      return textResult(data.getEventSectionSongIdeas);
    },
  );

  server.registerTool(
    'vibo_list_song_ideas_songs',
    {
      description:
        'List the suggested songs inside a song-idea collection (returns songUrl/viboSongId/title/artist to pass to vibo_add_song_to_section).',
      annotations: toolAnnotations({ title: 'List Vibo song-idea songs', readOnly: true }),
      inputSchema: {
        eventId: z.string().describe('Event id.'),
        sectionId: z.string().describe('Section id (from vibo_list_sections).'),
        songIdeasId: z.string().describe('The _id from vibo_list_section_song_ideas.'),
        limit: limitSchema,
        skip: skipSchema,
      },
    },
    async ({ eventId, sectionId, songIdeasId, limit, skip }) => {
      const data = await client.gql<{ getEventSectionSongIdeasSongs: unknown }>(LIST_SONG_IDEAS_SONGS, {
        eventId,
        sectionId,
        songIdeasId,
        pagination: pagination(limit, skip),
      });
      return textResult(data.getEventSectionSongIdeasSongs);
    },
  );
}
