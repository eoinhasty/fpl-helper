/**
 * How often a move the points model picked actually paid off, by its projected
 * gain and how many GWs that gain covers. From tools/analysis/confidence_table.py
 * (regenerate both together): out-of-sample walk-forward projections, 2024-25 +
 * 2025-26 pooled, GW4+. Each "move" is a regular starter (started 4 of his last
 * 5) swapped for the best-projected regular starter in his position costing at
 * most £1.0m more — measured on chosen moves, not all pairs, because picking the
 * best option inflates its projected gap (all pairs read 2-5 points higher).
 * Paid off = outscored the player it replaced over those GWs, ties half.
 * Bins with under 100 moves are pooled with a neighbour and rates made
 * non-decreasing in the gap.
 *
 * Approximate for the app's moves: the planner chooses under budget and squad
 * constraints rather than a £1m band, and players at rotation risk weren't in
 * the sample. Captaincy uses its own numbers (CAPTAIN_CLOSE_GAP below).
 */
const GAP_FROM = [0, 0.5, 1, 1.5, 2, 3, 5, 8];
const WIN_RATE: Record<number, number[]> = {
  1: [0.53, 0.55, 0.6, 0.62, 0.67, 0.73, 0.83, 0.83],
  2: [0.46, 0.54, 0.54, 0.57, 0.6, 0.67, 0.79, 0.86],
  3: [0.52, 0.56, 0.56, 0.56, 0.59, 0.64, 0.72, 0.82],
  4: [0.5, 0.5, 0.5, 0.52, 0.59, 0.61, 0.71, 0.78],
  5: [0.46, 0.48, 0.53, 0.57, 0.57, 0.6, 0.67, 0.75],
};

/** At or below 56% the call is close to a coin flip; at 65%+ it's about two in three or better. */
const TOSS_UP = 0.57;
const EDGE = 0.65;

/**
 * Among each GW's top-10 captain candidates, the favourite won 52% of pairs
 * within 1 pt and 55% within 1-2 pts, but 62% at 2+ (confidence_table.py).
 */
export const CAPTAIN_CLOSE_GAP = 2;

export type Confidence = { level: "toss-up" | "edge" | null; winRate: number };

/** Confidence in a projected gain of `gap` points summed over `gws` GWs (clamped to 1-5). */
export function confidence(gap: number, gws: number): Confidence {
  const row = WIN_RATE[Math.min(5, Math.max(1, Math.round(gws)))];
  let i = 0;
  while (i + 1 < GAP_FROM.length && Math.abs(gap) >= GAP_FROM[i + 1]) i++;
  const winRate = row[i];
  return { level: winRate < TOSS_UP ? "toss-up" : winRate >= EDGE ? "edge" : null, winRate };
}

/** Tooltip copy shared by every confidence label. */
export function confidenceTitle(c: Confidence): string {
  const pct = Math.round(c.winRate * 100);
  return c.level === "toss-up"
    ? `Close call: in past seasons, moves the model picked with a gain this small paid off ${pct}% of the time. Decide on news, price or fixtures.`
    : `In past seasons, moves the model picked with a gain this size paid off ${pct}% of the time.`;
}
