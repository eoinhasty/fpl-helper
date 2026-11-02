import type { Player } from "./types";
import { isStarting } from "./utils";

// Best starting XI + bench order from a squad of 15. Mirrors the season
// sim's lineup rule (pick_best_xi in backend/scripts/backtest_transfers.py):
// picking XIs on the points model's projections instead of last-GW xP added
// +110 / +220 pts/season there (2026-11-01).

/** Legal (DEF, MID, FWD) splits alongside one GK. */
const FORMATIONS: [number, number, number][] = [];
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

export type LineupSuggestion = {
  /** Values come from the points model rather than ep_next */
  projected: boolean;
  /** Projected points of the suggested XI minus the current XI's (captain not doubled) */
  gain: number;
  /** Bench players who should start, and the starters they displace */
  bringIn: Player[];
  drop: Player[];
  formation: string;
  currentFormation: string;
  /** Suggested bench: spare GK, then outfield players in auto-sub order */
  bench: Player[];
  benchChanged: boolean;
};

const formationOf = (xi: Player[]) =>
  [2, 3, 4].map((pos) => xi.filter((p) => p.position === pos).length).join("-");

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

  // FPL's auto-subs swap GK for GK and walk the outfield bench in order,
  // so the likeliest-to-score bench player goes first.
  const benched = players.filter((p) => !inXi.has(p.element));
  const bench = [
    ...benched.filter((p) => p.position === 1),
    ...benched.filter((p) => p.position !== 1).sort((a, b) => lineupValue(b) - lineupValue(a)),
  ];
  const currentBench = players
    .filter((p) => !isStarting(p))
    .sort((a, b) => (a.slot ?? 99) - (b.slot ?? 99));

  return {
    projected: players.some((p) => p.projected_pts != null),
    gain: xi === best ? gain : 0,
    bringIn: xi.filter((p) => !wasIn.has(p.element)),
    drop: current.filter((p) => !inXi.has(p.element)),
    formation: formationOf(xi),
    currentFormation: formationOf(current),
    bench,
    benchChanged: bench.some((p, i) => currentBench[i]?.element !== p.element),
  };
}
