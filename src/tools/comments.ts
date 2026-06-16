import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { textResult, toolAnnotations, schemaConfirm } from '@chrischall/mcp-utils';
import { client } from '../client.js';
import {
  CREATE_SONG_COMMENT,
  DELETE_SONG_COMMENT,
  CREATE_SECTION_COMMENT,
  DELETE_SECTION_COMMENT,
} from '../gql.js';
import { previewResult } from './shared.js';

export function registerCommentTools(server: McpServer): void {
  server.registerTool(
    'vibo_comment_on_song',
    {
      description: 'Leave a comment / note for the DJ on a specific song. Confirm-gated.',
      annotations: toolAnnotations({ title: 'Comment on Vibo song', readOnly: false }),
      inputSchema: {
        eventId: z.string().describe('Event id.'),
        sectionId: z.string().describe('Section id.'),
        songId: z.string().describe('Song _id (from vibo_get_section_songs).'),
        message: z.string().describe('The comment text.'),
        confirm: schemaConfirm,
      },
    },
    async ({ eventId, sectionId, songId, message, confirm }) => {
      const vars = { eventId, sectionId, songId, payload: { message } };
      if (!confirm) return previewResult('createSongComment', vars);
      const data = await client.gql<{ createSongComment: unknown }>(CREATE_SONG_COMMENT, vars);
      return textResult(data.createSongComment);
    },
  );

  server.registerTool(
    'vibo_delete_song_comment',
    {
      description: 'Delete a comment on a song. Confirm-gated.',
      annotations: toolAnnotations({ title: 'Delete Vibo song comment', readOnly: false }),
      inputSchema: {
        eventId: z.string().describe('Event id.'),
        sectionId: z.string().describe('Section id.'),
        songId: z.string().describe('Song _id (from vibo_get_section_songs).'),
        commentId: z.string().describe('Comment _id to delete.'),
        confirm: schemaConfirm,
      },
    },
    async ({ eventId, sectionId, songId, commentId, confirm }) => {
      const vars = { eventId, sectionId, songId, commentId };
      if (!confirm) return previewResult('deleteSongComment', vars);
      const data = await client.gql<{ deleteSongComment: unknown }>(DELETE_SONG_COMMENT, vars);
      return textResult(data.deleteSongComment);
    },
  );

  server.registerTool(
    'vibo_comment_on_section',
    {
      description: 'Leave a comment on a timeline section. Confirm-gated.',
      annotations: toolAnnotations({ title: 'Comment on Vibo section', readOnly: false }),
      inputSchema: {
        eventId: z.string().describe('Event id.'),
        sectionId: z.string().describe('Section id (from vibo_list_sections).'),
        message: z.string().describe('The comment text.'),
        confirm: schemaConfirm,
      },
    },
    async ({ eventId, sectionId, message, confirm }) => {
      const vars = { eventId, sectionId, payload: { message } };
      if (!confirm) return previewResult('createSectionComment', vars);
      const data = await client.gql<{ createSectionComment: unknown }>(CREATE_SECTION_COMMENT, vars);
      return textResult(data.createSectionComment);
    },
  );

  server.registerTool(
    'vibo_delete_section_comment',
    {
      description: 'Delete a comment on a timeline section. Confirm-gated.',
      annotations: toolAnnotations({ title: 'Delete Vibo section comment', readOnly: false }),
      inputSchema: {
        eventId: z.string().describe('Event id.'),
        sectionId: z.string().describe('Section id (from vibo_list_sections).'),
        commentId: z.string().describe('Comment _id to delete.'),
        confirm: schemaConfirm,
      },
    },
    async ({ eventId, sectionId, commentId, confirm }) => {
      const vars = { eventId, sectionId, commentId };
      if (!confirm) return previewResult('deleteSectionComment', vars);
      const data = await client.gql<{ deleteSectionComment: unknown }>(DELETE_SECTION_COMMENT, vars);
      return textResult(data.deleteSectionComment);
    },
  );
}
