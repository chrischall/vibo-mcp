import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { client } from '../../src/client.js';
import { registerCommentTools } from '../../src/tools/comments.js';
import { registerUploadTools } from '../../src/tools/uploads.js';
import { registerQuestionTools } from '../../src/tools/questions.js';
import { CREATE_SONG_COMMENT, DELETE_SECTION_COMMENT } from '../../src/gql.js';
import type { UploadFile, FileRef } from '../../src/upload-source.js';
import { createTestHarness, previewCall } from '../helpers.js';
import { parseToolResult } from '@chrischall/mcp-utils/test';

// Repo-wide properties of the confirm-token gate, exercised on a few tools.
// Every gated tool's own two-phase test lives beside its other tests.

const gql = vi.spyOn(client, 'gql').mockResolvedValue(undefined as never);
const gqlUpload = vi.spyOn(client, 'gqlUpload').mockResolvedValue(undefined as never);
const stubFile: UploadFile = { blob: new Blob(['x']), filename: 'f' };
const resolve = vi.fn<(ref: FileRef) => Promise<UploadFile>>().mockResolvedValue(stubFile);

const register = (s: Parameters<Parameters<typeof createTestHarness>[0]>[0]) => {
  registerCommentTools(s, client);
  registerUploadTools(s, client, resolve);
  registerQuestionTools(s, client, resolve);
};

const commentArgs = { eventId: 'e1', sectionId: 's1', songId: 'so1', message: 'play this loud' };

const savedEnv = { ...process.env };
let harness: Awaited<ReturnType<typeof createTestHarness>> | undefined;

beforeEach(() => {
  gql.mockClear();
  gqlUpload.mockClear();
  resolve.mockClear();
  delete process.env.MCP_CONFIRM_MODE;
});
afterEach(async () => {
  if (harness) await harness.close();
  harness = undefined;
  for (const k of Object.keys(process.env)) if (!(k in savedEnv)) delete process.env[k];
  Object.assign(process.env, savedEnv);
});

type Rejection = { status: string; error: string; confirmToken?: string };

