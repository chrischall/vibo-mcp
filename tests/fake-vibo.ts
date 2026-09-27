// A tiny stateful stand-in for the Vibo API, for tools that READ before they
// write. It answers the lookup documents from in-memory state and applies the
// section/song mutations to it, so a test can assert the resulting order — not
// just the request. `writes` records mutations only, which is what the
// confirm-flow helpers must count (phase 1 may read, never write).
import { vi, type MockInstance } from 'vitest';
import * as G from '../src/gql.js';
import type { SectionInfo, EventPermissions, SectionSongRef } from '../src/tools/lookups.js';

export interface FakeState {
  event: EventPermissions;
  sections: SectionInfo[];
  songs: Record<string, SectionSongRef[]>;
  /** Override a mutation's reply (e.g. a lying added:true). */
  replies?: Partial<Record<string, unknown>>;
  /** When false, createSection ignores insertBeforeSectionId and appends. */
  honorsInsertBefore?: boolean;
}

/** Vibo's reorder semantics, measured live: the source lands directly after target; null = first. */
function applyMove<T>(list: T[], idOf: (t: T) => string, source: string, target: string | null): T[] {
  const item = list.find((x) => idOf(x) === source)!;
  const rest = list.filter((x) => idOf(x) !== source);
  const to = target === null ? 0 : rest.findIndex((x) => idOf(x) === target) + 1;
  return [...rest.slice(0, to), item, ...rest.slice(to)];
}

export function section(id: string, over: Partial<SectionInfo> = {}): SectionInfo {
  return {
    _id: id,
    name: `Section ${id}`,
    type: 'simple',
    songsCount: 0,
    questionsCount: 0,
    answeredCount: 0,
    canRemove: true,
    settings: { canHostsOrderSongs: true, canHostDeleteSection: true },
    ...over,
  };
}

export function installFakeVibo(gql: MockInstance, state: FakeState) {
  const writes = vi.fn();
  let nextId = 1;
  gql.mockImplementation((async (doc: string, vars: Record<string, any> = {}) => {
    const reply = (name: string, fallback: unknown) => ({ [name]: name in (state.replies ?? {}) ? state.replies![name] : fallback });
    switch (doc) {
      case G.EVENT_PERMISSIONS:
        return { event: state.event };
      case G.SECTIONS_FOR_WRITE:
        return { sections: state.sections.map((s) => ({ ...s })) };
      case G.SECTION_SONG_IDS: {
        const all = state.songs[vars.sectionId] ?? [];
        const { skip, limit } = vars.pagination;
        return { getSectionSongs: { songs: all.slice(skip, skip + limit), totalCount: all.length } };
      }
      case G.CREATE_SECTION: {
        writes(doc, vars);
        const created = section(`new${nextId++}`, { name: vars.payload.name });
        const before = state.honorsInsertBefore === false ? -1
          : state.sections.findIndex((s) => s._id === vars.payload.insertBeforeSectionId);
        if (before < 0) state.sections.push(created);
        else state.sections.splice(before, 0, created);
        return reply('createSection', { _id: created._id, name: created.name, type: 'simple' });
      }
      case G.UPDATE_SECTION:
        writes(doc, vars);
        return reply('updateSection', { _id: vars.sectionId, ...vars.payload });
      case G.REMOVE_SECTION:
        writes(doc, vars);
        state.sections = state.sections.filter((s) => s._id !== vars.sectionId);
        return reply('removeSection', true);
      case G.REORDER_SECTIONS:
        writes(doc, vars);
        state.sections = applyMove(state.sections, (s) => s._id, vars.sourceSectionId, vars.targetSectionId);
        return reply('reorderSections', true);
      case G.REORDER_SONGS: {
        writes(doc, vars);
        let list = state.songs[vars.sectionId];
        for (const id of vars.sourceSongIds) list = applyMove(list, (s) => s._id, id, vars.targetSongId);
        state.songs[vars.sectionId] = list;
        return reply('reorderSongsBatch', true);
      }
      case G.REMOVE_SECTION_SONGS:
        writes(doc, vars);
        return reply('removeSectionSongsV2', { success: true });
      case G.UPDATE_SECTION_SONGS:
        writes(doc, vars);
        return reply('updateSectionSongs', []);
      case G.ADD_SONG_TO_SECTION: {
        writes(doc, vars);
        const fallback = { added: true, songId: `ss${nextId}` };
        if (!('addSongToSection' in (state.replies ?? {}))) {
          (state.songs[vars.sectionId] ??= []).push({ _id: `ss${nextId++}`, viboSongId: vars.payload.song.viboSongId });
        }
        return reply('addSongToSection', fallback);
      }
      default:
        throw new Error(`fake Vibo: unexpected document\n${doc}`);
    }
  }) as never);
  return { writes, state };
}

export const sectionOrder = (state: FakeState) => state.sections.map((s) => s._id);
export const songOrder = (state: FakeState, sectionId: string) => state.songs[sectionId].map((s) => s._id);
