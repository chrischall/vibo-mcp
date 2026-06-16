import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { textResult, toolAnnotations, schemaConfirm, McpToolError } from '@chrischall/mcp-utils';
import { client } from '../client.js';
import { GET_NOTIFICATIONS, GET_NOTIFICATIONS_COUNT, MARK_AS_READ } from '../gql.js';
import { limitSchema, skipSchema, pagination, previewResult } from './shared.js';

export function registerNotificationTools(server: McpServer): void {
  server.registerTool(
    'vibo_list_notifications',
    {
      description:
        'List your Vibo notifications (song additions, comments, DJ updates, etc.) with read state and linked event/section ids.',
      annotations: toolAnnotations({ title: 'List Vibo notifications', readOnly: true }),
      inputSchema: {
        limit: limitSchema,
        skip: skipSchema,
      },
    },
    async ({ limit, skip }) => {
      const data = await client.gql<{ getNotifications: unknown }>(GET_NOTIFICATIONS, {
        pagination: pagination(limit, skip),
      });
      return textResult(data.getNotifications);
    },
  );

  server.registerTool(
    'vibo_get_notifications_count',
    {
      description: 'Get the count of unread Vibo notifications.',
      annotations: toolAnnotations({ title: 'Unread notification count', readOnly: true }),
    },
    async () => {
      const data = await client.gql<{ getNotificationsCount: { total: number } }>(GET_NOTIFICATIONS_COUNT);
      return textResult(data.getNotificationsCount);
    },
  );

  server.registerTool(
    'vibo_mark_notifications_read',
    {
      description:
        'Mark notifications as read — pass specific notificationIds, or readAll:true to clear everything. Confirm-gated.',
      annotations: toolAnnotations({ title: 'Mark notifications read', readOnly: false }),
      inputSchema: {
        notificationIds: z.array(z.string()).optional().describe('Specific notification ids to mark read.'),
        readAll: z.boolean().optional().describe('Mark every notification as read.'),
        confirm: schemaConfirm,
      },
    },
    async ({ notificationIds, readAll, confirm }) => {
      if (!notificationIds?.length && !readAll) {
        throw new McpToolError('Provide notificationIds or set readAll:true.', {
          hint: 'Pass an array of notification ids, or readAll:true to clear all.',
        });
      }
      const variables: Record<string, unknown> = {};
      if (notificationIds?.length) variables.notificationIds = notificationIds;
      if (readAll) variables.readAll = true;
      if (!confirm) return previewResult('markAsRead', variables);
      const data = await client.gql<{ markAsRead: unknown }>(MARK_AS_READ, variables);
      return textResult({ marked: true, result: data.markAsRead });
    },
  );
}
