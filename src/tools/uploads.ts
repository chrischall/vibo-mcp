import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { textResult, toolAnnotations, schemaConfirm } from '@chrischall/mcp-utils';
import { client } from '../client.js';
import { UPLOAD_USER_PHOTO } from '../gql.js';
import { previewResult } from './shared.js';

export function registerUploadTools(server: McpServer): void {
  server.registerTool(
    'vibo_set_profile_photo',
    {
      description:
        'Set your Vibo profile photo from a local image file. Returns the uploaded image URL. Confirm-gated.',
      annotations: toolAnnotations({ title: 'Set Vibo profile photo', readOnly: false }),
      inputSchema: {
        path: z.string().describe('Absolute path to a local image file (jpg/png).'),
        confirm: schemaConfirm,
      },
    },
    async ({ path, confirm }) => {
      if (!confirm) return previewResult('uploadUserPhoto', { photo: path });
      const data = await client.gqlUpload<{ uploadUserPhoto: unknown }>(
        UPLOAD_USER_PHOTO,
        { photo: null },
        { 'variables.photo': path },
      );
      return textResult(data.uploadUserPhoto);
    },
  );
}
