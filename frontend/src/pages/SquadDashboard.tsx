// pages/SquadDashboard.tsx
import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "../components/layout/DashboardLayout";
import LeaguesCard from "../components/left/LeaguesCard";
import XIList from "../components/squad/XIList";
import PitchView from "../components/pitch/PitchView";
import SquadStatusBar from "../components/squad/SquadStatusBar";
import InsightsCarousel from "../components/right/InsightsCarousel";
import { useEntryId } from "../hooks/useEntryID";
import { useSquad } from "../hooks/useSquad";
import { usePreferences } from "../hooks/usePreferences";
import NextMatchCard from "../components/right/NextMatchCard";
import HotNewsCard from "../components/right/HotNewsCard";
import StandingsCard from "../components/right/StandingsCard";
import { Segmented } from "../components/controls/Segmented";

import type { Player } from "../lib/types";
import PlayerDetailModal from "../components/squad/PlayerDetailModal";

type Mode = "live" | "squad";

export default function SquadDashboard() {
  const { entry } = useEntryId();
  const { prefs } = usePreferences();
  const { data, loading, error, cache, loadSquad, loadLive } = useSquad(entry);

  const [mode, setMode] = useState<Mode>(prefs.defaultView);
  const [gw, setGw] = useState<number | undefined>(undefined); // undefined => server fallback

  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const openPlayer = (p: Player) => setSelectedPlayer(p);
  const closePlayer = () => setSelectedPlayer(null);

  // Keep Segmented in sync if Default View is changed elsewhere (Settings)
  useEffect(() => {
    if (mode !== prefs.defaultView) {
      setMode(prefs.defaultView as Mode);
    }
  }, [prefs.defaultView]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!entry) return;
    if (mode === "live") {
      loadLive();
      setGw(undefined); // lock gw for live
    } else {
      loadSquad({ gw });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, gw, entry]);

  // create GW options up to whichever GW we’ve seen
  const cap = data?.current_gw ?? 1;
  const gwOptions = useMemo(
    () => Array.from({ length: cap }, (_, i) => i + 1),
    [cap]
  );

  const left = <LeaguesCard entry={entry} />;

  const right = (
    <>
      <InsightsCarousel players={data?.players} />
      <NextMatchCard />
      <HotNewsCard />
      <StandingsCard />
    </>
  );

  return (
    <>
      <DashboardLayout
        left={left}
        right={right}
        top={
          <div className="flex items-center justify-between">
            <SquadStatusBar
              gw={data?.used_gw}
              deadlineISO={data?.deadline}
              teamValue={data?.team_value}
              teamBank={data?.team_bank}
              activeChip={data?.active_chip ?? null}
              cache={cache ?? { status: null, ageSeconds: null }}
              onRefresh={() =>
                mode === "live" ? loadLive(true) : loadSquad({ gw, forceRefresh: true })
              }
            />
            <div className="flex items-center gap-3">
              <Segmented<Mode>
                value={mode}
                onChange={setMode}
                options={[
                  { label: "Squad", value: "squad" },
                  { label: "Live", value: "live" },
                ]}
              />
              <div className="flex items-center gap-2">
                <label className="text-sm text-muted-foreground">Gameweek</label>
                <select
                  className="bg-card border border-border rounded-xl px-3 py-1.5 text-sm disabled:opacity-60"
                  value={gw ?? data?.used_gw ?? ""}
                  onChange={(e) => setGw(Number(e.target.value))}
                  disabled={mode === "live"}
                >
                  {gwOptions.map((g) => (
                    <option key={g} value={g}>GW {g}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        }
      >
        {prefs.squadLayout === "pitch" ? (
          // ✅ pass click handler to pitch
          <PitchView players={data?.players} brand="FPL Helper" onPlayerClick={openPlayer} />
        ) : (
          // ✅ pass click handler to list
          <XIList
            players={data?.players}
            loading={loading}
            error={error}
            entryMissing={entry === ""}
            onPlayerClick={openPlayer}
          />
        )}
      </DashboardLayout>

      {selectedPlayer && (
        <PlayerDetailModal open={true} onClose={closePlayer} player={selectedPlayer} />
      )}
    </>
  );
}