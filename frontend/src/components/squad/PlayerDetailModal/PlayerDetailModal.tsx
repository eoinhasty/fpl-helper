import * as React from "react";
import type { FixtureLite, Player, PlayerSummaryResponse } from "../../../lib/types";
import { fmtPrice, fmtPriceDelta } from "../../../lib/format";
import { useFetch } from "../../../hooks/useFetch";
import Modal from "../../ui/Modal";
import { POSITION_LABEL } from "../../../lib/constants";
import type { TeamFixture } from "./parts";
import OverviewTab from "./OverviewTab";
import StatsTab from "./StatsTab";
import FixturesTab from "./FixturesTab";
import HistoryTab from "./HistoryTab";

type Tab = "overview" | "stats" | "fixtures" | "history";

type Props = {
  open: boolean;
  onClose: () => void;
  player: Player;
  /** Planner squads set start_probability: 0 as a placeholder (required field,
   * not a real estimate) — hide the "start prob" badge in that context. */
  hideStartProbability?: boolean;
  /** e.g. "2026/27" — current FPL season, shown alongside "Season highlights"
   * so the current-season stats aren't confused with the History tab's past
   * seasons. Optional since older callers may not have it wired through yet. */
  season?: string | null;
  /** GW that `gw_points` belongs to */
  pointsGw?: number;
  /** GW that `fixtures` and `projected_pts` belong to */
  fixtureGw?: number;
};

function TopNum({ label, value, delta, accent }: { label: string; value: React.ReactNode; delta?: string; accent?: boolean }) {
  return (
    <div>
      <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.14em] leading-none">{label}</div>
      <div className={`text-[24px] font-bold tabular-nums tracking-[-0.02em] leading-tight mt-0.75 ${accent ? "text-primary" : "text-foreground"}`}>
        {value ?? "—"}
      </div>
      {delta && <div className="font-mono text-[10px] text-muted-foreground mt-0.5 leading-none">{delta}</div>}
    </div>
  );
}

/** "vs ARS", "@ LIV +1" for a double, "Blank GW" for none */
function opponentsLabel(fixtures: FixtureLite[] | undefined): string | undefined {
  if (!fixtures) return undefined;
  if (fixtures.length === 0) return "Blank GW";
  const [f] = fixtures;
  return `${f.home ? "vs" : "@"} ${f.opp}${fixtures.length > 1 ? ` +${fixtures.length - 1}` : ""}`;
}

