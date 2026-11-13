// lib/captaincy.ts — captain ranking for CaptaincyCard; the fallback formula's
// FDR curve mirrors backend scoring.py (fdrFactor in utils.ts)

import type { Player } from "./types";
import { fdrFactor, isStarting } from "./utils";

export type CaptainRow = {
  p: Player;
  score: number;
  /** The points shown beside the pick: projection, else ep_next (0 if neither) */
  pts: number;
};

/** Ownership below this (%) makes a player the "Differential" pick */
export const DIFF_THRESHOLD = 15;

function range(arr: number[]) {
  return { mn: Math.min(...arr), mx: Math.max(...arr) };
}

function norm(v: number, { mn, mx }: { mn: number; mx: number }) {
  return mx === mn ? 0.5 : (v - mn) / (mx - mn);
}

const posMult = (pos?: number) => (pos === 4 ? 1.0 : pos === 3 ? 0.92 : 0.72);

/** XI outfield players, best captain first. `projected` says the ranking is
 * the points model's projection rather than the fallback formula. */
export function rankCaptains(players: Player[]): { rows: CaptainRow[]; projected: boolean } {
  const xi = players.filter((p) => isStarting(p) && p.position !== 1);

  // The points model's projection is ranked as-is: it already prices fixtures,
  // home advantage and position, and backtested better without the formula's
  // terms on top (backend/scripts/backtest_transfers.py --captaincy).
  if (xi.some((p) => p.projected_pts != null)) {
    const rows = xi
      .map((p) => ({ p, score: p.projected_pts ?? 0, pts: p.projected_pts ?? 0 }))
      .sort((a, b) => b.score - a.score);
    return { rows, projected: true };
  }

  const raw = xi.map((p) => {
    const fxs = p.fixtures ?? (p.fixture ? [p.fixture] : []);
    const avgFdr = fxs.length ? fxs.reduce((s, f) => s + f.difficulty, 0) / fxs.length : 3;
    const homeRatio = fxs.length ? fxs.filter((f) => f.home).length / fxs.length : 0;
    const ep = parseFloat(p.ep_next ?? "0");
    return {
      p,
      form: parseFloat(p.form ?? "0"),
      ict: parseFloat(p.ict_index ?? "0"),
      // ep_next is already a whole-GW total — a DGW player's covers both fixtures
      ep,
      fdr: avgFdr,
      home: homeRatio,
      sp: p.start_probability ?? 0,
      dgw: fxs.length > 1,
      bgw: fxs.length === 0,
    };
  });

  const formRange = range(raw.map((r) => r.form));
  const ictRange = range(raw.map((r) => r.ict));
  const epRange = range(raw.map((r) => r.ep));
  const hasEp = raw.some((r) => r.ep > 0);

  const rows = raw
    .map((r) => {
      const base = hasEp ? norm(r.ep, epRange) : norm(r.form, formRange) * 0.5 + norm(r.ict, ictRange) * 0.5;
      const homeBoost = 1 + r.home * 0.08;
      // Only the per-match form/ICT fallback needs boosting; ep_next already counts both fixtures
      const dgwBoost = r.dgw && !hasEp ? 1.8 : 1.0;
      const bgwPenalty = r.bgw ? 0.1 : 1.0;
      const s = base * fdrFactor(r.fdr) * homeBoost * dgwBoost * bgwPenalty * r.sp * posMult(r.p.position);
      return { p: r.p, score: s, pts: r.ep };
    })
    .sort((a, b) => b.score - a.score);
  return { rows, projected: false };
}

/** The top 3 captains, plus the best-ranked XI player under DIFF_THRESHOLD%
 * ownership who isn't one of them (null if nobody qualifies). */
export function captaincyPicks(players: Player[]) {
  const { rows, projected } = rankCaptains(players);
  const picks = rows.slice(0, 3);
  const topIds = new Set(picks.map((r) => r.p.element));
  const differential =
    rows.find(
      (r) =>
        !topIds.has(r.p.element) &&
        typeof r.p.selected_by_percent !== "undefined" &&
        Number(r.p.selected_by_percent) < DIFF_THRESHOLD,
    ) ?? null;
  return { picks, differential, projected };
}
