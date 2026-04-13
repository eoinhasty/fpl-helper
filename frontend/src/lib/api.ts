// lib/api.ts
import type { SquadResponse } from "./types";

export type CacheStatus = "hit" | "miss" | "stale-serve" | "bypass-refresh" | null;
export type CacheMeta = { status: CacheStatus; ageSeconds: number | null };
export type ApiResult<T> = { data: T; cache: CacheMeta };

// In production with separate frontend/backend hosts, set VITE_API_BASE_URL to
// the backend URL (e.g. "https://fpl-helper-api.railway.app").
// Leave unset when both are on the same origin (local dev uses Vite proxy).
const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "";
const ORIGIN = API_BASE || (typeof window !== "undefined" ? window.location.origin : "");

// pull cache status/age out of response headers
function cacheFrom(r: Response): CacheMeta {
  const status = (r.headers.get("x-cache-status") as CacheStatus) ?? null;
  const age = r.headers.get("x-cache-age");
  return { status, ageSeconds: age ? Number(age) : null };
}

// fetch JSON, throw on non-2xx with a readable message
async function fetchJSON<T>(url: string, init?: RequestInit): Promise<{ json: T; resp: Response }> {
  const r = await fetch(url, init);
  if (!r.ok) {
    // use server error body if there is one, otherwise fall back to status text
    let reason = r.statusText;
    try {
      const text = await r.text();
      if (text) reason = text.slice(0, 180);
    } catch {}
    throw new Error(`${r.status} ${reason}`.trim());
  }
  return { json: await r.json(), resp: r };
}

function tokenHeaders(): Record<string, string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("fpl_token") : null;
  return token ? { "X-Fpl-Token": token } : {};
}

export async function getLive(entry: number, opts?: { forceRefresh?: boolean }): Promise<ApiResult<SquadResponse>> {
  const u = new URL(`/api/live/${entry}`, ORIGIN);
  if (opts?.forceRefresh) u.searchParams.set("noCache", "1");

  const { json, resp } = await fetchJSON<SquadResponse>(u.toString(), { headers: tokenHeaders() });
  return { data: json, cache: cacheFrom(resp) };
}

export async function getSquad(entry: string, opts?: { gw?: number; forceRefresh?: boolean }): Promise<ApiResult<SquadResponse>> {
  const u = new URL(`/api/squad/${entry}`, ORIGIN);
  if (opts?.gw != null) u.searchParams.set("gw", String(opts.gw));
  if (opts?.forceRefresh) u.searchParams.set("noCache", "1");

  const { json, resp } = await fetchJSON<SquadResponse>(u.toString());
  return { data: json, cache: cacheFrom(resp) };
}
