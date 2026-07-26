import * as React from "react";
import type { Player, PlayerRank, PlayerSummaryResponse } from "../../lib/types";
import { statusToText, fdrClass } from "../../lib/utils";
import { fmtKickoff, fmtPrice, pct, fmtCompact, fmtPriceDelta } from "../../lib/format";
import { useFetch } from "../../hooks/useFetch";
import { POSITION_LABEL } from "../../lib/constants";

type TeamFixture = {
  event: number;
  opp: string;
  home: boolean;
  difficulty: number;
  kickoff: string | null;
};

type Tab = "overview" | "stats" | "fixtures" | "history";

type Props = {
  open: boolean;
  onClose: () => void;
  player: Player;
  /** Planner squads set start_probability: 0 as a placeholder (required field,
   * not a real estimate) — hide the "start prob" badge in that context. */
  hideStartProbability?: boolean;
};

function TopNum({ label, value, delta, accent }: { label: string; value: React.ReactNode; delta?: string; accent?: boolean }) {
  return (
    <div>
      <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.14em] leading-none">{label}</div>
      <div className={`text-[24px] font-bold tabular-nums tracking-[-0.02em] leading-tight mt-[3px] ${accent ? "text-primary" : "text-foreground"}`}>
        {value ?? "—"}
      </div>
      {delta && <div className="font-mono text-[10px] text-muted-foreground mt-[2px] leading-none">{delta}</div>}
    </div>
  );
}

function SectionHeader({ label, right }: { label: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-2.5">
      <div className="text-xs font-bold text-foreground/80 tracking-[-0.005em]">{label}</div>
      {right}
    </div>
  );
}

type StatusCfg = { dot: string; border: string; bg: string; label: string };

const STATUS_CFG: Record<string, StatusCfg> = {
  d: { dot: "bg-warning", border: "border-warning/30", bg: "bg-warning/8", label: "text-warning" },
  i: { dot: "bg-destructive", border: "border-destructive/30", bg: "bg-destructive/8", label: "text-destructive" },
  s: { dot: "bg-destructive", border: "border-destructive/30", bg: "bg-destructive/8", label: "text-destructive" },
  n: { dot: "bg-muted-foreground", border: "border-border", bg: "bg-muted/40", label: "text-muted-foreground" },
};

const STATUS_CFG_DEFAULT: StatusCfg = { dot: "bg-success", border: "border-success/25", bg: "bg-success/5", label: "text-success" };

function StatusBanner({ player, hideStartProbability }: { player: Player; hideStartProbability?: boolean }) {
  const s = player.status;
  const cfg = (s ? STATUS_CFG[s] : undefined) ?? STATUS_CFG_DEFAULT;

  return (
    <div className={`flex items-start gap-3 px-3 py-2.5 rounded-lg border ${cfg.border} ${cfg.bg}`}>
      <div className={`mt-[3px] w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-sm font-medium ${cfg.label}`}>{statusToText(s)}</span>
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

function isPlayed(kickoff: string | null | undefined): boolean {
  return !!kickoff && new Date(kickoff) < new Date();
}

const POS_STATS: Record<number, Array<{ key: keyof Player; unit: string; rankKey: keyof NonNullable<Player["ranks"]>; primary?: boolean }>> = {
  1: [
    { key: "saves", unit: "SV", rankKey: "saves", primary: true },
    { key: "clean_sheets", unit: "CS", rankKey: "clean_sheets" },
    { key: "points_per_game", unit: "PPG", rankKey: "ppg" },
  ],
  2: [
    { key: "clean_sheets", unit: "CS", rankKey: "clean_sheets", primary: true },
    { key: "assists", unit: "A", rankKey: "assists" },
    { key: "points_per_game", unit: "PPG", rankKey: "ppg" },
  ],
  3: [
    { key: "assists", unit: "A", rankKey: "assists", primary: true },
    { key: "goals_scored", unit: "G", rankKey: "goals" },
    { key: "points_per_game", unit: "PPG", rankKey: "ppg" },
  ],
  4: [
    { key: "goals_scored", unit: "G", rankKey: "goals", primary: true },
    { key: "assists", unit: "A", rankKey: "assists" },
    { key: "points_per_game", unit: "PPG", rankKey: "ppg" },
  ],
};

function TightRank({ val, unit, rank, primary }: { val: React.ReactNode; unit: string; rank?: PlayerRank; primary?: boolean }) {
  return (
    <div className={`p-3 rounded-xl border bg-muted/30 ${primary ? "border-border/60" : "border-border/40"}`}>
      <div className="flex items-baseline gap-1.5">
        <span className="text-[22px] font-bold text-foreground tabular-nums leading-none tracking-tight">{val ?? "—"}</span>
        <span className="text-[10px] font-semibold text-muted-foreground tracking-widest uppercase">{unit}</span>
      </div>
      {rank != null && (
        <>
          <div className="mt-1.5 text-xs text-foreground/80 leading-none">
            #{rank.rank} <span className="text-muted-foreground">of {rank.of}</span>
          </div>
          <div className="mt-1.5 h-[3px] rounded-full bg-border overflow-hidden">
            <div
              className={`h-full rounded-full transition-none ${primary ? "bg-primary" : "bg-muted-foreground/60"}`}
              style={{ width: `${rank.pct}%` }}
            />
          </div>
        </>
      )}
    </div>
  );
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
      <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.1em]">{label}</div>
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
          {isPlayed(f.kickoff) ? "Played" : fmtKickoff(f.kickoff ?? null)}
        </span>
      </div>
      <span className={`text-xs px-2.5 py-1 rounded-lg font-bold tracking-[0.04em] ml-3 shrink-0 ${fdrClass(f.difficulty)}`}>
        FDR {f.difficulty}
      </span>
    </div>
  );
}

