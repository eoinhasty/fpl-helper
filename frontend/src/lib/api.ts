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

/** A failed API request: `status` for code that branches on it, `message` for display */
export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** The error a non-2xx response becomes. The backend's own `detail` is written
 * for users ("FPL entry 123 not found. Check your team ID."), so it's shown
 * as-is; rate limits and server errors get generic copy instead. */
export async function apiError(r: Response): Promise<ApiError> {
  let detail: string | null = null;
  try {
    const body = await r.json();
    if (typeof body?.detail === "string") detail = body.detail;
  } catch {
    // not JSON (a proxy's error page, an empty body)
  }
  const s = r.status;
  const message =
    s === 429
      ? "Too many requests — try again in a minute."
      : s >= 500
        ? (s === 502 && detail) || `FPL Helper's server couldn't load this — try again shortly (${s}).`
        : detail ?? `Couldn't load this (${s}).`;
  return new ApiError(s, message);
}

export const isUnauthorized = (e: unknown) => e instanceof ApiError && e.status === 401;

// fetch JSON, throw an ApiError on non-2xx
async function fetchJSON<T>(url: string, init?: RequestInit): Promise<{ json: T; resp: Response }> {
  const r = await fetch(url, init);
  if (!r.ok) throw await apiError(r);
  return { json: await r.json(), resp: r };
}

export const apiBase = API_BASE;

export function baseHeaders(): Record<string, string> {
  return API_SECRET ? { "X-Api-Key": API_SECRET } : {};
}

const TOKEN_KEY = "fpl_token";

export function tokenHeaders(): Record<string, string> {
  const token = typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
  return token ? { ...baseHeaders(), "X-Fpl-Token": token } : baseHeaders();
}

export function isAuthenticated(): boolean {
  return typeof window !== "undefined" && Boolean(localStorage.getItem(TOKEN_KEY));
}

export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY);
  // Also clear any legacy refresh token that may be in localStorage from older versions
  localStorage.removeItem("fpl_refresh_token");
  // Fire-and-forget: clear the HttpOnly refresh cookie server-side
  fetch(new URL("/api/auth/logout", ORIGIN).toString(), {
    method: "POST",
    headers: baseHeaders(),
    credentials: "include",
  }).catch(() => {});
}

export async function fplLogin(email: string, password: string): Promise<void> {
  const { json } = await fetchJSON<{ access_token: string }>(
    new URL("/api/auth/login", ORIGIN).toString(),
    {
      method: "POST",
      headers: { ...baseHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      credentials: "include",
    }
  );
  localStorage.setItem(TOKEN_KEY, `Bearer ${json.access_token}`);
}

// One refresh at a time: several cards can find the token expired on the same
// load, and a second refresh racing the first could present a refresh cookie
// the first one already rotated — failing, and logging the user out.
let refreshing: Promise<boolean> | null = null;

/** Swap the refresh cookie for a new access token; false (and logged out) if it's expired too */
export function tryRefresh(): Promise<boolean> {
  refreshing ??= doRefresh().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

async function doRefresh(): Promise<boolean> {
  try {
    // Refresh token is an HttpOnly cookie — browser sends it automatically with credentials: "include"
    const { json } = await fetchJSON<{ access_token: string }>(
      new URL("/api/auth/refresh", ORIGIN).toString(),
      {
        method: "POST",
        headers: baseHeaders(),
        credentials: "include",
      }
    );
    localStorage.setItem(TOKEN_KEY, `Bearer ${json.access_token}`);
    return true;
  } catch {
    clearAuth();
    return false;
  }
}

export async function getLive(entry: number, opts?: { forceRefresh?: boolean }): Promise<ApiResult<SquadResponse>> {
  const u = new URL(`/api/live/${entry}`, ORIGIN);
  if (opts?.forceRefresh) u.searchParams.set("noCache", "1");

  // tokenHeaders() is read per attempt so the retry picks up the refreshed token
  const attempt = async (): Promise<ApiResult<SquadResponse>> => {
    const { json, resp } = await fetchJSON<SquadResponse>(u.toString(), { headers: tokenHeaders() });
    return { data: json, cache: cacheFrom(resp) };
  };

  // Logged out: the request could only 401 (the access token and refresh
  // cookie are set at login and cleared together), so go straight to the login form
  if (!isAuthenticated()) throw new Error("AUTH_EXPIRED");

  try {
    return await attempt();
  } catch (e: unknown) {
    if (!isUnauthorized(e)) throw e;
    if (await tryRefresh()) {
      try {
        return await attempt();
      } catch (retryErr: unknown) {
        // Refresh succeeded but FPL still rejects the new token — same outcome
        // as an expired session, so route it to the re-login flow too.
        if (isUnauthorized(retryErr)) throw new Error("AUTH_EXPIRED", { cause: retryErr });
        throw retryErr;
      }
    }
    throw new Error("AUTH_EXPIRED", { cause: e });
  }
}

export async function getSquad(entry: number, opts?: { gw?: number; forceRefresh?: boolean }): Promise<ApiResult<SquadResponse>> {
  const u = new URL(`/api/squad/${entry}`, ORIGIN);
  if (opts?.gw != null) u.searchParams.set("gw", String(opts.gw));
  if (opts?.forceRefresh) u.searchParams.set("noCache", "1");

  const { json, resp } = await fetchJSON<SquadResponse>(u.toString(), { headers: baseHeaders() });
  return { data: json, cache: cacheFrom(resp) };
}
