import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { client } from '../../src/client.js';
import { registerUploadTools } from '../../src/tools/uploads.js';
import { UPLOAD_USER_PHOTO } from '../../src/gql.js';
import { createTestHarness } from '../helpers.js';
import { parseToolResult } from '@chrischall/mcp-utils/test';

const gqlUpload = vi.spyOn(client, 'gqlUpload').mockResolvedValue(undefined as never);
let harness: Awaited<ReturnType<typeof createTestHarness>>;

beforeEach(() => gqlUpload.mockClear());
afterAll(async () => { if (harness) await harness.close(); });

describe('upload tools', () => {
  it('setup', async () => {
    harness = await createTestHarness((s) => registerUploadTools(s));
  });

  it('vibo_set_profile_photo previews without confirm (no upload)', async () => {
    const res = await harness.callTool('vibo_set_profile_photo', { path: '/tmp/me.jpg' });
    expect(gqlUpload).not.toHaveBeenCalled();
    expect(parseToolResult<{ preview: boolean }>(res).preview).toBe(true);
  });

  it('vibo_set_profile_photo uploads via the multipart path with confirm', async () => {
    gqlUpload.mockResolvedValue({ uploadUserPhoto: { url: 'https://x/y.jpg' } });
    const res = await harness.callTool('vibo_set_profile_photo', { path: '/tmp/me.jpg', confirm: true });
    expect(gqlUpload).toHaveBeenCalledWith(
      UPLOAD_USER_PHOTO,
      { photo: null },
      { 'variables.photo': '/tmp/me.jpg' },
    );
    expect(parseToolResult<{ url: string }>(res).url).toBe('https://x/y.jpg');
  });
});
