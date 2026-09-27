import { McpToolError } from '@chrischall/mcp-utils';
import type { ViboClient } from '../client.js';
import { SECTIONS_FOR_WRITE, EVENT_PERMISSIONS, SECTION_SONG_IDS } from '../gql.js';

// Read-before-write lookups shared by the section and song write tools. They
// run BEFORE the confirmation gate — a preview that names the section being
// deleted, or refuses an id that isn't there, needs them — so phase 1 may read
// but still never writes.

export interface SectionInfo {
  _id: string;
  name: string;
  type: 'simple' | 'headline' | 'dontPlay' | string;
  songsCount: number;
  questionsCount: number;
  answeredCount: number;
  canRemove?: boolean;
  visibility?: string;
  settings?: { canHostsOrderSongs?: boolean; canHostDeleteSection?: boolean };
}

export interface EventPermissions {
  _id: string;
  role?: string | null;
  isLocked?: boolean;
  settings?: {
    canHostCreateSections?: boolean | null;
    canHostReorderSections?: boolean | null;
    sectionSongsLimit?: number | null;
    sectionMustPlayLimit?: number | null;
  } | null;
}

export interface SectionSongRef {
  _id: string;
  viboSongId?: string | null;
  artist?: string | null;
  title?: string | null;
}

/** The event's timeline, in order. */
export async function fetchSections(client: ViboClient, eventId: string): Promise<SectionInfo[]> {
  const data = await client.gql<{ sections: SectionInfo[] }>(SECTIONS_FOR_WRITE, { eventId });
  return data.sections ?? [];
}

export async function fetchEventPermissions(client: ViboClient, eventId: string): Promise<EventPermissions> {
  const data = await client.gql<{ event: EventPermissions }>(EVENT_PERMISSIONS, { eventId });
  return data.event;
}

export function findSection(sections: SectionInfo[], sectionId: string): SectionInfo {
  const section = sections.find((s) => s._id === sectionId);
  if (!section) {
    throw new McpToolError(`Section ${sectionId} is not in this event's timeline.`, {
      hint: 'Get section ids from vibo_list_sections for the same eventId.',
    });
  }
  return section;
}

/** Every song in a section, in its manual order (no sort applied). */
export async function fetchSectionSongs(
  client: ViboClient,
  eventId: string,
  sectionId: string,
): Promise<SectionSongRef[]> {
  const songs: SectionSongRef[] = [];
  const limit = 100;
  // Bounded: 50 pages × 100 is far beyond Vibo's per-section song limit (999).
  for (let page = 0; page < 50; page++) {
    const data = await client.gql<{ getSectionSongs: { songs: SectionSongRef[]; totalCount?: number } }>(
      SECTION_SONG_IDS,
      { eventId, sectionId, pagination: { skip: songs.length, limit } },
    );
    const batch = data.getSectionSongs?.songs ?? [];
    songs.push(...batch);
    const total = data.getSectionSongs?.totalCount;
    if (batch.length < limit || (typeof total === 'number' && songs.length >= total)) break;
  }
  return songs;
}

/**
 * Refuse, before the confirmation step, song ids that aren't in the section.
 * Names a passed viboSongId's section-song _id, the usual mix-up.
 */
export function assertSongsInSection(songIds: readonly string[], songs: readonly SectionSongRef[]): void {
  const have = new Set(songs.map((s) => s._id));
  const missing = songIds.filter((id) => !have.has(id));
  if (missing.length === 0) return;
  const hints = missing
    .map((id) => {
      const byVibo = songs.find((s) => s.viboSongId === id);
      return byVibo ? `${id} is a viboSongId — its section-song _id is ${byVibo._id}` : null;
    })
    .filter(Boolean);
  throw new McpToolError(
    `${missing.length} of ${songIds.length} song id(s) are not in this section: ${missing.join(', ')}. Nothing was sent.`,
    {
      hint:
        (hints.length ? hints.join('; ') + '. ' : '') +
        'Use the song _id values from vibo_get_section_songs for this same section.',
    },
  );
}

/** True when the caller is a host (not the DJ) — the role Vibo's host-permission toggles apply to. */
export function isHost(perms: EventPermissions): boolean {
  return perms.role === 'host';
}