describe('confirm-token flow (client without elicitation)', () => {
  it('phase 1 shows the operation and the exact variables it would send', async () => {
    harness = await createTestHarness(register);
    const body = await previewCall(harness, 'vibo_comment_on_song', commentArgs);
    expect(gql).not.toHaveBeenCalled();
    expect(body.action).toBe('vibo.comment_on_song');
    expect(body.preview).toEqual({
      action: 'createSongComment',
      willSend: { eventId: 'e1', sectionId: 's1', songId: 'so1', payload: { message: 'play this loud' } },
    });
  });

  it('a used token is refused as TOKEN_REUSED and writes nothing', async () => {
    harness = await createTestHarness(register);
    gql.mockResolvedValue({ createSongComment: { _id: 'c1' } });
    const { confirmToken } = await previewCall(harness, 'vibo_comment_on_song', commentArgs);
    await harness.callTool('vibo_comment_on_song', { ...commentArgs, confirmToken });
    expect(gql).toHaveBeenCalledTimes(1);
    expect(gql).toHaveBeenCalledWith(CREATE_SONG_COMMENT, expect.anything());

    const replay = await harness.callTool('vibo_comment_on_song', { ...commentArgs, confirmToken });
    expect(replay.isError).toBe(true);
    expect(parseToolResult<Rejection>(replay).error).toBe('TOKEN_REUSED');
    expect(gql).toHaveBeenCalledTimes(1);
  });

  it('changing an argument between the phases is refused as DRAFT_CHANGED and writes nothing', async () => {
    harness = await createTestHarness(register);
    const { confirmToken } = await previewCall(harness, 'vibo_comment_on_song', commentArgs);
    const res = await harness.callTool('vibo_comment_on_song', { ...commentArgs, message: 'actually, skip it', confirmToken });
    expect(res.isError).toBe(true);
    const body = parseToolResult<Rejection>(res);
    expect(body.error).toBe('DRAFT_CHANGED');
    expect(typeof body.confirmToken).toBe('string');
    expect(gql).not.toHaveBeenCalled();
  });

  it('a token from one tool does not work on another', async () => {
    harness = await createTestHarness(register);
    const { confirmToken } = await previewCall(harness, 'vibo_comment_on_song', commentArgs);
    const res = await harness.callTool('vibo_delete_section_comment', {
      eventId: 'e1', sectionId: 's1', commentId: 'c1', confirmToken,
    });
    expect(parseToolResult<Rejection>(res).error).toBe('TOKEN_INVALID');
    expect(gql).not.toHaveBeenCalled();
  });

  it('inline upload bytes are bound into the token even though the preview hides them', async () => {
    harness = await createTestHarness(register);
    const args = { fileData: 'aGk=', filename: 'me.png' };
    const body = await previewCall(harness, 'vibo_set_profile_photo', args);
    expect(body.preview.willSend).toEqual({ photo: '(inline bytes)' });
    const res = await harness.callTool('vibo_set_profile_photo', { ...args, fileData: 'Ynll', confirmToken: body.confirmToken });
    expect(parseToolResult<Rejection>(res).error).toBe('DRAFT_CHANGED');
    expect(resolve).not.toHaveBeenCalled();
    expect(gqlUpload).not.toHaveBeenCalled();
  });

  it('a swapped question attachment is refused as DRAFT_CHANGED', async () => {
    harness = await createTestHarness(register);
    const args = { eventId: 'e1', sectionId: 's1', questionId: 'q3', images: [{ data: 'aGk=', filename: 'a.png' }] };
    const body = await previewCall(harness, 'vibo_answer_question', args);
    expect(body.preview.willSend.uploads).toEqual({ 'variables.payload.answer.images.0': '(inline bytes)' });
    const res = await harness.callTool('vibo_answer_question', {
      ...args, images: [{ data: 'Ynll', filename: 'a.png' }], confirmToken: body.confirmToken,
    });
    expect(parseToolResult<Rejection>(res).error).toBe('DRAFT_CHANGED');
    expect(resolve).not.toHaveBeenCalled();
    expect(gqlUpload).not.toHaveBeenCalled();
  });

  it('MCP_CONFIRM_MODE=refuse refuses the write outright', async () => {
    process.env.MCP_CONFIRM_MODE = 'refuse';
    harness = await createTestHarness(register);
    const res = await harness.callTool('vibo_comment_on_song', commentArgs);
    const body = parseToolResult<{ reason: string; dispatched: boolean; confirmToken?: string }>(res);
    expect(body.reason).toBe('confirmation-unsupported');
    expect(body.dispatched).toBe(false);
    expect(body.confirmToken).toBeUndefined();
    expect(gql).not.toHaveBeenCalled();
  });
});

describe('elicitation (client that can show a confirmation prompt)', () => {
  const deleteArgs = { eventId: 'e1', sectionId: 's1', commentId: 'c2' };

  it('writes once the user accepts the prompt', async () => {
    const prompts: unknown[] = [];
    harness = await createTestHarness(register, {
      elicitation: async (req) => {
        prompts.push(req);
        return { action: 'accept', content: { confirmed: true } };
      },
    });
    gql.mockResolvedValue({ deleteSectionComment: { deleted: true } });
    const res = await harness.callTool('vibo_delete_section_comment', deleteArgs);
    expect(res.isError).toBeFalsy();
    expect(prompts).toHaveLength(1);
    expect(gql).toHaveBeenCalledTimes(1);
    expect(gql).toHaveBeenCalledWith(DELETE_SECTION_COMMENT, deleteArgs);
  });

  it('writes nothing when the user declines', async () => {
    harness = await createTestHarness(register, {
      elicitation: async () => ({ action: 'decline' }),
    });
    const res = await harness.callTool('vibo_delete_section_comment', deleteArgs);
    expect(parseToolResult<{ confirmed: boolean }>(res).confirmed).toBe(false);
    expect(gql).not.toHaveBeenCalled();
  });
});
