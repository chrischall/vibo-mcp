import { describe, it, expect, vi, afterAll, beforeEach } from 'vitest';
import { createTestHarness } from '@chrischall/mcp-utils/test';
import { client } from '../src/client.js';
import { LIST_UPCOMING_EVENTS, LIST_HISTORY_EVENTS, GET_NOTIFICATIONS } from '../src/gql.js';
import { registerProfileTools } from '../src/tools/profile.js';
import { registerEventTools } from '../src/tools/events.js';
import { registerSectionTools } from '../src/tools/sections.js';
import { registerSongTools } from '../src/tools/songs.js';
import { registerPlaylistTools } from '../src/tools/playlists.js';
import { registerNotificationTools } from '../src/tools/notifications.js';
import { registerQuestionTools } from '../src/tools/questions.js';
import { registerSongManagementTools } from '../src/tools/song-management.js';
import { registerCommentTools } from '../src/tools/comments.js';
import { registerIdeasTools } from '../src/tools/ideas.js';
import { registerImportTools } from '../src/tools/imports.js';
import { registerCollaborationTools } from '../src/tools/collaboration.js';
import { registerSectionEditTools } from '../src/tools/section-edit.js';
import { registerSectionManageTools } from '../src/tools/section-manage.js';
import { registerUploadTools } from '../src/tools/uploads.js';
import { registerSessionTools } from '../src/tools/session.js';

/**
 * Context-group hints (`_meta.mint`, mcp-host spec 2026-11-03 D4), asserted
 * against the SERVED tool list — what a host reads — for every registrar
 * `src/index.ts` wires, so a new tool cannot skip the decision.
 */
const REGISTRARS = [
  registerProfileTools, registerEventTools, registerSectionTools, registerSongTools,
  registerPlaylistTools, registerNotificationTools, registerQuestionTools, registerSongManagementTools,
  registerCommentTools, registerIdeasTools, registerImportTools, registerCollaborationTools,
  registerSectionEditTools, registerSectionManageTools, registerUploadTools, registerSessionTools,
];

const DOMAINS = ['school', 'home', 'work', 'family', 'health', 'money', 'travel', 'food'];
const INTENTS = ['whats-new', 'whats-due', 'whats-on', 'lookup', 'turn-on-off', 'send', 'change', 'other'];
const KEYS = ['domain', 'intent', 'canonical', 'subject', 'when', 'aliases'];

/** The intent every tool declares — this table is the assertion. */
const EXPECTED_INTENT: Record<string, string> = {
  vibo_get_me: 'lookup',
  vibo_list_events: 'whats-on',
  vibo_get_event: 'lookup',
  vibo_join_event: 'change',
  vibo_leave_event: 'change',
  vibo_create_event_contact: 'change',
  vibo_list_sections: 'lookup',
  vibo_get_section_songs: 'lookup',
  vibo_search_songs: 'lookup',
  vibo_add_song_to_section: 'change',
  vibo_toggle_song_like: 'change',
  vibo_get_playlists: 'lookup',
  vibo_get_playlist_songs: 'lookup',
  vibo_export_event_to_spotify: 'other',
  vibo_export_event_to_apple_music: 'other',
  vibo_list_notifications: 'whats-new',
  vibo_get_notifications_count: 'whats-new',
  vibo_mark_notifications_read: 'change',
  vibo_list_section_questions: 'lookup',
  vibo_answer_question: 'change',
  vibo_remove_song_from_section: 'change',
  vibo_update_song: 'change',
  vibo_move_song: 'change',
  vibo_reorder_songs: 'change',
  vibo_comment_on_song: 'send',
  vibo_delete_song_comment: 'change',
  vibo_comment_on_section: 'send',
  vibo_delete_section_comment: 'change',
  vibo_list_section_song_ideas: 'lookup',
  vibo_list_song_ideas_songs: 'lookup',
  vibo_import_playlist_to_section: 'change',
  vibo_list_event_users: 'lookup',
  vibo_invite_users: 'send',
  vibo_change_user_role: 'change',
  vibo_remove_user: 'change',
  vibo_update_section: 'change',
  vibo_create_section: 'change',
  vibo_delete_section: 'change',
  vibo_reorder_sections: 'change',
  vibo_set_profile_photo: 'change',
  vibo_capture_session: 'other',
};

type Listed = {
  name: string;
  inputSchema: { properties?: Record<string, { enum?: unknown[] }> };
  annotations?: { readOnlyHint?: boolean };
  _meta?: { mint?: Record<string, unknown> };
};

const gql = vi.spyOn(client, 'gql').mockResolvedValue(undefined as never);
let harness: Awaited<ReturnType<typeof createTestHarness>>;
let served: Listed[];

beforeEach(() => { gql.mockClear(); gql.mockResolvedValue(undefined as never); });
afterAll(async () => { if (harness) await harness.close(); });

async function tools(): Promise<Listed[]> {
  if (!served) {
    harness = await createTestHarness((server) => { for (const r of REGISTRARS) r(server, client); });
    served = (await harness.client.listTools()).tools as Listed[];
  }
  return served;
}

