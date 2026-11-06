import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import { client } from '../../src/client.js';
import { registerQuestionTools } from '../../src/tools/questions.js';
import { LIST_SECTION_QUESTIONS, ANSWER_SECTION_QUESTION } from '../../src/gql.js';
import type { UploadFile, FileRef } from '../../src/upload-source.js';
import { createTestHarness, confirmCall, previewCall, stubUpload } from '../helpers.js';
import { installFakeBlobStore } from '../fake-blob-store.js';
import { parseToolResult } from '@chrischall/mcp-utils/test';

const gql = vi.spyOn(client, 'gql').mockResolvedValue(undefined as never);
const gqlUpload = vi.spyOn(client, 'gqlUpload').mockResolvedValue(undefined as never);

// Fake upload resolver (see uploads.test.ts): the tool hands it a FileRef and
// gets back a stub in-memory file, so no filesystem is touched in tests.
const stubFile: UploadFile = stubUpload('x', 'f');
const resolve = vi.fn<(ref: FileRef) => Promise<UploadFile>>().mockResolvedValue(stubFile);

const IMAGE_NAMES = { path: 'imagePaths', inline: 'images', blobKey: 'imageBlobKeys' };
const FILE_NAMES = { path: 'filePaths', inline: 'files', blobKey: 'fileBlobKeys' };

let harness: Awaited<ReturnType<typeof createTestHarness>>;

beforeEach(() => {
  gql.mockClear();
  gqlUpload.mockClear();
  resolve.mockClear();
});
afterAll(async () => { if (harness) await harness.close(); });

