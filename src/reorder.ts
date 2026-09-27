/**
 * Plan a "move these items to after that one" request as single-item calls to
 * Vibo's reorder mutations (`reorderSections`, `reorderSongsBatch`).
 *
 * Semantics, measured live on throwaway sections (moves up, down, and to the
 * start): the source lands DIRECTLY AFTER `target`, and `target: null` puts it
 * first. So the plan is simply "each source after the previous one", skipping
 * any that already sit there.
 */
export interface PlannedMove {
  source: string;
  /** The item the source goes directly after; null = the start. */
  target: string | null;
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
      moves.push({ source, target: anchor });
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
