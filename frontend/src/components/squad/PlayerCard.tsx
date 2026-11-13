import type { Player } from "../../lib/types";
import { fmtPrice } from "../../lib/format";
import StartMeter from "./StartMeter";
import FixturePill from "./FixturePill";
import XgiBadge from "./XgiBadge";
import { gwPointsDisplay } from "../../lib/utils";

export default function PlayerCard({
  p,
  benchBadge,
  onOpen,
}: {
  p: Player;
  benchBadge?: string | null;
  onOpen: () => void;
}) {
  const cap = p.is_captain ? (
    <span className="rounded-full bg-fpl-purple px-2 py-0.5 text-[11px] text-fpl-purple-foreground ring-1 ring-black/15">
      C
    </span>
  ) : p.is_vice_captain ? (
    <span className="rounded-full border border-primary/30 bg-primary/15 px-2 py-0.5 text-[11px] text-primary">VC</span>
  ) : benchBadge ? (
    <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] text-foreground">
      {benchBadge}
    </span>
  ) : null;

  const change = p.lineup_change ? (
    <span
      className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold text-foreground ${
        p.lineup_change === "start" ? "border-success bg-success/8" : "border-warning bg-warning/8"
      }`}
    >
      {p.lineup_change === "start" ? "Start" : "Bench"}
    </span>
  ) : null;

  const gwPts = gwPointsDisplay(p);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${p.name} — details`}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen?.();
        }
      }}
      className="cursor-pointer rounded-xl border border-border bg-card p-3 transition hover:shadow-card focus-visible:ring-2 focus-visible:ring-foreground focus-visible:outline-none"
      title="Click for details"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <img
            src={p.shirt_url || ""}
            alt={`${p.team} shirt`}
            className="h-10 w-10 rounded-md border border-border bg-card object-contain p-0.5"
          />
          <div className="min-w-0">
            <div className="truncate leading-tight font-semibold text-foreground">{p.name}</div>
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
              <span className="whitespace-nowrap">
                {p.team} • {fmtPrice(p.price)}
              </span>
              <XgiBadge
                signal={p.xgi_signal}
                ga={(p.goals_scored ?? 0) + (p.assists ?? 0)}
                xgi={p.expected_goal_involvements}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {change}
          {cap}
          <FixturePill f={p.fixture ?? undefined} />
          {gwPts && (
            // GW points, as the pitch chip shows them — the list once showed none,
            // so a past GW in list view had no scores at all
            <span
              className={`min-w-6 text-right text-sm font-bold tabular-nums sm:min-w-11 ${gwPts.counted ? "text-foreground" : "text-muted-foreground"}`}
              title={gwPts.tooltip}
              aria-label={gwPts.tooltip}
            >
              {gwPts.points}
              <span className="hidden sm:inline"> pts</span>
            </span>
          )}
        </div>
      </div>

      <div className="mt-2">
        <StartMeter probability={p.start_probability} />
      </div>

      {p.news ? <div className="mt-2 line-clamp-2 text-xs text-muted-foreground">{p.news}</div> : null}
    </div>
  );
}