describe('question tools', () => {
  it('setup', async () => {
    harness = await createTestHarness((s) => registerQuestionTools(s, client, resolve));
  });

  it('vibo_list_section_questions passes event + section', async () => {
    gql.mockResolvedValue({ getEventSectionQuestionsV2: { questions: [], progress: 0 } });
    const res = await harness.callTool('vibo_list_section_questions', { eventId: 'e1', sectionId: 's1' });
    expect(gql).toHaveBeenCalledWith(LIST_SECTION_QUESTIONS, { eventId: 'e1', sectionId: 's1' });
    expect(parseToolResult<{ progress: number }>(res).progress).toBe(0);
  });

  it('vibo_answer_question requires at least one answer field', async () => {
    const res = await harness.callTool('vibo_answer_question', { eventId: 'e1', sectionId: 's1', questionId: 'q1' });
    expect(res.isError).toBeTruthy();
    expect(gql).not.toHaveBeenCalled();
  });

  it('vibo_answer_question rejects an otherOptionTitle-only submission (no primary field)', async () => {
    const res = await harness.callTool('vibo_answer_question', {
      eventId: 'e1',
      sectionId: 's1',
      questionId: 'q1',
      otherOptionTitle: 'Something else',
    });
    expect(res.isError).toBeTruthy();
    expect(gql).not.toHaveBeenCalled();
  });

  it('vibo_answer_question sends a link answer after confirmation', async () => {
    gql.mockResolvedValue({ answerEventSectionQuestionV2: { progress: 0.25 } });
    await confirmCall(harness, 'vibo_answer_question', {
      eventId: 'e1',
      sectionId: 's1',
      questionId: 'q3',
      link: ['https://youtu.be/abc'],
    }, gql, gqlUpload);
    expect(gql).toHaveBeenCalledWith(ANSWER_SECTION_QUESTION, {
      eventId: 'e1',
      sectionId: 's1',
      questionId: 'q3',
      payload: { answer: { link: ['https://youtu.be/abc'] } },
    });
  });

  it('vibo_answer_question previews a text answer without a token', async () => {
    const res = await harness.callTool('vibo_answer_question', {
      eventId: 'e1',
      sectionId: 's1',
      questionId: 'q1',
      text: 'Navy and gold',
    });
    expect(gql).not.toHaveBeenCalled();
    expect(parseToolResult<{ status: string }>(res).status).toBe('confirmation-required');
  });

  it('vibo_answer_question sends a text answer after confirmation', async () => {
    gql.mockResolvedValue({ answerEventSectionQuestionV2: { progress: 0.5 } });
    await confirmCall(harness, 'vibo_answer_question', {
      eventId: 'e1',
      sectionId: 's1',
      questionId: 'q1',
      text: 'Navy and gold',
    }, gql, gqlUpload);
    expect(gql).toHaveBeenCalledWith(ANSWER_SECTION_QUESTION, {
      eventId: 'e1',
      sectionId: 's1',
      questionId: 'q1',
      payload: { answer: { text: 'Navy and gold' } },
    });
  });

  it('vibo_answer_question sends selectedOptions for a radio/checkbox answer', async () => {
    gql.mockResolvedValue({ answerEventSectionQuestionV2: { progress: 1 } });
    await confirmCall(harness, 'vibo_answer_question', {
      eventId: 'e1',
      sectionId: 's1',
      questionId: 'q2',
      selectedOptions: ['optA', 'optB'],
      otherOptionTitle: 'Surprise me',
    }, gql, gqlUpload);
    expect(gql).toHaveBeenCalledWith(ANSWER_SECTION_QUESTION, {
      eventId: 'e1',
      sectionId: 's1',
      questionId: 'q2',
      payload: { answer: { selectedOptions: ['optA', 'optB'], otherOptionTitle: 'Surprise me' } },
    });
  });

  it('vibo_answer_question routes local-path image/file answers through the multipart upload path', async () => {
    gqlUpload.mockResolvedValue({ answerEventSectionQuestionV2: { progress: 1 } });
    await confirmCall(harness, 'vibo_answer_question', {
      eventId: 'e1',
      sectionId: 's1',
      questionId: 'q3',
      imagePaths: ['/tmp/a.jpg', '/tmp/b.jpg'],
      filePaths: ['/tmp/c.pdf'],
    }, gql, gqlUpload);
    // JSON path is not used; the upload path carries null placeholders + resolved blobs.
    expect(gql).not.toHaveBeenCalled();
    expect(resolve).toHaveBeenCalledWith({ path: '/tmp/a.jpg', kind: 'image', names: IMAGE_NAMES });
    expect(resolve).toHaveBeenCalledWith({ path: '/tmp/b.jpg', kind: 'image', names: IMAGE_NAMES });
    expect(resolve).toHaveBeenCalledWith({ path: '/tmp/c.pdf', kind: 'file', names: FILE_NAMES });
    expect(gqlUpload).toHaveBeenCalledWith(
      ANSWER_SECTION_QUESTION,
      {
        eventId: 'e1',
        sectionId: 's1',
        questionId: 'q3',
        payload: { answer: { images: [null, null], files: [null] } },
      },
      {
        'variables.payload.answer.images.0': stubFile,
        'variables.payload.answer.images.1': stubFile,
        'variables.payload.answer.files.0': stubFile,
      },
    );
  });

  it('vibo_answer_question routes inline base64 image answers (the no-local-filesystem path)', async () => {
    gqlUpload.mockResolvedValue({ answerEventSectionQuestionV2: { progress: 1 } });
    await confirmCall(harness, 'vibo_answer_question', {
      eventId: 'e1',
      sectionId: 's1',
      questionId: 'q3',
      images: [{ data: 'aGk=', filename: 'a.png' }],
    }, gql, gqlUpload);
    expect(gql).not.toHaveBeenCalled();
    expect(resolve).toHaveBeenCalledWith({ data: 'aGk=', filename: 'a.png', kind: 'image', names: IMAGE_NAMES });
    expect(gqlUpload).toHaveBeenCalledWith(
      ANSWER_SECTION_QUESTION,
      {
        eventId: 'e1',
        sectionId: 's1',
        questionId: 'q3',
        payload: { answer: { images: [null] } },
      },
      { 'variables.payload.answer.images.0': stubFile },
    );
  });

  it('vibo_answer_question previews file answers without uploading', async () => {
    const res = await harness.callTool('vibo_answer_question', {
      eventId: 'e1',
      sectionId: 's1',
      questionId: 'q3',
      imagePaths: ['/tmp/a.jpg'],
    });
    // Resolved (read + vetted) so the token can bind a digest of the bytes —
    // but nothing is uploaded until the confirmed call.
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(gqlUpload).not.toHaveBeenCalled();
    expect(gql).not.toHaveBeenCalled();
    expect(parseToolResult<{ status: string }>(res).status).toBe('confirmation-required');
  });
});

