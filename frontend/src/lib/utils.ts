// lib/utils.ts
import type { Player } from "./types";

export const isStarting = (p: Player): boolean => (p.multiplier ?? 0) > 0 || (p.slot ?? 99) <= 11;

export const pctColor = (p: number) =>
  p >= 0.75 ? "bg-accent" : p >= 0.60 ? "bg-warn" : "bg-danger";

export const fdrClass = (d?: number) =>
  d===1 ? "bg-emerald-100 text-emerald-800 border border-emerald-300" :
  d===2 ? "bg-green-100 text-green-800 border border-green-300" :
  d===3 ? "bg-slate-100 text-slate-600 border border-slate-300" :
  d===4 ? "bg-amber-100 text-amber-800 border border-amber-300" :
  d===5 ? "bg-red-100 text-red-800 border border-red-300" : "";

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
