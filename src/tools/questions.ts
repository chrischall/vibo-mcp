import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { textResult, toolAnnotations, schemaConfirm, McpToolError } from '@chrischall/mcp-utils';
import type { ViboClient } from '../client.js';
import { LIST_SECTION_QUESTIONS, ANSWER_SECTION_QUESTION } from '../gql.js';
import { nodeUploadResolver, type UploadResolver, type FileRef, type UploadFile } from '../upload-source.js';
import { previewResult, inlineFileSchema } from './shared.js';

/**
 * `resolveUpload` is the injectable file-source seam for photo/file answers:
 * stdio uses the default `nodeUploadResolver` (local `*Paths`), the hosted
 * connector passes `inlineUploadResolver` (inline base64 `images`/`files`).
 */
export function registerQuestionTools(
  server: McpServer,
  client: ViboClient,
  resolveUpload: UploadResolver = nodeUploadResolver,
): void {
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
        "Answer a section planning question. Provide the field matching the question's type: `text` for a text question, `selectedOptions` (array of option _ids from vibo_list_section_questions) for radio/checkbox/select, or `link` (array of URLs) for a link question. Use `otherOptionTitle` with the question's \"other\" option. For photo/file questions, pass local paths (`imagePaths`/`filePaths`) on the stdio server, or inline base64 bytes (`images`/`files`) on the hosted connector. Confirm-gated.",
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
          .describe('Absolute local image file paths, for a photo question (local/stdio server only).'),
        filePaths: z
          .array(z.string())
          .optional()
          .describe('Absolute local file paths, for a file-attachment question (local/stdio server only).'),
        images: z
          .array(inlineFileSchema)
          .optional()
          .describe('Inline base64 images, for a photo question (used by the hosted connector, which has no filesystem).'),
        files: z
          .array(inlineFileSchema)
          .optional()
          .describe('Inline base64 files, for a file-attachment question (used by the hosted connector).'),
        confirm: schemaConfirm,
      },
    },
    async ({ eventId, sectionId, questionId, text, selectedOptions, link, otherOptionTitle, imagePaths, filePaths, images, files, confirm }) => {
      // Merge local-path and inline-byte file refs (in that order) into one list
      // per slot. stdio supplies paths; the hosted connector supplies inline
      // bytes; the injected resolver turns each ref into an in-memory blob.
      const imageRefs: FileRef[] = [
        ...(imagePaths ?? []).map((path) => ({ path })),
        ...(images ?? []).map((f) => ({ data: f.data, filename: f.filename })),
      ];
      const fileRefs: FileRef[] = [
        ...(filePaths ?? []).map((path) => ({ path })),
        ...(files ?? []).map((f) => ({ data: f.data, filename: f.filename })),
      ];
      const hasImages = imageRefs.length > 0;
      const hasFiles = fileRefs.length > 0;
      // Require at least one PRIMARY answer field. otherOptionTitle is only a
      // modifier for selectedOptions — on its own it is not a valid answer.
      if (text === undefined && selectedOptions === undefined && link === undefined && !hasImages && !hasFiles) {
        throw new McpToolError('Provide an answer: text, selectedOptions, link, imagePaths/images, or filePaths/files.', {
          hint: "Match the question's type — text → `text`, radio/checkbox/select → `selectedOptions`, link → `link`, photo/file → `imagePaths`/`filePaths` (stdio) or `images`/`files` (hosted connector).",
        });
      }
      const answer: Record<string, unknown> = {};
      if (text !== undefined) answer.text = text;
      if (selectedOptions !== undefined) answer.selectedOptions = selectedOptions;
      if (link !== undefined) answer.link = link;
      if (otherOptionTitle !== undefined) answer.otherOptionTitle = otherOptionTitle;

      // File answers route through a multipart upload (the Upload scalar).
      if (hasImages || hasFiles) {
        if (hasImages) answer.images = imageRefs.map(() => null);
        if (hasFiles) answer.files = fileRefs.map(() => null);
        const payload = { answer };
        const previewUploads: Record<string, string> = {};
        imageRefs.forEach((ref, i) => {
          previewUploads[`variables.payload.answer.images.${i}`] = ref.path ?? '(inline bytes)';
        });
        fileRefs.forEach((ref, i) => {
          previewUploads[`variables.payload.answer.files.${i}`] = ref.path ?? '(inline bytes)';
        });
        if (!confirm) {
          return previewResult('answerEventSectionQuestionV2', { eventId, sectionId, questionId, payload, uploads: previewUploads });
        }
        // Resolve each ref to an in-memory blob keyed by its dotted var path.
        const resolvedFiles: Record<string, UploadFile> = {};
        for (let i = 0; i < imageRefs.length; i++) {
          resolvedFiles[`variables.payload.answer.images.${i}`] = await resolveUpload(imageRefs[i]);
        }
        for (let i = 0; i < fileRefs.length; i++) {
          resolvedFiles[`variables.payload.answer.files.${i}`] = await resolveUpload(fileRefs[i]);
        }
        const data = await client.gqlUpload<{ answerEventSectionQuestionV2: unknown }>(
          ANSWER_SECTION_QUESTION,
          { eventId, sectionId, questionId, payload },
          resolvedFiles,
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
