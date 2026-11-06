import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { client } from '../../src/client.js';
import { registerUploadTools } from '../../src/tools/uploads.js';
import { UPLOAD_USER_PHOTO } from '../../src/gql.js';
import { MAX_UPLOAD_BYTES, type UploadFile, type FileRef } from '../../src/upload-source.js';
import { createTestHarness, confirmCall, previewCall, stubUpload } from '../helpers.js';
import { installFakeBlobStore } from '../fake-blob-store.js';
import { parseToolResult } from '@chrischall/mcp-utils/test';

const gqlUpload = vi.spyOn(client, 'gqlUpload').mockResolvedValue(undefined as never);

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
const b64 = (b: Uint8Array) => Buffer.from(b).toString('base64');

// A fake upload resolver so the tool never touches the filesystem: it records
// the ref it was handed and returns a stub in-memory file. This is the same
// injectable upload-resolver seam — here we
// assert the tool resolves the right ref and streams the blob into gqlUpload.
const stubFile: UploadFile = stubUpload('x', 'photo.jpg');
const resolve = vi.fn<(ref: FileRef) => Promise<UploadFile>>().mockResolvedValue(stubFile);

let harness: Awaited<ReturnType<typeof createTestHarness>>;

beforeEach(() => {
  gqlUpload.mockReset();
  resolve.mockClear();
});
afterAll(async () => { if (harness) await harness.close(); });

describe('upload tools (injected resolver)', () => {
  it('setup', async () => {
    harness = await createTestHarness((s) => registerUploadTools(s, client, resolve));
  });

  it('vibo_set_profile_photo previews without a token (reads to fingerprint, no upload)', async () => {
    const res = await harness.callTool('vibo_set_profile_photo', { path: '/tmp/me.jpg' });
    // Resolved so the token can bind a digest of the bytes (fleet-audit #1139).
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(gqlUpload).not.toHaveBeenCalled();
    expect(parseToolResult<{ status: string }>(res).status).toBe('confirmation-required');
  });

  it('vibo_set_profile_photo resolves a local path and uploads via the multipart path after confirmation', async () => {
    gqlUpload.mockResolvedValue({ uploadUserPhoto: { url: 'https://x/y.jpg' } });
    const res = await confirmCall(harness, 'vibo_set_profile_photo', { path: '/tmp/me.jpg' }, gqlUpload);
    expect(resolve).toHaveBeenCalledWith({ path: '/tmp/me.jpg', data: undefined, blobKey: undefined, filename: undefined, kind: 'image' });
    expect(gqlUpload).toHaveBeenCalledWith(UPLOAD_USER_PHOTO, { photo: null }, { 'variables.photo': stubFile });
    // No blob was involved, so the result is Vibo's, unchanged.
    expect(parseToolResult<Record<string, unknown>>(res)).toEqual({ url: 'https://x/y.jpg' });
  });

  it('vibo_set_profile_photo resolves inline base64 fileData (the no-local-filesystem path)', async () => {
    gqlUpload.mockResolvedValue({ uploadUserPhoto: { url: 'https://x/z.jpg' } });
    await confirmCall(harness, 'vibo_set_profile_photo', { fileData: 'aGk=', filename: 'me.png' }, gqlUpload);
    expect(resolve).toHaveBeenCalledWith({ path: undefined, data: 'aGk=', blobKey: undefined, filename: 'me.png', kind: 'image' });
    expect(gqlUpload).toHaveBeenCalledWith(UPLOAD_USER_PHOTO, { photo: null }, { 'variables.photo': stubFile });
  });

  it('vibo_set_profile_photo passes a blobKey through', async () => {
    gqlUpload.mockResolvedValue({ uploadUserPhoto: { url: 'https://x/b.jpg' } });
    await confirmCall(harness, 'vibo_set_profile_photo', { blobKey: 'uploads/k' }, gqlUpload);
    expect(resolve).toHaveBeenCalledWith({ path: undefined, data: undefined, blobKey: 'uploads/k', filename: undefined, kind: 'image' });
  });

  it('the preview shows the file and the sha256 the token binds', async () => {
    const body = await previewCall(harness, 'vibo_set_profile_photo', { path: '/tmp/me.jpg' });
    expect(body.preview.willSend).toEqual({
      photo: { source: 'path', path: '/tmp/me.jpg', filename: 'photo.jpg', mimeType: 'application/octet-stream', sizeBytes: 1, sha256: stubFile.sha256 },
    });
  });
});

