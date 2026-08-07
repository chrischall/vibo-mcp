import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { client } from '../../src/client.js';
import { registerQuestionTools } from '../../src/tools/questions.js';
import { LIST_SECTION_QUESTIONS, ANSWER_SECTION_QUESTION } from '../../src/gql.js';
import type { UploadFile, FileRef } from '../../src/upload-source.js';
import { createTestHarness } from '../helpers.js';
import { parseToolResult } from '@chrischall/mcp-utils/test';

const gql = vi.spyOn(client, 'gql').mockResolvedValue(undefined as never);
const gqlUpload = vi.spyOn(client, 'gqlUpload').mockResolvedValue(undefined as never);

// Fake upload resolver (see uploads.test.ts): the tool hands it a FileRef and
// gets back a stub in-memory file, so no filesystem is touched in tests.
const stubFile: UploadFile = { blob: new Blob(['x']), filename: 'f' };
const resolve = vi.fn<(ref: FileRef) => Promise<UploadFile>>().mockResolvedValue(stubFile);

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

  it('vibo_answer_question sends a link answer with confirm', async () => {
    gql.mockResolvedValue({ answerEventSectionQuestionV2: { progress: 0.25 } });
    await harness.callTool('vibo_answer_question', {
      eventId: 'e1',
      sectionId: 's1',
      questionId: 'q3',
      link: ['https://youtu.be/abc'],
      confirm: true,
    });
    expect(gql).toHaveBeenCalledWith(ANSWER_SECTION_QUESTION, {
      eventId: 'e1',
      sectionId: 's1',
      questionId: 'q3',
      payload: { answer: { link: ['https://youtu.be/abc'] } },
    });
  });

  it('vibo_answer_question previews a text answer without confirm', async () => {
    const res = await harness.callTool('vibo_answer_question', {
      eventId: 'e1',
      sectionId: 's1',
      questionId: 'q1',
      text: 'Navy and gold',
    });
    expect(gql).not.toHaveBeenCalled();
    expect(parseToolResult<{ preview: boolean }>(res).preview).toBe(true);
  });

  it('vibo_answer_question sends a text answer with confirm', async () => {
    gql.mockResolvedValue({ answerEventSectionQuestionV2: { progress: 0.5 } });
    await harness.callTool('vibo_answer_question', {
      eventId: 'e1',
      sectionId: 's1',
      questionId: 'q1',
      text: 'Navy and gold',
      confirm: true,
    });
    expect(gql).toHaveBeenCalledWith(ANSWER_SECTION_QUESTION, {
      eventId: 'e1',
      sectionId: 's1',
      questionId: 'q1',
      payload: { answer: { text: 'Navy and gold' } },
    });
  });

  it('vibo_answer_question sends selectedOptions for a radio/checkbox answer', async () => {
    gql.mockResolvedValue({ answerEventSectionQuestionV2: { progress: 1 } });
    await harness.callTool('vibo_answer_question', {
      eventId: 'e1',
      sectionId: 's1',
      questionId: 'q2',
      selectedOptions: ['optA', 'optB'],
      otherOptionTitle: 'Surprise me',
      confirm: true,
    });
    expect(gql).toHaveBeenCalledWith(ANSWER_SECTION_QUESTION, {
      eventId: 'e1',
      sectionId: 's1',
      questionId: 'q2',
      payload: { answer: { selectedOptions: ['optA', 'optB'], otherOptionTitle: 'Surprise me' } },
    });
  });

  it('vibo_answer_question routes local-path image/file answers through the multipart upload path', async () => {
    gqlUpload.mockResolvedValue({ answerEventSectionQuestionV2: { progress: 1 } });
    await harness.callTool('vibo_answer_question', {
      eventId: 'e1',
      sectionId: 's1',
      questionId: 'q3',
      imagePaths: ['/tmp/a.jpg', '/tmp/b.jpg'],
      filePaths: ['/tmp/c.pdf'],
      confirm: true,
    });
    // JSON path is not used; the upload path carries null placeholders + resolved blobs.
    expect(gql).not.toHaveBeenCalled();
    expect(resolve).toHaveBeenCalledWith({ path: '/tmp/a.jpg' });
    expect(resolve).toHaveBeenCalledWith({ path: '/tmp/b.jpg' });
    expect(resolve).toHaveBeenCalledWith({ path: '/tmp/c.pdf' });
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
    await harness.callTool('vibo_answer_question', {
      eventId: 'e1',
      sectionId: 's1',
      questionId: 'q3',
      images: [{ data: 'aGk=', filename: 'a.png' }],
      confirm: true,
    });
    expect(gql).not.toHaveBeenCalled();
    expect(resolve).toHaveBeenCalledWith({ data: 'aGk=', filename: 'a.png' });
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
    expect(resolve).not.toHaveBeenCalled();
    expect(gqlUpload).not.toHaveBeenCalled();
    expect(gql).not.toHaveBeenCalled();
    expect(parseToolResult<{ preview: boolean }>(res).preview).toBe(true);
  });
});
