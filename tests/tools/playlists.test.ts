import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { client } from '../../src/client.js';
import { registerPlaylistTools } from '../../src/tools/playlists.js';
import {
  GET_PLAYLISTS,
  GET_PLAYLIST_SONGS,
  EXPORT_EVENT_TO_SPOTIFY,
  EXPORT_EVENT_TO_APPLE_MUSIC,
} from '../../src/gql.js';
import { createTestHarness, confirmCall } from '../helpers.js';
import { parseToolResult } from '@chrischall/mcp-utils/test';

const gql = vi.spyOn(client, 'gql').mockResolvedValue(undefined as never);
let harness: Awaited<ReturnType<typeof createTestHarness>>;

beforeEach(() => gql.mockClear());
afterAll(async () => { if (harness) await harness.close(); });

describe('playlist tools', () => {
  it('setup', async () => {
    harness = await createTestHarness((s) => registerPlaylistTools(s, client));
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

  it('vibo_get_playlists strips playlist cover images by default and keeps them on view: "full"', async () => {
    const payload = {
      getPlaylists: {
        playlists: [{ id: 'p1', name: 'Wedding', total: 3, images: [{ url: 'https://i.scdn.co/image/a', width: 640, height: 640 }] }],
      },
    };
    gql.mockResolvedValue(payload);
    const compact = parseToolResult<{ playlists: Array<Record<string, unknown>> }>(
      await harness.callTool('vibo_get_playlists', { source: 'spotify' }),
    );
    expect(compact.playlists[0]).toEqual({ id: 'p1', name: 'Wedding', total: 3 });
    gql.mockResolvedValue(payload);
    const full = parseToolResult<{ playlists: Array<Record<string, unknown>> }>(
      await harness.callTool('vibo_get_playlists', { source: 'spotify', view: 'full' }),
    );
    expect(full.playlists[0].images).toEqual(payload.getPlaylists.playlists[0].images);
  });

  it('vibo_get_playlist_songs strips track artwork by default but keeps the song link', async () => {
    gql.mockResolvedValue({
      getPlaylistSongs: {
        tracks: [{ id: 't1', title: 'T', artist: 'A', songUrl: 'https://open.spotify.com/track/x', images: [{ url: 'https://i.scdn.co/image/b' }] }],
      },
    });
    const out = parseToolResult<{ tracks: Array<Record<string, unknown>> }>(
      await harness.callTool('vibo_get_playlist_songs', { playlistId: 'p1', source: 'spotify' }),
    );
    expect(out.tracks[0]).toEqual({ id: 't1', title: 'T', artist: 'A', songUrl: 'https://open.spotify.com/track/x' });
  });

  it('vibo_export_event_to_spotify previews then exports', async () => {
    const args = { eventId: 'e1', sectionIds: ['s1', 's2'], title: 'My Set' };
    const preview = await harness.callTool('vibo_export_event_to_spotify', args);
    expect(gql).not.toHaveBeenCalled();
    expect(parseToolResult<{ status: string }>(preview).status).toBe('confirmation-required');

    gql.mockResolvedValue({ exportEventToSpotify: { playlistUrl: 'https://open.spotify/x' } });
    const res = await confirmCall(harness, 'vibo_export_event_to_spotify', args, gql);
    expect(gql).toHaveBeenCalledWith(EXPORT_EVENT_TO_SPOTIFY, {
      eventId: 'e1',
      sectionIds: ['s1', 's2'],
      title: 'My Set',
    });
    expect(parseToolResult<{ playlistUrl: string }>(res).playlistUrl).toContain('spotify');
  });

  it('vibo_export_event_to_apple_music is confirmation-gated', async () => {
    await harness.callTool('vibo_export_event_to_apple_music', { eventId: 'e1', sectionIds: ['s1'] });
    expect(gql).not.toHaveBeenCalled();
    gql.mockResolvedValue({ exportEventToAppleMusic: { playlistUrl: 'https://music.apple/x' } });
    await confirmCall(harness, 'vibo_export_event_to_apple_music', { eventId: 'e1', sectionIds: ['s1'] }, gql);
    expect(gql).toHaveBeenCalledWith(EXPORT_EVENT_TO_APPLE_MUSIC, { eventId: 'e1', sectionIds: ['s1'] });
  });
});
