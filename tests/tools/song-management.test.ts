import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { client } from '../../src/client.js';
import { registerSongManagementTools } from '../../src/tools/song-management.js';
import { REMOVE_SECTION_SONGS, UPDATE_SECTION_SONGS, MOVE_SECTION_SONGS, REORDER_SONGS } from '../../src/gql.js';
import { createTestHarness, confirmCall } from '../helpers.js';
import { parseToolResult } from '@chrischall/mcp-utils/test';

const gql = vi.spyOn(client, 'gql').mockResolvedValue(undefined as never);
let harness: Awaited<ReturnType<typeof createTestHarness>>;

beforeEach(() => gql.mockClear());
afterAll(async () => { if (harness) await harness.close(); });

describe('song management tools', () => {
  it('setup', async () => {
    harness = await createTestHarness((s) => registerSongManagementTools(s, client));
  });

  it('vibo_remove_song_from_section is confirmation-gated', async () => {
    const args = { eventId: 'e1', sectionId: 's1', songIds: ['so1', 'so2'] };
    const preview = await harness.callTool('vibo_remove_song_from_section', args);
    expect(gql).not.toHaveBeenCalled();
    expect(parseToolResult<{ status: string }>(preview).status).toBe('confirmation-required');

    gql.mockResolvedValue({ removeSectionSongsV2: { success: true } });
    await confirmCall(harness, 'vibo_remove_song_from_section', args, gql);
    expect(gql).toHaveBeenCalledWith(REMOVE_SECTION_SONGS, args);
  });

  it('vibo_update_song is confirmation-gated', async () => {
    const args = { eventId: 'e1', sectionId: 's1', songIds: ['so1'], isMustPlay: true };
    const preview = await harness.callTool('vibo_update_song', args);
    expect(gql).not.toHaveBeenCalled();
    expect(parseToolResult<{ status: string }>(preview).status).toBe('confirmation-required');

    gql.mockResolvedValue({ updateSectionSongs: [{ _id: 'so1', isMustPlay: true }] });
    await confirmCall(harness, 'vibo_update_song', args, gql);
    expect(gql).toHaveBeenCalledWith(UPDATE_SECTION_SONGS, {
      eventId: 'e1',
      sectionId: 's1',
      songIds: ['so1'],
      payload: { isMustPlay: true },
    });
  });

  it('vibo_update_song errors when no fields are provided', async () => {
    const res = await harness.callTool('vibo_update_song', {
      eventId: 'e1',
      sectionId: 's1',
      songIds: ['so1'],
    });
    expect(res.isError).toBeTruthy();
    expect(gql).not.toHaveBeenCalled();
  });

  it('vibo_update_song sends only the provided payload fields', async () => {
    gql.mockResolvedValue({ updateSectionSongs: [] });
    await confirmCall(harness, 'vibo_update_song', {
      eventId: 'e1',
      sectionId: 's1',
      songIds: ['so1'],
      isFlagged: true,
      comment: 'do not play',
    }, gql);
    expect(gql).toHaveBeenCalledWith(UPDATE_SECTION_SONGS, {
      eventId: 'e1',
      sectionId: 's1',
      songIds: ['so1'],
      payload: { isFlagged: true, comment: 'do not play' },
    });
  });

  it('vibo_move_song is confirmation-gated', async () => {
    const args = { eventId: 'e1', sourceSectionId: 's1', targetSectionId: 's2', songIds: ['so1'] };
    const preview = await harness.callTool('vibo_move_song', args);
    expect(gql).not.toHaveBeenCalled();
    expect(parseToolResult<{ status: string }>(preview).status).toBe('confirmation-required');

    gql.mockResolvedValue({ moveSectionSongsV2: { success: true } });
    await confirmCall(harness, 'vibo_move_song', args, gql);
    expect(gql).toHaveBeenCalledWith(MOVE_SECTION_SONGS, args);
  });

  it('vibo_reorder_songs is confirmation-gated', async () => {
    const args = { eventId: 'e1', sectionId: 's1', sourceSongIds: ['so1', 'so2'], targetSongId: 'so3' };
    const preview = await harness.callTool('vibo_reorder_songs', args);
    expect(gql).not.toHaveBeenCalled();
    expect(parseToolResult<{ status: string }>(preview).status).toBe('confirmation-required');

    gql.mockResolvedValue({ reorderSongsBatch: true });
    await confirmCall(harness, 'vibo_reorder_songs', args, gql);
    expect(gql).toHaveBeenCalledWith(REORDER_SONGS, {
      eventId: 'e1',
      sectionId: 's1',
      sourceSongIds: ['so1', 'so2'],
      targetSongId: 'so3',
    });
  });

  it('vibo_reorder_songs defaults targetSongId to null', async () => {
    gql.mockResolvedValue({ reorderSongsBatch: true });
    await confirmCall(harness, 'vibo_reorder_songs', {
      eventId: 'e1',
      sectionId: 's1',
      sourceSongIds: ['so1'],
    }, gql);
    expect(gql).toHaveBeenCalledWith(REORDER_SONGS, {
      eventId: 'e1',
      sectionId: 's1',
      sourceSongIds: ['so1'],
      targetSongId: null,
    });
  });
});
