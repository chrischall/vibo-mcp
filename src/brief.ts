import type { CallToolResult } from '@modelcontextprotocol/server';
import { UNTRUSTED_CONTENT_RULE, untrustedEnvelope } from '@chrischall/mcp-utils';

/**
 * The `view: "brief"` rung the context-group canonical reads answer (mcp-host
 * plan 2026-11-04, the consolidated brief-view contract): one line per item,
 * `title — <ISO date | no date> — <status>`, at most 120 characters. A line
 * starting with `-- ` is a NOTE, not an item (`-- none`, `-- N of M shown`,
 * `-- more`), so the brief rung never silently drops a page the other rungs
 * would report.
 */
export const BRIEF_MAX = 120;

/** A brief line, its title shortened so the whole line is ≤ 120 characters. */
export function briefLine(title: string, date: string, status: string): string {
  const tail = ` — ${date} — ${status}`;
  const room = BRIEF_MAX - tail.length;
  const shown = title.length > room ? `${title.slice(0, Math.max(room - 1, 0))}…` : title;
  return `${shown}${tail}`;
}

/** A trimmed non-empty string, else undefined. */
export function text(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() !== '' ? v.trim().replace(/\s+/g, ' ') : undefined;
}

/**
 * A Vibo date as ISO text. A string that already reads as an ISO date is kept
 * verbatim (an event's local date must not be shifted into UTC); an epoch
 * number — or an all-digit string — is converted. Anything else is "no date".
 */
export function isoDate(v: unknown): string {
  const s = typeof v === 'string' ? v.trim() : undefined;
  if (s && /^\d{4}-\d{2}-\d{2}/.test(s)) return s;
  const n = typeof v === 'number' ? v : s && /^\d+$/.test(s) ? Number(s) : NaN;
  if (Number.isFinite(n)) {
    const d = new Date(n);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return 'no date';
}

/** A Vibo list page: its items plus the paging fields Vibo returns beside them. */
export interface BriefPage {
  items: unknown[];
  totalCount?: unknown;
  next?: unknown;
  skip: number;
}

/**
 * The page's lines plus its notes: `-- none` when there is nothing, `-- N of
 * M shown` when Vibo's `totalCount` says more exist than this page holds, and
 * `-- more` when a `next` cursor exists but no total was given.
 */
export function briefLines(page: BriefPage, line: (item: Record<string, unknown>) => string): string[] {
  const lines = page.items.map((i) => line(i && typeof i === 'object' ? (i as Record<string, unknown>) : {}));
  if (lines.length === 0) return ['-- none'];
  const total = typeof page.totalCount === 'number' ? page.totalCount : undefined;
  if (total !== undefined) {
    if (page.skip + lines.length < total) lines.push(`-- ${lines.length} of ${total} shown`);
  } else if (page.next !== null && page.next !== undefined) {
    lines.push('-- more');
  }
  return lines;
}

/**
 * Brief lines carrying text other people wrote (event titles, notification
 * headers), answered inside the fleet's untrusted-data envelope as
 * `{ untrusted_content, note, data: string[] }`, minified — so the marker
 * precedes the text wherever the result is read. mcp-host's intent tools
 * unwrap the envelope and take `data` as the lines.
 */
export function untrustedBriefResponse(lines: string[], whoWrote: string): CallToolResult {
  const payload = untrustedEnvelope(lines, { note: `${whoWrote} ${UNTRUSTED_CONTENT_RULE}` });
  return { content: [{ type: 'text', text: JSON.stringify(payload) }] };
}

/** Read a Vibo list page out of its GraphQL envelope (`{ <listKey>: [...], next, totalCount }`). */
export function pageOf(data: unknown, listKey: string, skip: number): BriefPage {
  const d = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  const items = Array.isArray(d[listKey]) ? (d[listKey] as unknown[]) : [];
  return { items, totalCount: d.totalCount, next: d.next, skip };
}
