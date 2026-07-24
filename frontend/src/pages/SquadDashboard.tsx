// pages/SquadDashboard.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import DashboardLayout from "../components/layout/DashboardLayout";
import LeaguesCard from "../components/left/LeaguesCard";
import TransferSuggestionsCard from "../components/left/TransferSuggestionsCard";
import XIList from "../components/squad/XIList";
import PitchView from "../components/pitch/PitchView";
import SquadStatusBar from "../components/squad/SquadStatusBar";
import RightPanel from "../components/right/RightPanel";
import { useEntryId } from "../hooks/useEntryID";
import { useSquad } from "../hooks/useSquad";
import { usePreferences } from "../hooks/usePreferences";
import { Segmented } from "../components/controls/Segmented";
import { GwSelect } from "../components/controls/GwSelect";

import type { Player } from "../lib/types";
import PlayerDetailModal from "../components/squad/PlayerDetailModal";
import LiveAuthGate from "../components/squad/LiveAuthGate";
import PreSeasonNotice from "../components/squad/PreSeasonNotice";

type Mode = "live" | "squad";

export default function SquadDashboard() {
  const { entry } = useEntryId();
  const { prefs } = usePreferences();
  const { data, loading, error, cache, seasonStatus, isSwitching, loadSquad, loadLive, clearData } = useSquad(entry);

  const [mode, setMode] = useState<Mode>(prefs.defaultView);
  const [gw, setGw] = useState<number | undefined>(undefined); // undefined => server fallback
  const prevMode = useRef(mode);

  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const openPlayer = (p: Player) => setSelectedPlayer(p);
  const closePlayer = () => setSelectedPlayer(null);

  // Keep Segmented in sync if Default View is changed in Settings.
  // mode is intentionally excluded — including it would reset the toggle on every click.
  useEffect(() => {
    setMode(prefs.defaultView as Mode);
  }, [prefs.defaultView]);

  useEffect(() => {
    if (!entry) return;
    // Discard the other mode's data on an actual mode switch — otherwise a
    // stale squad-mode snapshot (e.g. pre-season, empty players) can linger
    // and get misread as this mode's state (masking LiveAuthGate, etc.).
    if (prevMode.current !== mode) {
      clearData();
      prevMode.current = mode;
    }
    if (mode === "live") {
      loadLive();
      setGw(undefined); // lock gw for live
    } else {
      loadSquad({ gw });
    }
  }, [mode, gw, entry, loadSquad, loadLive, clearData]);

  // create GW options up to whichever GW we’ve seen
  const cap = data?.current_gw ?? 1;
  const gwOptions = useMemo(
    () => Array.from({ length: cap }, (_, i) => i + 1),
    [cap]
  );

  const isHistorical = data?.used_label === "explicit" && (data?.used_gw ?? 0) < (data?.current_gw ?? 0);
  const isPreSeason = data?.season_status === "pre_season" && (data?.players?.length ?? 0) === 0;

  const left = (
    <>
      <LeaguesCard entry={entry} preSeason={seasonStatus === "pre_season"} />
      <TransferSuggestionsCard entry={entry} />
    </>
  );

  const right = (
    <RightPanel
      entry={entry}
      players={data?.players}
      loading={loading}
      error={error === "AUTH_EXPIRED" ? null : error}
      isHistorical={isHistorical}
      onPlayerClick={openPlayer}
    />
  );

  const contentHeader = useMemo(() => (
    <div
      className="sticky z-30 border-b border-border bg-background/80 backdrop-blur"
      style={{ top: 0 }}
    >
    <div className="mx-auto px-4 py-2.5 flex items-center justify-between gap-4" style={{ maxWidth: 1400 }}>
      <SquadStatusBar
        gw={data?.used_gw}
        deadlineISO={data?.deadline}
        teamValue={data?.team_value}
        teamBank={data?.team_bank}
        activeChip={data?.active_chip ?? null}
        cache={cache ?? { status: null, ageSeconds: null }}
        isLive={mode === "live"}
        isSwitching={isSwitching}
      />
      <div className="flex items-center gap-2 shrink-0">
        <Segmented<Mode>
          value={mode}
          onChange={setMode}
          options={[
            { label: "Squad", value: "squad" },
            { label: "Live", value: "live" },
          ]}
        />
        <GwSelect
          value={gw ?? data?.used_gw}
          options={gwOptions}
          onChange={setGw}
          disabled={mode === "live"}
        />
        <button
          className="btn"
          onClick={() => mode === "live" ? loadLive(true) : loadSquad({ gw, forceRefresh: true })}
          title="Force fresh fetch"
          aria-label="Refresh"
        >
          ↻
        </button>
      </div>
    </div>
    </div>
  ), [data?.used_gw, data?.deadline, data?.team_value, data?.team_bank, data?.active_chip, cache, isSwitching, mode, setMode, gw, gwOptions, loadLive, loadSquad]);

  return (
    <>
      {contentHeader}
      <DashboardLayout
        left={left}
        right={right}
        stickyOffsetPx={52}
      >
        {mode === "live" ? (
          <LiveAuthGate key={error === "AUTH_EXPIRED" ? "expired" : "authed"} onAuthenticated={loadLive}>
            {isPreSeason ? (
              <PreSeasonNotice deadlineISO={data?.deadline} />
            ) : prefs.squadLayout === "pitch" ? (
              <PitchView players={data?.players} brand="FPL Helper" onPlayerClick={openPlayer} loading={loading} error={error === "AUTH_EXPIRED" ? null : error} />
            ) : (
              <XIList
                players={data?.players}
                loading={loading}
                error={error === "AUTH_EXPIRED" ? null : error}
                entryMissing={entry === ""}
                onPlayerClick={openPlayer}
              />
            )}
          </LiveAuthGate>
        ) : isPreSeason ? (
          <PreSeasonNotice deadlineISO={data?.deadline} />
        ) : (
          prefs.squadLayout === "pitch" ? (
            <PitchView players={data?.players} brand="FPL Helper" onPlayerClick={openPlayer} loading={loading} error={error} />
          ) : (
            <XIList
              players={data?.players}
              loading={loading}
              error={error}
              entryMissing={entry === ""}
              onPlayerClick={openPlayer}
            />
          )
        )}
      </DashboardLayout>

      {selectedPlayer && (
        <PlayerDetailModal key={selectedPlayer.element} open={true} onClose={closePlayer} player={selectedPlayer} />
      )}
    </>
  );
}