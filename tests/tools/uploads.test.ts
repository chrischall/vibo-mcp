import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { client } from '../../src/client.js';
import { registerUploadTools } from '../../src/tools/uploads.js';
import { UPLOAD_USER_PHOTO } from '../../src/gql.js';
import type { UploadFile, FileRef } from '../../src/upload-source.js';
import { createTestHarness, confirmCall } from '../helpers.js';
import { parseToolResult } from '@chrischall/mcp-utils/test';

const gqlUpload = vi.spyOn(client, 'gqlUpload').mockResolvedValue(undefined as never);

// A fake upload resolver so the tool never touches the filesystem: it records
// the ref it was handed and returns a stub in-memory file. This is the same
// injectable upload-resolver seam — here we
// assert the tool resolves the right ref and streams the blob into gqlUpload.
const stubFile: UploadFile = { blob: new Blob(['x']), filename: 'photo.jpg' };
const resolve = vi.fn<(ref: FileRef) => Promise<UploadFile>>().mockResolvedValue(stubFile);

let harness: Awaited<ReturnType<typeof createTestHarness>>;

beforeEach(() => {
  gqlUpload.mockClear();
  resolve.mockClear();
});
afterAll(async () => { if (harness) await harness.close(); });

describe('upload tools', () => {
  it('setup', async () => {
    harness = await createTestHarness((s) => registerUploadTools(s, client, resolve));
  });

  it('vibo_set_profile_photo previews without a token (no resolve, no upload)', async () => {
    const res = await harness.callTool('vibo_set_profile_photo', { path: '/tmp/me.jpg' });
    expect(resolve).not.toHaveBeenCalled();
    expect(gqlUpload).not.toHaveBeenCalled();
    expect(parseToolResult<{ status: string }>(res).status).toBe('confirmation-required');
  });

  it('vibo_set_profile_photo resolves a local path and uploads via the multipart path after confirmation', async () => {
    gqlUpload.mockResolvedValue({ uploadUserPhoto: { url: 'https://x/y.jpg' } });
    const res = await confirmCall(harness, 'vibo_set_profile_photo', { path: '/tmp/me.jpg' }, gqlUpload);
    expect(resolve).toHaveBeenCalledWith({ path: '/tmp/me.jpg', data: undefined, filename: 'photo.jpg', kind: 'image' });
    expect(gqlUpload).toHaveBeenCalledWith(
      UPLOAD_USER_PHOTO,
      { photo: null },
      { 'variables.photo': stubFile },
    );
    expect(parseToolResult<{ url: string }>(res).url).toBe('https://x/y.jpg');
  });

  it('vibo_set_profile_photo resolves inline base64 fileData (the no-local-filesystem path)', async () => {
    gqlUpload.mockResolvedValue({ uploadUserPhoto: { url: 'https://x/z.jpg' } });
    await confirmCall(harness, 'vibo_set_profile_photo', { fileData: 'aGk=', filename: 'me.png' }, gqlUpload);
    expect(resolve).toHaveBeenCalledWith({ path: undefined, data: 'aGk=', filename: 'me.png', kind: 'image' });
    expect(gqlUpload).toHaveBeenCalledWith(UPLOAD_USER_PHOTO, { photo: null }, { 'variables.photo': stubFile });
  });

  it('vibo_set_profile_photo errors when neither path nor fileData is provided', async () => {
    const res = await harness.callTool('vibo_set_profile_photo', {});
    expect(res.isError).toBeTruthy();
    expect(resolve).not.toHaveBeenCalled();
    expect(gqlUpload).not.toHaveBeenCalled();
  });
});
