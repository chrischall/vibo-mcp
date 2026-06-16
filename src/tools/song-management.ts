import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { textResult, toolAnnotations, schemaConfirm, McpToolError } from '@chrischall/mcp-utils';
import { client } from '../client.js';
import { REMOVE_SECTION_SONGS, UPDATE_SECTION_SONGS, MOVE_SECTION_SONGS, REORDER_SONGS } from '../gql.js';
import { previewResult } from './shared.js';

export function registerSongManagementTools(server: McpServer): void {
  server.registerTool(
    'vibo_remove_song_from_section',
    {
      description: 'Remove one or more songs from a section. Confirm-gated.',
      annotations: toolAnnotations({ title: 'Remove songs from Vibo section', readOnly: false }),
      inputSchema: {
        eventId: z.string().describe('Event id.'),
        sectionId: z.string().describe('Section id.'),
        songIds: z
          .array(z.string())
          .min(1)
          .describe('Song _ids from vibo_get_section_songs.'),
        confirm: schemaConfirm,
      },
    },
    async ({ eventId, sectionId, songIds, confirm }) => {
      const vars = { eventId, sectionId, songIds };
      if (!confirm) return previewResult('removeSectionSongsV2', vars);
      const data = await client.gql<{ removeSectionSongsV2: unknown }>(REMOVE_SECTION_SONGS, vars);
      return textResult(data.removeSectionSongsV2);
    },
  );

  server.registerTool(
    'vibo_update_song',
    {
      description:
        'Update songs in a section: mark must-play, flag as do-not-play, and/or set a comment. Provide at least one field. Confirm-gated.',
      annotations: toolAnnotations({ title: 'Update Vibo section songs', readOnly: false }),
      inputSchema: {
        eventId: z.string().describe('Event id.'),
        sectionId: z.string().describe('Section id.'),
        songIds: z
          .array(z.string())
          .min(1)
          .describe('Song _ids from vibo_get_section_songs.'),
        isMustPlay: z.boolean().optional(),
        isFlagged: z.boolean().optional().describe('mark do-not-play / flagged'),
        comment: z.string().optional(),
        confirm: schemaConfirm,
      },
    },
    async ({ eventId, sectionId, songIds, isMustPlay, isFlagged, comment, confirm }) => {
      const payload: Record<string, unknown> = {};
      if (isMustPlay !== undefined) payload.isMustPlay = isMustPlay;
      if (isFlagged !== undefined) payload.isFlagged = isFlagged;
      if (comment !== undefined) payload.comment = comment;
      if (Object.keys(payload).length === 0) {
        throw new McpToolError('Provide at least one of isMustPlay, isFlagged, or comment.', {
          hint: 'Pass isMustPlay, isFlagged, and/or comment to update the songs.',
        });
      }
      const vars = { eventId, sectionId, songIds, payload };
      if (!confirm) return previewResult('updateSectionSongs', vars);
      const data = await client.gql<{ updateSectionSongs: unknown }>(UPDATE_SECTION_SONGS, vars);
      return textResult(data.updateSectionSongs);
    },
  );

  server.registerTool(
    'vibo_move_song',
    {
      description: 'Move songs from one section to another. Confirm-gated.',
      annotations: toolAnnotations({ title: 'Move Vibo section songs', readOnly: false }),
      inputSchema: {
        eventId: z.string().describe('Event id.'),
        sourceSectionId: z.string().describe('Section id the songs are currently in.'),
        targetSectionId: z.string().describe('Section id to move the songs to.'),
        songIds: z
          .array(z.string())
          .min(1)
          .describe('Song _ids from vibo_get_section_songs.'),
        confirm: schemaConfirm,
      },
    },
    async ({ eventId, sourceSectionId, targetSectionId, songIds, confirm }) => {
      const vars = { eventId, sourceSectionId, targetSectionId, songIds };
      if (!confirm) return previewResult('moveSectionSongsV2', vars);
      const data = await client.gql<{ moveSectionSongsV2: unknown }>(MOVE_SECTION_SONGS, vars);
      return textResult(data.moveSectionSongsV2);
    },
  );

  server.registerTool(
    'vibo_reorder_songs',
    {
      description: 'Reorder songs within a section. Confirm-gated.',
      annotations: toolAnnotations({ title: 'Reorder Vibo section songs', readOnly: false }),
      inputSchema: {
        eventId: z.string().describe('Event id.'),
        sectionId: z.string().describe('Section id.'),
        sourceSongIds: z
          .array(z.string())
          .min(1)
          .describe('Song _ids from vibo_get_section_songs.'),
        targetSongId: z
          .string()
          .optional()
          .describe('place the moved songs after this song _id; omit for start'),
        confirm: schemaConfirm,
      },
    },
    async ({ eventId, sectionId, sourceSongIds, targetSongId, confirm }) => {
      const vars = { eventId, sectionId, sourceSongIds, targetSongId: targetSongId ?? null };
      if (!confirm) return previewResult('reorderSongsBatch', vars);
      const data = await client.gql<{ reorderSongsBatch: unknown }>(REORDER_SONGS, vars);
      return textResult(data.reorderSongsBatch);
    },
  );
}
