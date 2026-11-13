import * as React from "react";
import AppShell from "../components/layout/AppShell";
import DataCard from "../components/ui/DataCard";
import PlayerTable from "../components/planner/PlayerTable";
import DraftPanel from "../components/planner/DraftPanel";
import { usePlayerDetailHost } from "../hooks/usePlayerDetail";
import PitchView from "../components/pitch/PitchView";
import { useFetch } from "../hooks/useFetch";
import { useDraft } from "../hooks/useDraft";
import { poolToSquadPlayers } from "../lib/plannerAdapter";
import type { Player, PlayersResponse, PoolPlayer } from "../lib/types";

export default function PlannerPage() {
  const { data, loading, error } = useFetch<PlayersResponse>("/api/players");
  const draft = useDraft(data?.players);
  const playerDetail = usePlayerDetailHost({
    pool: data?.players,
    poolGw: data?.gw,
    season: data?.season,
  });
  const openPool = (p: PoolPlayer) => playerDetail.open(p.id);
  const [showPitch, setShowPitch] = React.useState(false);
  const [showBackToTop, setShowBackToTop] = React.useState(false);

  React.useEffect(() => {
    const onScroll = () => setShowBackToTop(window.scrollY > 600);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const squadPlayers = React.useMemo(() => poolToSquadPlayers(draft.picks, data?.gw), [draft.picks, data?.gw]);
  const openPitch = (sp: Player) => playerDetail.open(sp.element);

  return (
    <AppShell>
      <div className="mx-auto flex w-full flex-col gap-5 px-4 py-4 lg:flex-row" style={{ maxWidth: 1400 }}>
        <div className="min-w-0 flex-1">
          <div className="mb-3 flex items-center justify-between gap-4">
            <h1 className="text-lg font-semibold text-foreground">Squad planner</h1>
            <button
              type="button"
              onClick={() => setShowPitch((v) => !v)}
              className="h-9 cursor-pointer rounded-xl border border-border bg-card px-3 text-sm text-foreground transition hover:bg-muted/60"
            >
              {showPitch ? "Hide pitch" : "View pitch"}
            </button>
          </div>

          {showPitch && (
            <div className="mb-4">
              <DataCard title={`Your squad (${draft.picks.length}/15)`}>
                {draft.picks.length === 0 ? (
                  <div className="py-12 text-center text-sm text-muted-foreground">
                    Add players from the pool below to see your squad on the pitch.
                  </div>
                ) : (
                  <PitchView players={squadPlayers} brand="FPL Helper" onPlayerClick={openPitch} hideStartMeter />
                )}
              </DataCard>
            </div>
          )}

          <DataCard title="Player pool" loading={loading} error={error} empty={!data}>
            {data && (
              <PlayerTable
                players={data.players}
                teams={data.teams}
                gw={data.gw}
                canAdd={draft.canAdd}
                onAdd={draft.add}
                onSelect={openPool}
              />
            )}
          </DataCard>
        </div>

        <aside
          className="w-full shrink-0 self-start lg:sticky lg:max-h-[calc(100vh-80px)] lg:w-80 lg:overflow-y-auto"
          style={{ top: 64 }}
        >
          <DataCard title="Your draft">
            <DraftPanel
              picks={draft.picks}
              budget={draft.budget}
              clubCounts={draft.clubCounts}
              violations={draft.violations}
              warnings={draft.warnings}
              onRemove={draft.remove}
              onSelect={openPool}
              onClear={draft.clear}
            />
          </DataCard>
        </aside>
      </div>

      {showBackToTop && (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="fixed right-4 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-border bg-card text-foreground shadow-card transition hover:bg-muted/60 lg:right-6 lg:bottom-6"
          aria-label="Back to top"
          title="Back to top"
        >
          ↑
        </button>
      )}

      {playerDetail.modal}
    </AppShell>
  );
}
