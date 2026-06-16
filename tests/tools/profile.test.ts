import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { client } from '../../src/client.js';
import { registerProfileTools } from '../../src/tools/profile.js';
import { GET_ME } from '../../src/gql.js';
import { createTestHarness } from '../helpers.js';
import { parseToolResult } from '@chrischall/mcp-utils/test';

const gql = vi.spyOn(client, 'gql').mockResolvedValue(undefined as never);
let harness: Awaited<ReturnType<typeof createTestHarness>>;

beforeEach(() => gql.mockClear());
afterAll(async () => { if (harness) await harness.close(); });

describe('profile tools', () => {
  it('setup', async () => {
    harness = await createTestHarness((s) => registerProfileTools(s));
  });

  it('vibo_get_me runs getMe and returns the user', async () => {
    gql.mockResolvedValue({ me: { _id: 'u1', email: 'a@b.com' } });
    const res = await harness.callTool('vibo_get_me');
    expect(gql).toHaveBeenCalledWith(GET_ME);
    expect(parseToolResult(res)).toEqual({ _id: 'u1', email: 'a@b.com' });
  });

  it('vibo_healthcheck reports ok with the user id', async () => {
    gql.mockResolvedValue({ me: { _id: 'u1', email: 'a@b.com' } });
    const res = await harness.callTool('vibo_healthcheck');
    expect(parseToolResult(res)).toEqual({ ok: true, userId: 'u1', email: 'a@b.com' });
  });
});
