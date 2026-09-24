// Re-export the shared in-memory test harness from `@chrischall/mcp-utils/test`,
// matching the fleet convention so local imports (`../helpers.js`) resolve.
import { expect, type MockInstance } from 'vitest';
import { parseToolResult, type TestHarness } from '@chrischall/mcp-utils/test';

export { createTestHarness } from '@chrischall/mcp-utils/test';

/** Phase 1 of the confirm-token flow, as a caller that cannot be prompted sees it. */
export interface ConfirmationRequired {
  status: string;
  action: string;
  confirmToken: string;
  preview: { action: string; willSend: Record<string, unknown> };
}

/** Call a gated tool WITHOUT a token and assert it answered with a preview. */
export async function previewCall(
  harness: TestHarness,
  name: string,
  args: Record<string, unknown>,
): Promise<ConfirmationRequired> {
  const body = parseToolResult<ConfirmationRequired>(await harness.callTool(name, args));
  expect(body.status).toBe('confirmation-required');
  expect(typeof body.confirmToken).toBe('string');
  return body;
}

/**
 * Drive both phases of a gated write on a harness with no elicitation handler
 * (the default `ask-user` token flow): phase 1 must touch none of `writes`,
 * phase 2 — the same args plus the returned token — must call them exactly once.
 */
export async function confirmCall(
  harness: TestHarness,
  name: string,
  args: Record<string, unknown>,
  ...writes: MockInstance[]
) {
  const total = () => writes.reduce((n, w) => n + w.mock.calls.length, 0);
  const before = total();
  const { confirmToken } = await previewCall(harness, name, args);
  expect(total()).toBe(before);
  const result = await harness.callTool(name, { ...args, confirmToken });
  expect(total()).toBe(before + 1);
  return result;
}
