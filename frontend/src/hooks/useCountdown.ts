import * as React from "react";

export function useCountdown(deadlineISO?: string | null) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!deadlineISO) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [deadlineISO]);

  if (!deadlineISO) return { text: "—", ended: false };
  const t = new Date(deadlineISO).getTime() - now;
  const ended = t <= 0;
  const abs = Math.max(0, t);
  const d = Math.floor(abs / 86400000);
  const h = Math.floor((abs % 86400000) / 3600000);
  const m = Math.floor((abs % 3600000) / 60000);
  const s = Math.floor((abs % 60000) / 1000);
  const text = ended
    ? "Deadline passed"
    : `${d}d ${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m ${String(
        s
      ).padStart(2, "0")}s`;
  return { text, ended };
}
