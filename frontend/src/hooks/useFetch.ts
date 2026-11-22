// hooks/useFetch.ts
import * as React from "react";
import { apiBase, apiError, baseHeaders, tokenHeaders, tryRefresh } from "../lib/api";

type Settled<T> = { key: string; data: T | null; error: string | null };

export function useFetch<T>(url?: string | null, opts?: { auth?: boolean; refreshMs?: number }) {
  const prefixedUrl = url ? `${apiBase}${url}` : null;
  const auth = opts?.auth ?? false;
  const key = prefixedUrl ? `${auth ? "auth" : "anon"}:${prefixedUrl}` : null;

  // The result is stored with the request it belongs to, and `loading` is
  // derived from that: the current request is loading until a result for
  // *its* key lands. Keeping a separate loading flag let the first render
  // (before the effect ran) and an aborted request's cleanup both report
  // "not loading, no data", which flashed every card's empty state.
  const [settled, setSettled] = React.useState<Settled<T> | null>(null);

  // `refreshMs` refetches the same request in the background while the tab is
  // visible. The key doesn't change, so the shown data stays put (no loading
  // state), and a failed refresh keeps it rather than swapping in the error.
  const refreshMs = opts?.refreshMs;
  const [tick, setTick] = React.useState(0);
  React.useEffect(() => {
    if (!key || !refreshMs) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") setTick((t) => t + 1);
    }, refreshMs);
    return () => window.clearInterval(id);
  }, [key, refreshMs]);

  React.useEffect(() => {
    if (!prefixedUrl || !key) return;
    const ac = new AbortController();
    (async () => {
      try {
        const get = () => fetch(prefixedUrl, { signal: ac.signal, headers: auth ? tokenHeaders() : baseHeaders() });
        let r = await get();
        // The backend answered without the token (from public data) because
        // it had expired: refresh it and fetch again for the logged-in data
        if (auth && r.headers.get("x-fpl-token-rejected") === "expired" && (await tryRefresh())) r = await get();
        if (!r.ok) throw await apiError(r);
        const data = (await r.json()) as T;
        setSettled({ key, data, error: null });
      } catch (e: unknown) {
        if ((e as Error)?.name === "AbortError") return;
        const error = (e as Error)?.message ?? "Failed";
        setSettled((prev) => (prev?.key === key && prev.data != null ? prev : { key, data: null, error }));
      }
    })();
    return () => ac.abort();
  }, [prefixedUrl, key, auth, tick]);

  const current = key !== null && settled?.key === key ? settled : null;
  return {
    data: current?.data ?? null,
    loading: key !== null && current === null,
    error: current?.error ?? null,
  };
}
