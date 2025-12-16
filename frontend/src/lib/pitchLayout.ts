// lib/pitchLayout.ts
import { PITCH } from "./constants";

export type RowId = keyof typeof PITCH.ROW_Y;

// Re-export row Y so views can import from here or directly from constants
export const ROW_Y: Record<RowId, number> = PITCH.ROW_Y;

const X_MIN = PITCH.X_MIN;
const X_MAX = PITCH.X_MAX;
const ROW_CFG = PITCH.ROW_CFG;

/**
 * Symmetric middle-out spread with anchored wings.
 * - vbWidth: pass your SVG viewBox width
 * - chipGapVB: min gap in viewBox units (chip + margins)
 * - gutterVB: inner padding per side inside the span
 */
export function spreadXsSymmetric(
  n: number,
  id: RowId,
  vbWidth: number,
  opts: { chipGapVB?: number; gutterVB?: number } = {}
): number[] {
  if (n <= 0) return [];
  const center = vbWidth / 2;

  const span = (X_MAX - X_MIN) * ROW_CFG[id].widthFactor;
  const leftBound  = center - span / 2 + (opts.gutterVB ?? 0);
  const rightBound = center + span / 2 - (opts.gutterVB ?? 0);

  if (n === 1) return [center];
  if (n === 2) return [leftBound, rightBound];

  const P = ROW_CFG[id].pinch;

  const kPairs = Math.floor((n - 2) / 2);
  const hasMiddle = n % 2 === 1;

  const g: number[] = [];
  for (let i = kPairs; i >= 1; i--) {
    const u = i / (kPairs + 1);
    g.push(Math.pow(u, P));
  }

  const half = (rightBound - leftBound) / 2;
  const xs: number[] = [];
  xs.push(leftBound);

  for (const gi of g) xs.push(center - gi * half);
  if (hasMiddle) xs.push(center);
  for (let i = g.length - 1; i >= 0; i--) xs.push(center + g[i] * half);

  xs.push(rightBound);

  const minGap = opts.chipGapVB ?? 0;
  if (minGap > 0) {
    for (let i = 1; i < xs.length; i++) {
      if (xs[i] - xs[i - 1] < minGap) xs[i] = xs[i - 1] + minGap;
    }
    const over = xs[xs.length - 1] - rightBound;
    if (over > 0) {
      const movable = xs.length - 1;
      for (let i = 1; i < xs.length; i++) xs[i] -= (over * i) / movable;
    }
  }

  return xs;
}