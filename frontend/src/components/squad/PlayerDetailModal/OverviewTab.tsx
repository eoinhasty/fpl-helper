import * as React from "react";
import type { FixturePoints, Player, PlayerSummaryResponse } from "../../../lib/types";
import { statusToText, fdrClass, TONE_CLASS, statusTone } from "../../../lib/utils";
import { fmtPrice, pct, fmtCompact } from "../../../lib/format";
import { useFetch } from "../../../hooks/useFetch";
import { SectionHeader, PositionTag, KickoffLabel, NextFixturesStatus } from "./parts";
import type { NextFixtures, TeamFixture } from "./parts";
import PointsBreakdown from "./PointsBreakdown";

function StatusBanner({ player, hideStartProbability }: { player: Player; hideStartProbability?: boolean }) {
  const s = player.status;
  const cfg = TONE_CLASS[statusTone(s)];

  return (
    <div className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 ${cfg.soft}`}>
      <div className={`mt-0.75 h-2 w-2 shrink-0 rounded-full ${cfg.bg}`} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`text-sm font-medium ${cfg.text}`}>{statusToText(s)}</span>
          {!hideStartProbability && (
            <span className="text-xs text-muted-foreground">{pct(player.start_probability)} start prob</span>
          )}
        </div>
        {player.news && <p className="mt-1 text-xs leading-snug text-muted-foreground">{player.news}</p>}
      </div>
    </div>
  );
}

/** Points and minutes per GW this season, oldest first (a double's two
 * matches summed). A GW with a match still to finish is left out, so a part-
 * played GW never reads as the full one. */
function seasonGws(summary: PlayerSummaryResponse) {
  const pending = new Set(summary.fixtures.map((f) => f.event));
  const byGw = new Map<number, { gw: number; pts: number; mins: number }>();
  for (const h of summary.history) {
    if (pending.has(h.round)) continue;
    const row = byGw.get(h.round) ?? { gw: h.round, pts: 0, mins: 0 };
    row.pts += h.total_points;
    row.mins += h.minutes;
    byGw.set(h.round, row);
  }
  return [...byGw.values()].sort((a, b) => a.gw - b.gw);
}

const TILES = 5;

function StepArrow({ dir, onClick }: { dir: "prev" | "next"; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      // Not `disabled`: that would drop keyboard focus at the first/last GW
      aria-disabled={!onClick}
      aria-label={dir === "prev" ? "Previous gameweek" : "Next gameweek"}
      className="flex w-8 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-border text-foreground/80 transition-colors hover:border-foreground/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none aria-disabled:cursor-default aria-disabled:opacity-35 aria-disabled:hover:border-border"
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <path
          d={dir === "prev" ? "M8.5 3L4.5 7L8.5 11" : "M5.5 3L9.5 7L5.5 11"}
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

function MarketRow({
  label,
  value,
  valueClass,
  sub,
  right,
}: {
  label: string;
  value: React.ReactNode;
  valueClass?: string;
  sub?: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="grid items-baseline gap-3" style={{ gridTemplateColumns: "90px 1fr auto" }}>
      <div className="text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">{label}</div>
      <div className="flex min-w-0 items-baseline gap-2.5">
        <span className={`text-[20px] font-bold tracking-[-0.01em] tabular-nums ${valueClass ?? "text-foreground"}`}>
          {value}
        </span>
        {sub != null && <span className="text-xs leading-snug">{sub}</span>}
      </div>
      {right != null && <div className="shrink-0 text-right text-xs">{right}</div>}
    </div>
  );
}

function OverviewFixtureCard({ f }: { f: TeamFixture }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border bg-muted/30 px-4 py-3">
      <div className="flex min-w-0 flex-col">
        <span className="text-sm leading-snug font-semibold text-foreground">
          GW{f.event}: {f.home ? "Home vs" : "Away at"} {f.opp}
        </span>
        <span className="mt-0.5 text-xs text-muted-foreground">
          <KickoffLabel kickoff={f.kickoff} />
        </span>
      </div>
      <span
        className={`ml-3 shrink-0 rounded-lg px-2.5 py-1 text-xs font-bold tracking-[0.04em] ${fdrClass(f.difficulty)}`}
      >
        FDR {f.difficulty}
      </span>
    </div>
  );
}

export default function OverviewTab({
  player,
  hideStartProbability,
  posLabel,
  pointsGw,
  history,
  next,
}: {
  player: Player;
  pointsGw?: number;
  hideStartProbability?: boolean;
  posLabel: string | null;
  history: { data: PlayerSummaryResponse | null; loading: boolean; error: string | null };
  next: NextFixtures;
}) {
  const season = React.useMemo(() => (history.data ? seasonGws(history.data) : null), [history.data]);

  // The breakdown shows the squad's GW until a tile is picked; any other GW
  // (or any GW for a non-squad player) is fetched on demand.
  const [pickedGw, setPickedGw] = React.useState<number | null>(null);
  // Exclusive end of the five tiles on show; null = the latest five
  const [winEnd, setWinEnd] = React.useState<number | null>(null);
  const shownGw = pickedGw ?? (player.gw_breakdown ? pointsGw : undefined);
  const fromSquad = player.gw_breakdown != null && shownGw === pointsGw;

  const tiles = season ?? [];
  const end = winEnd ?? tiles.length;
  const shownTiles = tiles.slice(Math.max(end - TILES, 0), end);
  // The arrows step through every tile's GW, plus the squad's when it's still
  // in play (and so not a tile yet); with nothing shown, "previous" is the latest.
  const steps = tiles.map((t) => t.gw);
  if (player.gw_breakdown && pointsGw != null && !steps.includes(pointsGw)) steps.push(pointsGw);
  const at = shownGw != null ? steps.indexOf(shownGw) : steps.length;

  /** Show `gw` (null = the squad's), sliding the tiles along if it's off either edge */
  const select = (gw: number | null) => {
    setPickedGw(gw);
    const i = tiles.findIndex((t) => t.gw === (gw ?? pointsGw));
    if (i === -1) setWinEnd(null);
    else if (i < end - TILES) setWinEnd(i + TILES);
    else if (i >= end) setWinEnd(i + 1);
  };
  const stepBack = at > 0 ? () => select(steps[at - 1]) : undefined;
  const stepOn = at !== -1 && at < steps.length - 1 ? () => select(steps[at + 1]) : undefined;
  const picked = useFetch<{ gw: number; points: number | null; breakdown: FixturePoints[] }>(
    shownGw != null && !fromSquad ? `/api/player/${player.element}/gw/${shownGw}/points` : null,
  );

  const netTransfers = (player.transfers_in_event ?? 0) - (player.transfers_out_event ?? 0);
  const hasTransferData = player.transfers_in_event != null || player.transfers_out_event != null;
  const netSign = netTransfers > 0 ? "+" : netTransfers < 0 ? "−" : "";
  const netStr = netTransfers !== 0 ? `${netSign}${fmtCompact(netTransfers)}` : "0";
  // transfer_rank is by net transfers, most-bought first — a net seller is
  // ranked from the other end instead ("#3 most-sold"), with ❄️ mirroring 🔥.
  const tr = player.transfer_rank;
  const soldRank = tr && netTransfers < 0 ? tr.of - tr.rank + 1 : null;
  const transferSub = [
    player.transfers_in_event != null && `▲ ${fmtCompact(player.transfers_in_event)} in`,
    player.transfers_out_event != null && `▼ ${fmtCompact(player.transfers_out_event)} out`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-4">
      <StatusBanner player={player} hideStartProbability={hideStartProbability} />

      {/* Per-GW returns — what form, an average, hides */}
      {!history.error && (
        <section>
          <SectionHeader
            label="Gameweeks"
            right={
              tiles.length > 0 && <span className="text-[10px] text-muted-foreground">Pick a week for its points</span>
            }
          />
          {history.loading && <div className="text-sm text-muted-foreground">Loading…</div>}
          {season && season.length === 0 && (
            <div className="text-sm text-muted-foreground">No matches played yet this season.</div>
          )}
          {tiles.length > 0 && (
            <div className="flex items-stretch gap-1.5">
              <StepArrow dir="prev" onClick={stepBack} />
              <div className="grid min-w-0 flex-1 grid-cols-5 gap-1.5">
                {shownTiles.map((r) => {
                  const on = r.gw === shownGw;
                  return (
                    <button
                      key={r.gw}
                      type="button"
                      aria-pressed={on}
                      aria-label={`GW${r.gw}: ${r.pts} points — show breakdown`}
                      // Picking the shown week again goes back to the squad's GW
                      onClick={() => (on && pickedGw != null ? select(null) : setPickedGw(r.gw))}
                      className={`flex min-w-0 cursor-pointer flex-col items-center gap-1 rounded-xl border px-1 py-2.5 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none ${
                        on ? "border-primary bg-primary/10" : "border-border bg-muted/30 hover:border-foreground/30"
                      }`}
                    >
                      <span
                        className={`font-mono text-[10px] tracking-wide ${on ? "text-primary-strong" : "text-muted-foreground"}`}
                      >
                        GW{r.gw}
                      </span>
                      <span className="text-lg leading-none font-bold text-foreground tabular-nums">{r.pts}</span>
                      <span className="text-[10px] whitespace-nowrap text-muted-foreground tabular-nums">
                        {r.mins > 0 ? `${r.mins} min` : "DNP"}
                      </span>
                    </button>
                  );
                })}
              </div>
              <StepArrow dir="next" onClick={stepOn} />
            </div>
          )}
        </section>
      )}

      {fromSquad ? (
        <PointsBreakdown breakdown={player.gw_breakdown ?? null} points={player.gw_points} gw={pointsGw} />
      ) : (
        shownGw != null && (
          <PointsBreakdown
            breakdown={picked.data?.breakdown ?? null}
            points={picked.data?.points}
            gw={shownGw}
            loading={picked.loading}
            error={picked.error}
          />
        )
      )}

      {/* Market */}
      <section>
        <SectionHeader label="Market" right={<PositionTag posLabel={posLabel} />} />
        <div className="flex flex-col gap-2.5">
          {hasTransferData && (
            <>
              <MarketRow
                label="Transfers"
                value={netStr}
                valueClass={
                  netTransfers > 0 ? "text-success" : netTransfers < 0 ? "text-destructive" : "text-muted-foreground"
                }
                sub={<span className="text-muted-foreground">{transferSub}</span>}
                right={
                  soldRank != null ? (
                    <span
                      className={`flex items-center gap-1 ${soldRank <= 5 ? "text-destructive" : "text-muted-foreground"}`}
                    >
                      {soldRank <= 5 && "❄️"}#{soldRank} most-sold {posLabel}
                    </span>
                  ) : tr != null ? (
                    <span
                      className={`flex items-center gap-1 ${tr.rank <= 5 ? "text-primary" : "text-muted-foreground"}`}
                    >
                      {tr.rank <= 5 && "🔥"}#{tr.rank} most-bought {posLabel}
                    </span>
                  ) : undefined
                }
              />
              <div className="h-px bg-border" />
            </>
          )}
          <MarketRow
            label="Price"
            value={fmtPrice(player.price)}
            sub={
              player.cost_change_start != null && player.cost_change_start !== 0 ? (
                <span className={player.cost_change_start > 0 ? "text-success" : "text-destructive"}>
                  {player.cost_change_start > 0 ? "↑" : "↓"} £{(Math.abs(player.cost_change_start) / 10).toFixed(1)}{" "}
                  since start
                </span>
              ) : (
                <span className="text-muted-foreground">no change since start</span>
              )
            }
            right={
              player.cost_change_event != null && player.cost_change_event !== 0 ? (
                <span className={player.cost_change_event > 0 ? "text-success" : "text-destructive"}>
                  {player.cost_change_event > 0 ? "↑" : "↓"} £{(Math.abs(player.cost_change_event) / 10).toFixed(1)}{" "}
                  this GW
                </span>
              ) : (
                <span className="text-muted-foreground">No change this GW</span>
              )
            }
          />
        </div>
      </section>

      {/* Next fixtures */}
      <section>
        <SectionHeader label="Next fixtures" />
        <NextFixturesStatus
          next={next}
          hasTeam={!!player.team_id}
          isEmpty={next.fixtures?.length === 0}
          emptyText="No upcoming fixtures."
        />
        {!next.loading && !next.error && next.fixtures && next.fixtures.length > 0 && (
          <div className="flex flex-col gap-2">
            {next.fixtures.slice(0, 3).map((f) => (
              <OverviewFixtureCard key={`${f.event}-${f.kickoff ?? ""}`} f={f} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
