import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { client } from '../../src/client.js';
import { registerSectionEditTools } from '../../src/tools/section-edit.js';
import { UPDATE_SECTION } from '../../src/gql.js';
import { createTestHarness } from '../helpers.js';
import { parseToolResult } from '@chrischall/mcp-utils/test';

const gql = vi.spyOn(client, 'gql').mockResolvedValue(undefined as never);
let harness: Awaited<ReturnType<typeof createTestHarness>>;

beforeEach(() => gql.mockClear());
afterAll(async () => { if (harness) await harness.close(); });

describe('section edit tools', () => {
  it('setup', async () => {
    harness = await createTestHarness((s) => registerSectionEditTools(s));
  });

  it('vibo_update_section errors when no fields are provided', async () => {
    const res = await harness.callTool('vibo_update_section', { eventId: 'e1', sectionId: 's1', confirm: true });
    expect(res.isError).toBeTruthy();
    expect(gql).not.toHaveBeenCalled();
  });

  it('vibo_update_section previews without confirm (no network)', async () => {
    const res = await harness.callTool('vibo_update_section', { eventId: 'e1', sectionId: 's1', name: 'Cocktails' });
    expect(gql).not.toHaveBeenCalled();
    expect(parseToolResult<{ preview: boolean }>(res).preview).toBe(true);
  });

  it('vibo_update_section builds the payload from only provided fields and is confirm-gated', async () => {
    gql.mockResolvedValue({ updateSection: { _id: 's1' } });
    await harness.callTool('vibo_update_section', {
      eventId: 'e1',
      sectionId: 's1',
      note: 'Play something upbeat',
      confirm: true,
    });
    expect(gql).toHaveBeenCalledWith(UPDATE_SECTION, {
      eventId: 'e1',
      sectionId: 's1',
      payload: { note: 'Play something upbeat' },
    });
  });
});
