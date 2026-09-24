import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { client } from '../../src/client.js';
import { registerCommentTools } from '../../src/tools/comments.js';
import {
  CREATE_SONG_COMMENT,
  DELETE_SONG_COMMENT,
  CREATE_SECTION_COMMENT,
  DELETE_SECTION_COMMENT,
} from '../../src/gql.js';
import { createTestHarness, confirmCall } from '../helpers.js';
import { parseToolResult } from '@chrischall/mcp-utils/test';

const gql = vi.spyOn(client, 'gql').mockResolvedValue(undefined as never);
let harness: Awaited<ReturnType<typeof createTestHarness>>;

beforeEach(() => gql.mockClear());
afterAll(async () => { if (harness) await harness.close(); });

describe('comment tools', () => {
  it('setup', async () => {
    harness = await createTestHarness((s) => registerCommentTools(s, client));
  });

  it('vibo_comment_on_song previews then sends the message payload', async () => {
    const args = { eventId: 'e1', sectionId: 's1', songId: 'so1', message: 'play this loud' };
    const preview = await harness.callTool('vibo_comment_on_song', args);
    expect(gql).not.toHaveBeenCalled();
    expect(parseToolResult<{ status: string }>(preview).status).toBe('confirmation-required');

    gql.mockResolvedValue({ createSongComment: { _id: 'c1' } });
    await confirmCall(harness, 'vibo_comment_on_song', args, gql);
    expect(gql).toHaveBeenCalledWith(CREATE_SONG_COMMENT, {
      eventId: 'e1',
      sectionId: 's1',
      songId: 'so1',
      payload: { message: 'play this loud' },
    });
  });

  it('vibo_delete_song_comment is confirmation-gated', async () => {
    const args = { eventId: 'e1', sectionId: 's1', songId: 'so1', commentId: 'c1' };
    const preview = await harness.callTool('vibo_delete_song_comment', args);
    expect(gql).not.toHaveBeenCalled();
    expect(parseToolResult<{ status: string }>(preview).status).toBe('confirmation-required');

    gql.mockResolvedValue({ deleteSongComment: { deleted: true } });
    await confirmCall(harness, 'vibo_delete_song_comment', args, gql);
    expect(gql).toHaveBeenCalledWith(DELETE_SONG_COMMENT, args);
  });

  it('vibo_comment_on_section previews then sends the message payload', async () => {
    const args = { eventId: 'e1', sectionId: 's1', message: 'great vibe' };
    const preview = await harness.callTool('vibo_comment_on_section', args);
    expect(gql).not.toHaveBeenCalled();
    expect(parseToolResult<{ status: string }>(preview).status).toBe('confirmation-required');

    gql.mockResolvedValue({ createSectionComment: { _id: 'c2' } });
    await confirmCall(harness, 'vibo_comment_on_section', args, gql);
    expect(gql).toHaveBeenCalledWith(CREATE_SECTION_COMMENT, {
      eventId: 'e1',
      sectionId: 's1',
      payload: { message: 'great vibe' },
    });
  });

  it('vibo_delete_section_comment is confirmation-gated', async () => {
    const args = { eventId: 'e1', sectionId: 's1', commentId: 'c2' };
    const preview = await harness.callTool('vibo_delete_section_comment', args);
    expect(gql).not.toHaveBeenCalled();
    expect(parseToolResult<{ status: string }>(preview).status).toBe('confirmation-required');

    gql.mockResolvedValue({ deleteSectionComment: { deleted: true } });
    await confirmCall(harness, 'vibo_delete_section_comment', args, gql);
    expect(gql).toHaveBeenCalledWith(DELETE_SECTION_COMMENT, args);
  });
});
