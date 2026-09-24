import { minifiedResult, resolveView, stripMediaUrls, viewParam, type View } from '@chrischall/mcp-utils';

/**
 * The rungs this server honours (`@chrischall/mcp-utils`' `view` vocabulary;
 * `chrischall/workflows` `docs/fleet-conventions.md`, "Response shape").
 *
 * **What compact does here, and what it deliberately does NOT do.**
 *
 * The read tools in this server hand back Vibo's payload close to
 * verbatim, and the repo holds no verified record of what those payloads
 * contain — no captured fixture, no documented field list. So nothing here can
 * honestly say which of Vibo's fields matter and which are noise.
 *
 * Compact therefore does the one projection that needs no such knowledge: it
 * strips image and avatar URLs. That is SUBTRACTIVE, so it cannot lose a field
 * nobody knew about — the failure an invented field list would risk, where a
 * record comes back with holes in it and reads like a verified answer.
 *
 * When a real payload can be captured, a field projection belongs here beside
 * this one and will save considerably more. Until then this is the honest
 * ceiling, and this docblock says so rather than implying a shape was checked.
 *
 * One exception: `vibo_list_event_users` projects its members to
 * `{_id, firstName, lastName, role}` on compact, because its document's field
 * list is fixed by the query and the dropped `email` is third-party PII
 * (fleet-audit #1136). See `membersForView` in `tools/collaboration.ts`.
 */
export const VIBO_VIEWS = ['compact', 'full'] as const;

const NOTE =
  'compact strips image/avatar URLs from the response; "full" returns Vibo\'s payload untouched. ' +
  'No field projection: this server has no verified record of which Vibo fields matter, and inventing ' +
  'one would risk dropping a field a caller needs.';

const EVENT_USERS_NOTE =
  'compact (default) returns each member as {_id, firstName, lastName, role} only — no email addresses or ' +
  'avatar URLs; "full" returns Vibo\'s payload untouched, emails included. This document\'s field list is ' +
  'fixed by its query, so the projection cannot drop an unknown field.';

/** The `view` parameter every read tool in this server takes. */
export const viewArg = (): ReturnType<typeof viewParam> => viewParam(VIBO_VIEWS, { note: NOTE });

/**
 * `vibo_list_event_users`' `view` parameter — the one exception to NOTE's
 * "no field projection" (see the docblock above), so its schema says so.
 */
export const eventUsersViewArg = (): ReturnType<typeof viewParam> =>
  viewParam(VIBO_VIEWS, { note: EVENT_USERS_NOTE });

/**
 * Answer in the requested rung.
 *
 * Only ever called from a READ tool. A write's response is a receipt — an id,
 * a status — with nothing to strip and everything to keep.
 */
export function viewResponse(view: string | undefined, data: unknown): ReturnType<typeof minifiedResult> {
  const rung: View = resolveView(view, VIBO_VIEWS);
  return minifiedResult(rung === 'compact' ? stripMediaUrls(data) : data);
}
