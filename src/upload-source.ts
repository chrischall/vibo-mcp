// Injectable file-source boundary for multipart uploads.
//
// The Vibo upload tools (`vibo_set_profile_photo`, `vibo_answer_question` with
// photo/file answers) send local media through the GraphQL `Upload` scalar.
// The stdio server reads those bytes from a local file path; the hosted
// Cloudflare Worker has NO filesystem, so it receives the bytes inline as
// base64 instead. Both paths converge on an in-memory {@link UploadFile} that
// `ViboClient.gqlUpload` streams into a `FormData` — the client itself never
// touches `node:fs`, which keeps it loadable in the Workers runtime.
//
// A tool hands the resolver a {@link FileRef} (a local `path`, or inline base64
// `data`) and gets back a `Blob` + filename. `nodeUploadResolver` (stdio)
// resolves either; `inlineUploadResolver` (Worker) resolves only inline bytes
// and throws an actionable error for a filesystem path.

import { McpToolError } from '@chrischall/mcp-utils';

/** An in-memory file ready to append to a multipart `FormData`. */
export interface UploadFile {
  blob: Blob;
  filename: string;
}

/**
 * A reference to a file to upload: either a local filesystem `path` (stdio) or
 * inline base64 `data` (the hosted connector). `filename` overrides the name
 * sent to the server (defaults to the path basename, or a generic name for
 * inline bytes).
 */
export interface FileRef {
  path?: string;
  data?: string;
  filename?: string;
}

/** Turns a {@link FileRef} into an in-memory {@link UploadFile}. */
export type UploadResolver = (ref: FileRef) => Promise<UploadFile>;

const DEFAULT_FILENAME = 'upload';

/** Decode base64 (optionally a `data:` URL) into an {@link UploadFile}. */
function blobFromBase64(data: string, filename: string | undefined): UploadFile {
  // Strip a leading `data:<mime>;base64,` prefix if present.
  const base64 = data.includes(',') && data.startsWith('data:') ? data.slice(data.indexOf(',') + 1) : data;
  let binary: string;
  try {
    binary = atob(base64.trim());
  } catch (err) {
    throw new McpToolError('Could not decode inline file data — expected base64.', {
      hint: 'Pass the file bytes as a base64 string in `fileData` (a `data:` URL prefix is allowed).',
      cause: err,
    });
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { blob: new Blob([bytes]), filename: filename ?? DEFAULT_FILENAME };
}

/**
 * stdio resolver: reads a local file path via `node:fs` `openAsBlob` (streamed,
 * not buffered), or decodes inline base64 if that's what the caller supplied.
 * This is the byte-for-byte-unchanged local-path upload path.
 */
export const nodeUploadResolver: UploadResolver = async (ref) => {
  if (ref.path) {
    const { openAsBlob } = await import('node:fs');
    const { basename } = await import('node:path');
    let blob: Blob;
    try {
      blob = await openAsBlob(ref.path);
    } catch (err) {
      throw new McpToolError(`Could not read file for upload: ${ref.path}`, {
        hint: 'Provide an absolute path to a readable local file.',
        cause: err,
      });
    }
    return { blob, filename: ref.filename ?? basename(ref.path) };
  }
  if (ref.data) return blobFromBase64(ref.data, ref.filename);
  throw new McpToolError('No file provided for upload.', {
    hint: 'Pass a local file `path` (or inline base64 `fileData`).',
  });
};

/**
 * Hosted-connector resolver: the Worker has no filesystem, so it accepts ONLY
 * inline base64 bytes. A filesystem path draws an actionable error rather than
 * a runtime crash.
 */
export const inlineUploadResolver: UploadResolver = async (ref) => {
  if (ref.data) return blobFromBase64(ref.data, ref.filename);
  if (ref.path) {
    throw new McpToolError('Local file paths are not available on the hosted Vibo connector.', {
      hint: 'The hosted connector has no filesystem — pass the file bytes as base64 in `fileData` instead of a `path`.',
    });
  }
  throw new McpToolError('No file provided for upload.', {
    hint: 'Pass the file bytes as base64 in `fileData`.',
  });
};
