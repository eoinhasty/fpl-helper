// pages/SquadDashboard.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import DashboardLayout from "../components/layout/DashboardLayout";
import LeaguesCard from "../components/left/LeaguesCard";
import TransferSuggestionsCard from "../components/left/TransferSuggestionsCard";
import XIList from "../components/squad/XIList";
import PitchView from "../components/pitch/PitchView";
import SquadStatusBar from "../components/squad/SquadStatusBar";
import SquadStatTiles from "../components/squad/SquadStatTiles";
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
  const {
    data, cache, seasonStatus, isSwitching,
    squadLoading, squadError, liveLoading, liveError,
    loadSquad, loadLive, clearData,
  } = useSquad(entry);

  const [mode, setMode] = useState<Mode>(prefs.defaultView);
  const [gw, setGw] = useState<number | undefined>(undefined); // undefined => server fallback
  const prevMode = useRef(mode);

  const loading = mode === "live" ? liveLoading : squadLoading;
  const error = mode === "live" ? liveError : squadError;

  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const openPlayer = (p: Player) => setSelectedPlayer(p);
  const closePlayer = () => setSelectedPlayer(null);

  // Keep Segmented in sync if Default View is changed in Settings.
  // mode is intentionally excluded — including it would reset the toggle on every click.
  useEffect(() => {
    setMode(prefs.defaultView as Mode);
  }, [prefs.defaultView]);

  // Discard the other mode's data on an actual mode switch — otherwise a
  // stale squad-mode snapshot (e.g. pre-season, empty players) can linger
  // and get misread as this mode's state (masking LiveAuthGate, etc.). Kept
  // as its own effect (rather than folded into the load effects below) so
  // that setGw(undefined) doesn't sit in the live-load effect's dependency
  // list — it would otherwise re-trigger that effect and double-fetch.
  useEffect(() => {
    if (prevMode.current === mode) return;
    prevMode.current = mode;
    clearData();
    if (mode === "live") setGw(undefined); // lock gw for live
  }, [mode, clearData]);

  useEffect(() => {
    if (!entry || mode !== "live") return;
    loadLive();
  }, [entry, mode, loadLive]);

  useEffect(() => {
    if (!entry || mode !== "squad") return;
    loadSquad({ gw });
  }, [entry, mode, gw, loadSquad]);

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

  // Squad/Live + GW picker + refresh — rendered twice (inline in the sticky
  // header on lg+, and again in the scrolling content on mobile, see below)
  // rather than made responsive in place, since the two contexts need very
  // different layouts around it. Same controlled state either way.
  const modeControls = (
    <div className="flex items-center gap-2">
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
  );

  const statusBarProps = {
    gw: data?.used_gw,
    deadlineISO: data?.deadline,
    teamValue: data?.team_value,
    teamBank: data?.team_bank,
    activeChip: data?.active_chip ?? null,
    cache: cache ?? { status: null, ageSeconds: null },
    isLive: mode === "live",
    isSwitching,
  };

  const contentHeader = (
    <div
      className="sticky z-30 border-b border-border bg-background/80 backdrop-blur"
      style={{ top: 0 }}
    >
      <div className="mx-auto px-4 py-2.5" style={{ maxWidth: 1400 }}>
        {/* Desktop/tablet: everything in one row */}
        <div className="hidden lg:flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <SquadStatusBar {...statusBarProps} />
          <div className="shrink-0">{modeControls}</div>
        </div>

        {/* Mobile: just the essentials — Value/Bank/chip and the mode
            controls move into the scrolling content instead, see below. */}
        <div className="flex lg:hidden">
          <SquadStatusBar {...statusBarProps} compact />
        </div>
      </div>
    </div>
  );

  return (
    <>
      {contentHeader}
      <DashboardLayout
        left={left}
        right={right}
        stickyOffsetPx={52}
      >
        {/* Mobile: Value/Bank/chip + the mode controls, relocated out of the
            cramped sticky header (see contentHeader above) into normal
            scrolling content, right above the squad itself. */}
        <div className="lg:hidden space-y-3">
          {modeControls}
          <SquadStatTiles teamValue={data?.team_value} teamBank={data?.team_bank} activeChip={data?.active_chip ?? null} />
        </div>

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
        <PlayerDetailModal key={selectedPlayer.element} open={true} onClose={closePlayer} player={selectedPlayer} season={data?.season} />
      )}
    </>
  );
}