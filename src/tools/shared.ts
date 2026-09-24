import { z } from 'zod';
import type { ServerContext } from '@modelcontextprotocol/server';
import { confirmationFromEnv, requireConfirmationWithFallback } from '@chrischall/mcp-utils';

/** Pagination knobs shared by the list tools (maps to Vibo's PaginationInput). */
export const limitSchema = z
  .number()
  .int()
  .min(1)
  .max(100)
  .optional()
  .describe('Max items to return (default 20).');

export const skipSchema = z
  .number()
  .int()
  .min(0)
  .optional()
  .describe('Number of items to skip, for paging (default 0).');

/** Build a Vibo PaginationInput from optional limit/skip with sane defaults. */
export function pagination(limit?: number, skip?: number): { skip: number; limit: number } {
  return { skip: skip ?? 0, limit: limit ?? 20 };
}

/**
 * One inline file (base64 bytes + optional filename) for callers with no
 * filesystem to name — a hosted deployment reaches the server's disk, not the
 * user's. Mirrors the local-path upload inputs so a tool can accept either.
 */
export const inlineFileSchema = z.object({
  data: z.string().describe('Base64-encoded file bytes (a `data:` URL prefix is allowed).'),
  filename: z.string().optional().describe('Filename to send with this file.'),
});

/**
 * The sentence every gated tool's description ends with, so the model knows a
 * first call may only preview.
 */
export const CONFIRM_NOTE =
  'Asks the user to confirm first: a confirmation prompt where the client supports one; otherwise the first ' +
  'call returns a preview and a confirmToken, and only a repeat call with that token proceeds (see MCP_CONFIRM_MODE).';

export interface ConfirmWriteOptions {
  /** The tool name the confirmation is bound to, e.g. `vibo_leave_event`. */
  tool: string;
  /** The GraphQL operation the write runs — shown to the user. */
  mutation: string;
  /** The prompt line shown above the preview. */
  message: string;
  /** The phase-2 token from the tool's input, or undefined. */
  confirmToken?: string;
  /** The primary id acted on, or '' when there is none. */
  target: string;
  /** What the write sends, as the user should see it. */
  willSend: Record<string, unknown>;
  /**
   * What is hashed into the token, when it must hold more than `willSend`
   * shows (inline upload bytes the preview summarises). Defaults to `willSend`.
   */
  payload?: unknown;
}

/**
 * Gate a write behind a confirmation: an elicitation prompt where the client
 * can show one, else the two-phase confirm-token flow (MCP_CONFIRM_MODE).
 * `undefined` means proceed; anything else is the result to return unchanged.
 * Nothing here makes a network call, so phase 1 never writes.
 */
export function confirmWrite(ctx: ServerContext, options: ConfirmWriteOptions) {
  const preview = { action: options.mutation, willSend: options.willSend };
  return requireConfirmationWithFallback(
    ctx,
    confirmationFromEnv({
      action: options.tool.replace(/^vibo_/, 'vibo.'),
      message: options.message,
      details: preview,
      tool: options.tool,
      confirmToken: options.confirmToken,
      subject: () => ({
        target: options.target,
        payload: options.payload ?? options.willSend,
        preview,
      }),
    }),
  );
}
