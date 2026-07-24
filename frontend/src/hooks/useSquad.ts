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

  // Separate counters per mode — loadSquad and loadLive can be in flight at
  // the same time (e.g. rapid mode switching), and a shared counter would let
  // one silently cancel the other.
  const squadReqId = useRef(0);
  const liveReqId = useRef(0);

  const _load = useCallback(async (
    reqIdRef: React.MutableRefObject<number>,
    fetcher: () => Promise<{ data: SquadResponse; cache: CacheMeta }>,
    fallbackMsg: string,
    onError?: (msg: string) => void,
  ) => {
    const id = ++reqIdRef.current;
    try {
      setLoading(true); setError(null);
      const res = await fetcher();
      if (id !== reqIdRef.current) return; // stale response
      setData(res.data); setCache(res.cache);
      if (res.data.season_status) setSeasonStatus(res.data.season_status);
    } catch (e: unknown) {
      if (id !== reqIdRef.current) return;
      const msg = (e as Error)?.message ?? fallbackMsg;
      onError?.(msg);
      setError(msg);
    } finally { if (id === reqIdRef.current) setLoading(false); }
  }, []);

  const loadSquad = useCallback((opts: LoadSquadOpts = {}) => {
    if (!entry) return;
    const { gw, forceRefresh } = opts;
    return _load(squadReqId, () => getSquad(String(entry), { gw, forceRefresh }), "Failed to load squad");
  }, [entry, _load]);

  const loadLive = useCallback((forceRefresh = false) => {
    if (!entry) return;
    return _load(liveReqId, () => getLive(Number(entry), { forceRefresh }), "Failed to load live squad", (msg) => {
      if (msg === "AUTH_EXPIRED") clearAuth();
    });
  }, [entry, _load]);

  // Drop stale cross-mode data (e.g. a "pre_season" squad snapshot lingering
  // after switching to Live) so mode-dependent UI doesn't render off it.
  const clearData = useCallback(() => {
    squadReqId.current++; // invalidate any in-flight request from the previous mode
    liveReqId.current++;
    setData(null);
    setError(null);
    setCache({ status: null, ageSeconds: null });
  }, []);

  return { data, loading, error, cache, seasonStatus, loadSquad, loadLive, clearData };
}