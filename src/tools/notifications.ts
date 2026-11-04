import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import { McpToolError, minifiedResult, confirmTokenParam, toolAnnotations } from '@chrischall/mcp-utils';
import type { ViboClient } from '../client.js';
import { GET_NOTIFICATIONS, GET_NOTIFICATIONS_COUNT, MARK_AS_READ } from '../gql.js';
import { limitSchema, skipSchema, pagination, confirmWrite, CONFIRM_NOTE } from './shared.js';
import { VIBO_VIEWS, viewResponse } from '../view.js';
import { familyMeta } from './hints.js';
import { briefLine, briefLines, isoDate, pageOf, text, untrustedBriefResponse } from '../brief.js';

/** Who writes the text a brief notification line carries. */
const NOTIFICATION_AUTHOR = 'Notification text quotes what other event members and the DJ wrote.';

/** One notification as `header — <ISO date | no date> — <read|unread>`, ≤ 120 chars. */
export function notificationBrief(n: Record<string, unknown>): string {
  return briefLine(text(n.header) ?? text(n.body) ?? '(notification)', isoDate(n.createdAt), n.isRead === true ? 'read' : 'unread');
}

export function registerNotificationTools(server: McpServer, client: ViboClient): void {
  server.registerTool(
    'vibo_list_notifications',
    {
      description:
        'List your Vibo notifications (song additions, comments, DJ updates, etc.) with read state and linked event/section ids.',
      annotations: toolAnnotations({ title: 'List Vibo notifications', readOnly: true, openWorld: true }),
      _meta: familyMeta('whats-new', {
        canonical: true,
        aliases: ['dj', 'vibo', 'notifications', 'updates', 'wedding music', 'song requests'],
      }),
      inputSchema: z.object({
        view: z
          .enum([...VIBO_VIEWS, 'brief'])
          .optional()
          .describe(
            'compact (default) strips image/avatar URLs; "full" returns Vibo\'s payload untouched; "brief" ' +
              'returns one line per notification: header — <ISO date | no date> — <read|unread>, inside the ' +
              'untrusted-data envelope, with "-- none" for none and "-- N of M shown" / "-- more" when partial.',
          ),
        limit: limitSchema,
        skip: skipSchema,
      }),
    },
    async ({ limit, skip, view }) => {
      const page = pagination(limit, skip);
      const data = await client.gql<{ getNotifications: unknown }>(GET_NOTIFICATIONS, { pagination: page });
      if (view === 'brief') {
        const lines = briefLines(pageOf(data.getNotifications, 'notifications', page.skip), notificationBrief);
        return untrustedBriefResponse(lines, NOTIFICATION_AUTHOR);
      }
      return viewResponse(view, data.getNotifications);
    },
  );

  server.registerTool(
    'vibo_get_notifications_count',
    {
      description: 'Get the count of unread Vibo notifications.',
      annotations: toolAnnotations({ title: 'Unread notification count', readOnly: true, openWorld: true }),
      _meta: familyMeta('whats-new', { aliases: ['dj', 'vibo', 'unread', 'wedding music'] }),
    },
    async () => {
      const data = await client.gql<{ getNotificationsCount: { total: number } }>(GET_NOTIFICATIONS_COUNT);
      return minifiedResult(data.getNotificationsCount);
    },
  );

  server.registerTool(
    'vibo_mark_notifications_read',
    {
      description:
        'Mark notifications as read — pass specific notificationIds, or readAll:true to clear everything. ' + CONFIRM_NOTE,
      annotations: toolAnnotations({ title: 'Mark notifications read', readOnly: false, destructive: true, idempotent: true, openWorld: true }),
      _meta: familyMeta('change'),
      inputSchema: z.object({
        notificationIds: z.array(z.string()).optional().describe('Specific notification ids to mark read.'),
        readAll: z.boolean().optional().describe('Mark every notification as read.'),
        confirmToken: confirmTokenParam,
      }),
    },
    async (args, ctx) => {
      const { notificationIds, readAll, confirmToken } = args;
      if (!notificationIds?.length && !readAll) {
        throw new McpToolError('Provide notificationIds or set readAll:true.', {
          hint: 'Pass an array of notification ids, or readAll:true to clear all.',
        });
      }
      const variables: Record<string, unknown> = {};
      if (notificationIds?.length) variables.notificationIds = notificationIds;
      if (readAll) variables.readAll = true;
      const gate = await confirmWrite(ctx, {
        tool: 'vibo_mark_notifications_read',
        mutation: 'markAsRead',
        message: 'Review and confirm marking these notifications read:',
        confirmToken,
        args,
        target: '',
        willSend: variables,
      });
      if (gate) return gate;
      const data = await client.gql<{ markAsRead: unknown }>(MARK_AS_READ, variables);
      return minifiedResult({ marked: true, result: data.markAsRead });
    },
  );
}
