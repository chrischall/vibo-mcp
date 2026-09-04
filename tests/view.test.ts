import { describe, it, expect } from 'vitest';
import { VIBO_VIEWS, viewArg, viewResponse } from '../src/view.js';

/** The serialised text of a tool result — always a single text block here. */
const textOf = (r: ReturnType<typeof viewResponse>): string =>
  (r.content[0] as { text: string }).text;

/**
 * The `view` vocabulary is only worth having if the DEFAULT is the cheap rung.
 * Four sibling repos shipped the projection as opt-in (`compact: false`), and
 * an efficiency a caller has to ask for is one they mostly do not — the caller
 * paying for it being the one least able to know it was on offer. So the first
 * thing pinned here is that omitting `view` strips.
 */
describe('viewResponse', () => {
  const song = {
    viboSongId: 'v1',
    songUrl: 'https://y/1',
    title: 'Tennessee Whiskey',
    artworkUrl: 'https://img.vibo.com/v1/art.jpg',
    thumbnail: 'https://img.vibo.com/v1/thumb',
  };

  it('strips media URLs when no view is given — compact is the DEFAULT rung', () => {
    const out = JSON.parse(textOf(viewResponse(undefined, song)));
    expect(out).toEqual({
      viboSongId: 'v1',
      songUrl: 'https://y/1',
      title: 'Tennessee Whiskey',
    });
  });

  it('strips media URLs on an explicit view: "compact"', () => {
    const out = JSON.parse(textOf(viewResponse('compact', song)));
    expect(out.artworkUrl).toBeUndefined();
    expect(out.thumbnail).toBeUndefined();
  });

  it('returns EVERYTHING on view: "full" — the escape hatch has to actually escape', () => {
    const out = JSON.parse(textOf(viewResponse('full', song)));
    expect(out).toEqual(song);
  });

  /**
   * A streaming link is this server's PRODUCT, not decoration: the quality
   * verdict is computed from how many services carry a track, and
   * `vibo_add_song_to_section` needs `songUrl` to add anything at all. None of
   * those keys is a media noun, so none of them may be touched.
   */
  it('keeps streaming links and songUrl — they are the product, not decoration', () => {
    const out = JSON.parse(
      textOf(
        viewResponse('compact', {
          songUrl: 'https://y/1',
          links: {
            spotify: 'https://open.spotify.com/track/x',
            youtube: 'https://youtu.be/x',
            appleMusic: null,
          },
        })
      )
    );
    // `null` survives too: an absent key and a null one are the same to
    // JSON.parse but not to a reader deciding whether a service was checked.
    expect(out).toEqual({
      songUrl: 'https://y/1',
      links: {
        spotify: 'https://open.spotify.com/track/x',
        youtube: 'https://youtu.be/x',
        appleMusic: null,
      },
    });
  });

  /**
   * Compact is SUBTRACTIVE — it names what to remove, never what to keep — so
   * a field this repo has never heard of cannot be lost by it. That is the
   * whole reason there is no invented field projection here.
   */
  it('passes an unanticipated field through compact untouched', () => {
    const out = JSON.parse(
      textOf(viewResponse('compact', { somethingNobodyAnticipated: 42 }))
    );
    expect(out.somethingNobodyAnticipated).toBe(42);
  });

  /**
   * Only FORMATTING whitespace goes. A track title's internal spacing is
   * content, and it must come back byte-identical.
   */
  it('leaves whitespace INSIDE a value byte-identical, and emits a single line', () => {
    const title = 'Line one.\n\n  Indented line two.\t Tabbed.';
    const text = textOf(viewResponse('compact', { title }));
    expect(JSON.parse(text).title).toBe(title);
    // One line: no pretty-printing. The `\n` above survives as the two-character
    // escape `\\n` in the serialised text, so a real newline would be an indent.
    expect(text.includes('\n')).toBe(false);
  });

  /** A rung this server does not honour must not error — it falls to compact. */
  it('falls back to compact for an unhonoured rung rather than throwing', () => {
    const out = JSON.parse(textOf(viewResponse('raw', song)));
    expect(out.artworkUrl).toBeUndefined();
  });
});

describe('viewArg', () => {
  it('offers exactly the rungs this server honours, and is optional', () => {
    expect([...VIBO_VIEWS]).toEqual(['compact', 'full']);
    const schema = viewArg();
    expect(schema.parse(undefined)).toBeUndefined();
    expect(schema.parse('full')).toBe('full');
    expect(() => schema.parse('raw')).toThrow();
  });

  it('documents the rungs on the OPTIONAL wrapper, where a host reads it', () => {
    // `.describe()` applied to the inner enum leaves the wrapper's description
    // blank — a parameter documented to nobody.
    expect(viewArg().description).toContain('compact');
  });
});
