import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { client } from '../../src/client.js';
import { registerSongTools, addVerifyDelaysMs } from '../../src/tools/songs.js';
import { GET_SECTION_SONGS, SEARCH_SONGS, ADD_SONG_TO_SECTION, TOGGLE_LIKE } from '../../src/gql.js';
import { createTestHarness, confirmCall, previewCall } from '../helpers.js';
import { installFakeVibo, section } from '../fake-vibo.js';

addVerifyDelaysMs.fill(0);
import { parseToolResult } from '@chrischall/mcp-utils/test';

const gql = vi.spyOn(client, 'gql').mockResolvedValue(undefined as never);
let harness: Awaited<ReturnType<typeof createTestHarness>>;

beforeEach(() => { gql.mockClear(); gql.mockImplementation((async () => undefined) as never); });
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

  const fakeAdd = (replies?: Record<string, unknown>) =>
    installFakeVibo(gql, { event: { _id: 'e1' }, sections: [section('s1')], songs: { s1: [] }, replies });
  const addArgs = { eventId: 'e1', sectionId: 's1', songUrl: 'https://x/y', viboSongId: 'v1', title: 'T', artist: 'A' };

  it('vibo_add_song_to_section previews, sends the song payload, and confirms it landed', async () => {
    const { writes } = fakeAdd();
    const res = await confirmCall(harness, 'vibo_add_song_to_section', addArgs, writes);
    expect(writes).toHaveBeenCalledWith(ADD_SONG_TO_SECTION, {
      eventId: 'e1',
      sectionId: 's1',
      payload: { song: { songUrl: 'https://x/y', viboSongId: 'v1', title: 'T', artist: 'A' } },
    });
    expect(parseToolResult<{ verified: boolean }>(res).verified).toBe(true);
  });

  it('vibo_add_song_to_section reports failure when added:true but the song is not in the section', async () => {
    const { writes, state } = fakeAdd({ addSongToSection: { added: true, songId: 'ss9', totalCount: 0 } });
    const { confirmToken } = await previewCall(harness, 'vibo_add_song_to_section', addArgs);
    const res = await harness.callTool('vibo_add_song_to_section', { ...addArgs, confirmToken });
    expect(writes).toHaveBeenCalledTimes(1);
    expect(res.isError).toBe(true);
    expect(JSON.stringify(res)).toContain('NOT added');
    expect(state.songs.s1).toHaveLength(0);
    // It re-read more than once before concluding (re-reads can be stale).
    const reads = gql.mock.calls.filter(([doc]) => doc !== ADD_SONG_TO_SECTION);
    expect(reads.length).toBe(addVerifyDelaysMs.length);
  });

  it('vibo_add_song_to_section accepts a late-appearing song (stale first re-read)', async () => {
    const { state } = fakeAdd({ addSongToSection: { added: true, songId: 'ss9' } });
    let reads = 0;
    const real = gql.getMockImplementation()!;
    gql.mockImplementation((async (doc: string, vars: Record<string, unknown>) => {
      if (doc !== ADD_SONG_TO_SECTION && ++reads === 2) state.songs.s1.push({ _id: 'ss9', viboSongId: 'v1' });
      return real(doc, vars);
    }) as never);
    const { confirmToken } = await previewCall(harness, 'vibo_add_song_to_section', addArgs);
    const res = await harness.callTool('vibo_add_song_to_section', { ...addArgs, confirmToken });
    expect(parseToolResult<{ verified: boolean }>(res).verified).toBe(true);
  });

  it('vibo_add_song_to_section surfaces added:false as an error', async () => {
    fakeAdd({ addSongToSection: { added: false } });
    const { confirmToken } = await previewCall(harness, 'vibo_add_song_to_section', addArgs);
    const res = await harness.callTool('vibo_add_song_to_section', { ...addArgs, confirmToken });
    expect(res.isError).toBe(true);
  });

  it('vibo_toggle_song_like is confirmation-gated', async () => {
    const args = { eventId: 'e1', sectionId: 's1', songId: 'so1', liked: true };
    await harness.callTool('vibo_toggle_song_like', args);
    expect(gql).not.toHaveBeenCalled();
    gql.mockResolvedValue({ toggleLike: { liked: true } });
    await confirmCall(harness, 'vibo_toggle_song_like', args, gql);
    expect(gql).toHaveBeenCalledWith(TOGGLE_LIKE, args);
  });

  it('vibo_get_section_songs drops thumbnails by DEFAULT and keeps them on view:"full"', async () => {
    const payload = {
      getSectionSongs: {
        songs: [
          {
            _id: 's1',
            viboSongId: 'v1',
            title: 'Thinking Out Loud',
            artist: 'Ed Sheeran',
            likesCount: 3,
            thumbnails: { s180x180: 'https://img.vibo.com/a.jpg', original: 'https://img.vibo.com/b.jpg' },
            links: { spotify: 'https://open.spotify.com/track/x' },
          },
        ],
        totalCount: 1,
      },
    };
    gql.mockResolvedValue(payload);
    const compact = parseToolResult<{ songs: Array<Record<string, unknown>> }>(
      await harness.callTool('vibo_get_section_songs', { eventId: 'e1', sectionId: 's1' }),
    );
    expect(compact.songs[0]!.thumbnails).toBeUndefined();
    expect(compact.songs[0]!.likesCount).toBe(3);
    expect(compact.songs[0]!.links).toEqual({ spotify: 'https://open.spotify.com/track/x' });

    gql.mockResolvedValue(payload);
    const full = parseToolResult<{ songs: Array<Record<string, unknown>> }>(
      await harness.callTool('vibo_get_section_songs', { eventId: 'e1', sectionId: 's1', view: 'full' }),
    );
    expect(full.songs[0]!.thumbnails).toEqual({ s180x180: 'https://img.vibo.com/a.jpg', original: 'https://img.vibo.com/b.jpg' });
  });

});
