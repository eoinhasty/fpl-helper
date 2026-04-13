// hooks/useFetch.ts
import * as React from "react";

const _apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "";

export function useFetch<T>(url?: string | null) {
  const prefixedUrl = url ? `${_apiBase}${url}` : url;

  const [data, setData] = React.useState<T | null>(null);
  const [loading, setLoading] = React.useState(Boolean(url));
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!prefixedUrl) return;
    const ac = new AbortController();
    (async () => {
      try {
        setLoading(true); setError(null);
        const r = await fetch(prefixedUrl, { signal: ac.signal });
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
