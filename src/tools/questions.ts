import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { textResult, toolAnnotations, schemaConfirm, McpToolError } from '@chrischall/mcp-utils';
import { client } from '../client.js';
import { LIST_SECTION_QUESTIONS, ANSWER_SECTION_QUESTION } from '../gql.js';
import { previewResult } from './shared.js';

export function registerQuestionTools(server: McpServer): void {
  server.registerTool(
    'vibo_list_section_questions',
    {
      description:
        "List the DJ's planning questions for a section, with each question's type (text/radio/checkbox/select/link/header), available options, whether it's answered, the current answer, and overall progress. Use the question _id (and option _ids) with vibo_answer_question.",
      annotations: toolAnnotations({ title: 'List Vibo section questions', readOnly: true }),
      inputSchema: {
        eventId: z.string().describe('Event id.'),
        sectionId: z.string().describe('Section id (from vibo_list_sections).'),
      },
    },
    async ({ eventId, sectionId }) => {
      const data = await client.gql<{ getEventSectionQuestionsV2: unknown }>(LIST_SECTION_QUESTIONS, {
        eventId,
        sectionId,
      });
      return textResult(data.getEventSectionQuestionsV2);
    },
  );

  server.registerTool(
    'vibo_answer_question',
    {
      description:
        "Answer a section planning question. Provide the field matching the question's type: `text` for a text question, `selectedOptions` (array of option _ids from vibo_list_section_questions) for radio/checkbox/select, or `link` (array of URLs) for a link question. Use `otherOptionTitle` with the question's \"other\" option. For photo/file questions, pass `imagePaths` / `filePaths` (absolute local paths). Confirm-gated.",
      annotations: toolAnnotations({ title: 'Answer Vibo question', readOnly: false }),
      inputSchema: {
        eventId: z.string().describe('Event id.'),
        sectionId: z.string().describe('Section id.'),
        questionId: z.string().describe('Question _id (from vibo_list_section_questions).'),
        text: z.string().optional().describe('Answer for a text question.'),
        selectedOptions: z
          .array(z.string())
          .optional()
          .describe('Option _ids to select, for radio/checkbox/select questions.'),
        link: z.array(z.string()).optional().describe('URL(s), for a link question.'),
        otherOptionTitle: z
          .string()
          .optional()
          .describe('Free-text value when selecting the question\'s "other" option.'),
        imagePaths: z
          .array(z.string())
          .optional()
          .describe('Absolute local image file paths, for a photo question.'),
        filePaths: z
          .array(z.string())
          .optional()
          .describe('Absolute local file paths, for a file-attachment question.'),
        confirm: schemaConfirm,
      },
    },
    async ({ eventId, sectionId, questionId, text, selectedOptions, link, otherOptionTitle, imagePaths, filePaths, confirm }) => {
      const hasImages = (imagePaths?.length ?? 0) > 0;
      const hasFiles = (filePaths?.length ?? 0) > 0;
      // Require at least one PRIMARY answer field. otherOptionTitle is only a
      // modifier for selectedOptions — on its own it is not a valid answer.
      if (text === undefined && selectedOptions === undefined && link === undefined && !hasImages && !hasFiles) {
        throw new McpToolError('Provide an answer: text, selectedOptions, link, imagePaths, or filePaths.', {
          hint: "Match the question's type — text → `text`, radio/checkbox/select → `selectedOptions`, link → `link`, photo/file → `imagePaths`/`filePaths`.",
        });
      }
      const answer: Record<string, unknown> = {};
      if (text !== undefined) answer.text = text;
      if (selectedOptions !== undefined) answer.selectedOptions = selectedOptions;
      if (link !== undefined) answer.link = link;
      if (otherOptionTitle !== undefined) answer.otherOptionTitle = otherOptionTitle;

      // File answers route through a multipart upload (the Upload scalar).
      if (hasImages || hasFiles) {
        if (hasImages) answer.images = (imagePaths as string[]).map(() => null);
        if (hasFiles) answer.files = (filePaths as string[]).map(() => null);
        const payload = { answer };
        const fileMap: Record<string, string> = {};
        (imagePaths ?? []).forEach((p, i) => (fileMap[`variables.payload.answer.images.${i}`] = p));
        (filePaths ?? []).forEach((p, i) => (fileMap[`variables.payload.answer.files.${i}`] = p));
        if (!confirm) {
          return previewResult('answerEventSectionQuestionV2', { eventId, sectionId, questionId, payload, uploads: fileMap });
        }
        const data = await client.gqlUpload<{ answerEventSectionQuestionV2: unknown }>(
          ANSWER_SECTION_QUESTION,
          { eventId, sectionId, questionId, payload },
          fileMap,
        );
        return textResult(data.answerEventSectionQuestionV2);
      }

      const payload = { answer };
      if (!confirm) return previewResult('answerEventSectionQuestionV2', { eventId, sectionId, questionId, payload });
      const data = await client.gql<{ answerEventSectionQuestionV2: unknown }>(ANSWER_SECTION_QUESTION, {
        eventId,
        sectionId,
        questionId,
        payload,
      });
      return textResult(data.answerEventSectionQuestionV2);
    },
  );
}
