import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { nodeUploadResolver, inlineUploadResolver } from '../src/upload-source.js';

// The injectable upload boundary: stdio reads a local path (node:fs), the
// hosted Worker decodes inline base64. Both converge on an in-memory blob.

let dir: string;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe('nodeUploadResolver (stdio)', () => {
  it('reads a local file into a blob, defaulting the filename to the basename', async () => {
    dir = mkdtempSync(join(tmpdir(), 'vibo-upload-'));
    const file = join(dir, 'me.jpg');
    writeFileSync(file, 'hello');
    const out = await nodeUploadResolver({ path: file });
    expect(out.filename).toBe('me.jpg');
    expect(await out.blob.text()).toBe('hello');
  });

  it('honors an explicit filename override for a local path', async () => {
    dir = mkdtempSync(join(tmpdir(), 'vibo-upload-'));
    const file = join(dir, 'me.jpg');
    writeFileSync(file, 'hi');
    const out = await nodeUploadResolver({ path: file, filename: 'avatar.jpg' });
    expect(out.filename).toBe('avatar.jpg');
  });

  it('throws an actionable error for an unreadable path', async () => {
    await expect(nodeUploadResolver({ path: '/no/such/file.jpg' })).rejects.toThrow(/Could not read file/);
  });

  it('also decodes inline base64 when given data instead of a path', async () => {
    const out = await nodeUploadResolver({ data: 'aGk=', filename: 'x.png' });
    expect(await out.blob.text()).toBe('hi');
    expect(out.filename).toBe('x.png');
  });

  it('throws when neither path nor data is supplied', async () => {
    await expect(nodeUploadResolver({})).rejects.toThrow(/No file provided/);
  });
});

describe('inlineUploadResolver (hosted connector)', () => {
  it('decodes base64 bytes into a blob (default filename)', async () => {
    const out = await inlineUploadResolver({ data: 'aGk=' });
    expect(await out.blob.text()).toBe('hi');
    expect(out.filename).toBe('upload');
  });

  it('strips a data: URL prefix before decoding', async () => {
    const out = await inlineUploadResolver({ data: 'data:image/png;base64,aGk=', filename: 'p.png' });
    expect(await out.blob.text()).toBe('hi');
    expect(out.filename).toBe('p.png');
  });

  it('rejects a filesystem path (no filesystem on the Worker)', async () => {
    await expect(inlineUploadResolver({ path: '/tmp/x.jpg' })).rejects.toThrow(/no filesystem|not available/i);
  });

  it('throws when no bytes are supplied', async () => {
    await expect(inlineUploadResolver({})).rejects.toThrow(/No file provided/);
  });

  it('throws an actionable error on undecodable base64', async () => {
    await expect(inlineUploadResolver({ data: '!!!not base64!!!' })).rejects.toThrow(/decode inline file data/);
  });
});
