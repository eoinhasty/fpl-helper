import * as React from "react";
import type { Player } from "../../lib/types";
import { statusToText, fdrClass } from "../../lib/utils";
import { fmtKickoff, fmtPrice, pct } from "../../lib/format";

const _apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "";

const POS_LABEL: Record<number, string> = { 1: "GK", 2: "DEF", 3: "MID", 4: "FWD" };

type TeamFixture = {
  event: number;
  opp: string;
  home: boolean;
  difficulty: number;
  kickoff: string | null;
};

type Tab = "overview" | "fixtures";

type Props = {
  open: boolean;
  onClose: () => void;
  player: Player;
};

function KeyNum({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px] uppercase tracking-[0.12em] font-mono text-muted-foreground leading-none">{label}</span>
      <span className="text-[20px] font-semibold text-foreground tabular-nums leading-tight tracking-tight">{value ?? "—"}</span>
      {sub != null && <span className="text-[10px] font-mono leading-none">{sub}</span>}
    </div>
  );
}

function InlineStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <span className="text-sm">
      <span className="font-semibold text-foreground">{value ?? "—"}</span>
      {" "}
      <span className="text-muted-foreground">{label}</span>
    </span>
  );
}

function StatusBanner({ player }: { player: Player }) {
  const s = player.status;
  const cfg =
    s === "d" ? { dot: "bg-warning", border: "border-warning/30", bg: "bg-warning/8", label: "text-warning" } :
    s === "i" ? { dot: "bg-destructive", border: "border-destructive/30", bg: "bg-destructive/8", label: "text-destructive" } :
    s === "s" ? { dot: "bg-destructive", border: "border-destructive/30", bg: "bg-destructive/8", label: "text-destructive" } :
    s === "n" ? { dot: "bg-muted-foreground", border: "border-border", bg: "bg-muted/40", label: "text-muted-foreground" } :
    { dot: "bg-success", border: "border-success/25", bg: "bg-success/5", label: "text-success" };

  return (
    <div className={`flex items-start gap-3 px-3 py-2.5 rounded-lg border ${cfg.border} ${cfg.bg}`}>
      <div className={`mt-[3px] w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-sm font-medium ${cfg.label}`}>{statusToText(s)}</span>
          <span className="text-xs text-muted-foreground">
            {pct(player.start_probability)} start prob
          </span>
        </div>
        {player.news && (
          <p className="text-xs text-muted-foreground mt-1 leading-snug">{player.news}</p>
        )}
      </div>
    </div>
  );
}

function fmtTransfers(n?: number): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}

function fmtCostChange(n?: number): string | null {
  if (n == null || n === 0) return null;
  const arrow = n > 0 ? "↑" : "↓";
  return `${arrow} £${Math.abs(n / 10).toFixed(1)}`;
}

function isPlayed(kickoff: string | null | undefined): boolean {
  return !!kickoff && new Date(kickoff) < new Date();
}

