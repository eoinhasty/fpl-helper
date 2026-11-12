import * as React from "react";
import { fmtKickoff } from "../../../lib/format";

export type TeamFixture = {
  event: number;
  opp: string;
  home: boolean;
  difficulty: number;
  kickoff: string | null;
};

/** `/api/team-next` for the player's club, shared by Overview and Fixtures */
export type NextFixtures = {
  fixtures: TeamFixture[] | null;
  loading: boolean;
  error: string | null;
};

export function SectionHeader({ label, right }: { label: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-2.5">
      <div className="text-xs font-bold text-foreground/80 tracking-[-0.005em]">{label}</div>
      {right}
    </div>
  );
}

export function PositionTag({ posLabel }: { posLabel: string | null }) {
  if (!posLabel) return null;
  return (
    <span className="text-[10px] font-mono text-muted-foreground px-1.5 py-0.5 rounded bg-muted/50 tracking-widest">
      vs {posLabel}
    </span>
  );
}

// Fixture data is cached for a day, so its finished flags would lag a live
// matchday — go by the clock instead: a match is over ~115 min after kickoff.
const MATCH_MS = 115 * 60 * 1000;

export function KickoffLabel({ kickoff }: { kickoff: string | null | undefined }) {
  if (!kickoff) return fmtKickoff(null);
  const since = Date.now() - new Date(kickoff).getTime();
  if (since < 0) return fmtKickoff(kickoff);
  return since < MATCH_MS ? "In play" : "Played";
}

/** Loading / error / not-available / empty states for the next-fixtures list */
export function NextFixturesStatus({ next, hasTeam, isEmpty, emptyText }: {
  next: NextFixtures;
  hasTeam: boolean;
  isEmpty: boolean;
  emptyText: string;
}) {
  if (next.loading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  if (next.error) return <div className="text-sm text-destructive">{next.error}</div>;
  if (!hasTeam) return <div className="text-sm text-muted-foreground">Not available.</div>;
  if (isEmpty) return <div className="text-sm text-muted-foreground">{emptyText}</div>;
  return null;
}
