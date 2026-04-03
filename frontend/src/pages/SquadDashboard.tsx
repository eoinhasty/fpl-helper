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
import { useSetNavCenter, useSetNavActions } from "../contexts/NavCenterContext";

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

  // Keep Segmented in sync if Default View is changed in Settings.
  // mode is intentionally excluded — including it would reset the toggle on every click.
  useEffect(() => {
    setMode(prefs.defaultView as Mode);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.defaultView]);

  useEffect(() => {
    if (!entry) return;
    if (mode === "live") {
      loadLive();
      setGw(undefined); // lock gw for live
    } else {
      loadSquad({ gw });
    }
  }, [mode, gw, entry, loadSquad, loadLive]);

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

  const navMiddle = useMemo(() => (
    <SquadStatusBar
      gw={data?.used_gw}
      deadlineISO={data?.deadline}
      teamValue={data?.team_value}
      teamBank={data?.team_bank}
      activeChip={data?.active_chip ?? null}
      cache={cache ?? { status: null, ageSeconds: null }}
    />
  ), [data?.used_gw, data?.deadline, data?.team_value, data?.team_bank, data?.active_chip, cache]);

  const navActions = useMemo(() => (
    <div className="flex items-center gap-2">
      <Segmented<Mode>
        value={mode}
        onChange={setMode}
        options={[
          { label: "Squad", value: "squad" },
          { label: "Live", value: "live" },
        ]}
      />
      <select
        className="bg-background text-foreground border border-border rounded-xl px-3 py-1.5 text-sm disabled:opacity-60"
        value={gw ?? data?.used_gw ?? ""}
        onChange={(e) => setGw(Number(e.target.value))}
        disabled={mode === "live"}
      >
        {gwOptions.map((g) => (
          <option key={g} value={g}>GW {g}</option>
        ))}
      </select>
      <button
        className="btn"
        onClick={() => mode === "live" ? loadLive(true) : loadSquad({ gw, forceRefresh: true })}
        title="Force fresh fetch"
      >
        Refresh
      </button>
    </div>
  ), [mode, setMode, gw, data?.used_gw, gwOptions, loadLive, loadSquad]);

  useSetNavCenter(navMiddle);
  useSetNavActions(navActions);

  return (
    <>
      <DashboardLayout
        left={left}
        right={right}
      >
        {prefs.squadLayout === "pitch" ? (
          <PitchView players={data?.players} brand="FPL Helper" onPlayerClick={openPlayer} />
        ) : (
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