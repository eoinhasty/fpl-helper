import { useEffect, useState } from "react";
import { apiBase, baseHeaders } from "../lib/api";

export function useBackendWakeup() {
  const [waking, setWaking] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;

    const ping = async () => {
      timer = setTimeout(() => {
        if (!cancelled) setWaking(true);
      }, 1500);

      try {
        await fetch(`${apiBase}/api/health`, { headers: baseHeaders() });
      } catch {}

      clearTimeout(timer);
      if (!cancelled) {
        setWaking(false);
        setDone(true);
      }
    };

    ping();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  return { waking, done };
}
