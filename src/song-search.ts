/**
 * Search-quality heuristics for Vibo's song catalog.
 *
 * Vibo's `searchField` source is a loose text index over a catalog that mixes
 * official recordings with YouTube-sourced covers, karaoke tracks and
 * re-uploads. Two consequences, both confirmed live against the production
 * catalog rather than assumed:
 *
 * 1. Querying `"<Artist> - <Title>"` resolves to the official recording;
 *    dropping the hyphen falls back to loose matching that ranks re-uploads
 *    first. Observed: `"Chris Stapleton - Tennessee Whiskey"` returned exactly
 *    one result — the official master, six streaming links. The same words
 *    without the hyphen returned nine results, *none* of them the original:
 *    the top hit was a re-upload whose `artist` field read `board`, followed
 *    by a Sing King karaoke track, three violin/piano covers, an instrumental
 *    and a techno edit.
 *
 * 2. Bad matches are mechanically detectable. Official recordings carry links
 *    across several streaming services; re-uploads are typically YouTube-only,
 *    carry a version marker in the title, or put an uploader/channel name in
 *    the `artist` field.
 *
 * A third, subtler trap: the index does not fold artist stylizations together.
 * `"Dan + Shay - Speechless"` returns the official master; `"Dan and Shay -
 * Speechless"` returns an acoustic cut, a `- Topic` upload, a live awards
 * performance and a cover — the official recording is absent entirely. Query
 * using the artist's own stylization. {@link normalizeName} folds `+`/`&`/`and`
 * only for *comparing* results, never for building the query.
 *
 * These helpers are pure so they can be unit-tested without a network call.
 */

/** Streaming links Vibo returns per song. All are independently nullable. */
export interface SongLinks {
  spotify?: string | null;
  appleMusic?: string | null;
  youtube?: string | null;
  tidal?: string | null;
  soundcloud?: string | null;
  deezer?: string | null;
}

/** The subset of a Vibo search result these heuristics read. */
export interface SearchSong {
  title?: string | null;
  artist?: string | null;
  links?: SongLinks | null;
  [key: string]: unknown;
}

export type Confidence = 'likely-original' | 'uncertain' | 'likely-not-original';

export interface SongQuality {
  confidence: Confidence;
  warnings: string[];
}

/** What the caller was looking for, parsed out of a `"Artist - Title"` query. */
export interface ParsedQuery {
  raw: string;
  artist?: string;
  title?: string;
  /** True when the query used the `"<Artist> - <Title>"` form. */
  structured: boolean;
}

/**
 * Title markers that mean "someone other than the credited artist performed
 * this". Any hit downgrades the result to `likely-not-original`.
 *
 * Matched on whole words, so `demo` does not fire on "Demolition Man". A title
 * that legitimately contains one of these words as part of its name (P!nk's
 * "Cover Me in Sunshine") will still be flagged — that bias is deliberate:
 * a false warning costs a glance, a missed karaoke track reaches the DJ.
 */
const NON_ORIGINAL_MARKERS = [
  'karaoke',
  'cover',
  'covers',
  'tribute',
  'instrumental',
  'backing track',
  'made famous by',
  'in the style of',
  'piano version',
  'acoustic version',
  'lyric video',
  'lyrics video',
  'sped up',
  'slowed',
  'nightcore',
  '8 bit',
];

/**
 * Title markers for a legitimate alternate version of the real artist's
 * recording. These warn but do not downgrade: a remix or live cut may be
 * exactly what was asked for, so the caller decides.
 */
const VARIANT_MARKERS = [
  'remix',
  'demo',
  'live at',
  'live from',
  'performance',
  'radio edit',
  'extended mix',
  'reprise',
];

/** Artist-field markers that name an uploader/channel rather than a performer. */
const UPLOADER_MARKERS = ['karaoke', 'cover', 'covers', 'tribute', 'versions', 'lyrics', 'sing king', 'topic'];

/**
 * Artist values seen in the wild that are pure placeholder junk — no performer
 * name at all. Matched exactly (normalized), never as a substring, so real
 * artists containing these words are unaffected.
 */
const JUNK_ARTISTS = ['board', 'unknown', 'various', 'various artists', 'na', 'none'];

/**
 * Fold a name to a comparable form: lowercase, diacritics stripped, `&`/`+`
 * spelled as `and`, punctuation dropped. So `"Dan + Shay"`, `"Dan & Shay"` and
 * `"Dan and Shay"` all normalize alike, and `"Amélie"` matches `"Amelie"`.
 */
export function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[&+]/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Whole-word containment over normalized text. Padding both sides with spaces
 * turns a substring test into a word-boundary test without a built regex.
 */
function containsPhrase(normalizedHaystack: string, phrase: string): boolean {
  const needle = normalizeName(phrase);
  if (!needle) return false;
  return ` ${normalizedHaystack} `.includes(` ${needle} `);
}

/**
 * Split a search query on the first ` - ` separator (hyphen, en dash or em
 * dash). Without a separator the query is returned unstructured, which is the
 * signal to warn the caller that they are about to get loose-match results.
 */
export function parseSearchQuery(query: string): ParsedQuery {
  const raw = query.trim();
  const match = raw.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (!match) return { raw, structured: false };
  const artist = match[1].trim();
  const title = match[2].trim();
  if (!artist || !title) return { raw, structured: false };
  return { raw, artist, title, structured: true };
}

/** Count links to real streaming services. YouTube is excluded: re-uploads all have one. */
function streamingLinkCount(links?: SongLinks | null): number {
  if (!links) return 0;
  return [links.spotify, links.appleMusic, links.tidal, links.deezer, links.soundcloud].filter(
    (l) => typeof l === 'string' && l.length > 0,
  ).length;
}

