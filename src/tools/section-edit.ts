import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import { McpToolError, minifiedResult, confirmTokenParam, toolAnnotations } from '@chrischall/mcp-utils';
import type { ViboClient } from '../client.js';
import { UPDATE_SECTION } from '../gql.js';
import { confirmWrite, CONFIRM_NOTE } from './shared.js';

export function registerSectionEditTools(server: McpServer, client: ViboClient): void {
  server.registerTool(
    'vibo_update_section',
    {
      description:
        "Edit a timeline section's name, time, note, or description. Subject to the section's host-edit permissions. " + CONFIRM_NOTE,
      annotations: toolAnnotations({ title: 'Update Vibo section', readOnly: false, destructive: false }),
      inputSchema: z.object({
        eventId: z.string(),
        sectionId: z.string(),
        name: z.string().optional(),
        time: z.string().optional().describe('scheduled time, e.g. "05:00 pm"'),
        note: z.string().optional().describe('note to the DJ for this section'),
        description: z.string().optional(),
        confirmToken: confirmTokenParam,
      }),
    },
    async ({ eventId, sectionId, name, time, note, description, confirmToken }, ctx) => {
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
      const gate = await confirmWrite(ctx, {
        tool: 'vibo_update_section',
        mutation: 'updateSection',
        message: 'Review and confirm this section edit:',
        confirmToken,
        target: sectionId,
        willSend: vars,
      });
      if (gate) return gate;
      const data = await client.gql<{ updateSection: unknown }>(UPDATE_SECTION, vars);
      return minifiedResult(data.updateSection);
    },
  );
}
