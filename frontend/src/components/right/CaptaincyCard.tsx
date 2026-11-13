import * as React from "react";
import { Link } from "@tanstack/react-router";
import DataCard from "../ui/DataCard";
import { Skeleton } from "../ui/Skeleton";
import type { Player } from "../../lib/types";
import { captaincyPicks } from "../../lib/captaincy";
import { CAPTAIN_CLOSE_GAP } from "../../lib/confidence";
import PlayerOpen from "../squad/PlayerOpen";

const RANK_ICON = ["⭐", "🥈", "🥉"];

function PlayerRow({ p, pts, projected, rank }: { p: Player; pts: number; projected: boolean; rank?: number }) {
  const fxs = p.fixtures ?? (p.fixture ? [p.fixture] : []);
  return (
    <li>
      <PlayerOpen
        id={p.element}
        className="flex w-full items-center justify-between rounded-lg border border-border bg-card px-2 py-1.5"
      >
        <div className="flex min-w-0 items-center gap-2">
          <img src={p.shirt_url || ""} alt="" className="h-6 w-6 rounded border border-border bg-card object-contain" />
          <div className="truncate">
            <div className="truncate text-sm font-medium text-foreground">
              {rank !== undefined ? `${RANK_ICON[rank]} ` : "💡 "}
              {p.name}
            </div>
            <div className="truncate text-[11px] text-muted-foreground">
              {p.team} •{" "}
              {p.has_dgw && fxs.length > 0
                ? fxs.map((f) => `${f.home ? "vs" : "@"} ${f.opp}`).join(", ") + " • DGW"
                : p.fixture
                  ? `${p.fixture.home ? "vs" : "@"} ${p.fixture.opp} • FDR ${p.fixture.difficulty}`
                  : "BGW"}
            </div>
          </div>
        </div>
        <div className="shrink-0 text-right text-xs text-muted-foreground">
          {typeof p.selected_by_percent !== "undefined" && <div>{Number(p.selected_by_percent).toFixed(1)}% own</div>}
          <div className="font-semibold text-foreground">
            {projected
              ? `${pts.toFixed(1)} proj pts`
              : pts > 0
                ? `${pts.toFixed(1)} xPts`
                : `${parseFloat(p.form ?? "0").toFixed(1)} form`}
          </div>
        </div>
      </PlayerOpen>
    </li>
  );
}

function CaptaincySkeleton() {
  return (
    <div className="space-y-2">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-2 rounded-lg border border-border px-2 py-1.5">
          <Skeleton className="h-6 w-6 shrink-0 rounded" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-2.5 w-1/2" />
          </div>
          <Skeleton className="h-3 w-10 shrink-0" />
        </div>
      ))}
    </div>
  );
}

export default function CaptaincyCard({
  entry,
  players,
  loading,
  error,
  isHistorical,
  lockedGw,
}: {
  entry?: number | "";
  players?: Player[] | null;
  loading?: boolean;
  error?: string | null;
  isHistorical?: boolean;
  /** The shown GW is past its deadline: its captain can't be changed */
  lockedGw?: number;
}) {
  const ranked = React.useMemo(() => (players ? captaincyPicks(players) : null), [players]);
  const { picks, differential, projected } = ranked ?? { picks: [], differential: null, projected: false };

  // States where picks don't apply, ahead of loading and errors
  const unavailable =
    lockedGw != null
      ? `GW${lockedGw}'s captain is locked — picks for the next GW appear once it finishes.`
      : isHistorical
        ? "Captain picks use live data — not available for past GWs."
        : !entry
          ? "Set your entry id to see captain picks."
          : null;

  return (
    <DataCard
      title="Captaincy Picks"
      right={
        projected && picks.length > 0 ? (
          <Link
            to="/model"
            className="rounded text-[11px] text-muted-foreground hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            Track record
          </Link>
        ) : undefined
      }
      loading={!unavailable && loading && !players}
      loadingContent={<CaptaincySkeleton />}
      error={unavailable ? null : error}
      empty={!!unavailable || picks.length === 0}
      emptyMessage={unavailable ?? "Captain picks appear once your squad is loaded."}
    >
      <ul className="space-y-2">
        {picks.map(({ p, pts }, i) => (
          <PlayerRow key={p.element} p={p} pts={pts} projected={projected} rank={i} />
        ))}
      </ul>
      {/* Measured on the model's projections only (CAPTAIN_CLOSE_GAP in lib/confidence.ts) */}
      {projected && picks.length > 1 && picks[0].pts - picks[1].pts < CAPTAIN_CLOSE_GAP && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Close call: in past seasons, top captain picks within {CAPTAIN_CLOSE_GAP} pts of each other went the model's
          way only about half the time. Weigh news, fixtures and ownership.
        </p>
      )}

      {differential && (
        <>
          <div className="mt-3 mb-2 border-t border-border" />
          <div className="mb-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            Differential
          </div>
          <ul>
            <PlayerRow p={differential.p} pts={differential.pts} projected={projected} />
          </ul>
        </>
      )}
    </DataCard>
  );
}
