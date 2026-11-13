/**
 * How often the points model's favourite actually outscored the alternative,
 * by the projected gap between them and how many GWs it covers. Measured on
 * out-of-sample walk-forward projections (tools/analysis data/walkforward,
 * 2024-25 + 2025-26 pooled, GW4+), every pair of regular starters (started 4 of
 * their last 5) in the same position, ties counted half. The 5-GW row
 * reproduces the gap table in tools/analysis/README.md.
 *
 * Not used for captaincy: among each GW's top candidates the model's #1 beat
 * its #2 only 47-49% of the time in both seasons, so every week would read
 * "toss-up".
 */
const GAP_FROM = [0, 0.5, 1, 1.5, 2, 3, 5, 8];
const WIN_RATE: Record<number, number[]> = {
  1: [0.52, 0.57, 0.61, 0.66, 0.71, 0.79, 0.83, 0.97],
  2: [0.51, 0.55, 0.58, 0.61, 0.65, 0.71, 0.78, 0.85],
  3: [0.51, 0.54, 0.56, 0.58, 0.62, 0.67, 0.75, 0.82],
  4: [0.5, 0.53, 0.55, 0.57, 0.6, 0.65, 0.72, 0.8],
  5: [0.51, 0.53, 0.54, 0.56, 0.58, 0.63, 0.7, 0.78],
};

/** Below this the call is close to a coin flip; at or above EDGE it's about two in three. */
const TOSS_UP = 0.57;
const EDGE = 0.65;

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
    ? `Close call: in past seasons the model's pick won only ${pct}% of calls this close. Decide on news, price or fixtures.`
    : `In past seasons the model's pick came out ahead in ${pct}% of calls with a gap this size.`;
}
