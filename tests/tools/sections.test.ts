import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { client } from '../../src/client.js';
import { registerSectionTools } from '../../src/tools/sections.js';
import { LIST_SECTIONS } from '../../src/gql.js';
import { createTestHarness } from '../helpers.js';
import { parseToolResult } from '@chrischall/mcp-utils/test';

const gql = vi.spyOn(client, 'gql').mockResolvedValue(undefined as never);
let harness: Awaited<ReturnType<typeof createTestHarness>>;

beforeEach(() => gql.mockClear());
afterAll(async () => { if (harness) await harness.close(); });

describe('section tools', () => {
  it('setup', async () => {
    harness = await createTestHarness((s) => registerSectionTools(s));
  });

  it('vibo_list_sections returns the timeline for an event', async () => {
    gql.mockResolvedValue({ sections: [{ _id: 's1', name: 'First Dance' }] });
    const res = await harness.callTool('vibo_list_sections', { eventId: 'e1' });
    expect(gql).toHaveBeenCalledWith(LIST_SECTIONS, { eventId: 'e1' });
    expect(parseToolResult<unknown[]>(res)).toHaveLength(1);
  });
});