describe('vibo_answer_question with the real resolver', () => {
  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);
  const base = { eventId: 'e1', sectionId: 's1', questionId: 'q3' };
  let h: Awaited<ReturnType<typeof createTestHarness>> | undefined;
  afterEach(async () => {
    if (h) await h.close();
    h = undefined;
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    gqlUpload.mockReset();
  });

  it('uploads slot files, then deletes them, and reports it', async () => {
    const fake = installFakeBlobStore();
    const img = fake.put('table plan.png', PNG);
    const doc = fake.put('run of show.txt', new TextEncoder().encode('first dance at 8'));
    h = await createTestHarness((s) => registerQuestionTools(s, client));
    gqlUpload.mockResolvedValue({ answerEventSectionQuestionV2: { progress: 1 } });
    const args = { ...base, imageBlobKeys: [img], fileBlobKeys: [doc] };
    const body = await previewCall(h, 'vibo_answer_question', args);
    expect((body.preview.willSend.uploads as Record<string, unknown>)['variables.payload.answer.images.0']).toMatchObject({
      source: 'blob', blobKey: img, filename: 'table plan.png',
    });
    expect(fake.objects.size).toBe(2);
    const res = await h.callTool('vibo_answer_question', { ...args, confirmToken: body.confirmToken });
    expect(res.isError).toBeFalsy();
    const files = gqlUpload.mock.calls[0]![2] as Record<string, UploadFile>;
    expect(files['variables.payload.answer.images.0']!.filename).toBe('table plan.png');
    expect(await files['variables.payload.answer.files.0']!.blob.text()).toBe('first dance at 8');
    expect(fake.objects.size).toBe(0);
    expect(parseToolResult<{ blobCleanup: unknown[] }>(res).blobCleanup).toEqual([
      { blobKey: img, deleted: true },
      { blobKey: doc, deleted: true },
    ]);
  });

  it('keeps slot files when Vibo refuses the answer', async () => {
    const fake = installFakeBlobStore();
    const img = fake.put('a.png', PNG);
    h = await createTestHarness((s) => registerQuestionTools(s, client));
    gqlUpload.mockRejectedValue(new Error('Vibo refused'));
    const args = { ...base, imageBlobKeys: [img] };
    const body = await previewCall(h, 'vibo_answer_question', args);
    const res = await h.callTool('vibo_answer_question', { ...args, confirmToken: body.confirmToken });
    expect(res.isError).toBe(true);
    expect(fake.objects.has(img)).toBe(true);
  });

  it('refuses inline images that are not images, and malformed base64, before any preview', async () => {
    h = await createTestHarness((s) => registerQuestionTools(s, client));
    const notImage = await h.callTool('vibo_answer_question', { ...base, images: [{ data: 'aGk=', filename: 'a.png' }] });
    expect(JSON.stringify(notImage.content)).toMatch(/do not look like image\/png/);
    const truncated = await h.callTool('vibo_answer_question', { ...base, files: [{ data: 'aGVsbG8', filename: 'a.txt' }] });
    expect(JSON.stringify(truncated.content)).toMatch(/not valid base64/);
    expect(gqlUpload).not.toHaveBeenCalled();
  });

  it('on a hosted deployment refuses imagePaths in its own parameter names', async () => {
    vi.stubEnv('MCP_DATA_DIR', '/data');
    h = await createTestHarness((s) => registerQuestionTools(s, client));
    const res = await h.callTool('vibo_answer_question', { ...base, imagePaths: ['me.png'] });
    expect(res.isError).toBe(true);
    expect(JSON.stringify(res.content)).toMatch(/imagePaths cannot work here.*images \(base64\)/);
  });
});
