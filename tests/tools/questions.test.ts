import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { client } from '../../src/client.js';
import { registerQuestionTools } from '../../src/tools/questions.js';
import { LIST_SECTION_QUESTIONS, ANSWER_SECTION_QUESTION } from '../../src/gql.js';
import { createTestHarness } from '../helpers.js';
import { parseToolResult } from '@chrischall/mcp-utils/test';

const gql = vi.spyOn(client, 'gql').mockResolvedValue(undefined as never);
let harness: Awaited<ReturnType<typeof createTestHarness>>;

beforeEach(() => gql.mockClear());
afterAll(async () => { if (harness) await harness.close(); });

describe('question tools', () => {
  it('setup', async () => {
    harness = await createTestHarness((s) => registerQuestionTools(s));
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
});
