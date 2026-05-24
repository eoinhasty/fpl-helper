import * as React from "react";
import type { Player } from "../../lib/types";
import { statusClass, statusToText, fdrClass } from "../../lib/utils";
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

type Props = {
  open: boolean;
  onClose: () => void;
  player: Player;
};

function BigStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-xl font-bold text-foreground leading-none">{value ?? "—"}</span>
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground text-center leading-tight">{label}</span>
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

function fmtTransfers(n?: number): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}

function fmtCostChange(n?: number): string | null {
  if (n == null || n === 0) return null;
  const sign = n > 0 ? "+" : "";
  return `${sign}£${(n / 10).toFixed(1)}`;
}

function isPlayed(kickoff: string | null | undefined): boolean {
  return !!kickoff && new Date(kickoff) < new Date();
}

export default function PlayerDetailModal({ open, onClose, player }: Props) {
  const [loading, setLoading] = React.useState(false);
  const [nextFixt, setNextFixt] = React.useState<TeamFixture[] | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    setNextFixt(null);
    setErr(null);
    let abort = false;
    async function run() {
      if (!open || !player?.team_id) return;
      setLoading(true);
      try {
        const r = await fetch(`${_apiBase}/api/team-next/${player.team_id}?count=3`);
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
        <div className="flex items-center gap-3 p-4 border-b border-border shrink-0">
          <img
            src={player.shirt_url || ""}
            alt={`${player.team} shirt`}
            className="w-10 h-10 object-contain rounded-md border border-border bg-card p-0.5 shrink-0"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span id="player-modal-title" className="text-lg font-semibold leading-tight">
                {player.name}
              </span>
              {hasCap && (
                <span
                  className="text-[11px] px-1.5 py-0.5 rounded-full ring-1 ring-black/15 text-[#fcfcfc]"
                  style={{ backgroundColor: "#38003C" }}
                >
                  {player.is_captain ? "C" : "VC"}
                </span>
              )}
              {posLabel && (
                <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
                  {posLabel}
                </span>
              )}
            </div>
            <div className="text-sm text-muted-foreground">{player.team} · {fmtPrice(player.price)}</div>
          </div>
          <button onClick={onClose} className="btn shrink-0" aria-label="Close">
            Close
          </button>
        </div>

        {/* scrollable body */}
        <div className="p-4 space-y-5 overflow-y-auto" style={{ willChange: "transform" }}>

          {/* Availability */}
          <section>
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">Availability</div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs ${statusClass(player.status)}`}>
                {statusToText(player.status)}
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-border bg-muted/40 text-xs">
                Start prob <span className="font-semibold text-foreground">{pct(player.start_probability)}</span>
              </span>
              {player.selected_by_percent != null && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-border bg-muted/40 text-xs">
                  Owned by <span className="font-semibold text-foreground">{Number(player.selected_by_percent).toFixed(1)}%</span>
                </span>
              )}
            </div>
            {player.news && (
              <div className="text-sm text-foreground mt-2">{player.news}</div>
            )}
          </section>

          {/* Stats — borderless number grid */}
          <section>
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-3">Stats</div>
            <div className="grid grid-cols-4 gap-2">
              <BigStat label="Total pts" value={player.total_points ?? "—"} />
              {hasGwPoints
                ? <BigStat label="GW pts" value={player.gw_points} />
                : <BigStat label="Pts/game" value={ppg} />
              }
              <BigStat label="xPts next" value={xPts} />
              <BigStat label="Minutes" value={player.minutes ?? "—"} />
            </div>
          </section>

          {/* Season — inline */}
          <section>
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">Season</div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
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
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">This week</div>
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

          {/* This GW */}
          {player.fixtures != null && (
            <section>
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">
                This GW
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
                            {isPlayed(f.kickoff) ? "Played" : fmtKickoff(f.kickoff)}
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

          {/* Next fixtures */}
          <section>
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">Next fixtures</div>
            {loading && <div className="text-sm text-muted-foreground">Loading…</div>}
            {err && <div className="text-sm text-destructive">{err}</div>}
            {!loading && !err && !player?.team_id && (
              <div className="text-sm text-muted-foreground">Not available.</div>
            )}
            {!loading && !err && nextFixt && nextFixt.length === 0 && (
              <div className="text-sm text-muted-foreground">No upcoming fixtures found.</div>
            )}
            {!loading && !err && nextFixt && nextFixt.length > 0 && (
              <ul className="space-y-1">
                {nextFixt.map((f) => (
                  <li key={`${f.event}-${f.kickoff ?? ""}`} className="text-sm flex items-center justify-between border border-border rounded-md px-3 py-2">
                    <div className="flex flex-col">
                      <span className="font-medium">GW {f.event}: {f.home ? "Home vs" : "Away at"} {f.opp}</span>
                      <span className="text-xs text-muted-foreground">
                        {isPlayed(f.kickoff) ? "Played" : fmtKickoff(f.kickoff)}
                      </span>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${fdrClass(f.difficulty)}`}>FDR {f.difficulty}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

        </div>
      </div>
    </div>
  );
}
