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
    <span
      className="text-[11px] px-2 py-0.5 rounded-full ring-1 ring-black/15 bg-fpl-purple text-fpl-purple-foreground"
    >
      C
    </span>
  ) : p.is_vice_captain ? (
    <span className="text-[11px] px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30">
      VC
    </span>
  ) : benchBadge ? (
    <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-foreground border border-border">
      {benchBadge}
    </span>
  ) : null;

  const change = p.lineup_change ? (
    <span
      className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border text-foreground ${
        p.lineup_change === "start" ? "bg-success/8 border-success" : "bg-warning/8 border-warning"
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
      className="rounded-xl p-3 cursor-pointer transition bg-card border border-border hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground"
      title="Click for details"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <img
            src={p.shirt_url || ""}
            alt={`${p.team} shirt`}
            className="w-10 h-10 object-contain rounded-md border border-border bg-card p-0.5"
          />
          <div className="min-w-0">
            <div className="font-semibold leading-tight truncate text-foreground">
              {p.name}
            </div>
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
              <span className="whitespace-nowrap">{p.team} • {fmtPrice(p.price)}</span>
              <XgiBadge
                signal={p.xgi_signal}
                ga={(p.goals_scored ?? 0) + (p.assists ?? 0)}
                xgi={p.expected_goal_involvements}
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap justify-end">
          {change}
          {cap}
          <FixturePill f={p.fixture ?? undefined} />
          {gwPts && (
            // GW points, as the pitch chip shows them — the list once showed none,
            // so a past GW in list view had no scores at all
            <span
              className={`min-w-6 sm:min-w-11 text-right text-sm font-bold tabular-nums ${gwPts.counted ? "text-foreground" : "text-muted-foreground"}`}
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

      {p.news ? (
        <div className="text-xs text-muted-foreground mt-2 line-clamp-2">
          {p.news}
        </div>
      ) : null}
    </div>
  );
}
