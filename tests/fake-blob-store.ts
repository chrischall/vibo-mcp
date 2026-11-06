// A stand-in for mcp-host's blob store: objects live in a Map behind a stubbed
// global `fetch`, and the store itself is the real mcp-utils client, found via
// the same MCP_BLOB_* environment a hosted deployment injects. So these tests
// drive the real signing, key validation, size cap and delete — only the
// network is fake.
import { vi } from 'vitest';
import { blobStoreFromEnv, mintUploadSlot } from '@chrischall/mcp-utils/export';

export const BLOB_BASE = 'https://host.example/b/reg_0123456789abcdef01234567';
const PATH_PREFIX = '/b/reg_0123456789abcdef01234567/';

export interface FakeBlobStore {
  objects: Map<string, { bytes: Uint8Array; type: string }>;
  /** Every request the store made, as `METHOD key`. */
  calls: string[];
  /** Mint a slot the way vibo_upload_slots does and "PUT" `bytes` into it; returns the blobKey. */
  put(filename: string, bytes: Uint8Array, mimeType?: string): string;
}

/**
 * Install the fake: sets MCP_BLOB_BASE_URL / MCP_BLOB_SIGNING_KEY (undo with
 * `vi.unstubAllEnvs()`) and stubs `fetch` (undo with `vi.unstubAllGlobals()`).
 * `deleteStatus` makes every DELETE fail with that status.
 */
export function installFakeBlobStore(opts: { deleteStatus?: number } = {}): FakeBlobStore {
  vi.stubEnv('MCP_BLOB_BASE_URL', BLOB_BASE);
  vi.stubEnv('MCP_BLOB_SIGNING_KEY', 'dGVzdC1zaWduaW5nLWtleQ');
  const objects = new Map<string, { bytes: Uint8Array; type: string }>();
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const key = decodeURIComponent(new URL(String(input)).pathname.replace(PATH_PREFIX, ''));
      const method = init?.method ?? 'GET';
      calls.push(`${method} ${key}`);
      if (method === 'DELETE') {
        if (opts.deleteStatus) return new Response('', { status: opts.deleteStatus });
        objects.delete(key);
        return new Response(null, { status: 204 });
      }
      const o = objects.get(key);
      return o ? new Response(o.bytes.slice(), { headers: { 'content-type': o.type } }) : new Response('', { status: 404 });
    }),
  );
  return {
    objects,
    calls,
    put(filename, bytes, mimeType) {
      const store = blobStoreFromEnv()!;
      const slot = mintUploadSlot(store, { filename, ...(mimeType ? { mimeType } : {}) });
      objects.set(slot.blobKey, { bytes, type: slot.mimeType });
      return slot.blobKey;
    },
  };
}
