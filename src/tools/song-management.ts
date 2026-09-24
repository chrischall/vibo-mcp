import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import { McpToolError, minifiedResult, confirmTokenParam, toolAnnotations } from '@chrischall/mcp-utils';
import type { ViboClient } from '../client.js';
import { REMOVE_SECTION_SONGS, UPDATE_SECTION_SONGS, MOVE_SECTION_SONGS, REORDER_SONGS } from '../gql.js';
import { confirmWrite, CONFIRM_NOTE } from './shared.js';

export function registerSongManagementTools(server: McpServer, client: ViboClient): void {
  server.registerTool(
    'vibo_remove_song_from_section',
    {
      description: 'Remove one or more songs from a section. ' + CONFIRM_NOTE,
      annotations: toolAnnotations({ title: 'Remove songs from Vibo section', readOnly: false, destructive: true }),
      inputSchema: z.object({
        eventId: z.string().describe('Event id.'),
        sectionId: z.string().describe('Section id.'),
        songIds: z
          .array(z.string())
          .min(1)
          .describe('Song _ids from vibo_get_section_songs.'),
        confirmToken: confirmTokenParam,
      }),
    },
    async ({ eventId, sectionId, songIds, confirmToken }, ctx) => {
      const vars = { eventId, sectionId, songIds };
      const gate = await confirmWrite(ctx, {
        tool: 'vibo_remove_song_from_section',
        mutation: 'removeSectionSongsV2',
        message: 'Review and confirm removing these songs:',
        confirmToken,
        target: sectionId,
        willSend: vars,
      });
      if (gate) return gate;
      const data = await client.gql<{ removeSectionSongsV2: unknown }>(REMOVE_SECTION_SONGS, vars);
      return minifiedResult(data.removeSectionSongsV2);
    },
  );

  server.registerTool(
    'vibo_update_song',
    {
      description:
        'Update songs in a section: mark must-play, flag as do-not-play, and/or set a comment. Provide at least one field. ' + CONFIRM_NOTE,
      annotations: toolAnnotations({ title: 'Update Vibo section songs', readOnly: false, destructive: false }),
      inputSchema: z.object({
        eventId: z.string().describe('Event id.'),
        sectionId: z.string().describe('Section id.'),
        songIds: z
          .array(z.string())
          .min(1)
          .describe('Song _ids from vibo_get_section_songs.'),
        isMustPlay: z.boolean().optional(),
        isFlagged: z.boolean().optional().describe('mark do-not-play / flagged'),
        comment: z.string().optional(),
        confirmToken: confirmTokenParam,
      }),
    },
    async ({ eventId, sectionId, songIds, isMustPlay, isFlagged, comment, confirmToken }, ctx) => {
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
      const gate = await confirmWrite(ctx, {
        tool: 'vibo_update_song',
        mutation: 'updateSectionSongs',
        message: 'Review and confirm this song update:',
        confirmToken,
        target: sectionId,
        willSend: vars,
      });
      if (gate) return gate;
      const data = await client.gql<{ updateSectionSongs: unknown }>(UPDATE_SECTION_SONGS, vars);
      return minifiedResult(data.updateSectionSongs);
    },
  );

  server.registerTool(
    'vibo_move_song',
    {
      description: 'Move songs from one section to another. ' + CONFIRM_NOTE,
      annotations: toolAnnotations({ title: 'Move Vibo section songs', readOnly: false, destructive: false }),
      inputSchema: z.object({
        eventId: z.string().describe('Event id.'),
        sourceSectionId: z.string().describe('Section id the songs are currently in.'),
        targetSectionId: z.string().describe('Section id to move the songs to.'),
        songIds: z
          .array(z.string())
          .min(1)
          .describe('Song _ids from vibo_get_section_songs.'),
        confirmToken: confirmTokenParam,
      }),
    },
    async ({ eventId, sourceSectionId, targetSectionId, songIds, confirmToken }, ctx) => {
      const vars = { eventId, sourceSectionId, targetSectionId, songIds };
      const gate = await confirmWrite(ctx, {
        tool: 'vibo_move_song',
        mutation: 'moveSectionSongsV2',
        message: 'Review and confirm moving these songs:',
        confirmToken,
        target: sourceSectionId,
        willSend: vars,
      });
      if (gate) return gate;
      const data = await client.gql<{ moveSectionSongsV2: unknown }>(MOVE_SECTION_SONGS, vars);
      return minifiedResult(data.moveSectionSongsV2);
    },
  );

  server.registerTool(
    'vibo_reorder_songs',
    {
      description: 'Reorder songs within a section. ' + CONFIRM_NOTE,
      annotations: toolAnnotations({ title: 'Reorder Vibo section songs', readOnly: false, destructive: false }),
      inputSchema: z.object({
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
        confirmToken: confirmTokenParam,
      }),
    },
    async ({ eventId, sectionId, sourceSongIds, targetSongId, confirmToken }, ctx) => {
      const vars = { eventId, sectionId, sourceSongIds, targetSongId: targetSongId ?? null };
      const gate = await confirmWrite(ctx, {
        tool: 'vibo_reorder_songs',
        mutation: 'reorderSongsBatch',
        message: 'Review and confirm this reorder:',
        confirmToken,
        target: sectionId,
        willSend: vars,
      });
      if (gate) return gate;
      const data = await client.gql<{ reorderSongsBatch: unknown }>(REORDER_SONGS, vars);
      return minifiedResult(data.reorderSongsBatch);
    },
  );
}
