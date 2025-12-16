// hooks/useFetch.ts
import * as React from "react";

export function useFetch<T>(url?: string | null) {
  const [data, setData] = React.useState<T | null>(null);
  const [loading, setLoading] = React.useState(Boolean(url));
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!url) return;
    const ac = new AbortController();
    (async () => {
      try {
        setLoading(true); setError(null);
        const r = await fetch(url, { signal: ac.signal });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        setData(await r.json());
      } catch (e: any) {
        if (e?.name !== "AbortError") setError(e?.message ?? "Failed");
      } finally {
        setLoading(false);
      }
    })();
    return () => ac.abort();
  }, [url]);

  return { data, loading, error };
}