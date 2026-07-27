import { describe, it, expect } from 'vitest';
import {
  annotateSearchResults,
  assessSong,
  normalizeName,
  parseSearchQuery,
  type SearchSong,
} from '../src/song-search.js';

/**
 * Fixtures are verbatim results captured from the live Vibo catalog, so these
 * tests pin the heuristics against real data rather than invented shapes.
 */
const OFFICIAL_STAPLETON: SearchSong = {
  title: 'Tennessee Whiskey',
  artist: 'Chris Stapleton',
  links: {
    spotify: 'https://open.spotify.com/track/3fqwjXwUGN6vbzIwvyFMhx',
    appleMusic: 'https://geo.music.apple.com/us/album/_/1440827477?i=1440827492',
    youtube: 'https://www.youtube.com/watch?v=4zAThXFOy2c',
    tidal: 'https://listen.tidal.com/track/44832786',
    soundcloud: 'https://soundcloud.com/chris-stapleton-music/tennessee-whiskey',
    deezer: 'https://www.deezer.com/track/98975170',
  },
};

const JUNK_ARTIST_REUPLOAD: SearchSong = {
  title: 'Chris Stapleton Tennessee Whiskey',
  artist: 'board',
  links: {
    spotify: 'https://open.spotify.com/track/3fqwjXwUGN6vbzIwvyFMhx',
    appleMusic: null,
    youtube: 'https://www.youtube.com/watch?v=JqPcXhqQHQ8',
    tidal: null,
    soundcloud: 'https://soundcloud.com/chris-stapleton-music/tennessee-whiskey',
    deezer: null,
  },
};

const SING_KING_KARAOKE: SearchSong = {
  title: 'Chris Stapleton - Tennessee Whiskey',
  artist: 'Sing King',
  links: { spotify: null, appleMusic: null, youtube: 'https://www.youtube.com/watch?v=DVxVXBpi7vc', tidal: null, soundcloud: null, deezer: null },
};

const MAGGS_COVER: SearchSong = {
  title: 'Speechless (Dan and Shay Cover)',
  artist: 'Brittany Maggs',
  links: {
    spotify: 'https://open.spotify.com/track/4mj7CltJPiW04ANoxgiVTw',
    appleMusic: 'https://geo.music.apple.com/us/album/_/1454532271?i=1454532276',
    youtube: 'https://www.youtube.com/watch?v=23T4yFSsW_g',
    tidal: 'https://listen.tidal.com/track/104935538',
    soundcloud: 'https://soundcloud.com/wejustmusic-co-ltd/mr-dan-shay-speechlessbrittany-maggs-cover-by',
    deezer: 'https://www.deezer.com/track/640886542',
  },
};

const GUIBOUX_COVER: SearchSong = {
  title: "Can't Help Falling in Love - Elvis Presley",
  artist: 'Amélie Guiboux',
  links: { spotify: null, appleMusic: null, youtube: 'https://www.youtube.com/watch?v=5EzbMtyovI8', tidal: null, soundcloud: null, deezer: null },
};

const OFFICIAL_ELVIS: SearchSong = {
  title: "Can't Help Falling In Love",
  artist: 'Elvis Presley',
  links: {
    spotify: 'https://open.spotify.com/track/67LD9lH0jgZJZuVxJo8B5N',
    appleMusic: 'https://geo.music.apple.com/us/album/_/388127843?i=388128266',
    youtube: 'https://www.youtube.com/watch?v=O-aavAlSYgc',
    tidal: 'https://listen.tidal.com/track/5119997',
    soundcloud: 'https://soundcloud.com/elvissonymusic/cant-help-falling-in-love-17',
    deezer: 'https://www.deezer.com/track/1045616',
  },
};

const OFFICIAL_DAN_SHAY: SearchSong = {
  title: 'Speechless',
  artist: 'Dan + Shay',
  links: {
    spotify: 'https://open.spotify.com/track/3GJ4hzg4lrGwU51Y3VARbF',
    appleMusic: 'https://geo.music.apple.com/us/album/_/1626959561?i=1626960160',
    youtube: 'https://www.youtube.com/watch?v=7UoP9ABJXGE',
    tidal: 'https://listen.tidal.com/track/88785493',
    soundcloud: 'https://soundcloud.com/danandshay/speechless',
    deezer: 'https://www.deezer.com/track/499632732',
  },
};

const stapletonQuery = parseSearchQuery('Chris Stapleton - Tennessee Whiskey');

