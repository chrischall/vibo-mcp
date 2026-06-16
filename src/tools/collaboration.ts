import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { textResult, toolAnnotations, schemaConfirm } from '@chrischall/mcp-utils';
import { client } from '../client.js';
import { LIST_EVENT_USERS, INVITE_USERS, CHANGE_USER_ROLE, REMOVE_USER } from '../gql.js';
import { limitSchema, skipSchema, pagination, previewResult } from './shared.js';

export function registerCollaborationTools(server: McpServer): void {
  server.registerTool(
    'vibo_list_event_users',
    {
      description:
        "List the hosts and guests on an event. With no usersType, returns both groups merged ({hosts, guests, hostsCount, guestsCount}) and `limit`/`skip` apply per group; with usersType, returns that one group's page.",
      annotations: toolAnnotations({ title: 'List Vibo event users', readOnly: true }),
      inputSchema: {
        eventId: z.string().describe('Event id.'),
        usersType: z.enum(['host', 'guest']).optional().describe('Filter to only hosts or only guests.'),
        limit: limitSchema.describe('Max items to return (default 20). Applies per group when usersType is omitted.'),
        skip: skipSchema,
      },
    },
    async ({ eventId, usersType, limit, skip }) => {
      type UsersPage = { users: unknown[]; totalCount: number };
      const page = pagination(limit, skip);
      if (usersType) {
        const data = await client.gql<{ eventUsers: UsersPage }>(LIST_EVENT_USERS, {
          eventId,
          usersType,
          pagination: page,
        });
        return textResult({ ...data.eventUsers, usersType });
      }
      // The API returns nothing unless usersType is set, so fetch both groups
      // and merge for the intuitive "everyone on the event" listing.
      const [hosts, guests] = await Promise.all([
        client.gql<{ eventUsers: UsersPage }>(LIST_EVENT_USERS, { eventId, usersType: 'host', pagination: page }),
        client.gql<{ eventUsers: UsersPage }>(LIST_EVENT_USERS, { eventId, usersType: 'guest', pagination: page }),
      ]);
      return textResult({
        hosts: hosts.eventUsers.users,
        guests: guests.eventUsers.users,
        hostsCount: hosts.eventUsers.totalCount,
        guestsCount: guests.eventUsers.totalCount,
      });
    },
  );

  server.registerTool(
    'vibo_invite_users',
    {
      description: 'Invite people to an event by email (as host or guest). Confirm-gated.',
      annotations: toolAnnotations({ title: 'Invite Vibo event users', readOnly: false }),
      inputSchema: {
        eventId: z.string().describe('Event id.'),
        type: z.enum(['host', 'guest']).describe('Invite as host or guest.'),
        text: z.string().describe('Personal message included in the invite.'),
        emails: z.array(z.string().email()).min(1).describe('Email addresses to invite.'),
        confirm: schemaConfirm,
      },
    },
    async ({ eventId, type, text, emails, confirm }) => {
      const variables = { eventId, type, text, emails };
      if (!confirm) return previewResult('inviteUserViaEmail', variables);
      const data = await client.gql<{ inviteUserViaEmail: unknown }>(INVITE_USERS, variables);
      return textResult(data.inviteUserViaEmail);
    },
  );

  server.registerTool(
    'vibo_change_user_role',
    {
      description: "Change an event member's role between host and guest. Confirm-gated.",
      annotations: toolAnnotations({ title: 'Change Vibo user role', readOnly: false }),
      inputSchema: {
        eventId: z.string().describe('Event id.'),
        userId: z.string().describe('Id of the member to update.'),
        type: z.enum(['host', 'guest']).describe('New role for the member.'),
        confirm: schemaConfirm,
      },
    },
    async ({ eventId, userId, type, confirm }) => {
      const variables = { eventId, userId, type };
      if (!confirm) return previewResult('changeUserTypeInEvent', variables);
      const data = await client.gql<{ changeUserTypeInEvent: unknown }>(CHANGE_USER_ROLE, variables);
      return textResult(data.changeUserTypeInEvent);
    },
  );

  server.registerTool(
    'vibo_remove_user',
    {
      description: 'Remove a member from an event. Confirm-gated.',
      annotations: toolAnnotations({ title: 'Remove Vibo event user', readOnly: false }),
      inputSchema: {
        eventId: z.string().describe('Event id.'),
        userId: z.string().describe('Id of the member to remove.'),
        confirm: schemaConfirm,
      },
    },
    async ({ eventId, userId, confirm }) => {
      const variables = { eventId, userId };
      if (!confirm) return previewResult('removeUserFromEvent', variables);
      const data = await client.gql<{ removeUserFromEvent: unknown }>(REMOVE_USER, variables);
      return textResult(data.removeUserFromEvent);
    },
  );
}
