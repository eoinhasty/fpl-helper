import * as React from "react";
import type { Player } from "../../lib/types";
import { statusClass, statusToText, fdrClass } from "../../lib/utils";
import { fmtKickoff } from "../../lib/format";

const _apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "";

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

export default function PlayerDetailModal({ open, onClose, player }: Props) {
  const [loading, setLoading] = React.useState(false);
  const [nextFixt, setNextFixt] = React.useState<TeamFixture[] | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  // lazy-load next fixtures when opened
  React.useEffect(() => {
    let abort = false;
    async function run() {
      if (!open) return;
      if (!player?.team_id) return;
      setLoading(true);
      setErr(null);
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
    return () => {
      abort = true;
    };
  }, [open, player?.team_id]);

  // esc to close
  React.useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* backdrop */}
      <div
        className="absolute inset-0 bg-background/60 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* modal card */}
      <div
        className="absolute left-1/2 top-10 -translate-x-1/2 w-[min(32rem,_92vw)] rounded-2xl bg-card text-foreground shadow-card border border-border"
        role="dialog"
        aria-modal="true"
        aria-labelledby="player-modal-title"
      >
        {/* header */}
        <div className="flex items-center gap-3 p-4 border-b border-border">
          <img
            src={player.shirt_url || ""}
            alt={`${player.team} shirt`}
            className="w-10 h-10 object-contain rounded-md border border-border bg-card p-0.5"
          />
          <div className="flex-1">
            <div id="player-modal-title" className="text-lg font-semibold leading-tight">
              {player.name}
            </div>
            <div className="text-sm text-muted-foreground">{player.team}</div>
          </div>
          <button
            onClick={onClose}
            className="btn"
            aria-label="Close"
          >
            Close
          </button>
        </div>

        {/* body */}
        <div className="p-4 space-y-4">
          {/* Availability */}
          <section>
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
              Availability
            </div>
            <div className="text-sm flex items-center gap-2 flex-wrap">
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full ${statusClass(
                  player.status
                )}`}
              >
                {statusToText(player.status)}
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full border border-border bg-card">
                Start prob:
                <span className="ml-1 font-medium">
                  {Math.round((player.start_probability ?? 0) * 100)}%
                </span>
              </span>
              {typeof player.selected_by_percent !== "undefined" && (
                <div className="text-xs text-muted-foreground mt-1">
                  Ownership:{" "}
                  <span className="font-medium">
                    {Number(player.selected_by_percent).toFixed(1)}%
                  </span>
                </div>
              )}
            </div>
            {player.news && (
              <div className="text-sm text-foreground mt-2">{player.news}</div>
            )}
          </section>

          {/* This GW fixture */}
          {player.fixture && (
            <section>
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                This GW
              </div>
              <div className="text-sm flex items-center justify-between border border-border rounded-md px-2 py-1">
                <div className="flex flex-col">
                  <span className="font-medium">
                    {player.fixture.home ? "Home vs" : "Away at"} {player.fixture.opp}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {fmtKickoff(player.fixture.kickoff)}
                  </span>
                </div>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${fdrClass(
                    player.fixture.difficulty
                  )}`}
                >
                  FDR {player.fixture.difficulty}
                </span>
              </div>
            </section>
          )}

          {/* Next 3 fixtures */}
          <section>
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
              Next fixtures
            </div>
            {loading && <div className="text-sm text-muted-foreground">Loading…</div>}
            {err && <div className="text-sm text-destructive">{" "}{err}</div>}
            {!loading && !err && nextFixt && nextFixt.length === 0 && (
              <div className="text-sm text-muted-foreground">No upcoming fixtures found.</div>
            )}
            {!loading && !err && nextFixt && nextFixt.length > 0 && (
              <ul className="space-y-1">
                {nextFixt.map((f) => (
                  <li
                    key={`${f.event}-${f.kickoff ?? ""}`}
                    className="text-sm flex items-center justify-between border border-border rounded-md px-2 py-1"
                  >
                    <div className="flex flex-col">
                      <span className="font-medium">
                        GW {f.event}: {f.home ? "Home vs" : "Away at"} {f.opp}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {fmtKickoff(f.kickoff)}
                      </span>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${fdrClass(f.difficulty)}`}>
                      FDR {f.difficulty}
                    </span>
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
