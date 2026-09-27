/**
 * Plan a "move these items to after that one" request as the sequence of
 * single drags the Vibo web app itself would send.
 *
 * Vibo's reorder mutations (`reorderSections`, `reorderSongsBatch`) take a
 * source and a `target`, and the web app's drag handler — read from the
 * web.vibodj.com bundle — fills `target` with the item that currently sits at
 * the DROP INDEX in the pre-drag list (`target = list[addedIndex]`). So the
 * source takes the target's slot: dragging down lands it just after the target,
 * dragging up lands it just before. That is not "after target", which is what
 * the old `vibo_reorder_songs` passed straight through (a move up landed one
 * slot early).
 *
 * Replaying the UI's own payload per item keeps us on the one request shape the
 * server is known to accept, and never needs the ambiguous `target: null`.
 */
export interface PlannedMove {
  source: string;
  target: string;
}

export interface MovePlan {
  moves: PlannedMove[];
  /** The order the list should be in once every move has applied. */
  finalOrder: string[];
}

/**
 * `order` is the current list; `sources` are moved (in the given order) to sit
 * directly after `after`, or at the start when `after` is null. Callers
 * validate ids first: every source and `after` must be in `order`, and
 * `after` must not be a source.
 */
export function planMoves(order: readonly string[], sources: readonly string[], after: string | null): MovePlan {
  let current = [...order];
  let anchor = after;
  const moves: PlannedMove[] = [];
  for (const source of sources) {
    const from = current.indexOf(source);
    const rest = current.filter((id) => id !== source);
    const to = anchor === null ? 0 : rest.indexOf(anchor) + 1;
    if (to !== from) {
      moves.push({ source, target: current[to] });
      current = [...rest.slice(0, to), source, ...rest.slice(to)];
    }
    anchor = source;
  }
  return { moves, finalOrder: current };
}

/** Ids from `wanted` that are not in `have`, preserving order. */
export function missingIds(wanted: readonly string[], have: readonly string[]): string[] {
  const set = new Set(have);
  return wanted.filter((id) => !set.has(id));
}
