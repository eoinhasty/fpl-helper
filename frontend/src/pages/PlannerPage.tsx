import * as React from "react";
import TopNav from "../components/layout/TopNav";
import DataCard from "../components/ui/DataCard";
import PlayerTable from "../components/planner/PlayerTable";
import DraftPanel from "../components/planner/DraftPanel";
import PlayerDetailModal from "../components/squad/PlayerDetailModal";
import PitchView from "../components/pitch/PitchView";
import { useFetch } from "../hooks/useFetch";
import { useDraft } from "../hooks/useDraft";
import { poolPlayerToPlayer, poolToSquadPlayers } from "../lib/plannerAdapter";
import type { Player, PlayersResponse, PoolPlayer } from "../lib/types";

export default function PlannerPage() {
  const { data, loading, error } = useFetch<PlayersResponse>("/api/players");
  const draft = useDraft(data?.players);
  const [selected, setSelected] = React.useState<PoolPlayer | null>(null);
  const [showPitch, setShowPitch] = React.useState(false);
  const [showBackToTop, setShowBackToTop] = React.useState(false);

  React.useEffect(() => {
    const onScroll = () => setShowBackToTop(window.scrollY > 600);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const squadPlayers = React.useMemo(() => poolToSquadPlayers(draft.picks), [draft.picks]);
  const byId = React.useMemo(() => new Map(draft.picks.map((p) => [p.id, p])), [draft.picks]);

  function handlePitchClick(sp: Player) {
    const p = byId.get(sp.element);
    if (p) setSelected(p);
  }

  return (
    <div className="min-h-screen page-bg flex flex-col">
      <TopNav />
      <div className="mx-auto w-full px-4 py-4 flex flex-col lg:flex-row gap-5" style={{ maxWidth: 1400 }}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-4 mb-3">
            <h1 className="text-lg font-semibold text-foreground">Squad planner</h1>
            <button
              type="button"
              onClick={() => setShowPitch((v) => !v)}
              className="h-9 px-3 rounded-xl border border-border bg-card text-sm text-foreground cursor-pointer transition hover:bg-muted/60"
            >
              {showPitch ? "Hide pitch" : "View pitch"}
            </button>
          </div>

          {showPitch && (
            <div className="mb-4">
              <DataCard title={`Your squad (${draft.picks.length}/15)`}>
                {draft.picks.length === 0 ? (
                  <div className="text-sm text-muted-foreground text-center py-12">
                    Add players from the pool below to see your squad on the pitch.
                  </div>
                ) : (
                  <PitchView players={squadPlayers} brand="FPL Helper" onPlayerClick={handlePitchClick} hideStartMeter />
                )}
              </DataCard>
            </div>
          )}

          <DataCard title="Player pool" loading={loading} error={error} empty={!data}>
            {data && (
              <PlayerTable
                players={data.players}
                teams={data.teams}
                canAdd={draft.canAdd}
                onAdd={draft.add}
                onSelect={setSelected}
              />
            )}
          </DataCard>
        </div>

        <aside
          className="w-full lg:w-80 shrink-0 self-start lg:sticky lg:overflow-y-auto lg:max-h-[calc(100vh-80px)]"
          style={{ top: 64 }}
        >
          <DataCard title="Your draft">
            <DraftPanel
              picks={draft.picks}
              budget={draft.budget}
              clubCounts={draft.clubCounts}
              violations={draft.violations}
              onRemove={draft.remove}
              onSelect={setSelected}
              onClear={draft.clear}
            />
          </DataCard>
        </aside>
      </div>

      {showBackToTop && (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="fixed bottom-6 right-6 z-30 h-11 w-11 rounded-full border border-border bg-card text-foreground shadow-card cursor-pointer transition hover:bg-muted/60 flex items-center justify-center"
          aria-label="Back to top"
          title="Back to top"
        >
          ↑
        </button>
      )}

      {selected && (
        <PlayerDetailModal
          open={!!selected}
          onClose={() => setSelected(null)}
          player={poolPlayerToPlayer(selected, 1)}
          hideStartProbability
          season={data?.season}
        />
      )}

      <footer className="mt-auto py-4 text-center text-xs text-muted-foreground/60">
        Not affiliated with or endorsed by Fantasy Premier League or the Premier League.{" "}
        <a href="/privacy" className="underline hover:text-muted-foreground">Privacy policy</a>
      </footer>
    </div>
  );
}
