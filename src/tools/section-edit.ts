import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { textResult, toolAnnotations, schemaConfirm, McpToolError } from '@chrischall/mcp-utils';
import { client } from '../client.js';
import { UPDATE_SECTION } from '../gql.js';
import { previewResult } from './shared.js';

export function registerSectionEditTools(server: McpServer): void {
  server.registerTool(
    'vibo_update_section',
    {
      description:
        "Edit a timeline section's name, time, note, or description. Subject to the section's host-edit permissions. Confirm-gated.",
      annotations: toolAnnotations({ title: 'Update Vibo section', readOnly: false }),
      inputSchema: {
        eventId: z.string(),
        sectionId: z.string(),
        name: z.string().optional(),
        time: z.string().optional().describe('scheduled time, e.g. "05:00 pm"'),
        note: z.string().optional().describe('note to the DJ for this section'),
        description: z.string().optional(),
        confirm: schemaConfirm,
      },
    },
    async ({ eventId, sectionId, name, time, note, description, confirm }) => {
      const payload: Record<string, unknown> = {};
      if (name !== undefined) payload.name = name;
      if (time !== undefined) payload.time = time;
      if (note !== undefined) payload.note = note;
      if (description !== undefined) payload.description = description;
      if (Object.keys(payload).length === 0) {
        throw new McpToolError('Provide at least one field to update: name, time, note, or description.', {
          hint: 'Pass at least one of name, time, note, or description.',
        });
      }
      const vars = { eventId, sectionId, payload };
      if (!confirm) return previewResult('updateSection', vars);
      const data = await client.gql<{ updateSection: unknown }>(UPDATE_SECTION, vars);
      return textResult(data.updateSection);
    },
  );
}
