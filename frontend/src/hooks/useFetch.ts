// hooks/useFetch.ts
import * as React from "react";
import { apiBase, baseHeaders, tokenHeaders } from "../lib/api";

type Settled<T> = { key: string; data: T | null; error: string | null };

export function useFetch<T>(url?: string | null, opts?: { auth?: boolean }) {
  const prefixedUrl = url ? `${apiBase}${url}` : null;
  const auth = opts?.auth ?? false;
  const key = prefixedUrl ? `${auth ? "auth" : "anon"}:${prefixedUrl}` : null;

  // The result is stored with the request it belongs to, and `loading` is
  // derived from that: the current request is loading until a result for
  // *its* key lands. Keeping a separate loading flag let the first render
  // (before the effect ran) and an aborted request's cleanup both report
  // "not loading, no data", which flashed every card's empty state.
  const [settled, setSettled] = React.useState<Settled<T> | null>(null);

  React.useEffect(() => {
    if (!prefixedUrl || !key) return;
    const ac = new AbortController();
    (async () => {
      try {
        const headers = auth ? tokenHeaders() : baseHeaders();
        const r = await fetch(prefixedUrl, { signal: ac.signal, headers });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = (await r.json()) as T;
        setSettled({ key, data, error: null });
      } catch (e: unknown) {
        if ((e as Error)?.name === "AbortError") return;
        setSettled({ key, data: null, error: (e as Error)?.message ?? "Failed" });
      }
    })();
    return () => ac.abort();
  }, [prefixedUrl, key, auth]);

  const current = key !== null && settled?.key === key ? settled : null;
  return {
    data: current?.data ?? null,
    loading: key !== null && current === null,
    error: current?.error ?? null,
  };
}
