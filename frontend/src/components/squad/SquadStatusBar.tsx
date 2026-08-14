import type { CacheMeta } from "../../lib/api";
import CacheIndicators from "../ui/CacheIndicators";
import { money } from "../../lib/format";
import { useCountdown } from "../../hooks/useCountdown";

export default function SquadStatusBar({
  gw,
  deadlineISO,
  teamValue,
  teamBank,
  cache,
  activeChip,
  isLive,
  isSwitching,
}: {
  gw?: number;
  deadlineISO?: string | null;
  teamValue?: number | null;
  teamBank?: number | null;
  activeChip?: string | null;
  cache: CacheMeta;
  isLive?: boolean;
  isSwitching?: boolean;
}) {
  const { text, ended } = useCountdown(deadlineISO);

  return (
    <div className="flex items-center gap-2.5 text-sm overflow-x-auto whitespace-nowrap max-w-full [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: "none" }}>
      {isLive ? (
        <span className="badge flex items-center gap-1.5 bg-success/15 text-success border border-success/30 shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
          LIVE
        </span>
      ) : (
        <span className="badge bg-primary text-primary-foreground border-0 shrink-0">
          GW {gw ?? "—"}
        </span>
      )}
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
        <div className="flex items-center gap-2.5">
          <span className="w-px h-4 bg-border shrink-0" />
          <CacheIndicators status={cache.status} ageSeconds={cache.ageSeconds} isSwitching={isSwitching} />
        </div>
      )}
    </div>
  );
}