export default function PlayerDetailModal({ open, onClose, player, hideStartProbability, season, pointsGw, fixtureGw }: Props) {
  // One spare, since the Fixtures tab drops the GW it already shows
  const fixtUrl = open && player.team_id ? `/api/team-next/${player.team_id}?count=6` : null;
  const { data: fixtData, loading, error: err } = useFetch<{ fixtures: TeamFixture[] }>(fixtUrl);
  const next = { fixtures: fixtData?.fixtures ?? null, loading, error: err };

  const [tab, setTab] = React.useState<Tab>("overview");

  // Overview's recent GWs and the History tab both read it
  const summaryUrl = open ? `/api/player/${player.element}/summary` : null;
  const history = useFetch<PlayerSummaryResponse>(summaryUrl);

  const closeBtnRef = React.useRef<HTMLButtonElement>(null);

  if (!open) return null;

  const posLabel = player.position ? POSITION_LABEL[player.position] : null;
  const hasGwPoints = player.gw_points != null;
  const costChange = fmtPriceDelta(player.cost_change_start);
  // The model's projection when there is one, as Captaincy and Best XI rank on
  // it; it's for fixtureGw, while ep_next is always FPL's next GW.
  const proj = player.projected_pts;
  const xPts = proj != null ? proj.toFixed(1) : player.ep_next ? Number(player.ep_next).toFixed(1) : "—";
  const xPtsLabel = proj != null && fixtureGw ? `GW${fixtureGw} xPTS` : "xPTS NEXT";
  const ppg = player.points_per_game ? Number(player.points_per_game).toFixed(1) : "—";
  const form = player.form ? Number(player.form).toFixed(1) : "—";
  const nextFixt = next.fixtures;
  const xPtsDelta = proj != null
    ? opponentsLabel(player.fixtures)
    : nextFixt?.[0] ? `${nextFixt[0].home ? "vs" : "@"} ${nextFixt[0].opp}` : undefined;

  const name = player.name ?? "";
  const lastSpace = name.lastIndexOf(" ");
  const nameParts = lastSpace === -1
    ? { first: "", last: name }
    : { first: name.slice(0, lastSpace), last: name.slice(lastSpace + 1) };

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="player-modal-title"
      widthClass="w-[min(32rem,94vw)]"
      initialFocusRef={closeBtnRef}
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
          ref={closeBtnRef}
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 z-10 min-h-9 text-[12px] font-medium text-foreground/70 border border-border/60 px-3 py-2 rounded-lg"
        >
          Close
        </button>

        {/* identity row */}
        <div className="relative flex gap-3.5 px-4 sm:px-6 pt-5 pb-4">
          <div className="w-15 h-19 shrink-0 rounded-[10px] bg-muted/50 border border-border flex items-center justify-center overflow-hidden">
            {player.shirt_url
              ? <img src={player.shirt_url} alt={`${player.team} shirt`} className="w-full h-full object-contain p-2" />
              : <svg width="28" height="28" viewBox="0 0 28 28" fill="none"><path d="M5 7L9 4H19L23 7L21 12L18 11V23H10V11L7 12L5 7Z" fill="currentColor" opacity="0.4" /></svg>
            }
          </div>
          <div className="flex-1 min-w-0 pr-16">
            <div className="flex gap-1.25 flex-wrap mb-1.25">
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
              className="text-[28px] font-bold leading-none tracking-tight m-0"
            >
              {nameParts.first && <span>{nameParts.first} </span>}
              <span className="text-primary">{nameParts.last}</span>
              {player.is_captain && (
                <span className="inline-block align-middle ml-2 text-[11px] font-bold text-primary border border-primary/30 bg-primary/10 px-2 py-0.5 rounded-md tracking-[0.08em]">
                  C
                </span>
              )}
              {player.is_vice_captain && (
                <span className="inline-block align-middle ml-2 text-[11px] font-bold text-primary border border-primary/30 bg-primary/10 px-2 py-0.5 rounded-md tracking-[0.08em]">
                  VC
                </span>
              )}
            </h2>
          </div>
        </div>

        {/* topline strip */}
        <div className="grid grid-cols-4 gap-2 sm:gap-3.5 px-4 sm:px-6 py-3.5 border-t border-border">
          <TopNum label="PRICE" value={fmtPrice(player.price)} delta={costChange ?? undefined} />
          <TopNum
            label={hasGwPoints ? (pointsGw ? `GW${pointsGw} PTS` : "GW PTS") : "FORM"}
            value={hasGwPoints ? player.gw_points : form}
            delta={hasGwPoints ? `Form ${form}` : `PPG ${ppg}`}
          />
          <TopNum label={xPtsLabel} value={xPts} delta={xPtsDelta} accent />
          <TopNum
            label="OWNED"
            value={player.selected_by_percent != null ? `${Number(player.selected_by_percent).toFixed(1)}%` : "—"}
          />
        </div>
      </div>

      {/* tab bar */}
      <div
        className="flex gap-6 px-4 border-b border-border shrink-0 overflow-x-auto [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: "none" }}
      >
        {(["overview", "stats", "fixtures", "history"] as const).map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={tab === t}
            onClick={() => setTab(t)}
            className={`py-3 text-sm font-medium capitalize relative transition-colors shrink-0 cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              tab === t ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t}
            {tab === t && (
              <span className="absolute -bottom-px left-0 right-0 h-0.5 bg-primary rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* scrollable body */}
      <div className="p-4 overflow-y-auto flex-1 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: "none" }}>
        {tab === "overview" && (
          <OverviewTab
            player={player}
            hideStartProbability={hideStartProbability}
            posLabel={posLabel}
            history={history}
            next={next}
          />
        )}
        {tab === "stats" && <StatsTab player={player} season={season} posLabel={posLabel} />}
        {tab === "fixtures" && <FixturesTab player={player} fixtureGw={fixtureGw} next={next} />}
        {tab === "history" && <HistoryTab history={history} />}
      </div>

      {/* Sticky action bar */}
      <div className="shrink-0 flex gap-2 px-4.5 py-3 border-t border-border bg-card">
        <button
          className="flex-1 bg-transparent border border-border/60 text-foreground/40 rounded-[10px] px-3.5 py-2.75 text-[13px] font-semibold cursor-not-allowed"
          disabled
          title="Compare — coming soon"
        >
          ⇄ Compare
        </button>
      </div>
    </Modal>
  );
}