/**
 * True when a SoundCloud URL's handle is consistent with `artist` — i.e. the
 * handle contains one of the artist's substantial name tokens, *or* the check
 * cannot be run at all. Deliberately loose: `soundcloud.com/elvissonymusic/...`
 * counts for Elvis Presley (a label account), while
 * `soundcloud.com/jen-prince-602192391/...` does not.
 */
function soundcloudHandleIsConsistentWith(url: string, artist: string): boolean {
  const path = url.replace(/^https?:\/\/(www\.)?soundcloud\.com\//i, '').split('/')[0] ?? '';
  const handle = normalizeName(path).split(' ').join('');
  const tokens = normalizeName(artist)
    .split(' ')
    .filter((t) => t.length >= 4);
  // Nothing to compare — an unparseable handle, or an artist whose every name
  // token is too short to match on without hitting noise ("Sia", "SZA", "U2",
  // "Nas"). Abstain rather than accuse: this is a soft signal, and a check that
  // cannot run is not evidence against the result.
  if (!handle || !tokens.length) return true;
  return tokens.some((t) => handle.includes(t));
}

/**
 * Judge one search result, optionally against what the caller asked for.
 * Passing `intended` (from {@link parseSearchQuery}) enables the strongest
 * check by far: whether the result's artist is actually the artist requested.
 */
export function assessSong(song: SearchSong, intended?: ParsedQuery): SongQuality {
  const warnings: string[] = [];
  let hard = false;

  const title = (song.title ?? '').trim();
  const artist = (song.artist ?? '').trim();
  const normalizedArtist = normalizeName(artist);
  const isJunkArtist = JUNK_ARTISTS.includes(normalizedArtist);

  if (!artist) {
    warnings.push('Result has no artist field.');
    hard = true;
  } else if (isJunkArtist) {
    warnings.push(`Artist field is placeholder junk ("${artist}"), not a performer name.`);
    hard = true;
  } else {
    const uploader = UPLOADER_MARKERS.find((m) => containsPhrase(normalizedArtist, m));
    if (uploader) {
      warnings.push(`Artist field looks like an uploader/channel ("${artist}"), not the performer.`);
      hard = true;
    }
  }

  // The strongest available check: does the result credit the artist we asked
  // for? Substring both ways so "Ed Sheeran" matches "Ed Sheeran & Beyoncé".
  if (intended?.artist && artist && !isJunkArtist) {
    const wanted = normalizeName(intended.artist);
    if (wanted && !normalizedArtist.includes(wanted) && !wanted.includes(normalizedArtist)) {
      warnings.push(`Artist is "${artist}", but the query asked for "${intended.artist}".`);
      hard = true;
    }
  }

  const normalizedTitle = normalizeName(title);
  const nonOriginal = NON_ORIGINAL_MARKERS.find((m) => containsPhrase(normalizedTitle, m));
  if (nonOriginal) {
    warnings.push(`Title contains "${nonOriginal}" — not the original studio recording.`);
    hard = true;
  }
  const variant = VARIANT_MARKERS.find((m) => containsPhrase(normalizedTitle, m));
  if (variant) {
    warnings.push(`Title contains "${variant}" — an alternate version; confirm it is the one wanted.`);
  }

  if (streamingLinkCount(song.links) === 0) {
    warnings.push('No streaming-service links (YouTube only) — typical of a re-upload.');
    hard = true;
  }

  // Soft signal: only checkable when a SoundCloud link is present.
  const soundcloud = song.links?.soundcloud;
  const artistForHandle = isJunkArtist ? intended?.artist : artist || intended?.artist;
  if (soundcloud && artistForHandle && !soundcloudHandleIsConsistentWith(soundcloud, artistForHandle)) {
    warnings.push(`SoundCloud handle does not obviously belong to "${artistForHandle}".`);
  }

  const confidence: Confidence = hard
    ? 'likely-not-original'
    : warnings.length
      ? 'uncertain'
      : 'likely-original';

  return { confidence, warnings };
}

export interface AnnotatedSearch {
  query: ParsedQuery;
  /** Present only when the query form is likely to have produced poor results. */
  hint?: string;
  summary: { total: number; likelyOriginal: number; flagged: number };
  results: Array<SearchSong & { quality: SongQuality }>;
}

/**
 * Attach a quality verdict to each search result and, when the query was not
 * in `"<Artist> - <Title>"` form, tell the caller to retry in that form.
 */
export function annotateSearchResults(
  results: SearchSong[],
  query: string,
  source: 'searchField' | 'spotify' = 'searchField',
): AnnotatedSearch {
  const parsed = parseSearchQuery(query);
  const annotated = results.map((song) => ({ ...song, quality: assessSong(song, parsed) }));

  const summary = {
    total: annotated.length,
    likelyOriginal: annotated.filter((s) => s.quality.confidence === 'likely-original').length,
    flagged: annotated.filter((s) => s.quality.confidence === 'likely-not-original').length,
  };

  // The hyphen rule is specific to the loose `searchField` text index; the
  // Spotify source queries a structured catalog and does not need it.
  let hint: string | undefined;
  if (source === 'searchField' && !parsed.structured) {
    hint =
      `Query "${parsed.raw}" is not in "<Artist> - <Title>" form. Vibo's text index ranks ` +
      'covers, karaoke and re-uploads above official recordings for unhyphenated queries. ' +
      'Retry as "<Artist> - <Title>" (space-hyphen-space) before trusting these results.';
  } else if (source === 'searchField' && summary.total > 0 && summary.likelyOriginal === 0) {
    hint =
      'No result looks like an official recording. Try reversing to "<Title> - <Artist>", ' +
      'searching the title alone and filtering by artist, or source: "spotify".';
  }

  return { query: parsed, ...(hint ? { hint } : {}), summary, results: annotated };
}
