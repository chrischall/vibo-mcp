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
  /**
   * The tool's validated arguments as the handler received them (mcp-utils
   * drops `confirmToken`). Bound into both the confirm token and an
   * elicitation acceptance, so an approval for one set of arguments is
   * refused for any other.
   */
  args: object;
  /** The primary id acted on, or '' when there is none. */
  target: string;
  /** What the write sends, as the user should see it. */
  willSend: Record<string, unknown>;
  /**
   * What is hashed into the token, when it must hold more than `willSend`
   * shows (inline upload bytes the preview summarises). Defaults to `willSend`.
   */
  payload?: unknown;
  /**
   * Read-only facts shown beside `willSend` so the user can judge the write
   * (e.g. how many songs a section being deleted holds). Bound into the token
   * too, so a change between preview and confirm is refused as DRAFT_CHANGED.
   */
  context?: Record<string, unknown>;
}

/**
 * Gate a write behind a confirmation: an elicitation prompt where the client
 * can show one, else the two-phase confirm-token flow (MCP_CONFIRM_MODE).
 * `undefined` means proceed; anything else is the result to return unchanged.
 * Nothing here makes a network call, so phase 1 never writes (a tool may READ
 * before calling this, to validate ids or fill `context`).
 */
export function confirmWrite(ctx: ServerContext, options: ConfirmWriteOptions) {
  const preview = {
    action: options.mutation,
    willSend: options.willSend,
    ...(options.context ? { context: options.context } : {}),
  };
  return requireConfirmationWithFallback(
    ctx,
    confirmationFromEnv({
      action: options.tool.replace(/^vibo_/, 'vibo.'),
      message: options.message,
      details: preview,
      tool: options.tool,
      confirmToken: options.confirmToken,
      // One Vibo account per server process (stdio env login, or one hosted
      // child per user), so there is no principal to tell apart here.
      account: undefined,
      args: options.args,
      subject: () => ({
        target: options.target,
        payload: options.payload ?? (options.context ? { willSend: options.willSend, context: options.context } : options.willSend),
        preview,
      }),
    }),
  );
}
