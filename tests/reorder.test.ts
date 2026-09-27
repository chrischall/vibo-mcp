import { describe, it, expect } from 'vitest';
import { planMoves, missingIds } from '../src/reorder.js';

/** Vibo's reorder semantics, measured live: the source lands directly after target; null = first. */
function replay(order: string[], moves: { source: string; target: string | null }[]): string[] {
  let list = [...order];
  for (const { source, target } of moves) {
    const rest = list.filter((x) => x !== source);
    const to = target === null ? 0 : rest.indexOf(target) + 1;
    list = [...rest.slice(0, to), source, ...rest.slice(to)];
  }
  return list;
}

/** What the caller asked for: sources, in order, directly after `after` (or first). */
function wanted(order: string[], sources: string[], after: string | null): string[] {
  const rest = order.filter((x) => !sources.includes(x));
  const at = after === null ? 0 : rest.indexOf(after) + 1;
  return [...rest.slice(0, at), ...sources, ...rest.slice(at)];
}

const ABCD = ['A', 'B', 'C', 'D'];

describe('planMoves', () => {
  it('targets the item the source should follow, moving down or up', () => {
    expect(planMoves(ABCD, ['A'], 'D')).toEqual({ moves: [{ source: 'A', target: 'D' }], finalOrder: ['B', 'C', 'D', 'A'] });
    expect(planMoves(ABCD, ['D'], 'A').moves).toEqual([{ source: 'D', target: 'A' }]);
  });

  it('moving to the start sends target null', () => {
    expect(planMoves(ABCD, ['C'], null).moves).toEqual([{ source: 'C', target: null }]);
  });

  it('chains a block: each later source follows the one before it', () => {
    expect(planMoves(ABCD, ['D', 'A'], 'B').moves).toEqual([
      { source: 'D', target: 'B' },
      { source: 'A', target: 'D' },
    ]);
  });

  it('skips items already in place', () => {
    expect(planMoves(ABCD, ['B'], 'A').moves).toEqual([]);
    expect(planMoves(ABCD, ['A', 'B'], null).moves).toEqual([]);
  });

  it('moves several items as a block in the given order', () => {
    const plan = planMoves(ABCD, ['D', 'A'], 'B');
    expect(plan.finalOrder).toEqual(['B', 'D', 'A', 'C']);
    expect(replay(ABCD, plan.moves)).toEqual(plan.finalOrder);
  });

  it('replaying the planned calls always yields the requested order (randomised)', () => {
    let seed = 7;
    const rand = (n: number) => ((seed = (seed * 1103515245 + 12345) % 2 ** 31), seed % n);
    for (let run = 0; run < 500; run++) {
      const order = Array.from({ length: 2 + rand(9) }, (_, i) => `s${i}`);
      const pool = [...order];
      const sources: string[] = [];
      for (let k = 1 + rand(Math.min(4, order.length - 1)); k > 0; k--) sources.push(pool.splice(rand(pool.length), 1)[0]);
      const after = rand(3) === 0 || pool.length === 0 ? null : pool[rand(pool.length)];
      const plan = planMoves(order, sources, after);
      expect(plan.finalOrder).toEqual(wanted(order, sources, after));
      expect(replay(order, plan.moves)).toEqual(plan.finalOrder);
      expect(plan.moves.length).toBeLessThanOrEqual(sources.length);
    }
  });
});

describe('missingIds', () => {
  it('lists wanted ids that are absent, in order', () => {
    expect(missingIds(['x', 'A', 'y'], ABCD)).toEqual(['x', 'y']);
  });
});
