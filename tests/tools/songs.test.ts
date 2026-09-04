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
    harness = await createTestHarness((s) => registerSongTools(s, client));
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

  it('vibo_search_songs annotates results with a quality verdict', async () => {
    gql.mockResolvedValue({
      getSongs: [
        {
          viboSongId: 'v1',
          songUrl: 'https://y/1',
          title: 'Tennessee Whiskey',
          artist: 'Chris Stapleton',
          links: { spotify: 'https://open.spotify.com/track/x', soundcloud: 'https://soundcloud.com/chris-stapleton-music/tennessee-whiskey' },
        },
        { viboSongId: 'v2', songUrl: 'https://y/2', title: 'Tennessee Whiskey', artist: 'board', links: {} },
      ],
    });
    const res = await harness.callTool('vibo_search_songs', {
      eventId: 'e1',
      sectionId: 's1',
      query: 'Chris Stapleton - Tennessee Whiskey',
    });
    const parsed = parseToolResult<{
      summary: { total: number; likelyOriginal: number; flagged: number };
      results: Array<{ viboSongId: string; quality: { confidence: string } }>;
    }>(res);
    expect(parsed.summary).toEqual({ total: 2, likelyOriginal: 1, flagged: 1 });
    expect(parsed.results[0]).toMatchObject({ viboSongId: 'v1', quality: { confidence: 'likely-original' } });
    expect(parsed.results[1]).toMatchObject({ viboSongId: 'v2', quality: { confidence: 'likely-not-original' } });
  });

  it('vibo_search_songs warns when the query omits the artist/title hyphen', async () => {
    gql.mockResolvedValue({ getSongs: [] });
    const res = await harness.callTool('vibo_search_songs', {
      eventId: 'e1',
      sectionId: 's1',
      query: 'Chris Stapleton Tennessee Whiskey',
    });
    expect(parseToolResult<{ hint?: string }>(res).hint).toMatch(/"<Artist> - <Title>" form/);
  });

  it('vibo_search_songs passes through a non-array payload untouched', async () => {
    gql.mockResolvedValue({ getSongs: { unexpected: 'shape' } });
    const res = await harness.callTool('vibo_search_songs', { eventId: 'e1', sectionId: 's1', query: 'abba' });
    expect(parseToolResult<{ unexpected: string }>(res).unexpected).toBe('shape');
  });

  // ---- vibo_search_songs: the `view` rung ---------------------------------
  //
  // The ARRAY branch is the one that runs on every real call, and it used to
  // end at `minifiedResult` while only the never-fired non-array branch went
  // through `viewResponse` — so `view: 'compact'` stripped nothing on the one
  // path a caller can reach. `annotateSearchResults` SPREADS Vibo's own song
  // objects (`{ ...song, quality }`), so every artwork/thumbnail URL the
  // catalog carries per track came straight back. These tests exercise the
  // array path specifically, which is where the bug lived.
  const withArtwork = () => ({
    getSongs: [
      {
        viboSongId: 'v1',
        songUrl: 'https://y/1',
        title: 'Tennessee Whiskey',
        artist: 'Chris Stapleton',
        artworkUrl: 'https://img.vibo.com/v1/art.jpg',
        thumbnail: 'https://img.vibo.com/v1/thumb',
        links: { spotify: 'https://open.spotify.com/track/x' },
      },
    ],
  });
  const searchArgs = {
    eventId: 'e1',
    sectionId: 's1',
    query: 'Chris Stapleton - Tennessee Whiskey',
  };

  it('vibo_search_songs strips media URLs on the ARRAY path by DEFAULT', async () => {
    // Compact is the DEFAULT rung: an efficiency a caller has to ask for is
    // one they mostly do not, so omitting `view` must already strip.
    gql.mockResolvedValue(withArtwork());
    const res = await harness.callTool('vibo_search_songs', searchArgs);
    const parsed = parseToolResult<{ results: Array<Record<string, unknown>> }>(res);
    const song = parsed.results[0]!;
    expect(song.artworkUrl).toBeUndefined();
    expect(song.thumbnail).toBeUndefined();
    // Subtractive: everything that is not a picture survives, including the
    // streaming links the quality verdict is computed from and the verdict
    // itself — this tool's whole product.
    expect(song.songUrl).toBe('https://y/1');
    expect(song.links).toEqual({ spotify: 'https://open.spotify.com/track/x' });
    expect(song.quality).toBeDefined();
  });

  it('vibo_search_songs returns media URLs on the ARRAY path with view: "full"', async () => {
    gql.mockResolvedValue(withArtwork());
    const res = await harness.callTool('vibo_search_songs', { ...searchArgs, view: 'full' });
    const song = parseToolResult<{ results: Array<Record<string, unknown>> }>(res).results[0]!;
    expect(song.artworkUrl).toBe('https://img.vibo.com/v1/art.jpg');
    expect(song.thumbnail).toBe('https://img.vibo.com/v1/thumb');
  });

  it('vibo_search_songs emits a single line on both rungs', async () => {
    for (const args of [searchArgs, { ...searchArgs, view: 'full' }]) {
      gql.mockResolvedValue(withArtwork());
      const res = await harness.callTool('vibo_search_songs', args);
      expect(((res.content as { text: string }[])[0]!.text).includes('\n')).toBe(false);
    }
  });

  it('vibo_search_songs keeps whitespace INSIDE a value byte-identical', async () => {
    // A track title's internal spacing is content, not layout; minifying drops
    // only the indent and the runs after `:` and `,`.
    const title = 'Tennessee  Whiskey\t(Live)';
    gql.mockResolvedValue({ getSongs: [{ viboSongId: 'v1', songUrl: 'https://y/1', title, artist: 'Chris Stapleton', links: {} }] });
    const res = await harness.callTool('vibo_search_songs', searchArgs);
    const song = parseToolResult<{ results: Array<{ title: string }> }>(res).results[0]!;
    expect(song.title).toBe(title);
  });

  it('vibo_search_songs never forwards `view` upstream', async () => {
    // `view` is a RESPONSE-shape argument; Vibo has never heard of it. Two
    // sibling repos shipped a handler that forwarded its whole args object
    // into a query and sent `view=compact` to the live API.
    gql.mockResolvedValue(withArtwork());
    await harness.callTool('vibo_search_songs', { ...searchArgs, view: 'full' });
    expect(gql).toHaveBeenCalledWith(SEARCH_SONGS, {
      eventId: 'e1',
      sectionId: 's1',
      filter: { q: 'Chris Stapleton - Tennessee Whiskey', source: 'searchField' },
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
