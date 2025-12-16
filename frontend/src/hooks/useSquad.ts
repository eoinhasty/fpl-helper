// hooks/useSquad.ts
import { useEffect, useRef, useState } from "react";
import type { SquadResponse } from "../lib/types";
import { getSquad, getLive, type CacheMeta } from "../lib/api";

type LoadSquadOpts = { gw?: number; forceRefresh?: boolean };

export function useSquad(entry: number | "") {
  const [data, setData] = useState<SquadResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cache, setCache] = useState<CacheMeta>({ status: null, ageSeconds: null });

  // avoid race conditions when switching fast
  const reqId = useRef(0);

  async function loadSquad(opts: LoadSquadOpts = {}) {
    if (!entry) return;
    const id = ++reqId.current;
    const { gw, forceRefresh } = opts;
    try {
      setLoading(true); setError(null);
      const res = await getSquad(String(entry), { gw, forceRefresh });
      if (id !== reqId.current) return; // stale response
      setData(res.data as SquadResponse); setCache(res.cache);
    } catch {
      if (id !== reqId.current) return;
      setError("Failed to load squad");
    } finally { if (id === reqId.current) setLoading(false); }
  }

  async function loadLive(forceRefresh = false) {
    if (!entry) return;
    const id = ++reqId.current;
    try {
      setLoading(true); setError(null);
      const res = await getLive(Number(entry), { forceRefresh });
      if (id !== reqId.current) return;
      setData(res.data as SquadResponse); setCache(res.cache);
    } catch {
      if (id !== reqId.current) return;
      setError("Failed to load live squad");
    } finally { if (id === reqId.current) setLoading(false); }
  }

  useEffect(() => { if (entry !== "") loadSquad(); }, [entry]);

  return { data, loading, error, cache, loadSquad, loadLive };
}