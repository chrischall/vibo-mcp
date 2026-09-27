import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { client } from '../../src/client.js';
import { registerSectionManageTools, normalizeTime } from '../../src/tools/section-manage.js';
import { CREATE_SECTION, REMOVE_SECTION, REORDER_SECTIONS, UPDATE_SECTION } from '../../src/gql.js';
import { createTestHarness, confirmCall, previewCall } from '../helpers.js';
import { installFakeVibo, section, sectionOrder, type FakeState } from '../fake-vibo.js';
import { parseToolResult } from '@chrischall/mcp-utils/test';

const gql = vi.spyOn(client, 'gql').mockResolvedValue(undefined as never);
let harness: Awaited<ReturnType<typeof createTestHarness>>;

const hostEvent = (settings: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => ({
  _id: 'e1',
  role: 'host',
  isLocked: false,
  settings: { canHostCreateSections: true, canHostReorderSections: true, sectionSongsLimit: 100, sectionMustPlayLimit: null, ...settings },
  ...extra,
});

function fresh(over: Partial<FakeState> = {}) {
  return installFakeVibo(gql, {
    event: hostEvent(),
    sections: [section('A'), section('B'), section('C'), section('D')],
    songs: {},
    ...over,
  });
}

beforeEach(() => { gql.mockClear(); gql.mockImplementation((async () => undefined) as never); });
afterAll(async () => { if (harness) await harness.close(); });

describe('section management tools', () => {
  it('setup', async () => {
    harness = await createTestHarness((s) => registerSectionManageTools(s, client));
  });

  describe('vibo_create_section', () => {
    it('previews without writing, then creates with the web app defaults and returns the new _id', async () => {
      const { writes, state } = fresh();
      const res = await confirmCall(harness, 'vibo_create_section', { eventId: 'e1', name: '  ZZ TEST one ' }, writes);
      expect(writes).toHaveBeenCalledWith(CREATE_SECTION, {
        eventId: 'e1',
        payload: {
          type: 'simple',
          name: 'ZZ TEST one',
          settings: {
            timeEnabled: true,
            songsEnabled: true,
            notesEnabled: true,
            canHostsOrderSongs: true,
            canHostDeleteSection: true,
            notesVisibleForHosts: true,
            canHostChangeSectionName: true,
            canHostChangeSectionTime: true,
            songsLimit: 100,
            visibleForGuests: false,
            visibleForHosts: true,
          },
        },
      });
      const body = parseToolResult<{ _id: string; placement: string; placedAfter: { _id: string } }>(res);
      expect(body._id).toBe('new1');
      expect(body.placedAfter._id).toBe('D'); // default: end of timeline
      expect(body.placement).toBe('as-requested');
      expect(sectionOrder(state)).toEqual(['A', 'B', 'C', 'D', 'new1']);
    });

    it('afterSectionId becomes insertBeforeSectionId of the next section', async () => {
      const { writes, state } = fresh();
      await confirmCall(harness, 'vibo_create_section', { eventId: 'e1', name: 'ZZ TEST', afterSectionId: 'B' }, writes);
      expect(writes.mock.calls[0][1].payload.insertBeforeSectionId).toBe('C');
      expect(sectionOrder(state)).toEqual(['A', 'B', 'new1', 'C', 'D']);
    });

    it('position 0 inserts first; a position past the end appends', async () => {
      let { writes, state } = fresh();
      await confirmCall(harness, 'vibo_create_section', { eventId: 'e1', name: 'ZZ first', position: 0 }, writes);
      expect(sectionOrder(state)[0]).toBe('new1');
      ({ writes, state } = fresh());
      await confirmCall(harness, 'vibo_create_section', { eventId: 'e1', name: 'ZZ last', position: 99 }, writes);
      expect(writes.mock.calls[0][1].payload).not.toHaveProperty('insertBeforeSectionId');
      expect(sectionOrder(state).at(-1)).toBe('new1');
    });

    it('falls back to reorderSections when Vibo ignores insertBeforeSectionId', async () => {
      const { writes, state } = fresh({ honorsInsertBefore: false });
      const args = { eventId: 'e1', name: 'ZZ TEST', afterSectionId: 'A' };
      const { confirmToken } = await previewCall(harness, 'vibo_create_section', args);
      expect(writes).not.toHaveBeenCalled();
      const res = await harness.callTool('vibo_create_section', { ...args, confirmToken });
      expect(writes).toHaveBeenCalledTimes(2);
      expect(writes).toHaveBeenCalledWith(REORDER_SECTIONS, { eventId: 'e1', sourceSectionId: 'new1', targetSectionId: 'B' });
      expect(sectionOrder(state)).toEqual(['A', 'new1', 'B', 'C', 'D']);
      expect(parseToolResult<{ placement: string }>(res).placement).toBe('fixed-by-reorder');
    });

    it('maps visibility "public", normalises time, and sets the note with a follow-up updateSection', async () => {
      const { writes } = installFakeVibo(gql, { event: hostEvent(), sections: [section('A')], songs: {} });
      const args = { eventId: 'e1', name: 'ZZ TEST', visibility: 'public', time: '5:30 PM', description: 'd', note: 'n' };
      const { preview } = await previewCall(harness, 'vibo_create_section', args);
      expect(preview.action).toBe('createSection, then updateSection (note)');
      expect(writes).not.toHaveBeenCalled();
      const { confirmToken } = await previewCall(harness, 'vibo_create_section', args);
      await harness.callTool('vibo_create_section', { ...args, confirmToken });
      const payload = writes.mock.calls[0][1].payload;
      expect(payload.settings).toMatchObject({ visibleForGuests: true, visibleForHosts: true });
      expect(payload).toMatchObject({ time: '05:30 pm', description: 'd' });
      expect(writes).toHaveBeenCalledWith(UPDATE_SECTION, { eventId: 'e1', sectionId: 'new1', payload: { note: 'n' } });
    });

    it('refuses a name over 45 characters before any network call', async () => {
      fresh();
      const res = await harness.callTool('vibo_create_section', { eventId: 'e1', name: 'Z'.repeat(46) });
      expect(res.isError).toBe(true);
      expect(JSON.stringify(res)).toContain('at most 45');
      expect(gql).not.toHaveBeenCalled();
      // 45 exactly is fine
      const ok = await harness.callTool('vibo_create_section', { eventId: 'e1', name: 'Z'.repeat(45) });
      expect(parseToolResult<{ status: string }>(ok).status).toBe('confirmation-required');
    });

    it('refuses a bad time, both placements at once, and an unknown afterSectionId', async () => {
      const { writes } = fresh();
      for (const args of [
        { name: 'x', time: '17:30' },
        { name: 'x', afterSectionId: 'A', position: 1 },
        { name: 'x', afterSectionId: 'nope' },
      ]) {
        const res = await harness.callTool('vibo_create_section', { eventId: 'e1', ...args });
        expect(res.isError, JSON.stringify(args)).toBe(true);
      }
      expect(writes).not.toHaveBeenCalled();
    });

    it('explains when the DJ has not let hosts add sections', async () => {
      const { writes } = fresh({ event: hostEvent({ canHostCreateSections: false }) });
      const res = await harness.callTool('vibo_create_section', { eventId: 'e1', name: 'ZZ' });
      expect(res.isError).toBe(true);
      expect(JSON.stringify(res)).toContain('canHostCreateSections');
      expect(writes).not.toHaveBeenCalled();
    });
  });

  describe('vibo_delete_section', () => {
    const withContent = () =>
      fresh({ sections: [section('A'), section('Z', { name: 'ZZ TEST x', songsCount: 3, questionsCount: 4, answeredCount: 2 })] });

    it('previews the name, song count and answered questions, then deletes', async () => {
      const { writes, state } = withContent();
      const { preview } = await previewCall(harness, 'vibo_delete_section', { eventId: 'e1', sectionId: 'Z' });
      expect((preview as unknown as { context: unknown }).context).toEqual({
        name: 'ZZ TEST x',
        type: 'simple',
        songsCount: 3,
        questionsAnswered: '2/4',
      });
      expect(writes).not.toHaveBeenCalled();
      const res = await confirmCall(harness, 'vibo_delete_section', { eventId: 'e1', sectionId: 'Z' }, writes);
      expect(writes).toHaveBeenCalledWith(REMOVE_SECTION, { eventId: 'e1', sectionId: 'Z' });
      expect(parseToolResult<{ deleted: boolean }>(res).deleted).toBe(true);
      expect(sectionOrder(state)).toEqual(['A']);
    });

    it('refuses the confirm if the section changed since the preview (context is bound into the token)', async () => {
      const { writes, state } = withContent();
      const { confirmToken } = await previewCall(harness, 'vibo_delete_section', { eventId: 'e1', sectionId: 'Z' });
      state.sections[1].songsCount = 4; // someone added a song meanwhile
      const res = await harness.callTool('vibo_delete_section', { eventId: 'e1', sectionId: 'Z', confirmToken });
      expect(JSON.stringify(res)).toContain('DRAFT_CHANGED');
      expect(writes).not.toHaveBeenCalled();
    });

    it.each(['dontPlay', 'headline'])('refuses a %s section unless force:true', async (type) => {
      const { writes } = fresh({ sections: [section('X', { type })] });
      const res = await harness.callTool('vibo_delete_section', { eventId: 'e1', sectionId: 'X' });
      expect(res.isError).toBe(true);
      expect(JSON.stringify(res)).toContain('force:true');
      expect(writes).not.toHaveBeenCalled();
      await confirmCall(harness, 'vibo_delete_section', { eventId: 'e1', sectionId: 'X', force: true }, writes);
    });

    it('refuses an unknown section and one Vibo marks canRemove:false', async () => {
      const { writes } = fresh({ sections: [section('A', { canRemove: false })] });
      expect((await harness.callTool('vibo_delete_section', { eventId: 'e1', sectionId: 'nope' })).isError).toBe(true);
      const res = await harness.callTool('vibo_delete_section', { eventId: 'e1', sectionId: 'A' });
      expect(res.isError).toBe(true);
      expect(JSON.stringify(res)).toContain('Who can delete section');
      expect(writes).not.toHaveBeenCalled();
    });

    it('reports failure when removeSection does not return true', async () => {
      const { writes } = fresh({ replies: { removeSection: false } });
      const { confirmToken } = await previewCall(harness, 'vibo_delete_section', { eventId: 'e1', sectionId: 'A' });
      const res = await harness.callTool('vibo_delete_section', { eventId: 'e1', sectionId: 'A', confirmToken });
      expect(writes).toHaveBeenCalledTimes(1);
      expect(res.isError).toBe(true);
    });
  });

  describe('vibo_reorder_sections', () => {
    it('moves sections after the target with one UI-shaped call per moved section', async () => {
      const { writes, state } = fresh();
      const args = { eventId: 'e1', sourceSectionIds: ['D'], targetSectionId: 'A' };
      const { preview } = await previewCall(harness, 'vibo_reorder_sections', args);
      expect(preview.willSend).toEqual({ eventId: 'e1', calls: [{ sourceSectionId: 'D', targetSectionId: 'B' }] });
      const res = await confirmCall(harness, 'vibo_reorder_sections', args, writes);
      expect(sectionOrder(state)).toEqual(['A', 'D', 'B', 'C']);
      expect(parseToolResult<{ newPositions: { index: number }[] }>(res).newPositions[0].index).toBe(1);
    });

    it('moves several to the start in the given order', async () => {
      const { writes, state } = fresh();
      const args = { eventId: 'e1', sourceSectionIds: ['C', 'B', 'D'] };
      const { confirmToken } = await previewCall(harness, 'vibo_reorder_sections', args);
      await harness.callTool('vibo_reorder_sections', { ...args, confirmToken });
      expect(writes.mock.calls.every(([doc]) => doc === REORDER_SECTIONS)).toBe(true);
      expect(sectionOrder(state)).toEqual(['C', 'B', 'D', 'A']);
    });

    it('is a no-op (no gate, no write) when already in order', async () => {
      const { writes } = fresh();
      const res = await harness.callTool('vibo_reorder_sections', { eventId: 'e1', sourceSectionIds: ['B'], targetSectionId: 'A' });
      expect(parseToolResult<{ changed: boolean }>(res).changed).toBe(false);
      expect(writes).not.toHaveBeenCalled();
    });

    it('refuses unknown ids, a target among the sources, and a DJ-disabled reorder', async () => {
      let { writes } = fresh();
      expect((await harness.callTool('vibo_reorder_sections', { eventId: 'e1', sourceSectionIds: ['nope'] })).isError).toBe(true);
      expect((await harness.callTool('vibo_reorder_sections', { eventId: 'e1', sourceSectionIds: ['A'], targetSectionId: 'A' })).isError).toBe(true);
      ({ writes } = fresh({ event: hostEvent({ canHostReorderSections: false }) }));
      const res = await harness.callTool('vibo_reorder_sections', { eventId: 'e1', sourceSectionIds: ['D'] });
      expect(JSON.stringify(res)).toContain('canHostReorderSections');
      expect(writes).not.toHaveBeenCalled();
    });

    it('lets the DJ reorder even when host reordering is off', async () => {
      const { writes } = fresh({ event: hostEvent({ canHostReorderSections: false }, { role: 'dj' }) });
      await confirmCall(harness, 'vibo_reorder_sections', { eventId: 'e1', sourceSectionIds: ['D'] }, writes);
    });
  });
});

describe('normalizeTime', () => {
  it.each([
    ['5:30 PM', '05:30 pm'],
    ['05:30pm', '05:30 pm'],
    ['12:00 a.m.', '12:00 am'],
  ])('%s → %s', (input, out) => expect(normalizeTime(input)).toBe(out));
  it.each(['17:30', '13:00 pm', '5 pm', 'noon'])('rejects %s', (input) => expect(normalizeTime(input)).toBeUndefined());
});
