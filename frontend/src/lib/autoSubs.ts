import type { Player } from "./types";

// FPL's auto-sub rules, for choosing a bench order. Mirrors `auto_subs` in
// backend/app/services/mini_league.py (which projects them live) — change both
// together. A starter who doesn't play is replaced by the first bench player,
// in order, who did play and keeps the XI at 3 DEF / 2 MID / 1 FWD; the spare
// GK only covers the GK.

/** FPL's minimum outfield formation by position (2 DEF, 3 MID, 4 FWD) */
const MIN_OUTFIELD: [number, number][] = [
  [2, 3],
  [3, 2],
  [4, 1],
];

/** The bench players who come on for the starters who didn't play, in the
 * order FPL makes the subs. Starters are taken in the order given. */
export function autoSubs(xi: Player[], bench: Player[], played: (p: Player) => boolean): Player[] {
  const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const p of xi) counts[p.position]++;
  const used = new Set<number>();
  const on: Player[] = [];
  for (const out of xi) {
    if (played(out)) continue;
    for (const b of bench) {
      if (used.has(b.element) || !played(b) || (b.position === 1) !== (out.position === 1)) continue;
      // The XI after swapping `out` for `b` must stay a legal formation
      const after = (pos: number) => counts[pos] - Number(out.position === pos) + Number(b.position === pos);
      if (out.position !== 1 && MIN_OUTFIELD.some(([pos, n]) => after(pos) < n)) continue;
      counts[out.position]--;
      counts[b.position]++;
      used.add(b.element);
      on.push(b);
      break;
    }
  }
  return on;
}

/** Each possible order of a list (fine for the three outfield subs) */
function permutations<T>(xs: T[]): T[][] {
  if (xs.length <= 1) return [xs];
  return xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((rest) => [x, ...rest]));
}

/** Outcomes less likely than this are left out of the expectation */
const MIN_PROB = 1e-7;

/** Expected points the outfield bench adds through auto-subs, in this order.
 * Sums over every combination of who plays — each player plays with
 * `chance(p)` and then scores `value(p)` — walking them depth first and
 * leaving out branches less likely than MIN_PROB (all-but-exact, and a few
 * thousand outcomes rather than 2^13). */
export function expectedSubPoints(
  xi: Player[],
  bench: Player[],
  chance: (p: Player) => number,
  value: (p: Player) => number,
): number {
  const outfield = xi.filter((p) => p.position !== 1);
  const everyone = [...outfield, ...bench];
  const index = new Map(everyone.map((p, i) => [p.element, i]));
  const chances = everyone.map(chance);
  const values = new Map(bench.map((p) => [p.element, value(p)]));
  const plays: boolean[] = [];
  let total = 0;
  const walk = (i: number, prob: number, missing: number) => {
    if (prob < MIN_PROB) return;
    // Every starter played: no subs, whoever on the bench did
    if (i === outfield.length && missing === 0) return;
    if (i === everyone.length) {
      for (const p of autoSubs(outfield, bench, (q) => plays[index.get(q.element)!]))
        total += prob * values.get(p.element)!;
      return;
    }
    const starter = i < outfield.length;
    plays[i] = true;
    walk(i + 1, prob * chances[i], missing);
    plays[i] = false;
    walk(i + 1, prob * (1 - chances[i]), missing + Number(starter));
  };
  walk(0, 1, 0);
  return total;
}

/** Below this (expected points) a different bench order isn't worth asking for */
const MIN_BENCH_GAIN = 0.05;

/** The outfield bench order with the most expected auto-sub points. `current`
 * is kept unless another order beats it by MIN_BENCH_GAIN, so near-ties
 * never ask for a reshuffle. */
export function bestBenchOrder(
  xi: Player[],
  current: Player[],
  chance: (p: Player) => number,
  value: (p: Player) => number,
): Player[] {
  const keep = expectedSubPoints(xi, current, chance, value);
  let best = current;
  let bestPts = keep;
  for (const order of permutations(current)) {
    const pts = expectedSubPoints(xi, order, chance, value);
    if (pts > bestPts + 1e-9) {
      best = order;
      bestPts = pts;
    }
  }
  return bestPts >= keep + MIN_BENCH_GAIN ? best : current;
}
