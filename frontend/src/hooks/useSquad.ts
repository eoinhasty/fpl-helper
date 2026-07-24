// hooks/useSquad.ts
import { useCallback, useRef, useState } from "react";
import type { SquadResponse } from "../lib/types";
import { getSquad, getLive, clearAuth, type CacheMeta } from "../lib/api";

type LoadSquadOpts = { gw?: number; forceRefresh?: boolean };

export function useSquad(entry: number | "") {
  const [data, setData] = useState<SquadResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cache, setCache] = useState<CacheMeta>({ status: null, ageSeconds: null });
  // Season status is a global fact (from bootstrap), not per-mode — once learned
  // from either a squad or live fetch, it should survive clearData() so UI that
  // depends on it (e.g. LeaguesCard's pre-season caption) doesn't flicker off
  // just because the other mode's fetch failed (e.g. Live while unauthenticated).
  const [seasonStatus, setSeasonStatus] = useState<SquadResponse["season_status"] | null>(null);

  // avoid race conditions when switching fast
  const reqId = useRef(0);

  const loadSquad = useCallback(async (opts: LoadSquadOpts = {}) => {
    if (!entry) return;
    const id = ++reqId.current;
    const { gw, forceRefresh } = opts;
    try {
      setLoading(true); setError(null);
      const res = await getSquad(String(entry), { gw, forceRefresh });
      if (id !== reqId.current) return; // stale response
      setData(res.data as SquadResponse); setCache(res.cache);
      if (res.data.season_status) setSeasonStatus(res.data.season_status);
    } catch (e: unknown) {
      if (id !== reqId.current) return;
      setError((e as Error)?.message ?? "Failed to load squad");
    } finally { if (id === reqId.current) setLoading(false); }
  }, [entry]);

  const loadLive = useCallback(async (forceRefresh = false) => {
    if (!entry) return;
    const id = ++reqId.current;
    try {
      setLoading(true); setError(null);
      const res = await getLive(Number(entry), { forceRefresh });
      if (id !== reqId.current) return;
      setData(res.data as SquadResponse); setCache(res.cache);
      if (res.data.season_status) setSeasonStatus(res.data.season_status);
    } catch (e: unknown) {
      if (id !== reqId.current) return;
      const msg: string = (e as Error)?.message ?? "Failed to load live squad";
      if (msg === "AUTH_EXPIRED") clearAuth();
      setError(msg);
    } finally { if (id === reqId.current) setLoading(false); }
  }, [entry]);

  // Drop stale cross-mode data (e.g. a "pre_season" squad snapshot lingering
  // after switching to Live) so mode-dependent UI doesn't render off it.
  const clearData = useCallback(() => {
    reqId.current++; // invalidate any in-flight request from the previous mode
    setData(null);
    setError(null);
    setCache({ status: null, ageSeconds: null });
  }, []);

  return { data, loading, error, cache, seasonStatus, loadSquad, loadLive, clearData };
}