import { z } from 'zod';
import { textResult } from '@chrischall/mcp-utils';

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
 * Dry-run response for a confirm-gated write. Returned WITHOUT making any
 * network call when `confirm` is not `true`, so the caller can see exactly what
 * would be sent before committing.
 */
export function previewResult(action: string, willSend: Record<string, unknown>) {
  return textResult({
    preview: true,
    action,
    willSend,
    note: 'No changes were made. Re-run with confirm: true to execute.',
  });
}
