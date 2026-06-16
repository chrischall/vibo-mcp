import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { client } from '../../src/client.js';
import { registerNotificationTools } from '../../src/tools/notifications.js';
import { GET_NOTIFICATIONS, GET_NOTIFICATIONS_COUNT, MARK_AS_READ } from '../../src/gql.js';
import { createTestHarness } from '../helpers.js';
import { parseToolResult } from '@chrischall/mcp-utils/test';

const gql = vi.spyOn(client, 'gql').mockResolvedValue(undefined as never);
let harness: Awaited<ReturnType<typeof createTestHarness>>;

beforeEach(() => gql.mockClear());
afterAll(async () => { if (harness) await harness.close(); });

describe('notification tools', () => {
  it('setup', async () => {
    harness = await createTestHarness((s) => registerNotificationTools(s));
  });

  it('vibo_list_notifications paginates', async () => {
    gql.mockResolvedValue({ getNotifications: { notifications: [] } });
    await harness.callTool('vibo_list_notifications', { limit: 50 });
    expect(gql).toHaveBeenCalledWith(GET_NOTIFICATIONS, { pagination: { skip: 0, limit: 50 } });
  });

  it('vibo_get_notifications_count returns the total', async () => {
    gql.mockResolvedValue({ getNotificationsCount: { total: 3 } });
    const res = await harness.callTool('vibo_get_notifications_count');
    expect(gql).toHaveBeenCalledWith(GET_NOTIFICATIONS_COUNT);
    expect(parseToolResult(res)).toEqual({ total: 3 });
  });

  it('vibo_mark_notifications_read requires ids or readAll', async () => {
    const res = await harness.callTool('vibo_mark_notifications_read', {});
    expect(res.isError).toBeTruthy();
    expect(gql).not.toHaveBeenCalled();
  });

  it('vibo_mark_notifications_read previews then marks specific ids', async () => {
    const preview = await harness.callTool('vibo_mark_notifications_read', { notificationIds: ['n1'] });
    expect(gql).not.toHaveBeenCalled();
    expect(parseToolResult<{ preview: boolean }>(preview).preview).toBe(true);

    gql.mockResolvedValue({ markAsRead: true });
    await harness.callTool('vibo_mark_notifications_read', { notificationIds: ['n1'], confirm: true });
    expect(gql).toHaveBeenCalledWith(MARK_AS_READ, { notificationIds: ['n1'] });
  });

  it('vibo_mark_notifications_read supports readAll', async () => {
    gql.mockResolvedValue({ markAsRead: true });
    await harness.callTool('vibo_mark_notifications_read', { readAll: true, confirm: true });
    expect(gql).toHaveBeenCalledWith(MARK_AS_READ, { readAll: true });
  });
});
