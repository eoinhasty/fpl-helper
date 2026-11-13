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

function TopNum({
  label,
  value,
  delta,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  delta?: string;
  accent?: boolean;
}) {
  return (
    <div>
      <div className="text-[10px] leading-none font-semibold tracking-[0.14em] text-muted-foreground uppercase">
        {label}
      </div>
      <div
        className={`mt-0.75 text-[24px] leading-tight font-bold tracking-[-0.02em] tabular-nums ${accent ? "text-primary" : "text-foreground"}`}
      >
        {value ?? "—"}
      </div>
      {delta && <div className="mt-0.5 font-mono text-[10px] leading-none text-muted-foreground">{delta}</div>}
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

export default function PlayerDetailModal({
  open,
  onClose,
  player,
  hideStartProbability,
  season,
  pointsGw,
  fixtureGw,
}: Props) {
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
  const xPtsDelta =
    proj != null
      ? opponentsLabel(player.fixtures)
      : nextFixt?.[0]
        ? `${nextFixt[0].home ? "vs" : "@"} ${nextFixt[0].opp}`
        : undefined;

  const name = player.name ?? "";
  const lastSpace = name.lastIndexOf(" ");
  const nameParts =
    lastSpace === -1 ? { first: "", last: name } : { first: name.slice(0, lastSpace), last: name.slice(lastSpace + 1) };

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
          className="pointer-events-none absolute leading-[0.85] font-bold tracking-[-0.04em] select-none"
          style={{ top: -36, right: -8, fontSize: 180, fontWeight: 800, color: "rgba(94,234,212,0.04)" }}
        >
          {player.team}
        </div>

        {/* close button */}
        <button
          ref={closeBtnRef}
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 z-10 min-h-9 rounded-lg border border-border/60 px-3 py-2 text-[12px] font-medium text-foreground/70"
        >
          Close
        </button>

        {/* identity row */}
        <div className="relative flex gap-3.5 px-4 pt-5 pb-4 sm:px-6">
          <div className="flex h-19 w-15 shrink-0 items-center justify-center overflow-hidden rounded-[10px] border border-border bg-muted/50">
            {player.shirt_url ? (
              <img src={player.shirt_url} alt={`${player.team} shirt`} className="h-full w-full object-contain p-2" />
            ) : (
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                <path d="M5 7L9 4H19L23 7L21 12L18 11V23H10V11L7 12L5 7Z" fill="currentColor" opacity="0.4" />
              </svg>
            )}
          </div>
          <div className="min-w-0 flex-1 pr-16">
            <div className="mb-1.25 flex flex-wrap gap-1.25">
              {posLabel && (
                <span className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] font-semibold tracking-[0.06em] text-foreground/70">
                  {posLabel}
                </span>
              )}
              {player.team && (
                <span className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] font-medium text-foreground/70">
                  {player.team}
                </span>
              )}
            </div>
            <h2 id="player-modal-title" className="m-0 text-[28px] leading-none font-bold tracking-tight">
              {nameParts.first && <span>{nameParts.first} </span>}
              <span className="text-primary">{nameParts.last}</span>
              {player.is_captain && (
                <span className="ml-2 inline-block rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 align-middle text-[11px] font-bold tracking-[0.08em] text-primary">
                  C
                </span>
              )}
              {player.is_vice_captain && (
                <span className="ml-2 inline-block rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 align-middle text-[11px] font-bold tracking-[0.08em] text-primary">
                  VC
                </span>
              )}
            </h2>
          </div>
        </div>

        {/* topline strip */}
        <div className="grid grid-cols-4 gap-2 border-t border-border px-4 py-3.5 sm:gap-3.5 sm:px-6">
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
        className="flex shrink-0 gap-6 overflow-x-auto border-b border-border px-4 [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: "none" }}
      >
        {(["overview", "stats", "fixtures", "history"] as const).map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={tab === t}
            onClick={() => setTab(t)}
            className={`relative shrink-0 cursor-pointer rounded py-3 text-sm font-medium capitalize transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
              tab === t ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t}
            {tab === t && <span className="absolute right-0 -bottom-px left-0 h-0.5 rounded-full bg-primary" />}
          </button>
        ))}
      </div>

      {/* scrollable body */}
      <div className="flex-1 overflow-y-auto p-4 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: "none" }}>
        {tab === "overview" && (
          <OverviewTab
            player={player}
            hideStartProbability={hideStartProbability}
            posLabel={posLabel}
            pointsGw={pointsGw}
            history={history}
            next={next}
          />
        )}
        {tab === "stats" && <StatsTab player={player} season={season} posLabel={posLabel} />}
        {tab === "fixtures" && <FixturesTab player={player} fixtureGw={fixtureGw} next={next} />}
        {tab === "history" && <HistoryTab history={history} />}
      </div>

      {/* Sticky action bar */}
      <div className="flex shrink-0 gap-2 border-t border-border bg-card px-4.5 py-3">
        <button
          className="flex-1 cursor-not-allowed rounded-[10px] border border-border/60 bg-transparent px-3.5 py-2.75 text-[13px] font-semibold text-foreground/40"
          disabled
          title="Compare — coming soon"
        >
          ⇄ Compare
        </button>
      </div>
    </Modal>
  );
}