function FixtureCompactPill({ f }: { f: TeamFixture }) {
  return (
    <div className="flex-1 flex flex-col items-center gap-1.5 px-2 py-3 rounded-xl border border-border bg-muted/30 text-center min-w-0">
      <span className="text-[10px] text-muted-foreground tracking-wide font-mono">GW{f.event}</span>
      <span className="text-sm font-semibold text-foreground leading-none">{f.opp}</span>
      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${fdrClass(f.difficulty)}`}>
        {f.home ? "H" : "A"} · {f.difficulty}
      </span>
    </div>
  );
}

export default function PlayerDetailModal({ open, onClose, player, hideStartProbability }: Props) {
  const fixtUrl = open && player.team_id ? `/api/team-next/${player.team_id}?count=5` : null;
  const { data: fixtData, loading, error: err } = useFetch<{ fixtures: TeamFixture[] }>(fixtUrl);
  const nextFixt = fixtData?.fixtures ?? null;

  const [tab, setTab] = React.useState<Tab>("overview");

  const historyUrl = open && tab === "history" ? `/api/player/${player.element}/summary` : null;
  const { data: historyData, loading: historyLoading, error: historyErr } =
    useFetch<PlayerSummaryResponse>(historyUrl);

  React.useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  const posLabel = player.position ? POSITION_LABEL[player.position] : null;
  const hasGwPoints = player.gw_points != null;
  const costChange = fmtPriceDelta(player.cost_change_start);
  const xPts = player.ep_next ? Number(player.ep_next).toFixed(1) : "—";
  const ppg = player.points_per_game ? Number(player.points_per_game).toFixed(1) : "—";
  const form = player.form ? Number(player.form).toFixed(1) : "—";
  const xPtsDelta = nextFixt?.[0] ? `${nextFixt[0].home ? "vs" : "@"} ${nextFixt[0].opp}` : undefined;

  const name = player.name ?? "";
  const lastSpace = name.lastIndexOf(" ");
  const nameParts = lastSpace === -1
    ? { first: "", last: name }
    : { first: name.slice(0, lastSpace), last: name.slice(lastSpace + 1) };

  const netTransfers = (player.transfers_in_event ?? 0) - (player.transfers_out_event ?? 0);
  const hasTransferData = player.transfers_in_event != null || player.transfers_out_event != null;
  const netSign = netTransfers > 0 ? "+" : netTransfers < 0 ? "−" : "";
  const netStr = netTransfers !== 0 ? `${netSign}${fmtCompact(netTransfers)}` : "0";
  const transferSub = [
    player.transfers_in_event != null && `▲ ${fmtCompact(player.transfers_in_event)} in`,
    player.transfers_out_event != null && `▼ ${fmtCompact(player.transfers_out_event)} out`,
  ].filter(Boolean).join(" · ");

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-background/60"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        className="absolute left-1/2 top-10 -translate-x-1/2 w-[min(32rem,_92vw)] rounded-2xl bg-card text-foreground shadow-card border border-border flex flex-col max-h-[calc(100vh-5rem)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="player-modal-title"
      >
        {/* header */}
        <div className="relative shrink-0 overflow-hidden border-b border-border">
          {/* watermark club code */}
          <div
            aria-hidden="true"
            className="absolute pointer-events-none select-none font-bold leading-[0.85] tracking-[-0.04em]"
            style={{ top: -36, right: -8, fontSize: 180, fontWeight: 800, color: "rgba(94,234,212,0.04)" }}
          >
            {player.team}
          </div>

          {/* close button */}
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute top-3.5 right-4 z-10 text-[12px] font-medium text-foreground/70 border border-border/60 px-3 py-[5px] rounded-lg"
          >
            Close
          </button>

          {/* identity row */}
          <div className="relative flex gap-3.5 px-6 pt-5 pb-4">
            <div className="w-[60px] h-[76px] shrink-0 rounded-[10px] bg-muted/50 border border-border flex items-center justify-center overflow-hidden">
              {player.shirt_url
                ? <img src={player.shirt_url} alt={`${player.team} shirt`} className="w-full h-full object-contain p-2" />
                : <svg width="28" height="28" viewBox="0 0 28 28" fill="none"><path d="M5 7L9 4H19L23 7L21 12L18 11V23H10V11L7 12L5 7Z" fill="currentColor" opacity="0.4" /></svg>
              }
            </div>
            <div className="flex-1 min-w-0 pr-16">
              <div className="flex gap-[5px] flex-wrap mb-[5px]">
                {posLabel && (
                  <span className="text-[10px] font-semibold text-foreground/70 border border-border/60 px-2 py-0.5 rounded-full tracking-[0.06em]">
                    {posLabel}
                  </span>
                )}
                {player.team && (
                  <span className="text-[10px] font-medium text-foreground/70 border border-border/60 px-2 py-0.5 rounded-full">
                    {player.team}
                  </span>
                )}
              </div>
              <h2
                id="player-modal-title"
                className="text-[28px] font-bold leading-[1.0] tracking-[-0.025em] m-0"
              >
                {nameParts.first && <span>{nameParts.first} </span>}
                <span className="text-primary">{nameParts.last}</span>
                {player.is_captain && (
                  <span className="inline-block align-middle ml-2 text-[11px] font-bold text-primary border border-primary/30 bg-primary/10 px-2 py-0.5 rounded-[6px] tracking-[0.08em]">
                    C
                  </span>
                )}
                {player.is_vice_captain && (
                  <span className="inline-block align-middle ml-2 text-[11px] font-bold text-primary border border-primary/30 bg-primary/10 px-2 py-0.5 rounded-[6px] tracking-[0.08em]">
                    VC
                  </span>
                )}
              </h2>
            </div>
          </div>

          {/* topline strip */}
          <div className="grid grid-cols-4 gap-[14px] px-6 py-[14px] border-t border-border">
            <TopNum label="PRICE" value={fmtPrice(player.price)} delta={costChange ?? undefined} />
            <TopNum
              label={hasGwPoints ? "GW PTS" : "FORM"}
              value={hasGwPoints ? player.gw_points : form}
              delta={hasGwPoints ? `Form ${form}` : `PPG ${ppg}`}
            />
            <TopNum label="xPTS NEXT" value={xPts} delta={xPtsDelta} accent />
            <TopNum
              label="OWNED"
              value={player.selected_by_percent != null ? `${Number(player.selected_by_percent).toFixed(1)}%` : "—"}
            />
          </div>
        </div>

        {/* tab bar */}
        <div className="flex gap-6 px-4 border-b border-border shrink-0">
          {(["overview", "stats", "fixtures", "history"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`py-3 text-sm font-medium capitalize relative transition-colors ${
                tab === t ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t}
              {tab === t && (
                <span className="absolute bottom-[-1px] left-0 right-0 h-0.5 bg-primary rounded-full" />
              )}
            </button>
          ))}
        </div>

        {/* scrollable body */}
        <div className="p-4 overflow-y-auto flex-1 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: "none" }}>

          {/* ── OVERVIEW TAB ── */}
          {tab === "overview" && (
            <div className="space-y-4">
              <StatusBanner player={player} hideStartProbability={hideStartProbability} />

              {/* Market */}
              <section>
                <SectionHeader
                  label="Market"
                  right={posLabel && (
                    <span className="text-[10px] font-mono text-muted-foreground px-1.5 py-0.5 rounded bg-muted/50 tracking-widest">
                      vs {posLabel}
                    </span>
                  )}
                />
                <div className="flex flex-col gap-2.5">
                  {hasTransferData && (
                    <>
                      <MarketRow
                        label="Transfers"
                        value={netStr}
                        valueClass={netTransfers > 0 ? "text-success" : "text-muted-foreground"}
                        sub={<span className="text-muted-foreground">{transferSub}</span>}
                        right={
                          player.transfer_rank != null ? (
                            <span className={`flex items-center gap-1 ${player.transfer_rank.rank <= 5 ? "text-primary" : "text-muted-foreground"}`}>
                              {player.transfer_rank.rank <= 5 && "🔥"}#{player.transfer_rank.rank} most-bought {posLabel}
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
                            {player.cost_change_event > 0 ? "↑" : "↓"} £{(Math.abs(player.cost_change_event) / 10).toFixed(1)} today
                          </span>
                        : <span className="text-muted-foreground">No change today</span>
                    }
                  />
                </div>
              </section>

              {/* Next fixtures */}
              <section>
                <SectionHeader label="Next fixtures" />
                {loading && <div className="text-sm text-muted-foreground">Loading…</div>}
                {err && <div className="text-sm text-destructive">{err}</div>}
                {!loading && !err && !player.team_id && (
                  <div className="text-sm text-muted-foreground">Not available.</div>
                )}
                {!loading && !err && nextFixt && nextFixt.length === 0 && (
                  <div className="text-sm text-muted-foreground">No upcoming fixtures.</div>
                )}
                {!loading && !err && nextFixt && nextFixt.length > 0 && (
                  <div className="flex flex-col gap-2">
                    {nextFixt.slice(0, 3).map((f) => (
                      <OverviewFixtureCard key={`${f.event}-${f.kickoff ?? ""}`} f={f} />
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}

          {/* ── STATS TAB ── */}
          {tab === "stats" && (
            <div className="space-y-4">
              {/* Season highlights */}
              <section>
                <SectionHeader
                  label="Season highlights"
                  right={posLabel && (
                    <span className="text-[10px] font-mono text-muted-foreground px-1.5 py-0.5 rounded bg-muted/50 tracking-widest">
                      vs {posLabel}
                    </span>
                  )}
                />
                <div className="grid grid-cols-3 gap-2">
                  {(POS_STATS[player.position] ?? POS_STATS[3]).map(({ key, unit, rankKey, primary }) => {
                    const raw = player[key] as string | number | null | undefined;
                    const val = raw != null ? (key === "points_per_game" ? Number(raw).toFixed(1) : raw) : null;
                    return (
                      <TightRank
                        key={unit}
                        val={val}
                        unit={unit}
                        rank={player.ranks?.[rankKey]}
                        primary={primary}
                      />
                    );
                  })}
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  {[
                    player.position === 3 && player.clean_sheets != null && `${player.clean_sheets} CS`,
                    player.position === 2 && player.goals_scored ? `${player.goals_scored} G` : null,
                    player.bonus != null && `${player.bonus} bonus`,
                    player.minutes != null && `${player.minutes} mins`,
                  ].filter(Boolean).join(" · ")}
                </div>
              </section>

              {/* Per 90 */}
              <section>
                <div className="flex items-center justify-between mb-2.5">
                  <div className="text-xs font-bold text-foreground/80 tracking-[-0.005em]">
                    Per 90 · vs {posLabel ?? "pos"}
                  </div>
                </div>
                <div className="px-4 py-4 rounded-xl border border-border bg-muted/30 text-sm text-muted-foreground">
                  Per-90 data not yet available.
                </div>
              </section>
            </div>
          )}

          {/* ── FIXTURES TAB ── */}
          {tab === "fixtures" && (
            <div className="space-y-4">
              {/* This GW */}
              {player.fixtures != null && (
                <section>
                  <SectionHeader
                    label="This GW"
                    right={
                      player.has_dgw
                        ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30">DGW</span>
                        : player.fixtures.length === 0
                        ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">BGW</span>
                        : undefined
                    }
                  />
                  {player.fixtures.length === 0
                    ? <div className="text-sm text-muted-foreground">No fixture this gameweek.</div>
                    : (
                      <ul className="space-y-1">
                        {player.fixtures.map((f) => (
                          <li key={`${f.opp}-${f.kickoff ?? ""}`} className="text-sm flex items-center justify-between border border-border rounded-md px-3 py-2">
                            <div className="flex flex-col">
                              <span className="font-medium">{f.home ? "Home vs" : "Away at"} {f.opp}</span>
                              <span className="text-xs text-muted-foreground">
                                {isPlayed(f.kickoff) ? "Played" : fmtKickoff(f.kickoff ?? null)}
                              </span>
                            </div>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${fdrClass(f.difficulty)}`}>FDR {f.difficulty}</span>
                          </li>
                        ))}
                      </ul>
                    )
                  }
                </section>
              )}

              {/* Next fixtures — pills */}
              <section>
                <SectionHeader label="Next fixtures" />
                {loading && <div className="text-sm text-muted-foreground">Loading…</div>}
                {err && <div className="text-sm text-destructive">{err}</div>}
                {!loading && !err && !player.team_id && (
                  <div className="text-sm text-muted-foreground">Not available.</div>
                )}
                {!loading && !err && nextFixt && nextFixt.length === 0 && (
                  <div className="text-sm text-muted-foreground">No upcoming fixtures found.</div>
                )}
                {!loading && !err && nextFixt && nextFixt.length > 0 && (
                  <div className="flex gap-1.5">
                    {nextFixt.map((f) => (
                      <FixtureCompactPill key={`${f.event}-${f.kickoff ?? ""}`} f={f} />
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}

          {/* ── HISTORY TAB ── */}
          {tab === "history" && (
            <div className="space-y-4">
              <section>
                <SectionHeader label="Past seasons" />
                {historyLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
                {historyErr && <div className="text-sm text-destructive">{historyErr}</div>}
                {!historyLoading && !historyErr && (!historyData || historyData.history_past.length === 0) && (
                  <div className="text-sm text-muted-foreground">No prior-season history.</div>
                )}
                {!historyLoading && !historyErr && historyData && historyData.history_past.length > 0 && (
                  <div className="flex flex-col gap-2">
                    {historyData.history_past.map((h) => (
                      <div
                        key={h.season_name}
                        className="flex items-center justify-between border border-border rounded-xl px-4 py-3 bg-muted/30"
                      >
                        <div className="flex flex-col">
                          <span className="text-sm font-semibold text-foreground">{h.season_name}</span>
                          <span className="text-xs text-muted-foreground mt-0.5">
                            {h.minutes} mins · {h.goals_scored}G {h.assists}A
                          </span>
                        </div>
                        <span className="text-sm font-bold tabular-nums text-foreground">{h.total_points} pts</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}

        </div>

        {/* Sticky action bar */}
        <div className="shrink-0 flex gap-2 px-[18px] py-3 border-t border-border bg-card">
          <button
            className="flex-1 bg-transparent border border-border/60 text-foreground/40 rounded-[10px] px-3.5 py-[11px] text-[13px] font-semibold cursor-not-allowed"
            disabled
            title="Compare — coming soon"
          >
            ⇄ Compare
          </button>
        </div>
      </div>
    </div>
  );
}
