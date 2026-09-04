import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { McpToolError, minifiedResult, schemaConfirm, toolAnnotations } from '@chrischall/mcp-utils';
import type { ViboClient } from '../client.js';
import { UPLOAD_USER_PHOTO } from '../gql.js';
import { nodeUploadResolver, type UploadResolver } from '../upload-source.js';
import { previewResult } from './shared.js';

/**
 * `resolveUpload` is the injectable file-source seam: the stdio server uses the
 * default `nodeUploadResolver`, which resolves either a local `path` or inline
 * base64 `fileData`. A caller that shares no filesystem with the server sends
 * the bytes inline, and the same tool works unchanged.
 */
export function registerUploadTools(
  server: McpServer,
  client: ViboClient,
  resolveUpload: UploadResolver = nodeUploadResolver,
): void {
  server.registerTool(
    'vibo_set_profile_photo',
    {
      description:
        'Set your Vibo profile photo from an image. Pass a local file `path` if the server shares your filesystem; otherwise pass the image bytes as base64 `fileData`. Returns the uploaded image URL. Confirm-gated.',
      annotations: toolAnnotations({ title: 'Set Vibo profile photo', readOnly: false }),
      inputSchema: {
        path: z.string().optional().describe('Absolute path to a local image file (jpg/png). Local/stdio server only.'),
        fileData: z
          .string()
          .optional()
          .describe('Base64-encoded image bytes (a `data:` URL prefix is allowed). Use this when the server cannot read your filesystem.'),
        filename: z.string().optional().describe('Filename for the image when using fileData (default "photo.jpg").'),
        confirm: schemaConfirm,
      },
    },
    async ({ path, fileData, filename, confirm }) => {
      if (!path && !fileData) {
        throw new McpToolError('Provide an image: a local file `path` or inline base64 `fileData`.', {
          hint: 'Pass `path` for a local file, or `fileData` (base64) if the server cannot read your filesystem.',
        });
      }
      if (!confirm) return previewResult('uploadUserPhoto', { photo: path ?? '(inline bytes)' });
      const file = await resolveUpload({ path, data: fileData, filename: filename ?? 'photo.jpg' });
      const data = await client.gqlUpload<{ uploadUserPhoto: unknown }>(
        UPLOAD_USER_PHOTO,
        { photo: null },
        { 'variables.photo': file },
      );
      return minifiedResult(data.uploadUserPhoto);
    },
  );
}
