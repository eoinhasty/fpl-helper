// components/league/SwingCards.tsx — the players who move you against the league
import DataCard from "../ui/DataCard";
import PlayerOpen from "../squad/PlayerOpen";
import { pct, signed, type Swing } from "../../lib/leagueLive";
import { PlayerState, Shirt } from "./parts";

function Owned({ s }: { s: Swing }) {
  return (
    <span className="tabular-nums">
      {s.mine === 0 ? "not yours" : s.mine === 1 ? "yours" : `yours ×${s.mine}`} · league {pct(s.eo)}
    </span>
  );
}

function SwingRow({ s, value }: { s: Swing; value: React.ReactNode }) {
  return (
    <li>
      <PlayerOpen
        id={s.element}
        className="flex w-full items-center gap-2.5 rounded-lg border border-border bg-card px-2 py-1.5 text-left"
      >
        <Shirt url={s.player.shirt_url} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-foreground">
            {s.player.name} <span className="text-[11px] font-normal text-muted-foreground">{s.player.team}</span>
          </span>
          <span className="block truncate text-[11px] text-muted-foreground">
            <PlayerState player={s.player} />
            {s.player.state === "playing" && ` · ${s.player.points} pts`}
            {" · "}
            <Owned s={s} />
          </span>
        </span>
        {value}
      </PlayerOpen>
    </li>
  );
}

function PerPoint({ s }: { s: Swing }) {
  const up = s.perPoint > 0;
  return (
    <span
      className={`shrink-0 rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums ${
        up ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"
      }`}
      title={`Each point they score moves you ${Math.abs(s.perPoint).toFixed(1)} ${up ? "up on" : "down on"} the league average`}
    >
      {signed(s.perPoint)}/pt
    </span>
  );
}

function Group({ title, hint, rows, good }: { title: string; hint: string; rows: Swing[]; good: boolean }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
        <span aria-hidden className={`h-2 w-2 rounded-full ${good ? "bg-success" : "bg-destructive"}`} />
        {title}
      </div>
      <div className="text-[11px] text-muted-foreground">{hint}</div>
      {rows.length === 0 ? (
        <div className="mt-1.5 rounded-lg border border-dashed border-border px-2 py-2 text-xs text-muted-foreground">
          None left to play.
        </div>
      ) : (
        <ul className="mt-1.5 space-y-1.5">
          {rows.map((s) => (
            <SwingRow key={s.element} s={s} value={<PerPoint s={s} />} />
          ))}
        </ul>
      )}
    </div>
  );
}

/** Still to play: your differentials and the league's players you lack */
export function StillToCome({ yours, threats }: { yours: Swing[]; threats: Swing[] }) {
  return (
    <DataCard title="Still to play">
      <div className="space-y-4">
        <Group title="Your differentials" hint="You have more of them than the league does" rows={yours} good />
        <Group title="Threats" hint="The league has more of them than you do" rows={threats} good={false} />
        <p className="text-[11px] text-muted-foreground">
          +0.5/pt: every point they score moves you half a point up on the league average. League % is effective
          ownership — captains count twice.
        </p>
      </div>
    </DataCard>
  );
}

/** Who's moved you most against the league so far this GW */
export function SwungSoFar({ rows }: { rows: Swing[] }) {
  return (
    <DataCard
      title="What's moved you"
      empty={rows.length === 0}
      emptyMessage="Nothing's split you from the league yet."
    >
      <ul className="mt-1.5 space-y-1.5">
        {rows.map((s) => (
          <SwingRow
            key={s.element}
            s={s}
            value={
              <span className="shrink-0 text-right">
                <span
                  className={`block text-sm font-semibold tabular-nums ${s.net > 0 ? "text-success" : "text-destructive"}`}
                >
                  {signed(s.net)}
                </span>
                <span className="block text-[11px] text-muted-foreground tabular-nums">{s.player.points} pts</span>
              </span>
            }
          />
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-muted-foreground">Points gained or lost against the league average.</p>
    </DataCard>
  );
}
