import type { Player } from "./types";
import { bestBenchOrder } from "./autoSubs";
import { isStarting } from "./utils";

// Best starting XI + bench order from a squad of 15. Mirrors the season
// sim's lineup rule (pick_best_xi in backend/scripts/backtest_transfers.py):
// picking XIs on the points model's projections instead of last-GW xP added
// +110 / +220 pts/season there (2026-11-01).

/** Legal (DEF, MID, FWD) splits alongside one GK. */
export const FORMATIONS: [number, number, number][] = [];
for (let d = 3; d <= 5; d++)
  for (let f = 1; f <= 3; f++) {
    const m = 10 - d - f;
    if (m >= 2 && m <= 5) FORMATIONS.push([d, m, f]);
  }

/** Gains below this are rounding noise, not a reason to move anyone. */
const MIN_GAIN = 0.05;

/** The model's projection (already × chance of playing), else FPL's ep_next. */
export function lineupValue(p: Player): number {
  return p.projected_pts ?? parseFloat(p.ep_next ?? "0");
}

/** Chance a player gets on the pitch: the start probability heuristic (which
 * already folds in FPL's chance of playing), kept off 0 and 1 */
const playChance = (p: Player) => Math.min(0.99, Math.max(0.01, p.start_probability ?? 0.9));

/** Points if they do play: lineupValue is an expectation over playing or not */
const pointsIfPlaying = (p: Player) => lineupValue(p) / Math.max(playChance(p), 0.05);

export type LineupSuggestion = {
  /** Values come from the points model rather than ep_next */
  projected: boolean;
  /** Projected points of the suggested XI minus the current XI's (captain not doubled) */
  gain: number;
  /** Suggested XI (the current one when it's already best) */
  xi: Player[];
  /** Bench players who should start, and the starters they displace */
  bringIn: Player[];
  drop: Player[];
  formation: string;
  currentFormation: string;
  /** Suggested bench: spare GK, then outfield players in auto-sub order */
  bench: Player[];
  benchChanged: boolean;
};

const formationOf = (xi: Player[]) => [2, 3, 4].map((pos) => xi.filter((p) => p.position === pos).length).join("-");

const total = (ps: Player[]) => ps.reduce((s, p) => s + lineupValue(p), 0);

export function suggestLineup(players: Player[]): LineupSuggestion | null {
  const current = players.filter(isStarting);
  if (players.length !== 15 || current.length !== 11) return null;

  // Highest value first; ties keep current starters in, so equal options never churn
  const byPos = (pos: number) =>
    players
      .filter((p) => p.position === pos)
      .sort((a, b) => lineupValue(b) - lineupValue(a) || Number(isStarting(b)) - Number(isStarting(a)));
  const gks = byPos(1);
  const [defs, mids, fwds] = [byPos(2), byPos(3), byPos(4)];
  if (!gks.length) return null;

  let best: Player[] | null = null;
  for (const [d, m, f] of FORMATIONS) {
    if (defs.length < d || mids.length < m || fwds.length < f) continue;
    const xi = [gks[0], ...defs.slice(0, d), ...mids.slice(0, m), ...fwds.slice(0, f)];
    if (!best || total(xi) > total(best) + 1e-9) best = xi;
  }
  if (!best) return null;

  const gain = total(best) - total(current);
  const xi = gain >= MIN_GAIN ? best : current;
  const inXi = new Set(xi.map((p) => p.element));
  const wasIn = new Set(current.map((p) => p.element));

  // FPL's auto-subs swap GK for GK and walk the outfield bench in order. The
  // order is the one with the most expected auto-sub points (lib/autoSubs.ts):
  // raw value first would put a reliable low scorer ahead of a doubtful high
  // one, though FPL skips a sub who didn't play and moves on to the next.
  const currentBench = players.filter((p) => !isStarting(p)).sort((a, b) => (a.slot ?? 99) - (b.slot ?? 99));
  const benched = players.filter((p) => !inXi.has(p.element));
  const sameBench = benched.every((p) => !isStarting(p));
  // Start from the user's own order when the same four sit out, so a near-tie
  // never asks for a reshuffle; otherwise from value order
  const startOrder = sameBench
    ? currentBench.filter((p) => p.position !== 1)
    : benched.filter((p) => p.position !== 1).sort((a, b) => lineupValue(b) - lineupValue(a));
  const bench = [
    ...benched.filter((p) => p.position === 1),
    ...bestBenchOrder(xi, startOrder, playChance, pointsIfPlaying),
  ];

  return {
    projected: players.some((p) => p.projected_pts != null),
    xi,
    gain: xi === best ? gain : 0,
    bringIn: xi.filter((p) => !wasIn.has(p.element)),
    drop: current.filter((p) => !inXi.has(p.element)),
    formation: formationOf(xi),
    currentFormation: formationOf(current),
    bench,
    benchChanged: bench.some((p, i) => currentBench[i]?.element !== p.element),
  };
}

/** The squad re-slotted into the suggested lineup (XI 1-11 by position, bench
 * 12-15 in sub order), for PitchView/XIList to render as a preview. */
export function previewLineup(players: Player[], s: LineupSuggestion): Player[] {
  const wasIn = new Set(players.filter(isStarting).map((p) => p.element));
  const xi = [...s.xi].sort((a, b) => a.position - b.position);
  // FPL won't save a benched captain: the armband passes to the vice, as
  // FPL's own team screen does, so the preview is a lineup FPL would accept
  const captain = players.find((p) => p.is_captain);
  const captainBenched = !!captain && !xi.some((p) => p.element === captain.element);
  const capMult = Math.max(captain?.multiplier ?? 2, 2);
  const armband = (p: Player) =>
    captainBenched ? p.is_vice_captain && xi.some((x) => x.element === p.element) : !!p.is_captain;
  return [
    ...xi.map((p, i) => ({
      ...p,
      slot: i + 1,
      is_captain: armband(p),
      is_vice_captain: armband(p) ? false : p.is_vice_captain,
      multiplier: armband(p) ? capMult : 1,
      lineup_change: wasIn.has(p.element) ? undefined : ("start" as const),
    })),
    ...s.bench.map((p, i) => ({
      ...p,
      slot: 12 + i,
      is_captain: false,
      multiplier: 0,
      lineup_change: wasIn.has(p.element) ? ("bench" as const) : undefined,
    })),
  ];
}
