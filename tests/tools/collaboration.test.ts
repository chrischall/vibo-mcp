import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { client } from '../../src/client.js';
import { registerCollaborationTools } from '../../src/tools/collaboration.js';
import { LIST_EVENT_USERS, INVITE_USERS, CHANGE_USER_ROLE, REMOVE_USER } from '../../src/gql.js';
import { createTestHarness } from '../helpers.js';
import { parseToolResult } from '@chrischall/mcp-utils/test';

const gql = vi.spyOn(client, 'gql').mockResolvedValue(undefined as never);
let harness: Awaited<ReturnType<typeof createTestHarness>>;

beforeEach(() => gql.mockClear());
afterAll(async () => { if (harness) await harness.close(); });

describe('collaboration tools', () => {
  it('setup', async () => {
    harness = await createTestHarness((s) => registerCollaborationTools(s, client));
  });

  it('vibo_list_event_users fetches both groups and merges when usersType omitted', async () => {
    // Promise.all invokes the host call first, then the guest call.
    gql.mockResolvedValueOnce({ eventUsers: { users: [{ _id: 'h1' }], totalCount: 1 } });
    gql.mockResolvedValueOnce({ eventUsers: { users: [{ _id: 'g1' }, { _id: 'g2' }], totalCount: 2 } });
    const res = await harness.callTool('vibo_list_event_users', { eventId: 'e1' });
    expect(gql).toHaveBeenCalledTimes(2);
    expect(gql).toHaveBeenNthCalledWith(1, LIST_EVENT_USERS, { eventId: 'e1', usersType: 'host', pagination: { skip: 0, limit: 20 } });
    expect(gql).toHaveBeenNthCalledWith(2, LIST_EVENT_USERS, { eventId: 'e1', usersType: 'guest', pagination: { skip: 0, limit: 20 } });
    expect(parseToolResult(res)).toEqual({
      hosts: [{ _id: 'h1' }],
      guests: [{ _id: 'g1' }, { _id: 'g2' }],
      hostsCount: 1,
      guestsCount: 2,
    });
  });

  it('vibo_list_event_users does a single filtered query when usersType passed', async () => {
    gql.mockResolvedValue({ eventUsers: { users: [{ _id: 'u1' }], totalCount: 1 } });
    const res = await harness.callTool('vibo_list_event_users', { eventId: 'e1', usersType: 'host', limit: 5, skip: 10 });
    expect(gql).toHaveBeenCalledTimes(1);
    expect(gql).toHaveBeenCalledWith(LIST_EVENT_USERS, {
      eventId: 'e1',
      usersType: 'host',
      pagination: { skip: 10, limit: 5 },
    });
    expect(parseToolResult(res)).toEqual({ users: [{ _id: 'u1' }], totalCount: 1, usersType: 'host' });
  });

  it('vibo_invite_users previews without confirm (no network)', async () => {
    const res = await harness.callTool('vibo_invite_users', {
      eventId: 'e1',
      type: 'guest',
      text: 'Join us!',
      emails: ['a@example.com'],
    });
    expect(gql).not.toHaveBeenCalled();
    expect(parseToolResult<{ preview: boolean }>(res).preview).toBe(true);
  });

  it('vibo_invite_users sends the mutation with confirm', async () => {
    gql.mockResolvedValue({ inviteUserViaEmail: true });
    await harness.callTool('vibo_invite_users', {
      eventId: 'e1',
      type: 'guest',
      text: 'Join us!',
      emails: ['a@example.com', 'b@example.com'],
      confirm: true,
    });
    expect(gql).toHaveBeenCalledWith(INVITE_USERS, {
      eventId: 'e1',
      type: 'guest',
      text: 'Join us!',
      emails: ['a@example.com', 'b@example.com'],
    });
  });

  it('vibo_change_user_role previews without confirm (no network)', async () => {
    const res = await harness.callTool('vibo_change_user_role', {
      eventId: 'e1',
      userId: 'u1',
      type: 'host',
    });
    expect(gql).not.toHaveBeenCalled();
    expect(parseToolResult<{ preview: boolean }>(res).preview).toBe(true);
  });

  it('vibo_change_user_role sends the mutation with confirm', async () => {
    gql.mockResolvedValue({ changeUserTypeInEvent: true });
    await harness.callTool('vibo_change_user_role', {
      eventId: 'e1',
      userId: 'u1',
      type: 'host',
      confirm: true,
    });
    expect(gql).toHaveBeenCalledWith(CHANGE_USER_ROLE, { eventId: 'e1', userId: 'u1', type: 'host' });
  });

  it('vibo_remove_user previews without confirm (no network)', async () => {
    const res = await harness.callTool('vibo_remove_user', { eventId: 'e1', userId: 'u1' });
    expect(gql).not.toHaveBeenCalled();
    expect(parseToolResult<{ preview: boolean }>(res).preview).toBe(true);
  });

  it('vibo_remove_user sends the mutation with confirm', async () => {
    gql.mockResolvedValue({ removeUserFromEvent: true });
    await harness.callTool('vibo_remove_user', { eventId: 'e1', userId: 'u1', confirm: true });
    expect(gql).toHaveBeenCalledWith(REMOVE_USER, { eventId: 'e1', userId: 'u1' });
  });

  // Two exits, and the MERGED one is what a caller gets when they omit
  // usersType — the default call. Both must honour the rung; wiring only the
  // filtered branch is the shape of bug that already shipped once here, in
  // vibo_search_songs, where the rung sat on the branch that never fired.
  it('vibo_list_event_users drops avatar URLs on BOTH exits by DEFAULT', async () => {
    const host = { eventUsers: { users: [{ _id: 'u1', firstName: 'A', role: 'host', imageUrl: 'https://img.vibo.com/u1.jpg' }], totalCount: 1 } };
    const guest = { eventUsers: { users: [{ _id: 'u2', firstName: 'B', role: 'guest', imageUrl: 'https://img.vibo.com/u2.jpg' }], totalCount: 1 } };

    gql.mockResolvedValueOnce(host).mockResolvedValueOnce(guest);
    const merged = parseToolResult<{ hosts: Array<Record<string, unknown>>; guests: Array<Record<string, unknown>> }>(
      await harness.callTool('vibo_list_event_users', { eventId: 'e1' }),
    );
    expect(merged.hosts[0]!.imageUrl).toBeUndefined();
    expect(merged.guests[0]!.imageUrl).toBeUndefined();
    expect(merged.hosts[0]!.firstName).toBe('A');

    gql.mockResolvedValueOnce(host);
    const filtered = parseToolResult<{ users: Array<Record<string, unknown>>; usersType: string }>(
      await harness.callTool('vibo_list_event_users', { eventId: 'e1', usersType: 'host' }),
    );
    expect(filtered.users[0]!.imageUrl).toBeUndefined();
    expect(filtered.usersType).toBe('host');
  });

  it('vibo_list_event_users returns avatars on view:"full"', async () => {
    gql.mockResolvedValueOnce({ eventUsers: { users: [{ _id: 'u1', imageUrl: 'https://img.vibo.com/u1.jpg' }], totalCount: 1 } });
    const out = parseToolResult<{ users: Array<Record<string, unknown>> }>(
      await harness.callTool('vibo_list_event_users', { eventId: 'e1', usersType: 'host', view: 'full' }),
    );
    expect(out.users[0]!.imageUrl).toBe('https://img.vibo.com/u1.jpg');
  });

});
