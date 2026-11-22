// components/league/HeadToHead.tsx — what separates two teams this GW
import PlayerOpen from "../squad/PlayerOpen";
import { headToHead, type Difference, type PlayerMap } from "../../lib/leagueLive";
import type { LeagueLiveEntry } from "../../lib/types";
import { PlayerState, Shirt } from "./parts";

function Side({
  title,
  rows,
  points,
  left,
  winning,
}: {
  title: string;
  rows: Difference[];
  points: number;
  left: number;
  winning: boolean | null;
}) {
  const tone = winning == null ? "bg-muted/50" : winning ? "bg-success/10" : "bg-destructive/10";
  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-card">
      <div className={`flex items-baseline justify-between gap-2 px-3 py-2 ${tone}`}>
        <span className="truncate text-xs font-semibold text-foreground">{title}</span>
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
          <span className="text-base font-bold text-foreground">{points}</span> pts
          {left > 0 && ` · ${left} to play`}
        </span>
      </div>
      {rows.length === 0 ? (
        <div className="px-3 py-2 text-xs text-muted-foreground">No players the other side doesn't have.</div>
      ) : (
        <ul className="divide-y divide-border/60">
          {rows.map((d) => (
            <li key={d.element}>
              <PlayerOpen id={d.element} className="flex w-full items-center gap-2 px-3 py-1.5 text-left">
                <Shirt url={d.player.shirt_url} size="h-6 w-6" />
                <span className="min-w-0 flex-1 truncate text-xs">
                  <span className="font-medium text-foreground">{d.player.name}</span>
                  {d.times > 1 && <span className="text-muted-foreground"> ×{d.times}</span>}
                  <span className="text-muted-foreground">
                    {" · "}
                    <PlayerState player={d.player} />
                  </span>
                </span>
                <span className="shrink-0 text-sm font-semibold text-foreground tabular-nums">{d.points}</span>
              </PlayerOpen>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Two teams with what they share cancelled out: each side adds up to its
 * share of the GW points gap (before hits) */
export default function HeadToHead({
  me,
  them,
  players,
}: {
  me: LeagueLiveEntry;
  them: LeagueLiveEntry;
  players: PlayerMap;
}) {
  if (!me.picks || !them.picks)
    return <div className="text-xs text-muted-foreground">FPL isn't serving one of these teams' picks right now.</div>;
  const h = headToHead(me, them, players);
  const edge = h.oursPoints - h.theirsPoints;
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Shared players cancel out.{" "}
        {edge === 0 ? (
          "Level on the players that differ so far"
        ) : (
          <>
            You're{" "}
            <span className={`font-semibold ${edge > 0 ? "text-success" : "text-destructive"}`}>
              {edge > 0 ? "+" : "−"}
              {Math.abs(edge)}
            </span>{" "}
            on the players that differ
          </>
        )}
        {(me.hits ?? 0) !== (them.hits ?? 0) && ", before hits"}.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Side
          title="Only you"
          rows={h.ours}
          points={h.oursPoints}
          left={h.oursLeft}
          winning={edge === 0 ? null : edge > 0}
        />
        <Side
          title={`Only ${them.entry_name ?? "them"}`}
          rows={h.theirs}
          points={h.theirsPoints}
          left={h.theirsLeft}
          winning={edge === 0 ? null : edge < 0}
        />
      </div>
    </div>
  );
}