const textOf = (r: unknown): string => ((r as { content: Array<{ text: string }> }).content[0]!).text;

describe('_meta.mint on tools/list', () => {
  it('names every served tool, so a new tool cannot skip the decision', async () => {
    const names = (await tools()).map((t) => t.name).filter((n) => n !== 'vibo_healthcheck');
    expect(names.sort()).toEqual(Object.keys(EXPECTED_INTENT).sort());
  });

  it('the healthcheck joins no group', async () => {
    const hc = (await tools()).find((t) => t.name === 'vibo_healthcheck');
    expect(hc).toBeDefined();
    expect(hc!._meta?.mint).toBeUndefined();
  });

  it('every other tool declares domain family and its intent', async () => {
    for (const t of await tools()) {
      if (t.name === 'vibo_healthcheck') continue;
      const m = t._meta?.mint;
      expect(m, t.name).toBeDefined();
      expect(m!.domain, t.name).toBe('family');
      expect(m!.intent, t.name).toBe(EXPECTED_INTENT[t.name]);
    }
  });

  it('every hint is shaped per the host contract', async () => {
    for (const t of await tools()) {
      const m = t._meta?.mint;
      if (!m) continue;
      expect(Object.keys(m).filter((k) => !KEYS.includes(k)), t.name).toEqual([]);
      expect(DOMAINS, t.name).toContain(m.domain);
      expect(INTENTS, t.name).toContain(m.intent);
      const props = t.inputSchema.properties ?? {};
      if ('canonical' in m) {
        expect(m.canonical, t.name).toBe(true);
        expect(t.annotations?.readOnlyHint, t.name).toBe(true);
        expect(['whats-new', 'whats-due', 'whats-on'], t.name).toContain(m.intent);
        expect(props.view?.enum, t.name).toContain('brief');
      }
      if ('subject' in m) expect(props, t.name).toHaveProperty(m.subject as string);
      if ('when' in m) {
        const when = m.when as Record<string, string>;
        expect(Object.keys(when).sort(), t.name).toEqual(['end', 'start']);
        expect(props, t.name).toHaveProperty(when.start);
        expect(props, t.name).toHaveProperty(when.end);
      }
      if ('aliases' in m) {
        const aliases = m.aliases as string[];
        expect(aliases.length, t.name).toBeLessThanOrEqual(8);
        for (const a of aliases) {
          expect(a.length, t.name).toBeLessThanOrEqual(40);
          expect(a, t.name).toBe(a.toLowerCase());
        }
      }
    }
  });

  it('marks exactly one canonical read per intent: events for whats-on, notifications for whats-new', async () => {
    const canonical = (await tools())
      .filter((t) => t._meta?.mint?.canonical === true)
      .map((t) => [t.name, t._meta!.mint!.intent]);
    expect(canonical.sort()).toEqual([
      ['vibo_list_events', 'whats-on'],
      ['vibo_list_notifications', 'whats-new'],
    ]);
  });

  it('the canonical reads carry no subject (nothing here lists people or properties) and no range', async () => {
    for (const name of ['vibo_list_events', 'vibo_list_notifications']) {
      const m = (await tools()).find((t) => t.name === name)!._meta!.mint!;
      expect(m.subject, name).toBeUndefined();
      expect(m.when, name).toBeUndefined();
      expect((m.aliases as string[]).length, name).toBeGreaterThan(0);
    }
  });
});

type Envelope = { untrusted_content: boolean; note: string; data: string[] };

