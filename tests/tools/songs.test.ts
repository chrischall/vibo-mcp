import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { client } from '../../src/client.js';
import { registerSongTools } from '../../src/tools/songs.js';
import { GET_SECTION_SONGS, SEARCH_SONGS, ADD_SONG_TO_SECTION, TOGGLE_LIKE } from '../../src/gql.js';
import { createTestHarness } from '../helpers.js';
import { parseToolResult } from '@chrischall/mcp-utils/test';

const gql = vi.spyOn(client, 'gql').mockResolvedValue(undefined as never);
let harness: Awaited<ReturnType<typeof createTestHarness>>;

beforeEach(() => gql.mockClear());
afterAll(async () => { if (harness) await harness.close(); });

describe('song tools', () => {
  it('setup', async () => {
    harness = await createTestHarness((s) => registerSongTools(s));
  });

  it('vibo_get_section_songs applies filter + sort + pagination', async () => {
    gql.mockResolvedValue({ getSectionSongs: { songs: [], totalCount: 0 } });
    await harness.callTool('vibo_get_section_songs', {
      eventId: 'e1',
      sectionId: 's1',
      isMustPlay: true,
      sortField: 'likesCount',
      limit: 10,
    });
    expect(gql).toHaveBeenCalledWith(GET_SECTION_SONGS, {
      eventId: 'e1',
      sectionId: 's1',
      pagination: { skip: 0, limit: 10 },
      filter: { isMustPlay: true },
      sort: { field: 'likesCount', direction: 'desc' },
    });
  });

  it('vibo_search_songs defaults source to searchField', async () => {
    gql.mockResolvedValue({ getSongs: [] });
    await harness.callTool('vibo_search_songs', { eventId: 'e1', sectionId: 's1', query: 'abba' });
    expect(gql).toHaveBeenCalledWith(SEARCH_SONGS, {
      eventId: 'e1',
      sectionId: 's1',
      filter: { q: 'abba', source: 'searchField' },
      limit: 20,
    });
  });

  it('vibo_add_song_to_section previews then sends the song payload', async () => {
    const args = { eventId: 'e1', sectionId: 's1', songUrl: 'https://x/y', viboSongId: 'v1', title: 'T', artist: 'A' };
    const preview = await harness.callTool('vibo_add_song_to_section', args);
    expect(gql).not.toHaveBeenCalled();
    expect(parseToolResult<{ preview: boolean }>(preview).preview).toBe(true);

    gql.mockResolvedValue({ addSongToSection: { added: true } });
    await harness.callTool('vibo_add_song_to_section', { ...args, confirm: true });
    expect(gql).toHaveBeenCalledWith(ADD_SONG_TO_SECTION, {
      eventId: 'e1',
      sectionId: 's1',
      payload: { song: { songUrl: 'https://x/y', viboSongId: 'v1', title: 'T', artist: 'A' } },
    });
  });

  it('vibo_toggle_song_like is confirm-gated', async () => {
    const args = { eventId: 'e1', sectionId: 's1', songId: 'so1', liked: true };
    await harness.callTool('vibo_toggle_song_like', args);
    expect(gql).not.toHaveBeenCalled();
    gql.mockResolvedValue({ toggleLike: { liked: true } });
    await harness.callTool('vibo_toggle_song_like', { ...args, confirm: true });
    expect(gql).toHaveBeenCalledWith(TOGGLE_LIKE, args);
  });
});
