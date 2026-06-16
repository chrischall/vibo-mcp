import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { textResult, toolAnnotations, schemaConfirm, McpToolError } from '@chrischall/mcp-utils';
import { client } from '../client.js';
import {
  LIST_UPCOMING_EVENTS,
  LIST_HISTORY_EVENTS,
  GET_EVENT,
  JOIN_EVENT_BY_DEEP_LINK,
  JOIN_EVENT_BY_HASH,
  LEAVE_EVENT,
  CREATE_EVENT_CONTACT,
} from '../gql.js';
import { limitSchema, skipSchema, pagination, previewResult } from './shared.js';

export function registerEventTools(server: McpServer): void {
  server.registerTool(
    'vibo_list_events',
    {
      description:
        "List the events you're part of (as host or guest). Defaults to upcoming events; pass past:true for events that have already happened. Optionally filter by a search query.",
      annotations: toolAnnotations({ title: 'List Vibo events', readOnly: true }),
      inputSchema: {
        past: z.boolean().optional().describe('Return past events instead of upcoming (default false).'),
        q: z.string().optional().describe('Search events by title.'),
        limit: limitSchema,
        skip: skipSchema,
      },
    },
    async ({ past, q, limit, skip }) => {
      const variables = {
        pagination: pagination(limit, skip),
        ...(q ? { filter: { q } } : {}),
      };
      const doc = past ? LIST_HISTORY_EVENTS : LIST_UPCOMING_EVENTS;
      const data = await client.gql<Record<string, unknown>>(doc, variables);
      return textResult(past ? data.historyEvents : data.upcomingEvents);
    },
  );

  server.registerTool(
    'vibo_get_event',
    {
      description:
        'Get full details for one event: title, date/timezone, location, your role, lock status, playlist size, and section/question progress. Use vibo_list_sections for the timeline.',
      annotations: toolAnnotations({ title: 'Get Vibo event', readOnly: true }),
      inputSchema: {
        eventId: z.string().describe('Event id (the _id from vibo_list_events).'),
      },
    },
    async ({ eventId }) => {
      const data = await client.gql<{ event: unknown }>(GET_EVENT, { eventId });
      return textResult(data.event);
    },
  );

  server.registerTool(
    'vibo_join_event',
    {
      description:
        "Join an event you were invited to, via its share link or hash (e.g. a vibodj.app.link/... URL someone sent you). Returns the joined event's id. Confirm-gated.",
      annotations: toolAnnotations({ title: 'Join Vibo event', readOnly: false }),
      inputSchema: {
        link: z
          .string()
          .describe('The full event share URL (vibodj.app.link/... or web.vibodj.com/...) or the bare join hash.'),
        confirm: schemaConfirm,
      },
    },
    async ({ link, confirm }) => {
      const isUrl = /^https?:\/\//i.test(link);
      if (!confirm) {
        return previewResult('joinEvent', isUrl ? { deepLink: link } : { hash: link });
      }
      if (isUrl) {
        const data = await client.gql<{ joinEventViaDeepLink: { _id: string } }>(JOIN_EVENT_BY_DEEP_LINK, {
          deepLink: link,
        });
        return textResult({ joined: true, eventId: data.joinEventViaDeepLink._id });
      }
      const data = await client.gql<{ joinEventByHash: { _id: string } }>(JOIN_EVENT_BY_HASH, { hash: link });
      return textResult({ joined: true, eventId: data.joinEventByHash._id });
    },
  );

  server.registerTool(
    'vibo_leave_event',
    {
      description: 'Leave an event you previously joined. Confirm-gated.',
      annotations: toolAnnotations({ title: 'Leave Vibo event', readOnly: false }),
      inputSchema: {
        eventId: z.string().describe('Event id to leave.'),
        confirm: schemaConfirm,
      },
    },
    async ({ eventId, confirm }) => {
      if (!confirm) return previewResult('leaveEvent', { eventId });
      const data = await client.gql<{ leaveEvent: unknown }>(LEAVE_EVENT, { eventId });
      return textResult({ left: true, eventId, result: data.leaveEvent });
    },
  );

  server.registerTool(
    'vibo_create_event_contact',
    {
      description:
        'Add a contact (host or guest) to an event with their name/email/phone. Confirm-gated.',
      annotations: toolAnnotations({ title: 'Add Vibo event contact', readOnly: false }),
      inputSchema: {
        eventId: z.string().describe('Event id.'),
        role: z.enum(['host', 'guest']).describe("The contact's role in the event."),
        email: z.string().email().describe('Contact email (required by Vibo).'),
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        phoneCode: z.string().optional().describe('Country calling code, e.g. "1".'),
        phoneNumber: z.string().optional(),
        confirm: schemaConfirm,
      },
    },
    async ({ eventId, role, email, firstName, lastName, phoneCode, phoneNumber, confirm }) => {
      const payload: Record<string, unknown> = { role, email };
      if (firstName !== undefined) payload.firstName = firstName;
      if (lastName !== undefined) payload.lastName = lastName;
      if (phoneCode !== undefined) payload.phoneCode = phoneCode;
      if (phoneNumber !== undefined) payload.phoneNumber = phoneNumber;
      if (phoneNumber !== undefined && phoneCode === undefined) {
        throw new McpToolError('phoneCode is required when phoneNumber is provided.', {
          hint: 'Pass phoneCode (e.g. "1") alongside phoneNumber.',
        });
      }
      if (!confirm) return previewResult('createEventContact', { eventId, payload });
      const data = await client.gql<{ createEventContact: unknown }>(CREATE_EVENT_CONTACT, { eventId, payload });
      return textResult(data.createEventContact);
    },
  );
}