describe('vibo_list_events view: brief', () => {
  it('answers one enveloped line per event, title — date — status, each ≤ 120 chars', async () => {
    await tools();
    gql.mockResolvedValue({
      upcomingEvents: {
        events: [
          { _id: 'e1', title: 'Spring Gala', date: '2027-04-10T23:00:00.000Z', role: 'host', isLocked: false },
          { _id: 'e2', title: 'x'.repeat(200), date: 1807488000000, role: 'guest', isLocked: true },
          { _id: 'e3', title: '', role: 'host' },
        ],
        totalCount: 3,
      },
    });
    const out = JSON.parse(textOf(await harness.callTool('vibo_list_events', { view: 'brief' }))) as Envelope;
    expect(gql).toHaveBeenCalledWith(LIST_UPCOMING_EVENTS, { pagination: { skip: 0, limit: 20 } });
    expect(out.untrusted_content).toBe(true);
    expect(out.note).toMatch(/hosts/i);
    expect(out.data[0]).toBe('Spring Gala — 2027-04-10T23:00:00.000Z — host, open');
    expect(out.data[1]).toMatch(/^x+… — 2027-04-12T00:00:00\.000Z — guest, locked$/);
    expect(out.data[2]).toBe('(untitled event) — no date — host, open');
    for (const line of out.data) expect(line.length).toBeLessThanOrEqual(120);
    expect(out.data).toHaveLength(3);
  });

  it('escapes a host title that starts with "-- " so it cannot read as a note', async () => {
    await tools();
    gql.mockResolvedValue({
      upcomingEvents: {
        events: [
          { title: '-- none', date: '2027-01-01', role: 'host' },
          { title: `-- ${'y'.repeat(200)}`, date: '2027-01-02', role: 'guest' },
          { title: '--not a note', date: '2027-01-03', role: 'host' },
        ],
        totalCount: 3,
      },
    });
    const out = JSON.parse(textOf(await harness.callTool('vibo_list_events', { view: 'brief' }))) as Envelope;
    expect(out.data[0]).toBe('\\-- none — 2027-01-01 — host, open');
    expect(out.data[1]).toMatch(/^\\-- y+… — 2027-01-02 — guest, open$/);
    expect(out.data[1].length).toBeLessThanOrEqual(120);
    expect(out.data[2]).toBe('--not a note — 2027-01-03 — host, open');
    for (const line of out.data) expect(line.startsWith('-- ')).toBe(false);
  });

  it('notes a partial page as "-- N of M shown"', async () => {
    await tools();
    gql.mockResolvedValue({
      historyEvents: { events: [{ title: 'Past', date: '2025-01-01', role: 'host' }], next: { skip: 1, limit: 1 }, totalCount: 4 },
    });
    const out = JSON.parse(textOf(await harness.callTool('vibo_list_events', { view: 'brief', past: true, limit: 1 }))) as Envelope;
    expect(gql).toHaveBeenCalledWith(LIST_HISTORY_EVENTS, { pagination: { skip: 0, limit: 1 } });
    expect(out.data).toEqual(['Past — 2025-01-01 — host, open', '-- 1 of 4 shown']);
  });

  it('notes "-- more" when a next page exists but no total is given', async () => {
    await tools();
    gql.mockResolvedValue({ upcomingEvents: { events: [{ title: 'A', role: 'host' }], next: { skip: 1, limit: 1 } } });
    const out = JSON.parse(textOf(await harness.callTool('vibo_list_events', { view: 'brief', limit: 1 }))) as Envelope;
    expect(out.data.at(-1)).toBe('-- more');
  });

  it('answers "-- none" for no events', async () => {
    await tools();
    gql.mockResolvedValue({ upcomingEvents: { events: [], totalCount: 0 } });
    const out = JSON.parse(textOf(await harness.callTool('vibo_list_events', { view: 'brief' }))) as Envelope;
    expect(out.data).toEqual(['-- none']);
  });

  it('keeps the payload as-is without a view', async () => {
    await tools();
    const page = { upcomingEvents: { events: [{ _id: 'e1', title: 'A' }], totalCount: 1 } };
    gql.mockResolvedValue(page);
    expect(JSON.parse(textOf(await harness.callTool('vibo_list_events', {})))).toEqual(page.upcomingEvents);
  });
});

describe('vibo_list_notifications view: brief', () => {
  it('answers one enveloped line per notification, header — date — read state', async () => {
    await tools();
    gql.mockResolvedValue({
      getNotifications: {
        notifications: [
          { _id: 'n1', header: 'New song added', body: 'b', isRead: false, createdAt: '2026-11-01T10:00:00.000Z' },
          { _id: 'n2', body: 'Only a body', isRead: true },
        ],
        totalCount: 2,
      },
    });
    const out = JSON.parse(textOf(await harness.callTool('vibo_list_notifications', { view: 'brief' }))) as Envelope;
    expect(gql).toHaveBeenCalledWith(GET_NOTIFICATIONS, { pagination: { skip: 0, limit: 20 } });
    expect(out.untrusted_content).toBe(true);
    expect(out.data).toEqual([
      'New song added — 2026-11-01T10:00:00.000Z — unread',
      'Only a body — no date — read',
    ]);
  });

  it('escapes a notification header that starts with "-- "', async () => {
    await tools();
    gql.mockResolvedValue({ getNotifications: { notifications: [{ header: '-- 1 of 9 shown', isRead: true }], totalCount: 1 } });
    const out = JSON.parse(textOf(await harness.callTool('vibo_list_notifications', { view: 'brief' }))) as Envelope;
    expect(out.data).toEqual(['\\-- 1 of 9 shown — no date — read']);
  });

  it('notes a partial page and an empty one', async () => {
    await tools();
    gql.mockResolvedValue({ getNotifications: { notifications: [{ header: 'H', isRead: false }], totalCount: 9 } });
    const partial = JSON.parse(textOf(await harness.callTool('vibo_list_notifications', { view: 'brief', limit: 1 }))) as Envelope;
    expect(partial.data.at(-1)).toBe('-- 1 of 9 shown');
    gql.mockResolvedValue({ getNotifications: { notifications: [], totalCount: 0 } });
    const empty = JSON.parse(textOf(await harness.callTool('vibo_list_notifications', { view: 'brief' }))) as Envelope;
    expect(empty.data).toEqual(['-- none']);
  });
});
