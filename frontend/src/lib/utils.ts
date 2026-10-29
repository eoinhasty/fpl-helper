// lib/utils.ts
import type { Player } from "./types";

export const isStarting = (p: Player): boolean => (p.multiplier ?? 0) > 0 || (p.slot ?? 99) <= 11;

export type Tone = "success" | "warning" | "destructive";

/** Class strings per tone — written out in full so Tailwind can see them. */
export const TONE_CLASS: Record<Tone, { text: string; bg: string; fill: string; soft: string }> = {
  success:     { text: "text-success",     bg: "bg-success",     fill: "fill-success",     soft: "bg-success/8 border-success/30" },
  warning:     { text: "text-warning",     bg: "bg-warning",     fill: "fill-warning",     soft: "bg-warning/8 border-warning/30" },
  destructive: { text: "text-destructive", bg: "bg-destructive", fill: "fill-destructive", soft: "bg-destructive/8 border-destructive/30" },
};

/** Start probability (0–1) → tone. Single source for every start-% colour. */
export const startProbTone = (p: number): Tone =>
  p >= 0.7 ? "success" : p >= 0.4 ? "warning" : "destructive";

/** FPL status → tone, matching FPL's own flags: doubtful amber; injured,
 * suspended, not available and left-the-club red. Single source for every
 * status colour. */
export const statusTone = (s: string | undefined): Tone =>
  !s || s === "a" ? "success" : s === "d" ? "warning" : "destructive";

export const fdrClass = (d?: number) =>
  d===1 ? "bg-fdr-good/20 text-fdr-good font-semibold" :
  d===2 ? "bg-fdr-good/8 text-muted-foreground" :
  d===3 ? "text-muted-foreground" :
  d===4 ? "bg-destructive/8 text-muted-foreground" :
  d===5 ? "bg-destructive/20 text-destructive font-semibold" : "";

/** Same FDR scale as fdrClass, as a solid dot color — for small indicators where
 * fdrClass's alpha-tinted pill backgrounds would be too faint to read. */
export const fdrDotClass = (d?: number) =>
  d===1 ? "bg-fdr-good" :
  d===2 ? "bg-fdr-good/60" :
  d===3 ? "bg-muted-foreground/40" :
  d===4 ? "bg-destructive/60" :
  d===5 ? "bg-destructive" : "bg-muted-foreground/20";

/** Captaincy/transfer fixture multiplier for an average FDR (fractional for a
 * DGW). Mirrors FDR_FACTOR in backend service.py — change both together. */
const FDR_FACTOR = [1.0, 0.95, 0.9, 0.8, 0.6];
export function fdrFactor(avgFdr: number) {
  const lo = Math.max(1, Math.min(4, Math.floor(avgFdr)));
  const t = Math.min(Math.max(avgFdr - lo, 0), 1);
  return FDR_FACTOR[lo - 1] + (FDR_FACTOR[lo] - FDR_FACTOR[lo - 1]) * t;
}

export function statusToText(s: string | undefined) {
  switch ((s || "").toLowerCase()) {
    case "a": return "Available";
    case "d": return "Doubtful";
    case "i": return "Injured";
    case "s": return "Suspended";
    case "n": return "Not in squad";
    case "u": return "Left club";
    default:  return "Unknown";
  }
}
