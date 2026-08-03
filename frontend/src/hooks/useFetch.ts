// hooks/useFetch.ts
import * as React from "react";
import { apiBase, baseHeaders, tokenHeaders } from "../lib/api";

export function useFetch<T>(url?: string | null, opts?: { auth?: boolean }) {
  const prefixedUrl = url ? `${apiBase}${url}` : url;
  const auth = opts?.auth ?? false;

  const [data, setData] = React.useState<T | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!prefixedUrl) return;
    const ac = new AbortController();
    (async () => {
      try {
        setLoading(true); setError(null); setData(null);
        const headers = auth ? tokenHeaders() : baseHeaders();
        const r = await fetch(prefixedUrl, { signal: ac.signal, headers });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        setData(await r.json());
      } catch (e: unknown) {
        if ((e as Error)?.name !== "AbortError") setError((e as Error)?.message ?? "Failed");
      } finally {
        setLoading(false);
      }
    })();
    return () => ac.abort();
  }, [prefixedUrl, auth]);

  return { data, loading, error };
}
