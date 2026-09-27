import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { client } from '../../src/client.js';
import { registerSongManagementTools } from '../../src/tools/song-management.js';
import { REMOVE_SECTION_SONGS, UPDATE_SECTION_SONGS, MOVE_SECTION_SONGS, REORDER_SONGS } from '../../src/gql.js';
import { createTestHarness, confirmCall, previewCall } from '../helpers.js';
import { installFakeVibo, section, songOrder } from '../fake-vibo.js';
import { parseToolResult } from '@chrischall/mcp-utils/test';

const gql = vi.spyOn(client, 'gql').mockResolvedValue(undefined as never);
let harness: Awaited<ReturnType<typeof createTestHarness>>;

beforeEach(() => { gql.mockClear(); gql.mockImplementation((async () => undefined) as never); });
afterAll(async () => { if (harness) await harness.close(); });

describe('song management tools', () => {
  it('setup', async () => {
    harness = await createTestHarness((s) => registerSongManagementTools(s, client));
  });

  const songsIn = (...ids: string[]) => ids.map((id) => ({ _id: id, viboSongId: `v-${id}`, title: `T${id}`, artist: 'A' }));
  const fakeWith = (songs = songsIn('so1', 'so2', 'so3', 'so4'), sectionOver = {}, role = 'host') =>
    installFakeVibo(gql, {
      event: { _id: 'e1', role, isLocked: false, settings: {} },
      sections: [section('s1', { name: 'Ceremony', ...sectionOver })],
      songs: { s1: songs },
    });

  it('vibo_remove_song_from_section checks the ids, previews the songs, then removes', async () => {
    const { writes } = fakeWith();
    const args = { eventId: 'e1', sectionId: 's1', songIds: ['so1', 'so2'] };
    const { preview } = await previewCall(harness, 'vibo_remove_song_from_section', args);
    expect((preview as unknown as { context: unknown }).context).toEqual({ songs: ['Tso1 — A', 'Tso2 — A'] });
    await confirmCall(harness, 'vibo_remove_song_from_section', args, writes);
    expect(writes).toHaveBeenCalledWith(REMOVE_SECTION_SONGS, args);
  });

  it('vibo_remove_song_from_section refuses ids not in the section and lists them (Vibo would say success)', async () => {
    const { writes } = fakeWith();
    const res = await harness.callTool('vibo_remove_song_from_section', {
      eventId: 'e1',
      sectionId: 's1',
      songIds: ['so1', 'ghost', 'v-so3'],
    });
    expect(res.isError).toBe(true);
    const text = JSON.stringify(res);
    expect(text).toContain('2 of 3');
    expect(text).toContain('ghost');
    expect(text).toContain('v-so3 is a viboSongId');
    expect(text).toContain('so3');
    expect(writes).not.toHaveBeenCalled();
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

  it('vibo_update_song refuses a comment over 90 characters before the confirmation step', async () => {
    const base = { eventId: 'e1', sectionId: 's1', songIds: ['so1'] };
    const res = await harness.callTool('vibo_update_song', { ...base, comment: 'x'.repeat(91) });
    expect(res.isError).toBe(true);
    expect(JSON.stringify(res)).toContain('at most 90');
    // Emoji count double, as Vibo counts them (46 emoji = 92 units was refused live).
    expect((await harness.callTool('vibo_update_song', { ...base, comment: '😀'.repeat(46) })).isError).toBe(true);
    expect(gql).not.toHaveBeenCalled();
    // 90 is the longest Vibo stores (measured live) — it reaches the confirmation preview.
    const ok = await harness.callTool('vibo_update_song', { ...base, comment: 'x'.repeat(90) });
    expect(parseToolResult<{ status: string }>(ok).status).toBe('confirmation-required');
  });

  it('vibo_reorder_songs places songs AFTER the target, one call per moved song', async () => {
    const { writes, state } = fakeWith();
    const args = { eventId: 'e1', sectionId: 's1', sourceSongIds: ['so4'], targetSongId: 'so1' };
    const { preview } = await previewCall(harness, 'vibo_reorder_songs', args);
    expect(preview.willSend).toEqual({
      eventId: 'e1',
      sectionId: 's1',
      calls: [{ sourceSongIds: ['so4'], targetSongId: 'so1' }],
    });
    await confirmCall(harness, 'vibo_reorder_songs', args, writes);
    expect(writes).toHaveBeenCalledWith(REORDER_SONGS, { eventId: 'e1', sectionId: 's1', sourceSongIds: ['so4'], targetSongId: 'so1' });
    expect(songOrder(state, 's1')).toEqual(['so1', 'so4', 'so2', 'so3']);
  });

  it('vibo_reorder_songs with no target moves the songs to the top, in order', async () => {
    const { writes, state } = fakeWith();
    const args = { eventId: 'e1', sectionId: 's1', sourceSongIds: ['so3', 'so4'] };
    const { confirmToken } = await previewCall(harness, 'vibo_reorder_songs', args);
    await harness.callTool('vibo_reorder_songs', { ...args, confirmToken });
    expect(writes).toHaveBeenCalledTimes(2);
    expect(songOrder(state, 's1')).toEqual(['so3', 'so4', 'so1', 'so2']);
  });

  it('vibo_reorder_songs explains a host blocked by the section setting instead of sending a doomed request', async () => {
    const { writes } = fakeWith(undefined, { settings: { canHostsOrderSongs: false } });
    const res = await harness.callTool('vibo_reorder_songs', { eventId: 'e1', sectionId: 's1', sourceSongIds: ['so4'] });
    expect(res.isError).toBe(true);
    expect(JSON.stringify(res)).toContain('canHostsOrderSongs');
    expect(writes).not.toHaveBeenCalled();
  });

  it('vibo_reorder_songs lets the DJ reorder regardless of the host setting', async () => {
    const { writes } = fakeWith(undefined, { settings: { canHostsOrderSongs: false } }, 'dj');
    await confirmCall(harness, 'vibo_reorder_songs', { eventId: 'e1', sectionId: 's1', sourceSongIds: ['so4'] }, writes);
  });

  it('vibo_reorder_songs refuses ids not in the section, and is a no-op when already in place', async () => {
    const { writes } = fakeWith();
    const bad = await harness.callTool('vibo_reorder_songs', { eventId: 'e1', sectionId: 's1', sourceSongIds: ['ghost'] });
    expect(bad.isError).toBe(true);
    const noop = await harness.callTool('vibo_reorder_songs', { eventId: 'e1', sectionId: 's1', sourceSongIds: ['so2'], targetSongId: 'so1' });
    expect(parseToolResult<{ changed: boolean }>(noop).changed).toBe(false);
    expect(writes).not.toHaveBeenCalled();
  });
});