describe('parseSearchQuery', () => {
  it('splits the "<Artist> - <Title>" form', () => {
    expect(parseSearchQuery('Ed Sheeran - Thinking Out Loud')).toEqual({
      raw: 'Ed Sheeran - Thinking Out Loud',
      artist: 'Ed Sheeran',
      title: 'Thinking Out Loud',
      structured: true,
    });
  });

  it('treats an unhyphenated query as unstructured', () => {
    expect(parseSearchQuery('Ed Sheeran Thinking Out Loud').structured).toBe(false);
  });

  it('does not split on a hyphen inside a name', () => {
    expect(parseSearchQuery('Jay-Z - 99 Problems')).toMatchObject({ artist: 'Jay-Z', title: '99 Problems' });
  });

  it('requires whitespace around the separator', () => {
    expect(parseSearchQuery('Jay-Z').structured).toBe(false);
  });

  it('accepts en and em dashes', () => {
    expect(parseSearchQuery('Elvis Presley – Suspicious Minds').structured).toBe(true);
    expect(parseSearchQuery('Elvis Presley — Suspicious Minds').structured).toBe(true);
  });
});

describe('normalizeName', () => {
  it('folds "+", "&" and "and" together', () => {
    expect(normalizeName('Dan + Shay')).toBe(normalizeName('Dan & Shay'));
    expect(normalizeName('Dan + Shay')).toBe(normalizeName('Dan and Shay'));
  });

  it('strips diacritics', () => {
    expect(normalizeName('Amélie Guiboux')).toBe('amelie guiboux');
  });
});

describe('assessSong', () => {
  it('passes the official recording', () => {
    expect(assessSong(OFFICIAL_STAPLETON, stapletonQuery)).toEqual({
      confidence: 'likely-original',
      warnings: [],
    });
  });

  it('passes an official recording whose SoundCloud lives on a label account', () => {
    const elvis = assessSong(OFFICIAL_ELVIS, parseSearchQuery("Elvis Presley - Can't Help Falling in Love"));
    expect(elvis.confidence).toBe('likely-original');
  });

  it('passes an artist whose name uses "+" against a query using "and"', () => {
    const result = assessSong(OFFICIAL_DAN_SHAY, parseSearchQuery('Dan and Shay - Speechless'));
    expect(result.confidence).toBe('likely-original');
  });

  it('flags a placeholder artist field', () => {
    const result = assessSong(JUNK_ARTIST_REUPLOAD, stapletonQuery);
    expect(result.confidence).toBe('likely-not-original');
    expect(result.warnings.join(' ')).toMatch(/placeholder junk/);
  });

  it('flags a karaoke channel with no streaming links', () => {
    const result = assessSong(SING_KING_KARAOKE, stapletonQuery);
    expect(result.confidence).toBe('likely-not-original');
    expect(result.warnings.join(' ')).toMatch(/uploader\/channel/);
    expect(result.warnings.join(' ')).toMatch(/No streaming-service links/);
  });

  it('flags a cover on both the artist mismatch and the title marker', () => {
    const result = assessSong(MAGGS_COVER, parseSearchQuery('Dan + Shay - Speechless'));
    expect(result.confidence).toBe('likely-not-original');
    expect(result.warnings.join(' ')).toMatch(/asked for "Dan \+ Shay"/);
    expect(result.warnings.join(' ')).toMatch(/Title contains "cover"/);
  });

  it('flags a cover credited to the uploader with the real artist in the title', () => {
    const result = assessSong(GUIBOUX_COVER, parseSearchQuery("Elvis Presley - Can't Help Falling in Love"));
    expect(result.confidence).toBe('likely-not-original');
  });

  it('flags a SoundCloud handle unrelated to the artist', () => {
    expect(assessSong(MAGGS_COVER, stapletonQuery).warnings.join(' ')).toMatch(/SoundCloud handle/);
  });

  it('accepts a wider credit than asked for', () => {
    const collab: SearchSong = { ...OFFICIAL_STAPLETON, artist: 'Chris Stapleton & Justin Timberlake' };
    expect(assessSong(collab, stapletonQuery).confidence).toBe('likely-original');
  });

  it('matches version markers on whole words only', () => {
    const demolition: SearchSong = { ...OFFICIAL_STAPLETON, title: 'Demolition Man', artist: 'The Police' };
    const result = assessSong(demolition, parseSearchQuery('The Police - Demolition Man'));
    expect(result.warnings.join(' ')).not.toMatch(/demo/);
    // The fixture's SoundCloud handle belongs to Stapleton, so only that fires.
    expect(result.confidence).toBe('uncertain');
  });

  it('treats a remix as an alternate version, not a fake', () => {
    const remix: SearchSong = { ...OFFICIAL_STAPLETON, title: 'Tennessee Whiskey (Remix)' };
    const result = assessSong(remix, stapletonQuery);
    expect(result.confidence).toBe('uncertain');
    expect(result.warnings.join(' ')).toMatch(/alternate version/);
  });

  it('flags a result with no artist at all', () => {
    expect(assessSong({ title: 'Tennessee Whiskey', artist: null, links: OFFICIAL_STAPLETON.links }).confidence).toBe(
      'likely-not-original',
    );
  });

  it('works without an intended query, on links and markers alone', () => {
    expect(assessSong(OFFICIAL_STAPLETON).confidence).toBe('likely-original');
    expect(assessSong(SING_KING_KARAOKE).confidence).toBe('likely-not-original');
  });

  // The result set live Vibo returns for the mis-stylized "Dan and Shay - Speechless",
  // none of which is the official master that "Dan + Shay - Speechless" finds.
  describe('the mis-stylized-artist result set', () => {
    const asked = parseSearchQuery('Dan and Shay - Speechless');

    it('flags a "- Topic" channel upload', () => {
      const topic: SearchSong = {
        title: 'Speechless (ft. Tori Kelly)',
        artist: 'Dan And Shay - Topic',
        links: { spotify: 'https://open.spotify.com/track/5KmXFYMJYQi5FekE3WmtEg', youtube: 'https://y/1' },
      };
      const result = assessSong(topic, asked);
      expect(result.confidence).toBe('likely-not-original');
      expect(result.warnings.join(' ')).toMatch(/uploader\/channel/);
    });

    it('flags an acoustic cut that carries no streaming links', () => {
      const acoustic: SearchSong = {
        title: 'Dan + Shay - Speechless Acoustic',
        artist: 'Dan And Shay',
        links: { youtube: 'https://y/2' },
      };
      expect(assessSong(acoustic, asked).confidence).toBe('likely-not-original');
    });

    it('marks a live awards performance as an alternate version', () => {
      const live: SearchSong = {
        title: 'Dan + Shay ft. Tori Kelly - Speechless (Billboard Music Awards 2019 Performance)',
        artist: 'Dan And Shay',
        links: { youtube: 'https://y/3', soundcloud: 'https://soundcloud.com/fine-world-89372607/dan-shay-feat-tori-kelly' },
      };
      expect(assessSong(live, asked).warnings.join(' ')).toMatch(/"performance" — an alternate version/);
    });
  });

  it('accepts a documented false positive on a title containing "cover"', () => {
    // P!nk's "Cover Me in Sunshine" is a real song; the heuristic is deliberately
    // biased toward a false warning over a missed karaoke track.
    const pink: SearchSong = { ...OFFICIAL_STAPLETON, title: 'Cover Me in Sunshine', artist: 'P!nk' };
    expect(assessSong(pink, parseSearchQuery('P!nk - Cover Me in Sunshine')).confidence).toBe('likely-not-original');
  });
});

