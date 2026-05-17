// lib/utils.ts
import type { Player } from "./types";

export const isStarting = (p: Player): boolean => (p.multiplier ?? 0) > 0 || (p.slot ?? 99) <= 11;

export const pctColor = (p: number) =>
  p >= 0.75 ? "bg-accent" : p >= 0.60 ? "bg-warn" : "bg-danger";

export const fdrClass = (d?: number) =>
  d===2 ? "bg-[#e8f7ee] text-[#0f5132] border border-[#b8e7c9]" :
  d===3 ? "bg-[#eef2ff] text-[#1e3a8a] border border-[#dbe2ff]" :
  d===4 ? "bg-[#fff7e6] text-[#7c3e00] border border-[#ffe1a9]" :
  d===5 ? "bg-[#ffe5e5] text-[#7f1d1d] border border-[#ffc4c4]" : "";

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
