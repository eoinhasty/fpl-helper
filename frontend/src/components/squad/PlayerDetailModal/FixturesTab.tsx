import type { Player } from "../../../lib/types";
import { fdrClass } from "../../../lib/utils";
import { SectionHeader, KickoffLabel, NextFixturesStatus } from "./parts";
import type { NextFixtures, TeamFixture } from "./parts";

function FixtureCompactPill({ f }: { f: TeamFixture }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5 rounded-xl border border-border bg-muted/30 px-2 py-3 text-center">
      <span className="font-mono text-[10px] tracking-wide text-muted-foreground">GW{f.event}</span>
      <span className="text-sm leading-none font-semibold text-foreground">{f.opp}</span>
      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${fdrClass(f.difficulty)}`}>
        {f.home ? "H" : "A"} · {f.difficulty}
      </span>
    </div>
  );
}

export default function FixturesTab({
  player,
  fixtureGw,
  next,
}: {
  player: Player;
  fixtureGw?: number;
  next: NextFixtures;
}) {
  // fixtureGw's own fixtures are shown above, so the pills start after it
  const laterFixt = next.fixtures?.filter((f) => player.fixtures == null || f.event !== fixtureGw).slice(0, 5) ?? null;

  return (
    <div className="space-y-4">
      {/* This GW */}
      {player.fixtures != null && (
        <section>
          <SectionHeader
            label={fixtureGw ? `GW${fixtureGw}` : "This GW"}
            right={
              player.has_dgw ? (
                <span className="rounded-full border border-primary/30 bg-primary/15 px-1.5 py-0.5 text-[10px] text-primary">
                  DGW
                </span>
              ) : player.fixtures.length === 0 ? (
                <span className="rounded-full border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  BGW
                </span>
              ) : undefined
            }
          />
          {player.fixtures.length === 0 ? (
            <div className="text-sm text-muted-foreground">No fixture this gameweek.</div>
          ) : (
            <ul className="space-y-1">
              {player.fixtures.map((f) => (
                <li
                  key={`${f.opp}-${f.kickoff ?? ""}`}
                  className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
                >
                  <div className="flex flex-col">
                    <span className="font-medium">
                      {f.home ? "Home vs" : "Away at"} {f.opp}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      <KickoffLabel kickoff={f.kickoff} />
                    </span>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${fdrClass(f.difficulty)}`}>
                    FDR {f.difficulty}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Next fixtures — pills */}
      <section>
        <SectionHeader label={player.fixtures != null ? "After that" : "Next fixtures"} />
        <NextFixturesStatus
          next={next}
          hasTeam={!!player.team_id}
          isEmpty={laterFixt?.length === 0}
          emptyText="No upcoming fixtures found."
        />
        {!next.loading && !next.error && laterFixt && laterFixt.length > 0 && (
          <div className="flex gap-1.5">
            {laterFixt.map((f) => (
              <FixtureCompactPill key={`${f.event}-${f.kickoff ?? ""}`} f={f} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
