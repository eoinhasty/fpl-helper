// pages/SquadDashboard.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode, KeyboardEvent } from "react";
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
import { money } from "../lib/format";

import type { Player } from "../lib/types";
import PlayerDetailModal from "../components/squad/PlayerDetailModal";
import LiveAuthGate from "../components/squad/LiveAuthGate";
import PreSeasonNotice from "../components/squad/PreSeasonNotice";

type Mode = "live" | "squad";

/** Plain label/value pair — no border, no card background. Used in the
 * mobile stats/controls row, which is deliberately borderless (see
 * SquadStatusBar/GwSelect's "plain" treatment below) rather than reusing
 * LeaguesCard's boxed Tile idiom. */
function StatText({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}

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
  // header on lg+, and again — as a plain/borderless variant — in the same
  // sticky header on mobile, see contentHeader below) rather than made
  // responsive in place, since the two contexts need very different
  // layouts and visual treatments around it. Same controlled state either
  // way; two mounted-but-hidden copies (one via `hidden lg:flex`, one via
  // `lg:hidden`) is a deliberate, accepted tradeoff over a JS media-query
  // hook — harmless here since neither copy fetches anything on its own.
  const modeControls = (
    <div className="flex items-center gap-2">
      <Segmented<Mode>
        value={mode}
        onChange={setMode}
        ariaLabel="View"
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

  // Plain/borderless equivalent of modeControls for the mobile sticky
  // header — hand-rolled rather than reusing <Segmented> (which is always
  // bordered) since this row is a deliberate, scoped exception to the
  // app's normal control styling. Kept keyboard-operable and at the same
  // 44px touch-target floor as everywhere else in the app despite having
  // no visible border to hint at that hit area.
  function onModeToggleKeyDown(e: KeyboardEvent) {
    if (["ArrowRight", "ArrowLeft", "Home", "End"].includes(e.key)) {
      e.preventDefault();
      setMode((m) => (m === "squad" ? "live" : "squad"));
    }
  }
  const plainModeToggleClass = (active: boolean) =>
    [
      "min-h-11 min-w-11 px-2 flex items-center justify-center rounded-md text-sm transition",
      "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      active ? "font-semibold text-primary-strong" : "text-muted-foreground",
    ].join(" ");
  const mobileModeControls = (
    <div className="flex items-center gap-3 shrink-0">
      <div role="radiogroup" aria-label="View" className="flex items-center" onKeyDown={onModeToggleKeyDown}>
        <button
          type="button"
          role="radio"
          aria-checked={mode === "squad"}
          onClick={() => setMode("squad")}
          className={plainModeToggleClass(mode === "squad")}
        >
          Squad
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={mode === "live"}
          onClick={() => setMode("live")}
          className={plainModeToggleClass(mode === "live")}
        >
          Live
        </button>
      </div>
      <GwSelect
        value={gw ?? data?.used_gw}
        options={gwOptions}
        onChange={setGw}
        disabled={mode === "live"}
        variant="plain"
        className="w-auto"
      />
      <button
        type="button"
        onClick={() => mode === "live" ? loadLive(true) : loadSquad({ gw, forceRefresh: true })}
        className="min-h-11 min-w-11 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground transition focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        title="Force fresh fetch"
        aria-label="Refresh"
      >
        ↻
      </button>
    </div>
  );

  const mobileStats = (
    <div className="flex items-end gap-4">
      <StatText label="Value" value={money(data?.team_value)} />
      <StatText label="Bank" value={money(data?.team_bank)} />
      {data?.active_chip && (
        <StatText
          label="Chip"
          value={<span className="uppercase">{data.active_chip.replace(/_/g, " ")}</span>}
        />
      )}
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

        {/* Mobile: two stacked rows, both sticky — badge/countdown/cache on
            top, then Value/Bank/chip + the mode controls below. Keeping the
            controls in the sticky header (not the scrolling content) means
            they stay reachable without scrolling back up, matching desktop;
            an earlier version moved them into scrolling content and lost
            that. Borderless/plain styling throughout is a deliberate,
            scoped exception to the app's normal bordered controls (see
            mobileModeControls above) — items-end so the two-line stat
            blocks and the single-line controls share a bottom edge instead
            of centering against each other. */}
        <div className="lg:hidden space-y-2">
          <SquadStatusBar {...statusBarProps} compact />
          <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 text-sm">
            {mobileStats}
            {mobileModeControls}
          </div>
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