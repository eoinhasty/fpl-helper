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
  compact,
}: {
  gw?: number;
  deadlineISO?: string | null;
  teamValue?: number | null;
  teamBank?: number | null;
  activeChip?: string | null;
  cache: CacheMeta;
  isLive?: boolean;
  isSwitching?: boolean;
  /** Drop Value/Bank/chip — just the badge, countdown, and cache indicator.
   * Used on mobile where the full row doesn't fit without squeezing; the
   * dropped stats render via StatText in SquadDashboard's mobile header
   * row instead (see contentHeader in pages/SquadDashboard.tsx). */
  compact?: boolean;
}) {
  const { text, ended } = useCountdown(deadlineISO);

  return (
    <div
      className="flex max-w-full items-center gap-2.5 overflow-x-auto text-sm whitespace-nowrap [&::-webkit-scrollbar]:hidden"
      style={{ scrollbarWidth: "none" }}
      // Scrollbar is hidden for visual cleanliness, so tabIndex is the only
      // remaining affordance that a keyboard user can reach and scroll this
      // strip when it overflows (native browser behavior on a focused
      // scrollable element responds to arrow keys).
      tabIndex={0}
    >
      {isLive ? (
        <span className="badge flex shrink-0 items-center gap-1.5 border border-success/30 bg-success/15 text-success">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
          LIVE
        </span>
      ) : (
        <span className="badge shrink-0 border-0 bg-primary text-primary-foreground">GW {gw ?? "—"}</span>
      )}
      <span className={ended ? "font-medium text-destructive" : "text-muted-foreground"}>{text}</span>
      {!compact && (
        <>
          <span className="h-4 w-px shrink-0 bg-border" />
          <span className="text-muted-foreground">
            Value <span className="font-semibold text-foreground">{money(teamValue)}</span>
          </span>
          <span className="h-4 w-px shrink-0 bg-border" />
          <span className="text-muted-foreground">
            Bank <span className="font-semibold text-foreground">{money(teamBank)}</span>
          </span>
          {activeChip && (
            <>
              <span className="h-4 w-px shrink-0 bg-border" />
              <span className="badge pill-warn shrink-0 font-semibold uppercase">{activeChip.replace(/_/g, " ")}</span>
            </>
          )}
        </>
      )}
      {cache?.status !== null && (
        <div className="flex items-center gap-2.5">
          <span className="h-4 w-px shrink-0 bg-border" />
          <CacheIndicators status={cache.status} ageSeconds={cache.ageSeconds} isSwitching={isSwitching} />
        </div>
      )}
    </div>
  );
}
