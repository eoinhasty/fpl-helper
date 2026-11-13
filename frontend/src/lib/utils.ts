// lib/utils.ts
import type { Player, XgiSignal } from "./types";

export const isStarting = (p: Player): boolean => (p.multiplier ?? 0) > 0 || (p.slot ?? 99) <= 11;

export type Tone = "success" | "warning" | "destructive";

/** Class strings per tone — written out in full so Tailwind can see them. */
export const TONE_CLASS: Record<Tone, { text: string; bg: string; fill: string; soft: string }> = {
  success: { text: "text-success", bg: "bg-success", fill: "fill-success", soft: "bg-success/8 border-success/30" },
  warning: { text: "text-warning", bg: "bg-warning", fill: "fill-warning", soft: "bg-warning/8 border-warning/30" },
  destructive: {
    text: "text-destructive",
    bg: "bg-destructive",
    fill: "fill-destructive",
    soft: "bg-destructive/8 border-destructive/30",
  },
};

/** Start probability (0–1) → tone. Single source for every start-% colour. */
export const startProbTone = (p: number): Tone => (p >= 0.7 ? "success" : p >= 0.4 ? "warning" : "destructive");

/** FPL status → tone, matching FPL's own flags: doubtful amber; injured,
 * suspended, not available and left-the-club red. Single source for every
 * status colour. */
export const statusTone = (s: string | undefined): Tone =>
  !s || s === "a" ? "success" : s === "d" ? "warning" : "destructive";

export const fdrClass = (d?: number) =>
  d === 1
    ? "bg-fdr-good/20 text-fdr-good font-semibold"
    : d === 2
      ? "bg-fdr-good/8 text-muted-foreground"
      : d === 3
        ? "text-muted-foreground"
        : d === 4
          ? "bg-destructive/8 text-muted-foreground"
          : d === 5
            ? "bg-destructive/20 text-destructive font-semibold"
            : "";

/** The fixture ticker's Attack/Defence views on fdrClass's 1–5 scale (1 =
 * easiest): expected goals as a ratio of a team's league average — scored
 * when attacking (higher is easier), conceded when defending (lower is). The
 * bands split the model's fixtures about as unevenly as FPL's FDR does. */
export function xgBand(ratio: number, higherIsEasier: boolean): 1 | 2 | 3 | 4 | 5 {
  const r = higherIsEasier ? ratio : 2 - ratio;
  return r >= 1.3 ? 1 : r >= 1.1 ? 2 : r > 0.9 ? 3 : r > 0.7 ? 4 : 5;
}

/** Same FDR scale as fdrClass, as a solid dot color — for small indicators where
 * fdrClass's alpha-tinted pill backgrounds would be too faint to read. */
export const fdrDotClass = (d?: number) =>
  d === 1
    ? "bg-fdr-good"
    : d === 2
      ? "bg-fdr-good/60"
      : d === 3
        ? "bg-muted-foreground/40"
        : d === 4
          ? "bg-destructive/60"
          : d === 5
            ? "bg-destructive"
            : "bg-muted-foreground/20";

/** Captaincy/transfer fixture multiplier for an average FDR (fractional for a
 * DGW). Mirrors FDR_FACTOR in backend scoring.py — change both together. */
const FDR_FACTOR = [1.0, 0.95, 0.9, 0.8, 0.6];
export function fdrFactor(avgFdr: number) {
  const lo = Math.max(1, Math.min(4, Math.floor(avgFdr)));
  const t = Math.min(Math.max(avgFdr - lo, 0), 1);
  return FDR_FACTOR[lo - 1] + (FDR_FACTOR[lo] - FDR_FACTOR[lo - 1]) * t;
}

/** Mirrors XGI_MIN_MINUTES in backend scoring.py — below it there's no xgi_signal. */
export const XGI_MIN_MINUTES = 270;

/** xgi_signal copy. "over" scores above their chances (likely to cool off — a
 * sell-high risk); "under" isn't converting chances yet (a buy-low). */
export const XGI_COPY: Record<XgiSignal["direction"], { label: string; tone: Tone; outlook: string }> = {
  over: { label: "Running hot", tone: "warning", outlook: "likely to cool off" },
  under: { label: "Unlucky", tone: "success", outlook: "likely to pick up" },
};

export function xgiSummary(s: XgiSignal, ga: number, xgi: string | undefined): string {
  return `${ga} G+A from ${Number(xgi ?? 0).toFixed(1)} xGI — ${XGI_COPY[s.direction].outlook}`;
}

export function statusToText(s: string | undefined) {
  switch ((s || "").toLowerCase()) {
    case "a":
      return "Available";
    case "d":
      return "Doubtful";
    case "i":
      return "Injured";
    case "s":
      return "Suspended";
    case "n":
      return "Not in squad";
    case "u":
      return "Left club";
    default:
      return "Unknown";
  }
}

/** A player's GW points as they count for the manager: × the pick multiplier
 * (captain ×2, triple captain ×3), and not counted on the bench. The
 * multiplier is FPL's own word on that — slots alone get a Bench Boost week
 * wrong, where slots 12–15 count too. Null when there are no live points. */
export function gwPointsDisplay(p: Player): { points: number; counted: boolean; tooltip: string } | null {
  if (p.gw_points == null) return null;
  const mult = p.multiplier ?? ((p.slot ?? 99) <= 11 ? 1 : 0);
  if (mult === 0) return { points: p.gw_points, counted: false, tooltip: `Bench: ${p.gw_points} points (not counted)` };
  const points = p.gw_points * mult;
  return {
    points,
    counted: true,
    tooltip: mult > 1 ? `Captain: ${p.gw_points} × ${mult} = ${points}` : `GW points: ${points}`,
  };
}
