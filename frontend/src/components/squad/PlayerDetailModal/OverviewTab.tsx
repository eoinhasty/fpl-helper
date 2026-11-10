import * as React from "react";
import type { Player, PlayerSummaryResponse } from "../../../lib/types";
import { statusToText, fdrClass, TONE_CLASS, statusTone } from "../../../lib/utils";
import { fmtPrice, pct, fmtCompact } from "../../../lib/format";
import { SectionHeader, PositionTag, KickoffLabel, NextFixturesStatus } from "./parts";
import type { NextFixtures, TeamFixture } from "./parts";

function StatusBanner({ player, hideStartProbability }: { player: Player; hideStartProbability?: boolean }) {
  const s = player.status;
  const cfg = TONE_CLASS[statusTone(s)];

  return (
    <div className={`flex items-start gap-3 px-3 py-2.5 rounded-lg border ${cfg.soft}`}>
      <div className={`mt-0.75 w-2 h-2 rounded-full shrink-0 ${cfg.bg}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-sm font-medium ${cfg.text}`}>{statusToText(s)}</span>
          {!hideStartProbability && (
            <span className="text-xs text-muted-foreground">
              {pct(player.start_probability)} start prob
            </span>
          )}
        </div>
        {player.news && (
          <p className="text-xs text-muted-foreground mt-1 leading-snug">{player.news}</p>
        )}
      </div>
    </div>
  );
}

/** Points and minutes per GW for the last few finished GWs (a double's two
 * matches summed). A GW with a match still to finish is left out, so a part-
 * played GW never reads as the full one. */
function recentGws(summary: PlayerSummaryResponse, count: number) {
  const pending = new Set(summary.fixtures.map((f) => f.event));
  const byGw = new Map<number, { gw: number; pts: number; mins: number }>();
  for (const h of summary.history) {
    if (pending.has(h.round)) continue;
    const row = byGw.get(h.round) ?? { gw: h.round, pts: 0, mins: 0 };
    row.pts += h.total_points;
    row.mins += h.minutes;
    byGw.set(h.round, row);
  }
  return [...byGw.values()].sort((a, b) => a.gw - b.gw).slice(-count);
}

function MarketRow({ label, value, valueClass, sub, right }: {
  label: string;
  value: React.ReactNode;
  valueClass?: string;
  sub?: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="grid items-baseline gap-3" style={{ gridTemplateColumns: "90px 1fr auto" }}>
      <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">{label}</div>
      <div className="flex items-baseline gap-2.5 min-w-0">
        <span className={`text-[20px] font-bold tabular-nums tracking-[-0.01em] ${valueClass ?? "text-foreground"}`}>{value}</span>
        {sub != null && <span className="text-xs leading-snug">{sub}</span>}
      </div>
      {right != null && <div className="text-xs text-right shrink-0">{right}</div>}
    </div>
  );
}

function OverviewFixtureCard({ f }: { f: TeamFixture }) {
  return (
    <div className="flex items-center justify-between border border-border rounded-xl px-4 py-3 bg-muted/30">
      <div className="flex flex-col min-w-0">
        <span className="text-sm font-semibold text-foreground leading-snug">
          GW{f.event}: {f.home ? "Home vs" : "Away at"} {f.opp}
        </span>
        <span className="text-xs text-muted-foreground mt-0.5">
          <KickoffLabel kickoff={f.kickoff} />
        </span>
      </div>
      <span className={`text-xs px-2.5 py-1 rounded-lg font-bold tracking-[0.04em] ml-3 shrink-0 ${fdrClass(f.difficulty)}`}>
        FDR {f.difficulty}
      </span>
    </div>
  );
}

export default function OverviewTab({ player, hideStartProbability, posLabel, history, next }: {
  player: Player;
  hideStartProbability?: boolean;
  posLabel: string | null;
  history: { data: PlayerSummaryResponse | null; loading: boolean; error: string | null };
  next: NextFixtures;
}) {
  const recent = history.data ? recentGws(history.data, 5) : null;

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
  ].filter(Boolean).join(" · ");

  return (
    <div className="space-y-4">
      <StatusBanner player={player} hideStartProbability={hideStartProbability} />

      {/* Per-GW returns — what form, an average, hides */}
      {!history.error && (
        <section>
          <SectionHeader label="Recent gameweeks" />
          {history.loading && <div className="text-sm text-muted-foreground">Loading…</div>}
          {recent && recent.length === 0 && (
            <div className="text-sm text-muted-foreground">No matches played yet this season.</div>
          )}
          {recent && recent.length > 0 && (
            <div className="grid grid-cols-5 gap-1.5">
              {recent.map((r) => (
                <div key={r.gw} className="flex flex-col items-center gap-1 px-1 py-2.5 rounded-xl border border-border bg-muted/30">
                  <span className="text-[10px] text-muted-foreground tracking-wide font-mono">GW{r.gw}</span>
                  <span className="text-lg font-bold tabular-nums leading-none text-foreground">{r.pts}</span>
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    {r.mins > 0 ? `${r.mins} min` : "DNP"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
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
                valueClass={netTransfers > 0 ? "text-success" : netTransfers < 0 ? "text-destructive" : "text-muted-foreground"}
                sub={<span className="text-muted-foreground">{transferSub}</span>}
                right={
                  soldRank != null ? (
                    <span className={`flex items-center gap-1 ${soldRank <= 5 ? "text-destructive" : "text-muted-foreground"}`}>
                      {soldRank <= 5 && "❄️"}#{soldRank} most-sold {posLabel}
                    </span>
                  ) : tr != null ? (
                    <span className={`flex items-center gap-1 ${tr.rank <= 5 ? "text-primary" : "text-muted-foreground"}`}>
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
              player.cost_change_start != null && player.cost_change_start !== 0
                ? <span className={player.cost_change_start > 0 ? "text-success" : "text-destructive"}>
                    {player.cost_change_start > 0 ? "↑" : "↓"} £{(Math.abs(player.cost_change_start) / 10).toFixed(1)} since start
                  </span>
                : <span className="text-muted-foreground">no change since start</span>
            }
            right={
              player.cost_change_event != null && player.cost_change_event !== 0
                ? <span className={player.cost_change_event > 0 ? "text-success" : "text-destructive"}>
                    {player.cost_change_event > 0 ? "↑" : "↓"} £{(Math.abs(player.cost_change_event) / 10).toFixed(1)} this GW
                  </span>
                : <span className="text-muted-foreground">No change this GW</span>
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
