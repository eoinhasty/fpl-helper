import * as React from "react";
import { getRouteApi, Link } from "@tanstack/react-router";
import AppShell from "../components/layout/AppShell";
import DataCard from "../components/ui/DataCard";
import LeagueTable from "../components/league/LeagueTable";
import YourPosition from "../components/league/YourPosition";
import { StillToCome, SwungSoFar } from "../components/league/SwingCards";
import { LiveDot } from "../components/league/parts";
import { useFetch } from "../hooks/useFetch";
import { useEntryId } from "../hooks/useEntryID";
import { PlayerDetailContext, usePlayerDetailHost } from "../hooks/usePlayerDetail";
import { leagueEo, stillToCome, swings, swungSoFar } from "../lib/leagueLive";
import type { LeagueLiveResponse } from "../lib/types";

const route = getRouteApi("/league/$leagueId");

// The backend's scoring data refreshes every 30s; a minute is plenty for a
// table someone keeps open through a match
const REFRESH_MS = 60_000;

function StatusLine({ data, live }: { data: LeagueLiveResponse; live: boolean }) {
  const m = data.matches;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold ${
          live ? "bg-success/15 text-success" : "bg-muted text-foreground"
        }`}
      >
        {live && <LiveDot />}
        GW{data.gw} {live ? "live" : "final"}
      </span>
      {m && (
        <span>
          {m.done} of {m.total} matches finished
          {m.playing > 0 && (
            <>
              {" · "}
              <span className="font-medium text-success">{m.playing} in play</span>
            </>
          )}
        </span>
      )}
      {live && <span className="text-xs">Updates every minute</span>}
    </div>
  );
}

export default function LeagueLivePage() {
  const { leagueId } = route.useParams();
  const id = /^\d+$/.test(leagueId) ? leagueId : null;
  const { entry } = useEntryId();
  const playerDetail = usePlayerDetailHost({});

  // Poll only while there's a live GW to follow — known from the last response
  const [polling, setPolling] = React.useState(false);
  const { data, loading, error } = useFetch<LeagueLiveResponse>(id ? `/api/leagues/${id}/live` : null, {
    refreshMs: polling ? REFRESH_MS : undefined,
  });
  const live = Boolean(data?.available && !data.finished);
  if (live !== polling) setPolling(live);

  const rows = React.useMemo(() => data?.entries ?? [], [data]);
  const players = React.useMemo(() => data?.players ?? {}, [data]);
  const me = (entry !== "" && rows.find((r) => r.entry === entry)) || null;
  const swing = React.useMemo(() => {
    if (!me?.picks) return null;
    const all = swings(me, leagueEo(rows), players);
    return { ...stillToCome(all), so_far: swungSoFar(all) };
  }, [me, rows, players]);
  const notAvailable =
    data && !data.available
      ? data.reason === "not_started" && data.league.start_event
        ? `This league starts in GW${data.league.start_event}.`
        : "The live table starts once the season's first gameweek is under way."
      : undefined;

  return (
    <PlayerDetailContext.Provider value={playerDetail.open}>
      <AppShell>
        <div className="mx-auto w-full space-y-4 px-4 py-4" style={{ maxWidth: 1120 }}>
          <div>
            <Link
              to="/"
              className="rounded text-xs text-muted-foreground hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              ← Dashboard
            </Link>
            <h1 className="mt-1 text-xl font-semibold text-foreground">{data?.league.name ?? "League"}</h1>
            {data?.available && <StatusLine data={data} live={live} />}
          </div>

          {me && (
            <DataCard title="Your position">
              <YourPosition me={me} rows={rows} players={players} />
            </DataCard>
          )}

          <div className={swing ? "grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]" : ""}>
            <DataCard
              title="Live table"
              right={
                rows.length > 0 ? (
                  <span className="text-xs text-muted-foreground">
                    {me ? "Tap a team to compare" : `${rows.length} teams`}
                  </span>
                ) : null
              }
              loading={loading}
              error={id ? error : "That isn't a league ID."}
              empty={rows.length === 0}
              emptyMessage={notAvailable ?? "No teams in this league yet."}
            >
              <div className="-mx-4 -mb-4 overflow-hidden rounded-b-2xl">
                <LeagueTable rows={rows} me={me} players={players} />
              </div>
            </DataCard>
            {swing && (
              <div className="order-first space-y-4 lg:order-none">
                {live && <StillToCome yours={swing.yours} threats={swing.threats} />}
                <SwungSoFar rows={swing.so_far} />
              </div>
            )}
          </div>
          {rows.length > 0 && !me && (
            <p className="text-xs text-muted-foreground">
              Set your team ID in Settings to see your differentials and compare yourself with your rivals.
            </p>
          )}

          {rows.length > 0 && (
            <div className="space-y-1 text-xs text-muted-foreground">
              <p>
                GW points are worked out from each team's picks as matches play, so the table moves before FPL re-totals
                it. Captains count double (triple on a Triple Captain) and hits are taken off.
              </p>
              {data?.bonus_provisional && (
                <p>Bonus is included from the current BPS, before FPL confirms it after each match.</p>
              )}
              <p>
                Auto-subs are made once it's certain a starter didn't play (their match is over and they got no
                minutes), walking the bench in order as FPL does. A sub waiting on a bench player whose match is still
                to come isn't counted yet. If a captain doesn't play, the vice takes the armband — unless they didn't
                play either.
              </p>
              {data?.league.truncated && <p>Only the top 50 are shown, and ranked among themselves.</p>}
            </div>
          )}
        </div>
      </AppShell>
      {playerDetail.modal}
    </PlayerDetailContext.Provider>
  );
}