describe('upload tools (real resolver)', () => {
  let real: Awaited<ReturnType<typeof createTestHarness>> | undefined;
  let dir: string | undefined;
  afterEach(async () => {
    if (real) await real.close();
    real = undefined;
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  const open = async () => {
    real = await createTestHarness((s) => registerUploadTools(s, client));
    return real;
  };

  it('vibo_set_profile_photo needs exactly one source, named in its own parameters', async () => {
    const h = await open();
    for (const args of [{}, { fileData: b64(PNG), blobKey: 'uploads/x' }]) {
      const res = await h.callTool('vibo_set_profile_photo', args);
      expect(res.isError).toBe(true);
      expect(JSON.stringify(res.content)).toMatch(/exactly one of path, fileData or blobKey/);
    }
    expect(gqlUpload).not.toHaveBeenCalled();
  });

  it('refuses an oversize fileData before any preview or upload', async () => {
    const h = await open();
    const res = await h.callTool('vibo_set_profile_photo', {
      fileData: b64(Buffer.concat([PNG, Buffer.alloc(MAX_UPLOAD_BYTES)])),
    });
    expect(res.isError).toBe(true);
    expect(JSON.stringify(res.content)).toMatch(/limit is 25 MiB/);
    expect(gqlUpload).not.toHaveBeenCalled();
  });

  it('refuses truncated base64 fileData', async () => {
    const h = await open();
    const res = await h.callTool('vibo_set_profile_photo', { fileData: b64(PNG).slice(0, -1) });
    expect(res.isError).toBe(true);
    expect(JSON.stringify(res.content)).toMatch(/not valid base64/);
  });

  it('accepts a data: URL fileData and names unnamed bytes for their type', async () => {
    const h = await open();
    gqlUpload.mockResolvedValue({ uploadUserPhoto: { url: 'https://x/p.png' } });
    await confirmCall(h, 'vibo_set_profile_photo', { fileData: `data:image/png;base64,${b64(PNG)}` }, gqlUpload);
    const sent = (gqlUpload.mock.calls[0]![2] as Record<string, UploadFile>)['variables.photo']!;
    expect(sent.filename).toBe('photo.png');
    expect(Buffer.from(await sent.blob.arrayBuffer())).toEqual(PNG);
  });

  it('a local path still uploads from the upload directory', async () => {
    dir = mkdtempSync(join(tmpdir(), 'vibo-upload-'));
    vi.stubEnv('VIBO_UPLOAD_DIR', dir);
    writeFileSync(join(dir, 'me.jpg'), JPEG);
    const h = await open();
    gqlUpload.mockResolvedValue({ uploadUserPhoto: { url: 'https://x/me.jpg' } });
    const res = await confirmCall(h, 'vibo_set_profile_photo', { path: 'me.jpg' }, gqlUpload);
    const sent = (gqlUpload.mock.calls[0]![2] as Record<string, UploadFile>)['variables.photo']!;
    expect(sent.filename).toBe('me.jpg');
    expect(Buffer.from(await sent.blob.arrayBuffer())).toEqual(JPEG);
    expect(parseToolResult<Record<string, unknown>>(res)).toEqual({ url: 'https://x/me.jpg' });
  });

  it('on a hosted deployment a path is refused, pointing at vibo_upload_slots', async () => {
    vi.stubEnv('MCP_DATA_DIR', '/data');
    installFakeBlobStore();
    const h = await open();
    const res = await h.callTool('vibo_set_profile_photo', { path: 'me.jpg' });
    expect(res.isError).toBe(true);
    expect(JSON.stringify(res.content)).toMatch(/can't read files on your machine.*vibo_upload_slots/);
    expect(gqlUpload).not.toHaveBeenCalled();
  });

  it('blob happy path: the slot\'s file is uploaded, then deleted, and the deletion reported', async () => {
    const fake = installFakeBlobStore();
    const key = fake.put('new headshot.png', PNG);
    const h = await open();
    gqlUpload.mockResolvedValue({ uploadUserPhoto: { url: 'https://x/h.png' } });
    const body = await previewCall(h, 'vibo_set_profile_photo', { blobKey: key });
    expect(body.preview.willSend.photo).toMatchObject({ source: 'blob', blobKey: key, filename: 'new headshot.png', mimeType: 'image/png' });
    expect(fake.objects.has(key)).toBe(true); // a preview never deletes
    const res = await h.callTool('vibo_set_profile_photo', { blobKey: key, confirmToken: body.confirmToken });
    expect(res.isError).toBeFalsy();
    const sent = (gqlUpload.mock.calls[0]![2] as Record<string, UploadFile>)['variables.photo']!;
    expect(Buffer.from(await sent.blob.arrayBuffer())).toEqual(PNG);
    expect(fake.objects.has(key)).toBe(false);
    expect(parseToolResult<Record<string, unknown>>(res)).toEqual({
      url: 'https://x/h.png',
      blobCleanup: [{ blobKey: key, deleted: true }],
    });
  });

  it('a failed Vibo upload keeps the blob for a retry', async () => {
    const fake = installFakeBlobStore();
    const key = fake.put('a.png', PNG);
    const h = await open();
    gqlUpload.mockRejectedValue(new Error('Vibo is down'));
    const body = await previewCall(h, 'vibo_set_profile_photo', { blobKey: key });
    const res = await h.callTool('vibo_set_profile_photo', { blobKey: key, confirmToken: body.confirmToken });
    expect(res.isError).toBe(true);
    expect(fake.objects.has(key)).toBe(true);
    expect(fake.calls.some((c) => c.startsWith('DELETE'))).toBe(false);
  });

  it('a failed delete after a successful upload is reported, not thrown', async () => {
    const fake = installFakeBlobStore({ deleteStatus: 500 });
    const key = fake.put('a.png', PNG);
    const h = await open();
    gqlUpload.mockResolvedValue({ uploadUserPhoto: { url: 'https://x/a.png' } });
    const body = await previewCall(h, 'vibo_set_profile_photo', { blobKey: key });
    const res = await h.callTool('vibo_set_profile_photo', { blobKey: key, confirmToken: body.confirmToken });
    expect(res.isError).toBeFalsy();
    const out = parseToolResult<{ blobCleanup: { deleted: boolean; note: string }[] }>(res);
    expect(out.blobCleanup[0]).toMatchObject({ deleted: false });
    expect(out.blobCleanup[0]!.note).toMatch(/do not retry/);
  });

  it('a blob changed between preview and confirm is refused as DRAFT_CHANGED and not uploaded', async () => {
    const fake = installFakeBlobStore();
    const key = fake.put('a.png', PNG);
    const h = await open();
    const body = await previewCall(h, 'vibo_set_profile_photo', { blobKey: key });
    fake.objects.set(key, { bytes: new Uint8Array(Buffer.concat([PNG, Buffer.from([1])])), type: 'image/png' });
    const res = await h.callTool('vibo_set_profile_photo', { blobKey: key, confirmToken: body.confirmToken });
    expect(parseToolResult<{ error: string }>(res).error).toBe('DRAFT_CHANGED');
    expect(gqlUpload).not.toHaveBeenCalled();
    expect(fake.objects.has(key)).toBe(true);
  });
});

describe('vibo_upload_slots', () => {
  let h: Awaited<ReturnType<typeof createTestHarness>> | undefined;
  afterEach(async () => {
    if (h) await h.close();
    h = undefined;
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('mints one signed PUT slot per file, and is read-only', async () => {
    installFakeBlobStore();
    h = await createTestHarness((s) => registerUploadTools(s, client));
    const { tools } = await h.client.listTools();
    expect(tools.find((t) => t.name === 'vibo_upload_slots')?.annotations?.readOnlyHint).toBe(true);
    const res = await h.callTool('vibo_upload_slots', { files: [{ filename: 'new headshot.png' }, { filename: 'run of show.pdf' }] });
    const out = parseToolResult<{ slots: { blobKey: string; uploadUrl: string; mimeType: string; curl: string }[]; maxBytes: number }>(res);
    expect(out.slots).toHaveLength(2);
    expect(out.slots[0]!.blobKey).toMatch(/^uploads\/[0-9a-f-]{36}\//);
    expect(out.slots[0]!.uploadUrl).toMatch(/^https:\/\/host\.example\/b\/.*sig=/);
    expect(out.slots[0]!.mimeType).toBe('image/png');
    expect(out.slots[1]!.mimeType).toBe('application/pdf');
    expect(out.slots[0]!.curl).toContain("Content-Type: image/png");
    expect(out.maxBytes).toBe(MAX_UPLOAD_BYTES);
    expect(gqlUpload).not.toHaveBeenCalled();
  });

  it('refuses clearly when the deployment has no blob store', async () => {
    h = await createTestHarness((s) => registerUploadTools(s, client));
    const res = await h.callTool('vibo_upload_slots', { files: [{ filename: 'a.png' }] });
    expect(res.isError).toBe(true);
    expect(JSON.stringify(res.content)).toMatch(/no blob store.*fileData/);
  });

  it('refuses a filename that is a path', async () => {
    installFakeBlobStore();
    h = await createTestHarness((s) => registerUploadTools(s, client));
    const res = await h.callTool('vibo_upload_slots', { files: [{ filename: '../a.png' }] });
    expect(res.isError).toBe(true);
    expect(JSON.stringify(res.content)).toMatch(/bare filename/);
  });
});
