import * as React from "react";
import type { CacheMeta } from "../../lib/api";
import CacheIndicators from "../ui/CacheIndicators";
import { money } from "../../lib/format";

function useCountdown(deadlineISO?: string | null) {
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

export default function SquadStatusBar({
  gw,
  deadlineISO,
  teamValue,
  teamBank,
  cache,
  activeChip,
}: {
  gw?: number;
  deadlineISO?: string | null;
  teamValue?: number | null;
  teamBank?: number | null;
  activeChip?: string | null;
  cache: CacheMeta;
}) {
  const { text, ended } = useCountdown(deadlineISO);

  return (
    <div className="flex items-center gap-2.5 text-sm">
      <span className="badge bg-primary text-primary-foreground border-0 shrink-0">
        GW {gw ?? "—"}
      </span>
      <span className={ended ? "text-destructive font-medium" : "text-muted-foreground"}>
        {text}
      </span>
      <span className="w-px h-4 bg-border shrink-0" />
      <span className="text-muted-foreground">
        Value <span className="font-semibold text-foreground">{money(teamValue)}</span>
      </span>
      <span className="w-px h-4 bg-border shrink-0" />
      <span className="text-muted-foreground">
        Bank <span className="font-semibold text-foreground">{money(teamBank)}</span>
      </span>
      {activeChip && (
        <>
          <span className="w-px h-4 bg-border shrink-0" />
          <span className="badge pill-warn uppercase font-semibold shrink-0">
            {activeChip.replace(/_/g, " ")}
          </span>
        </>
      )}
      {cache?.status !== null && (
        <div className="hidden xl:flex items-center gap-2.5">
          <span className="w-px h-4 bg-border shrink-0" />
          <CacheIndicators status={cache.status} ageSeconds={cache.ageSeconds} />
        </div>
      )}
    </div>
  );
}
