// lib/utils.ts
import type { Player } from "./types";

export const isStarting = (p: Player): boolean => (p.multiplier ?? 0) > 0 || (p.slot ?? 99) <= 11;

export const pctColor = (p: number) =>
  p >= 0.75 ? "bg-accent" : p >= 0.60 ? "bg-warn" : "bg-danger";

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

export const statusClass = (s: string | undefined) =>
    s === "a" ? "bg-[#e6ffed] text-[#0f5132] border border-[#b8e7c9]" :
    s === "d" ? "bg-[#fff4e5] text-[#7c3e00] border border-[#ffe1a9]" :
    s === "i" ? "bg-[#fff1f1] text-[#7f1d1d] border border-[#ffc4c4]" :
    s === "s" ? "bg-[#f3f4f6] text-[#374151] border border-[#d1d5db]" :
    s === "n" ? "bg-[#f3f4f6] text-[#374151] border border-[#d1d5db]" :
    "bg-gray-200 text-gray-600 border border-gray-300";

export function statusToText(s: string | undefined) {
  switch ((s || "").toLowerCase()) {
    case "a": return "Available";
    case "d": return "Doubtful";
    case "i": return "Injured";
    case "s": return "Suspended";
    case "n": return "Not in squad";
    default:  return "Unknown";
  }
}
