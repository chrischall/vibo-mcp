// Injectable file-source boundary for multipart uploads.
//
// The Vibo upload tools (`vibo_set_profile_photo`, `vibo_answer_question` with
// photo/file answers) send local media through the GraphQL `Upload` scalar.
// A caller that shares a filesystem with the server names a local path; one
// that does not — anything reaching this server remotely — sends the bytes
// inline as base64 instead. Both converge on an in-memory {@link UploadFile}
// that `ViboClient.gqlUpload` streams into a `FormData`.
//
// A tool hands the resolver a {@link FileRef} (a local `path`, or inline base64
// `data`) and gets back a `Blob` + filename; `nodeUploadResolver` resolves
// either.

import { McpToolError } from '@chrischall/mcp-utils';

/** An in-memory file ready to append to a multipart `FormData`. */
export interface UploadFile {
  blob: Blob;
  filename: string;
}

/**
 * A reference to a file to upload: either a local filesystem `path` or inline
 * base64 `data`. `filename` overrides the name
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

