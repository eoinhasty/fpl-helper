// hooks/useSquad.ts
import { useCallback, useEffect, useRef, useState } from "react";
import type { SquadResponse } from "../lib/types";
import { getSquad, getLive, clearAuth, type CacheMeta } from "../lib/api";

type LoadSquadOpts = { gw?: number; forceRefresh?: boolean };
type Fetcher = () => Promise<{ data: SquadResponse; cache: CacheMeta }>;
type Timer = ReturnType<typeof setTimeout>;

const STALE_REFRESH_DELAY_MS = 4000;

function clearTimer(ref: React.MutableRefObject<Timer | null>) {
  if (ref.current) { clearTimeout(ref.current); ref.current = null; }
}

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

  // Backend serves stale-serve data instantly and revalidates in the
  // background (usually <1s) — these track the poll-until-resolved fetch per
  // mode so the "Refreshing…" badge doesn't stay stuck.
  const squadStaleTimer = useRef<Timer | null>(null);
  const liveStaleTimer = useRef<Timer | null>(null);

  // True between clearData() (a mode switch) and the next load settling —
  // suppresses the "Refreshing…" badge so leftover stale-serve state from
  // the mode just left doesn't render mislabeled on the mode just entered.
  const [isSwitching, setIsSwitching] = useState(false);

  // Quietly re-fetch after a stale-serve response, without touching loading/error
  // state — this is an opportunistic background poll, not a user-initiated load.
  // Keeps rescheduling itself as long as the backend keeps reporting stale-serve
  // (e.g. its own background revalidation is still in flight), so the badge
  // can't get stuck after a single retry.
  const _pollIfStale = useCallback((
    reqIdRef: React.MutableRefObject<number>,
    fetcher: Fetcher,
    staleTimerRef: React.MutableRefObject<Timer | null>,
    id: number,
  ) => {
    staleTimerRef.current = setTimeout(async () => {
      staleTimerRef.current = null;
      if (id !== reqIdRef.current) return; // superseded by a real load meanwhile
      try {
        const res = await fetcher();
        if (id !== reqIdRef.current) return;
        setData(res.data); setCache(res.cache);
        if (res.data.season_status) setSeasonStatus(res.data.season_status);
        if (res.cache.status === "stale-serve") {
          _pollIfStale(reqIdRef, fetcher, staleTimerRef, id);
        }
      } catch {
        // opportunistic refresh; a real load will surface any persistent error
      }
    }, STALE_REFRESH_DELAY_MS);
  }, []);

  const _load = useCallback(async (
    reqIdRef: React.MutableRefObject<number>,
    fetcher: Fetcher,
    fallbackMsg: string,
    staleTimerRef: React.MutableRefObject<Timer | null>,
    onError?: (msg: string) => void,
  ) => {
    clearTimer(staleTimerRef);
    const id = ++reqIdRef.current;
    try {
      setLoading(true); setError(null);
      const res = await fetcher();
      if (id !== reqIdRef.current) return; // stale response
      setData(res.data); setCache(res.cache);
      if (res.data.season_status) setSeasonStatus(res.data.season_status);
      if (res.cache.status === "stale-serve") {
        _pollIfStale(reqIdRef, fetcher, staleTimerRef, id);
      }
    } catch (e: unknown) {
      if (id !== reqIdRef.current) return;
      const msg = (e as Error)?.message ?? fallbackMsg;
      onError?.(msg);
      setError(msg);
    } finally {
      if (id === reqIdRef.current) { setLoading(false); setIsSwitching(false); }
    }
  }, [_pollIfStale]);

  const loadSquad = useCallback((opts: LoadSquadOpts = {}) => {
    if (!entry) return;
    const { gw, forceRefresh } = opts;
    return _load(squadReqId, () => getSquad(String(entry), { gw, forceRefresh }), "Failed to load squad", squadStaleTimer);
  }, [entry, _load]);

  const loadLive = useCallback((forceRefresh = false) => {
    if (!entry) return;
    return _load(liveReqId, () => getLive(Number(entry), { forceRefresh }), "Failed to load live squad", liveStaleTimer, (msg) => {
      if (msg === "AUTH_EXPIRED") clearAuth();
    });
  }, [entry, _load]);

  // Drop stale cross-mode data (e.g. a "pre_season" squad snapshot lingering
  // after switching to Live) so mode-dependent UI doesn't render off it. Cache
  // meta is deliberately left alone — it's not part of that correctness
  // concern, and nulling it just makes CacheIndicators flicker off and back
  // on every switch; the upcoming fetch's setCache() replaces it a moment later.
  const clearData = useCallback(() => {
    squadReqId.current++; // invalidate any in-flight request from the previous mode
    liveReqId.current++;
    clearTimer(squadStaleTimer);
    clearTimer(liveStaleTimer);
    setIsSwitching(true);
    setData(null);
    setError(null);
  }, []);

  useEffect(() => () => {
    clearTimer(squadStaleTimer);
    clearTimer(liveStaleTimer);
  }, []);

  return { data, loading, error, cache, seasonStatus, isSwitching, loadSquad, loadLive, clearData };
}