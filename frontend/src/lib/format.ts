// lib/format.ts
export const num = (n: number | null | undefined) => n == null ? "—" : n.toLocaleString("en-GB");
export const money = (n?: number | null) => n == null ? "—" : `£${(n / 10).toFixed(1)}m`;
export const fmtKickoff = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "TBD";
export const fmtPrice = (p10?: number) =>
  p10 == null ? "£-" : `£${(p10/10).toFixed(1)}`;
export const delta = (curr: number | null, prev: number | null) => {
  if (curr == null || prev == null) return null;
  const d = prev - curr;
  if (d === 0) return "±0";
  const sign = d > 0 ? "▲" : "▼";
  return `${sign} ${Math.abs(d)}`;
};
export const pct = (p?: number | null) =>
  p == null ? "—" : `${Math.round(p * 100)}%`;

export function fmtRelTime(iso: string | null | undefined): string {
  if (!iso) return "recently";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return mins <= 1 ? "just now" : `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}