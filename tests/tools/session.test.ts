import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { client } from '../../src/client.js';
import * as auth from '../../src/auth.js';
import { registerSessionTools } from '../../src/tools/session.js';
import { createTestHarness } from '../helpers.js';
import { parseToolResult } from '@chrischall/mcp-utils/test';

const capture = vi.spyOn(auth, 'captureViboSession');
const setTokens = vi.spyOn(client, 'setTokens').mockImplementation(() => {});
const gql = vi.spyOn(client, 'gql').mockResolvedValue(undefined as never);
let harness: Awaited<ReturnType<typeof createTestHarness>>;

beforeEach(() => {
  capture.mockReset();
  setTokens.mockClear();
  gql.mockReset();
});
afterAll(async () => { if (harness) await harness.close(); });

describe('session tool', () => {
  it('setup', async () => {
    harness = await createTestHarness((s) => registerSessionTools(s));
  });

  it('vibo_capture_session captures, adopts the tokens, and confirms identity', async () => {
    capture.mockResolvedValue({ accessToken: 'AT', refreshToken: 'RT' });
    gql.mockResolvedValue({ me: { _id: 'u1', email: 'a@b.com' } });

    const res = await harness.callTool('vibo_capture_session');

    expect(capture).toHaveBeenCalled();
    expect(setTokens).toHaveBeenCalledWith('AT', 'RT');
    expect(parseToolResult(res)).toEqual({
      captured: true,
      hasRefreshToken: true,
      userId: 'u1',
      email: 'a@b.com',
    });
  });

  it('surfaces a capture failure as a tool error', async () => {
    capture.mockRejectedValue(new Error('fetchproxy bridge is down'));
    const res = await harness.callTool('vibo_capture_session');
    expect(res.isError).toBeTruthy();
    expect(setTokens).not.toHaveBeenCalled();
  });
});
