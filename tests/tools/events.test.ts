import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { client } from '../../src/client.js';
import { registerEventTools } from '../../src/tools/events.js';
import {
  LIST_UPCOMING_EVENTS,
  LIST_HISTORY_EVENTS,
  GET_EVENT,
  JOIN_EVENT_BY_DEEP_LINK,
  JOIN_EVENT_BY_HASH,
  LEAVE_EVENT,
  CREATE_EVENT_CONTACT,
} from '../../src/gql.js';
import { createTestHarness } from '../helpers.js';
import { parseToolResult } from '@chrischall/mcp-utils/test';

const gql = vi.spyOn(client, 'gql').mockResolvedValue(undefined as never);
let harness: Awaited<ReturnType<typeof createTestHarness>>;

beforeEach(() => gql.mockClear());
afterAll(async () => { if (harness) await harness.close(); });

describe('event tools', () => {
  it('setup', async () => {
    harness = await createTestHarness((s) => registerEventTools(s));
  });

  it('vibo_list_events defaults to upcoming with pagination', async () => {
    gql.mockResolvedValue({ upcomingEvents: { events: [], totalCount: 0 } });
    const res = await harness.callTool('vibo_list_events', {});
    expect(gql).toHaveBeenCalledWith(LIST_UPCOMING_EVENTS, { pagination: { skip: 0, limit: 20 } });
    expect(parseToolResult(res)).toEqual({ events: [], totalCount: 0 });
  });

  it('vibo_list_events past:true uses the history query + filter', async () => {
    gql.mockResolvedValue({ historyEvents: { events: [{ _id: 'e1' }] } });
    const res = await harness.callTool('vibo_list_events', { past: true, q: 'wedding', limit: 5, skip: 10 });
    expect(gql).toHaveBeenCalledWith(LIST_HISTORY_EVENTS, {
      pagination: { skip: 10, limit: 5 },
      filter: { q: 'wedding' },
    });
    expect(parseToolResult<{ events: unknown[] }>(res).events).toHaveLength(1);
  });

  it('vibo_get_event passes the eventId', async () => {
    gql.mockResolvedValue({ event: { _id: 'e1', title: 'Party' } });
    await harness.callTool('vibo_get_event', { eventId: 'e1' });
    expect(gql).toHaveBeenCalledWith(GET_EVENT, { eventId: 'e1' });
  });

  it('vibo_join_event previews without confirm (no network)', async () => {
    const res = await harness.callTool('vibo_join_event', { link: 'https://vibodj.app.link/abc' });
    expect(gql).not.toHaveBeenCalled();
    expect(parseToolResult<{ preview: boolean }>(res).preview).toBe(true);
  });

  it('vibo_join_event treats a URL as a deep link', async () => {
    gql.mockResolvedValue({ joinEventViaDeepLink: { _id: 'e9' } });
    const res = await harness.callTool('vibo_join_event', { link: 'https://vibodj.app.link/abc', confirm: true });
    expect(gql).toHaveBeenCalledWith(JOIN_EVENT_BY_DEEP_LINK, { deepLink: 'https://vibodj.app.link/abc' });
    expect(parseToolResult(res)).toEqual({ joined: true, eventId: 'e9' });
  });

  it('vibo_join_event treats a bare token as a hash', async () => {
    gql.mockResolvedValue({ joinEventByHash: { _id: 'e9' } });
    await harness.callTool('vibo_join_event', { link: 'dl4V2lOe03b', confirm: true });
    expect(gql).toHaveBeenCalledWith(JOIN_EVENT_BY_HASH, { hash: 'dl4V2lOe03b' });
  });

  it('vibo_leave_event is confirm-gated', async () => {
    await harness.callTool('vibo_leave_event', { eventId: 'e1' });
    expect(gql).not.toHaveBeenCalled();
    gql.mockResolvedValue({ leaveEvent: true });
    await harness.callTool('vibo_leave_event', { eventId: 'e1', confirm: true });
    expect(gql).toHaveBeenCalledWith(LEAVE_EVENT, { eventId: 'e1' });
  });

  it('vibo_create_event_contact builds the payload and is confirm-gated', async () => {
    const args = { eventId: 'e1', role: 'guest', email: 'g@example.com', firstName: 'Sam' };
    const preview = await harness.callTool('vibo_create_event_contact', args);
    expect(gql).not.toHaveBeenCalled();
    expect(parseToolResult<{ preview: boolean }>(preview).preview).toBe(true);

    gql.mockResolvedValue({ createEventContact: { _id: 'c1' } });
    await harness.callTool('vibo_create_event_contact', { ...args, confirm: true });
    expect(gql).toHaveBeenCalledWith(CREATE_EVENT_CONTACT, {
      eventId: 'e1',
      payload: { role: 'guest', email: 'g@example.com', firstName: 'Sam' },
    });
  });

  it('vibo_create_event_contact requires phoneCode with phoneNumber', async () => {
    const res = await harness.callTool('vibo_create_event_contact', {
      eventId: 'e1',
      role: 'host',
      email: 'h@example.com',
      phoneNumber: '5551234',
      confirm: true,
    });
    expect(res.isError).toBeTruthy();
    expect(gql).not.toHaveBeenCalled();
  });
});
