import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import { minifiedResult, confirmTokenParam, resolveView, toolAnnotations } from '@chrischall/mcp-utils';
import type { ViboClient } from '../client.js';
import { LIST_EVENT_USERS, INVITE_USERS, CHANGE_USER_ROLE, REMOVE_USER } from '../gql.js';
import { limitSchema, skipSchema, pagination, confirmWrite, CONFIRM_NOTE } from './shared.js';
import { eventUsersViewArg, viewResponse, VIBO_VIEWS } from '../view.js';

/**
 * Compact rung for event members. Unlike the rest of this server, the shape
 * here IS known: LIST_EVENT_USERS selects exactly
 * `{_id firstName lastName email role imageUrl}`. Compact keeps who-is-who
 * (id, name, role) and drops `email` — third-party PII the "who is a host /
 * guest" question never needs, and which would otherwise sit in the
 * transcript on every default call — plus the avatar URL, as compact does
 * everywhere. `view: 'full'` returns the members untouched, emails included.
 */
type EventUser = { _id?: unknown; firstName?: unknown; lastName?: unknown; role?: unknown };
function membersForView(view: string | undefined, users: unknown[]): unknown[] {
  if (resolveView(view, VIBO_VIEWS) !== 'compact') return users;
  return users.map((u) => {
    const { _id, firstName, lastName, role } = (u ?? {}) as EventUser;
    return { _id, firstName, lastName, role };
  });
}

export function registerCollaborationTools(server: McpServer, client: ViboClient): void {
  server.registerTool(
    'vibo_list_event_users',
    {
      description:
        "List the hosts and guests on an event. With no usersType, returns both groups merged ({hosts, guests, hostsCount, guestsCount}) and `limit`/`skip` apply per group; with usersType, returns that one group's page. Default (compact) view returns each member's id, name and role only; pass view:'full' for email addresses and avatars.",
      annotations: toolAnnotations({ title: 'List Vibo event users', readOnly: true }),
      inputSchema: z.object({
        eventId: z.string().describe('Event id.'),
        usersType: z.enum(['host', 'guest']).optional().describe('Filter to only hosts or only guests.'),
        view: eventUsersViewArg(),
        limit: limitSchema.describe('Max items to return (default 20). Applies per group when usersType is omitted.'),
        skip: skipSchema,
      }),
    },
    async ({ eventId, usersType, limit, skip, view }) => {
      type UsersPage = { users: unknown[]; totalCount: number };
      const page = pagination(limit, skip);
      if (usersType) {
        const data = await client.gql<{ eventUsers: UsersPage }>(LIST_EVENT_USERS, {
          eventId,
          usersType,
          pagination: page,
        });
        return viewResponse(view, {
          ...data.eventUsers,
          users: membersForView(view, data.eventUsers.users),
          usersType,
        });
      }
      // The API returns nothing unless usersType is set, so fetch both groups
      // and merge for the intuitive "everyone on the event" listing.
      const [hosts, guests] = await Promise.all([
        client.gql<{ eventUsers: UsersPage }>(LIST_EVENT_USERS, { eventId, usersType: 'host', pagination: page }),
        client.gql<{ eventUsers: UsersPage }>(LIST_EVENT_USERS, { eventId, usersType: 'guest', pagination: page }),
      ]);
      // BOTH exits go through the rung. The merged branch is the one that runs
      // when `usersType` is omitted — the default call — so honouring `view` on
      // only the filtered branch would leave the common path paying full price.
      return viewResponse(view, {
        hosts: membersForView(view, hosts.eventUsers.users),
        guests: membersForView(view, guests.eventUsers.users),
        hostsCount: hosts.eventUsers.totalCount,
        guestsCount: guests.eventUsers.totalCount,
      });
    },
  );

  server.registerTool(
    'vibo_invite_users',
    {
      description: 'Invite people to an event by email (as host or guest). ' + CONFIRM_NOTE,
      annotations: toolAnnotations({ title: 'Invite Vibo event users', readOnly: false, destructive: true }),
      inputSchema: z.object({
        eventId: z.string().describe('Event id.'),
        type: z.enum(['host', 'guest']).describe('Invite as host or guest.'),
        text: z.string().describe('Personal message included in the invite.'),
        emails: z.array(z.string().email()).min(1).describe('Email addresses to invite.'),
        confirmToken: confirmTokenParam,
      }),
    },
    async ({ eventId, type, text, emails, confirmToken }, ctx) => {
      const variables = { eventId, type, text, emails };
      const gate = await confirmWrite(ctx, {
        tool: 'vibo_invite_users',
        mutation: 'inviteUserViaEmail',
        message: 'Review and confirm sending these invitations:',
        confirmToken,
        target: eventId,
        willSend: variables,
      });
      if (gate) return gate;
      const data = await client.gql<{ inviteUserViaEmail: unknown }>(INVITE_USERS, variables);
      return minifiedResult(data.inviteUserViaEmail);
    },
  );

  server.registerTool(
    'vibo_change_user_role',
    {
      description: "Change an event member's role between host and guest. " + CONFIRM_NOTE,
      annotations: toolAnnotations({ title: 'Change Vibo user role', readOnly: false, destructive: true }),
      inputSchema: z.object({
        eventId: z.string().describe('Event id.'),
        userId: z.string().describe('Id of the member to update.'),
        type: z.enum(['host', 'guest']).describe('New role for the member.'),
        confirmToken: confirmTokenParam,
      }),
    },
    async ({ eventId, userId, type, confirmToken }, ctx) => {
      const variables = { eventId, userId, type };
      const gate = await confirmWrite(ctx, {
        tool: 'vibo_change_user_role',
        mutation: 'changeUserTypeInEvent',
        message: 'Review and confirm this role change:',
        confirmToken,
        target: userId,
        willSend: variables,
      });
      if (gate) return gate;
      const data = await client.gql<{ changeUserTypeInEvent: unknown }>(CHANGE_USER_ROLE, variables);
      return minifiedResult(data.changeUserTypeInEvent);
    },
  );

  server.registerTool(
    'vibo_remove_user',
    {
      description: 'Remove a member from an event. ' + CONFIRM_NOTE,
      annotations: toolAnnotations({ title: 'Remove Vibo event user', readOnly: false, destructive: true }),
      inputSchema: z.object({
        eventId: z.string().describe('Event id.'),
        userId: z.string().describe('Id of the member to remove.'),
        confirmToken: confirmTokenParam,
      }),
    },
    async ({ eventId, userId, confirmToken }, ctx) => {
      const variables = { eventId, userId };
      const gate = await confirmWrite(ctx, {
        tool: 'vibo_remove_user',
        mutation: 'removeUserFromEvent',
        message: 'Review and confirm removing this member from the event:',
        confirmToken,
        target: userId,
        willSend: variables,
      });
      if (gate) return gate;
      const data = await client.gql<{ removeUserFromEvent: unknown }>(REMOVE_USER, variables);
      return minifiedResult(data.removeUserFromEvent);
    },
  );
}
