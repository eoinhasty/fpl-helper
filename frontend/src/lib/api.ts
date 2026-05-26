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
const API_SECRET = (import.meta.env.VITE_API_SECRET as string | undefined) ?? "";

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

function baseHeaders(): Record<string, string> {
  return API_SECRET ? { "X-Api-Key": API_SECRET } : {};
}

const TOKEN_KEY = "fpl_token";
const REFRESH_KEY = "fpl_refresh_token";

function tokenHeaders(): Record<string, string> {
  const token = typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
  return token ? { ...baseHeaders(), "X-Fpl-Token": token } : baseHeaders();
}

export function isAuthenticated(): boolean {
  return typeof window !== "undefined" && Boolean(localStorage.getItem(TOKEN_KEY));
}

export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

export async function fplLogin(email: string, password: string): Promise<void> {
  const { json } = await fetchJSON<{ access_token: string; refresh_token: string }>(
    new URL("/api/auth/login", ORIGIN).toString(),
    {
      method: "POST",
      headers: { ...baseHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    }
  );
  localStorage.setItem(TOKEN_KEY, `Bearer ${json.access_token}`);
  localStorage.setItem(REFRESH_KEY, json.refresh_token);
}

async function tryRefresh(): Promise<boolean> {
  const refreshToken = typeof window !== "undefined" ? localStorage.getItem(REFRESH_KEY) : null;
  if (!refreshToken) return false;
  try {
    const { json } = await fetchJSON<{ access_token: string; refresh_token: string }>(
      new URL("/api/auth/refresh", ORIGIN).toString(),
      {
        method: "POST",
        headers: { ...baseHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      }
    );
    localStorage.setItem(TOKEN_KEY, `Bearer ${json.access_token}`);
    localStorage.setItem(REFRESH_KEY, json.refresh_token);
    return true;
  } catch {
    clearAuth();
    return false;
  }
}

export async function getLive(entry: number, opts?: { forceRefresh?: boolean }): Promise<ApiResult<SquadResponse>> {
  const u = new URL(`/api/live/${entry}`, ORIGIN);
  if (opts?.forceRefresh) u.searchParams.set("noCache", "1");

  try {
    const { json, resp } = await fetchJSON<SquadResponse>(u.toString(), { headers: tokenHeaders() });
    return { data: json, cache: cacheFrom(resp) };
  } catch (e: any) {
    if (e?.message?.startsWith("401") && await tryRefresh()) {
      const { json, resp } = await fetchJSON<SquadResponse>(u.toString(), { headers: tokenHeaders() });
      return { data: json, cache: cacheFrom(resp) };
    }
    if (e?.message?.startsWith("401")) {
      throw new Error("AUTH_EXPIRED");
    }
    throw e;
  }
}

export async function getSquad(entry: string, opts?: { gw?: number; forceRefresh?: boolean }): Promise<ApiResult<SquadResponse>> {
  const u = new URL(`/api/squad/${entry}`, ORIGIN);
  if (opts?.gw != null) u.searchParams.set("gw", String(opts.gw));
  if (opts?.forceRefresh) u.searchParams.set("noCache", "1");

  const { json, resp } = await fetchJSON<SquadResponse>(u.toString(), { headers: baseHeaders() });
  return { data: json, cache: cacheFrom(resp) };
}
