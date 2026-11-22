// components/league/LeagueTable.tsx — the live table, one line per team; tap a
// rival to see what separates you
import * as React from "react";
import { num } from "../../lib/format";
import { leftLabel, type PlayerMap } from "../../lib/leagueLive";
import type { LeagueLiveEntry } from "../../lib/types";
import HeadToHead from "./HeadToHead";
import { Chip, LiveDot, Movement, Shirt } from "./parts";

const GRID =
  "grid grid-cols-[2.25rem_minmax(0,1fr)_3rem_4rem] md:grid-cols-[2.5rem_minmax(0,1fr)_11rem_4.5rem_3.5rem_4.5rem]";

function Captain({ row, players }: { row: LeagueLiveEntry; players: PlayerMap }) {
  const c = row.captain;
  if (!c) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <Shirt url={players[c.element]?.shirt_url} size="h-6 w-6" />
      <span className="shrink-0 text-[10px] font-bold text-muted-foreground">
        {c.vice ? "VC" : c.multiplier === 3 ? "TC" : "C"}
      </span>
      <span className="truncate text-foreground">{c.name}</span>
      <span className="shrink-0 text-muted-foreground tabular-nums">{c.points}</span>
      {c.state === "playing" && <LiveDot />}
    </span>
  );
}

function Row({
  row,
  mine,
  open,
  onToggle,
  players,
}: {
  row: LeagueLiveEntry;
  players: PlayerMap;
  mine: boolean;
  open: boolean;
  onToggle?: () => void;
}) {
  const left = leftLabel(row);
  const body = (
    <>
      <span className="flex flex-col items-start leading-tight">
        <span className="font-semibold text-foreground tabular-nums">{row.rank}</span>
        <Movement row={row} />
      </span>
      <span className="min-w-0 text-left">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate font-medium text-foreground">{row.entry_name}</span>
          <Chip chip={row.chip} />
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {row.player_name}
          {!!row.auto_subs?.length && (
            <span title={`Projected auto-subs: ${row.auto_subs.map((s) => `${s.in} for ${s.out}`).join(", ")}`}>
              {" · Auto-sub: "}
              {row.auto_subs.map((s) => `${s.in} for ${s.out}`).join(", ")}
            </span>
          )}
          {/* Captain and players left fold in here below md */}
          <span className="md:hidden">
            {row.captain && ` · ${row.captain.vice ? "VC" : "C"} ${row.captain.name} ${row.captain.points}`}
            {left && ` · ${left}`}
          </span>
        </span>
      </span>
      <span className="hidden min-w-0 text-xs md:flex">
        {row.unscored ? (
          <span className="text-muted-foreground">picks unavailable</span>
        ) : (
          <Captain row={row} players={players} />
        )}
      </span>
      <span className="hidden text-xs text-muted-foreground tabular-nums md:block">{left}</span>
      <span className="text-right">
        <span className="block text-base font-bold text-foreground tabular-nums">{row.gw_points}</span>
        {!!row.hits && <span className="block text-[10px] text-destructive tabular-nums">−{row.hits}</span>}
      </span>
      <span className="text-right font-medium text-foreground tabular-nums">{num(row.total)}</span>
    </>
  );
  const cls = `${GRID} w-full items-center gap-x-3 px-4 py-2.5 text-left text-sm`;
  return (
    <li className={`border-b border-border/60 last:border-0 ${mine ? "bg-primary/10" : ""}`}>
      {onToggle ? (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className={`${cls} cursor-pointer hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset`}
          title={open ? "Hide" : "Compare with your team"}
        >
          {body}
        </button>
      ) : (
        <div className={cls}>{body}</div>
      )}
    </li>
  );
}

export default function LeagueTable({
  rows,
  me,
  players,
}: {
  rows: LeagueLiveEntry[];
  me: LeagueLiveEntry | null;
  players: PlayerMap;
}) {
  const [openId, setOpenId] = React.useState<number | null>(null);
  return (
    <div>
      <div
        className={`${GRID} gap-x-3 border-b border-border bg-muted/40 px-4 py-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase`}
      >
        <span>#</span>
        <span>Team</span>
        <span className="hidden md:block">Captain</span>
        <span className="hidden md:block">Left</span>
        <span className="text-right">GW</span>
        <span className="text-right">Total</span>
      </div>
      <ul>
        {rows.map((r) => {
          const mine = me?.entry === r.entry;
          const open = openId === r.entry;
          return (
            <React.Fragment key={r.entry}>
              <Row
                row={r}
                mine={mine}
                open={open}
                players={players}
                onToggle={me && !mine ? () => setOpenId(open ? null : r.entry) : undefined}
              />
              {open && me && (
                <li className="border-b border-border/60 bg-muted/30 px-4 py-3">
                  <HeadToHead me={me} them={r} players={players} />
                </li>
              )}
            </React.Fragment>
          );
        })}
      </ul>
    </div>
  );
}
