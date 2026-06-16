import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { textResult, toolAnnotations } from '@chrischall/mcp-utils';
import { client } from '../client.js';
import { LIST_SECTIONS } from '../gql.js';

export function registerSectionTools(server: McpServer): void {
  server.registerTool(
    'vibo_list_sections',
    {
      description:
        "List an event's timeline sections (e.g. Ceremony, First Dance, Dinner, Dancing) with each section's id, name, scheduled time, note, song count and progress. Use a section _id with vibo_get_section_songs / vibo_add_song_to_section.",
      annotations: toolAnnotations({ title: 'List Vibo event sections', readOnly: true }),
      inputSchema: {
        eventId: z.string().describe('Event id (from vibo_list_events).'),
      },
    },
    async ({ eventId }) => {
      const data = await client.gql<{ sections: unknown }>(LIST_SECTIONS, { eventId });
      return textResult(data.sections);
    },
  );
}