function FixturePill({ f }: { f: TeamFixture }) {
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

export default function PlayerDetailModal({ open, onClose, player }: Props) {
  const [loading, setLoading] = React.useState(false);
  const [nextFixt, setNextFixt] = React.useState<TeamFixture[] | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState<Tab>("overview");

  React.useEffect(() => {
    setNextFixt(null);
    setErr(null);
    setTab("overview");
    let abort = false;
    async function run() {
      if (!open || !player?.team_id) return;
      setLoading(true);
      try {
        const r = await fetch(`${_apiBase}/api/team-next/${player.team_id}?count=5`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const json = await r.json();
        if (!abort) setNextFixt(json.fixtures || []);
      } catch (e: any) {
        if (!abort) setErr(e?.message ?? "Failed to load fixtures");
      } finally {
        if (!abort) setLoading(false);
      }
    }
    run();
    return () => { abort = true; };
  }, [open, player?.team_id]);

  React.useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  const posLabel = player.position ? POS_LABEL[player.position] : null;
  const hasCap = player.is_captain || player.is_vice_captain;
  const hasGwPoints = player.gw_points != null;
  const costChange = fmtCostChange(player.cost_change_start);
  const hasTransfers = player.transfers_in_event != null || player.transfers_out_event != null;
  const xPts = player.ep_next ? Number(player.ep_next).toFixed(1) : "—";
  const ppg = player.points_per_game ? Number(player.points_per_game).toFixed(1) : "—";
  const form = player.form ? Number(player.form).toFixed(1) : "—";

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
        <div className="p-4 border-b border-border shrink-0 space-y-3">
          {/* identity row */}
          <div className="flex items-start gap-3">
            <img
              src={player.shirt_url || ""}
              alt={`${player.team} shirt`}
              className="w-14 h-14 object-contain rounded-lg border border-border bg-card p-1 shrink-0"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                {posLabel && (
                  <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/30 font-mono tracking-wide">
                    {posLabel}
                  </span>
                )}
                {hasCap && (
                  <span
                    className="text-[11px] px-1.5 py-0.5 rounded-full ring-1 ring-black/15 text-[#fcfcfc]"
                    style={{ backgroundColor: "#38003C" }}
                  >
                    {player.is_captain ? "C" : "VC"}
                  </span>
                )}
              </div>
              <h2 id="player-modal-title" className="text-2xl font-bold leading-tight tracking-tight">
                {player.name}
              </h2>
              <div className="text-sm text-muted-foreground mt-0.5">{player.team} · {fmtPrice(player.price)}</div>
            </div>
            <button onClick={onClose} className="btn shrink-0 mt-1" aria-label="Close">
              Close
            </button>
          </div>

          {/* key numbers strip */}
          <div className="grid grid-cols-4 gap-0 pt-3 border-t border-border">
            <KeyNum
              label="Price"
              value={fmtPrice(player.price)}
              sub={costChange
                ? <span className={player.cost_change_start! > 0 ? "text-success" : "text-destructive"}>{costChange}</span>
                : <span className="text-muted-foreground">no change</span>}
            />
            {hasGwPoints
              ? <KeyNum label="GW pts" value={player.gw_points} sub={<span className="text-muted-foreground">Form {form}</span>} />
              : <KeyNum label="Form" value={form} sub={<span className="text-muted-foreground">PPG {ppg}</span>} />
            }
            <KeyNum
              label="xPts next"
              value={xPts}
              sub={nextFixt?.[0]
                ? <span className="text-muted-foreground">{nextFixt[0].home ? "vs" : "@"} {nextFixt[0].opp}</span>
                : undefined}
            />
            <KeyNum
              label="Owned"
              value={player.selected_by_percent != null ? `${Number(player.selected_by_percent).toFixed(1)}%` : "—"}
            />
          </div>
        </div>

        {/* tab bar */}
        <div className="flex gap-6 px-4 border-b border-border shrink-0">
          {(["overview", "fixtures"] as const).map((t) => (
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
        <div className="p-4 space-y-4 overflow-y-auto" style={{ willChange: "transform" }}>

          {/* ── OVERVIEW TAB ── */}
          {tab === "overview" && (
            <>
              <StatusBanner player={player} />

              {/* Season */}
              <section>
                <div className="text-xs uppercase tracking-wide font-mono text-muted-foreground mb-2">● Season</div>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {hasGwPoints && (
                    <InlineStat label="ppg" value={ppg} />
                  )}
                  <InlineStat label="goals" value={player.goals_scored ?? "—"} />
                  <InlineStat label="assists" value={player.assists ?? "—"} />
                  {player.position !== 4 && (
                    <InlineStat label="clean sheets" value={player.clean_sheets ?? "—"} />
                  )}
                  <InlineStat label="bonus" value={player.bonus ?? "—"} />
                </div>
              </section>

              {/* Transfers this week */}
              {(hasTransfers || costChange) && (
                <section>
                  <div className="text-xs uppercase tracking-wide font-mono text-muted-foreground mb-2">● This week</div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {player.transfers_in_event != null && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-border bg-muted/40 text-xs">
                        <span className="text-success font-semibold">▲</span>
                        <span className="font-semibold text-foreground">{fmtTransfers(player.transfers_in_event)}</span>
                        <span className="text-muted-foreground">in</span>
                      </span>
                    )}
                    {player.transfers_out_event != null && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-border bg-muted/40 text-xs">
                        <span className="text-destructive font-semibold">▼</span>
                        <span className="font-semibold text-foreground">{fmtTransfers(player.transfers_out_event)}</span>
                        <span className="text-muted-foreground">out</span>
                      </span>
                    )}
                    {costChange && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-border bg-muted/40 text-xs">
                        <span className={`font-semibold ${player.cost_change_start! > 0 ? "text-success" : "text-destructive"}`}>
                          {costChange}
                        </span>
                        <span className="text-muted-foreground">since start</span>
                      </span>
                    )}
                  </div>
                </section>
              )}
            </>
          )}

          {/* ── FIXTURES TAB ── */}
          {tab === "fixtures" && (
            <>
              {/* This GW */}
              {player.fixtures != null && (
                <section>
                  <div className="text-xs uppercase tracking-wide font-mono text-muted-foreground mb-2">
                    ● This GW
                    {player.has_dgw && (
                      <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30">DGW</span>
                    )}
                    {player.fixtures.length === 0 && (
                      <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">BGW</span>
                    )}
                  </div>
                  {player.fixtures.length === 0
                    ? <div className="text-sm text-muted-foreground">No fixture this gameweek.</div>
                    : (
                      <ul className="space-y-1">
                        {player.fixtures.map((f, i) => (
                          <li key={i} className="text-sm flex items-center justify-between border border-border rounded-md px-3 py-2">
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
                <div className="text-xs uppercase tracking-wide font-mono text-muted-foreground mb-2">● Next fixtures</div>
                {loading && <div className="text-sm text-muted-foreground">Loading…</div>}
                {err && <div className="text-sm text-destructive">{err}</div>}
                {!loading && !err && !player?.team_id && (
                  <div className="text-sm text-muted-foreground">Not available.</div>
                )}
                {!loading && !err && nextFixt && nextFixt.length === 0 && (
                  <div className="text-sm text-muted-foreground">No upcoming fixtures found.</div>
                )}
                {!loading && !err && nextFixt && nextFixt.length > 0 && (
                  <div className="flex gap-1.5">
                    {nextFixt.map((f) => (
                      <FixturePill key={`${f.event}-${f.kickoff ?? ""}`} f={f} />
                    ))}
                  </div>
                )}
              </section>
            </>
          )}

        </div>
      </div>
    </div>
  );
}
