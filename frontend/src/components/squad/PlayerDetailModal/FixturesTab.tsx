import type { Player } from "../../../lib/types";
import { fdrClass } from "../../../lib/utils";
import { SectionHeader, KickoffLabel, NextFixturesStatus } from "./parts";
import type { NextFixtures, TeamFixture } from "./parts";

function FixtureCompactPill({ f }: { f: TeamFixture }) {
  return (
    <div className="flex-1 flex flex-col items-center gap-1.5 px-2 py-3 rounded-xl border border-border bg-muted/30 text-center min-w-0">
      <span className="text-[10px] text-muted-foreground tracking-wide font-mono">GW{f.event}</span>
      <span className="text-sm font-semibold text-foreground leading-none">{f.opp}</span>
      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${fdrClass(f.difficulty)}`}>
        {f.home ? "H" : "A"} · {f.difficulty}
      </span>
    </div>
  );
}

export default function FixturesTab({ player, fixtureGw, next }: {
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
              player.has_dgw
                ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30">DGW</span>
                : player.fixtures.length === 0
                ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">BGW</span>
                : undefined
            }
          />
          {player.fixtures.length === 0
            ? <div className="text-sm text-muted-foreground">No fixture this gameweek.</div>
            : (
              <ul className="space-y-1">
                {player.fixtures.map((f) => (
                  <li key={`${f.opp}-${f.kickoff ?? ""}`} className="text-sm flex items-center justify-between border border-border rounded-md px-3 py-2">
                    <div className="flex flex-col">
                      <span className="font-medium">{f.home ? "Home vs" : "Away at"} {f.opp}</span>
                      <span className="text-xs text-muted-foreground">
                        <KickoffLabel kickoff={f.kickoff} />
                      </span>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${fdrClass(f.difficulty)}`}>FDR {f.difficulty}</span>
                  </li>
                ))}
              </ul>
            )
          }
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
