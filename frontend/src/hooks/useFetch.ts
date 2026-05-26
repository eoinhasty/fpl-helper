// hooks/useFetch.ts
import * as React from "react";
import { apiBase, baseHeaders } from "../lib/api";

export function useFetch<T>(url?: string | null) {
  const prefixedUrl = url ? `${apiBase}${url}` : url;

  const [data, setData] = React.useState<T | null>(null);
  const [loading, setLoading] = React.useState(Boolean(url));
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!prefixedUrl) return;
    const ac = new AbortController();
    (async () => {
      try {
        setLoading(true); setError(null);
        const headers = baseHeaders();
        const r = await fetch(prefixedUrl, { signal: ac.signal, headers });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        setData(await r.json());
      } catch (e: any) {
        if (e?.name !== "AbortError") setError(e?.message ?? "Failed");
      } finally {
        setLoading(false);
      }
    })();
    return () => ac.abort();
  }, [prefixedUrl]);

  return { data, loading, error };
}
