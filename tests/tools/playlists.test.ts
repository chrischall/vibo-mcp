import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { client } from '../../src/client.js';
import { registerPlaylistTools } from '../../src/tools/playlists.js';
import {
  GET_PLAYLISTS,
  GET_PLAYLIST_SONGS,
  EXPORT_EVENT_TO_SPOTIFY,
  EXPORT_EVENT_TO_APPLE_MUSIC,
} from '../../src/gql.js';
import { createTestHarness } from '../helpers.js';
import { parseToolResult } from '@chrischall/mcp-utils/test';

const gql = vi.spyOn(client, 'gql').mockResolvedValue(undefined as never);
let harness: Awaited<ReturnType<typeof createTestHarness>>;

beforeEach(() => gql.mockClear());
afterAll(async () => { if (harness) await harness.close(); });

describe('playlist tools', () => {
  it('setup', async () => {
    harness = await createTestHarness((s) => registerPlaylistTools(s));
  });

  it('vibo_get_playlists passes source + pagination', async () => {
    gql.mockResolvedValue({ getPlaylists: { playlists: [] } });
    await harness.callTool('vibo_get_playlists', { source: 'spotify' });
    expect(gql).toHaveBeenCalledWith(GET_PLAYLISTS, { source: 'spotify', pagination: { skip: 0, limit: 20 } });
  });

  it('vibo_get_playlist_songs passes playlistId + source', async () => {
    gql.mockResolvedValue({ getPlaylistSongs: { tracks: [] } });
    await harness.callTool('vibo_get_playlist_songs', { playlistId: 'p1', source: 'appleMusic' });
    expect(gql).toHaveBeenCalledWith(GET_PLAYLIST_SONGS, {
      playlistId: 'p1',
      source: 'appleMusic',
      pagination: { skip: 0, limit: 20 },
    });
  });

  it('vibo_export_event_to_spotify previews then exports', async () => {
    const args = { eventId: 'e1', sectionIds: ['s1', 's2'], title: 'My Set' };
    const preview = await harness.callTool('vibo_export_event_to_spotify', args);
    expect(gql).not.toHaveBeenCalled();
    expect(parseToolResult<{ preview: boolean }>(preview).preview).toBe(true);

    gql.mockResolvedValue({ exportEventToSpotify: { playlistUrl: 'https://open.spotify/x' } });
    const res = await harness.callTool('vibo_export_event_to_spotify', { ...args, confirm: true });
    expect(gql).toHaveBeenCalledWith(EXPORT_EVENT_TO_SPOTIFY, {
      eventId: 'e1',
      sectionIds: ['s1', 's2'],
      title: 'My Set',
    });
    expect(parseToolResult<{ playlistUrl: string }>(res).playlistUrl).toContain('spotify');
  });

  it('vibo_export_event_to_apple_music is confirm-gated', async () => {
    await harness.callTool('vibo_export_event_to_apple_music', { eventId: 'e1', sectionIds: ['s1'] });
    expect(gql).not.toHaveBeenCalled();
    gql.mockResolvedValue({ exportEventToAppleMusic: { playlistUrl: 'https://music.apple/x' } });
    await harness.callTool('vibo_export_event_to_apple_music', { eventId: 'e1', sectionIds: ['s1'], confirm: true });
    expect(gql).toHaveBeenCalledWith(EXPORT_EVENT_TO_APPLE_MUSIC, { eventId: 'e1', sectionIds: ['s1'] });
  });
});