describe('annotateSearchResults', () => {
  it('hints to re-query when the caller omitted the hyphen', () => {
    const out = annotateSearchResults([JUNK_ARTIST_REUPLOAD], 'Chris Stapleton Tennessee Whiskey');
    expect(out.query.structured).toBe(false);
    expect(out.hint).toMatch(/"<Artist> - <Title>" form/);
  });

  it('stays quiet when a structured query found the original', () => {
    const out = annotateSearchResults([OFFICIAL_STAPLETON], 'Chris Stapleton - Tennessee Whiskey');
    expect(out.hint).toBeUndefined();
    expect(out.summary).toEqual({ total: 1, likelyOriginal: 1, flagged: 0 });
  });

  it('suggests fallback queries when nothing looks original', () => {
    const out = annotateSearchResults([SING_KING_KARAOKE, MAGGS_COVER], 'Chris Stapleton - Tennessee Whiskey');
    expect(out.hint).toMatch(/No result looks like an official recording/);
    expect(out.summary).toEqual({ total: 2, likelyOriginal: 0, flagged: 2 });
  });

  it('does not push the hyphen rule at the structured Spotify catalog', () => {
    const out = annotateSearchResults([OFFICIAL_STAPLETON], 'Chris Stapleton Tennessee Whiskey', 'spotify');
    expect(out.hint).toBeUndefined();
  });

  it('preserves the original result fields alongside the verdict', () => {
    const out = annotateSearchResults(
      [{ ...OFFICIAL_STAPLETON, viboSongId: 'Pj_chN9t', songUrl: 'https://y/1' }],
      'Chris Stapleton - Tennessee Whiskey',
    );
    expect(out.results[0]).toMatchObject({
      viboSongId: 'Pj_chN9t',
      songUrl: 'https://y/1',
      artist: 'Chris Stapleton',
      quality: { confidence: 'likely-original' },
    });
  });

  it('handles an empty result set without a false "nothing original" hint', () => {
    const out = annotateSearchResults([], 'Chris Stapleton - Tennessee Whiskey');
    expect(out.hint).toBeUndefined();
    expect(out.summary).toEqual({ total: 0, likelyOriginal: 0, flagged: 0 });
  });
});
