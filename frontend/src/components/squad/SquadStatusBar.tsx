import * as React from "react";
import type { CacheMeta } from "../../lib/api";
import Card from "../ui/Card";
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
  onRefresh, // optional
}: {
  gw?: number;
  deadlineISO?: string | null;
  teamValue?: number | null;
  teamBank?: number | null;
  activeChip?: string | null;
  cache: CacheMeta;
  onRefresh?: () => void;
}) {
  const { text } = useCountdown(deadlineISO);

  return (
    <Card className="px-4 py-2">
      <div className="flex flex-wrap items-center gap-3 min-h-[56px]">
        {/* Left chunk — GW + deadline */}
        <div className="flex items-center gap-3 mr-4">
          <span className="badge bg-primary text-primary-foreground border-0">
            GW {gw ?? "—"}
          </span>
          <div className="text-sm text-foreground">
            Deadline:{" "}
            <span className="font-semibold">
              {deadlineISO ? new Date(deadlineISO).toLocaleString() : "—"}
            </span>
            <span className="mx-2 text-muted-foreground">•</span>
            <span className="font-medium">{text}</span>
          </div>
        </div>

        {/* Middle chunk — value/bank/chip */}
        <div className="flex items-center gap-2 text-sm">
          <span className="badge">Value</span>
          <span className="font-semibold ml-1">{money(teamValue)}</span>

          <span className="text-muted-foreground">Bank</span>
          <span className="font-semibold ml-1">{money(teamBank)}</span>

          {activeChip && (
            <span className="badge pill-warn uppercase font-semibold">
              {activeChip.replace(/_/g, " ")}
            </span>
          )}
        </div>

        {/* Right chunk — cache + refresh */}
        <div className="ml-auto flex items-center gap-3">
          {cache?.status !== null && (
            <div className="hidden md:block">
              <CacheIndicators status={cache.status} ageSeconds={cache.ageSeconds} />
            </div>
          )}
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="btn"
              title="Force fresh fetch"
            >
              Refresh
            </button>
          )}
        </div>
      </div>
    </Card>
  );
}
