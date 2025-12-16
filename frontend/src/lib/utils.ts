// lib/utils.ts

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

export function teamShortToLong(t: string) {
  switch (t) {
    case "ARS": return "Arsenal";
    case "AVL": return "Aston Villa";
    case "BRE": return "Brentford";
    case "BHA": return "Brighton";
    case "BUR": return "Burnley";
    case "CHE": return "Chelsea";
    case "CRY": return "Crystal Palace";
    case "EVE": return "Everton";
    case "FUL": return "Fulham";
    case "LEE": return "Leeds";
    case "LEI": return "Leicester";
    case "LIV": return "Liverpool";
    case "MCI": return "Manchester City";
    case "MUN": return "Manchester United";
    case "NEW": return "Newcastle";
    case "NFO": return "Nottingham Forest";
    case "SOU": return "Southampton";
    case "TOT": return "Tottenham";
    case "WAT": return "Watford";
    case "WHU": return "West Ham";
    case "WOL": return "Wolves";
    default:    return t;
  }
}