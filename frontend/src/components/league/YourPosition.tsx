// components/league/YourPosition.tsx — where you stand, who's either side of
// you, and what separates you from them
import * as React from "react";
import { num } from "../../lib/format";
import { leftLabel, type PlayerMap } from "../../lib/leagueLive";
import type { LeagueLiveEntry } from "../../lib/types";
import HeadToHead from "./HeadToHead";
import { Movement } from "./parts";

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-card px-3 py-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="text-xl leading-7 font-bold text-foreground tabular-nums">{value}</div>
      {sub && <div className="truncate text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

/** Every team on one line by total points: how bunched the league is around you */
function PointsStrip({ me, rows }: { me: LeagueLiveEntry; rows: LeagueLiveEntry[] }) {
  const totals = rows.map((r) => r.total);
  const lo = Math.min(...totals);
  const hi = Math.max(...totals);
  const at = (t: number) => (hi === lo ? 50 : ((t - lo) / (hi - lo)) * 100);
  return (
    <div>
      <div className="relative mx-1.5 h-6" aria-hidden>
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-muted" />
        {rows
          .filter((r) => r.entry !== me.entry)
          .map((r) => (
            <span
              key={r.entry}
              title={`${r.entry_name} · ${num(r.total)}`}
              className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-card bg-muted-foreground/50"
              style={{ left: `${at(r.total)}%` }}
            />
          ))}
        <span
          className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-primary shadow"
          style={{ left: `${at(me.total)}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-muted-foreground tabular-nums">
        <span>{num(lo)}</span>
        <span>
          You're {num(hi - me.total)} off the top · {num(me.total - lo)} clear of the bottom
        </span>
        <span>{num(hi)}</span>
      </div>
    </div>
  );
}

function Neighbour({
  row,
  gap,
  above,
  active,
  onPick,
}: {
  row: LeagueLiveEntry;
  gap: number;
  above: boolean;
  active: boolean;
  onPick: () => void;
}) {
  const left = leftLabel(row);
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={active}
      className={`min-w-0 flex-1 cursor-pointer rounded-xl border px-3 py-2 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none ${
        active ? "border-primary bg-primary/10" : "border-border hover:bg-muted/50"
      }`}
    >
      <div className="text-[11px] text-muted-foreground">
        {above ? "Above you" : "Below you"} · #{row.rank}
      </div>
      <div className="truncate text-sm font-medium text-foreground">{row.entry_name}</div>
      <div className="text-xs text-muted-foreground tabular-nums">
        <span className={`font-semibold ${above ? "text-destructive" : "text-success"}`}>
          {gap === 0 ? "level" : `${num(gap)} ${above ? "ahead" : "behind"}`}
        </span>
        {left && ` · ${left}`}
      </div>
    </button>
  );
}

export default function YourPosition({
  me,
  rows,
  players,
}: {
  me: LeagueLiveEntry;
  rows: LeagueLiveEntry[];
  players: PlayerMap;
}) {
  const i = rows.findIndex((r) => r.entry === me.entry);
  const above = i > 0 ? rows[i - 1] : null;
  const below = i >= 0 && i < rows.length - 1 ? rows[i + 1] : null;
  const [pick, setPick] = React.useState<number | null>(null);
  const rival = rows.find((r) => r.entry === pick) ?? above ?? below;
  const left = leftLabel(me);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <Stat
          label="Your rank"
          value={
            <span className="inline-flex items-baseline gap-1.5">
              {me.rank}
              <Movement row={me} />
            </span>
          }
          sub={`of ${rows.length} · was ${me.pre_rank}`}
        />
        <Stat label="GW points" value={me.gw_points} sub={me.hits ? `after −${me.hits} hit` : (left ?? undefined)} />
        <Stat label="Total" value={num(me.total)} sub={me.hits ? (left ?? undefined) : undefined} />
      </div>

      {rows.length > 2 && <PointsStrip me={me} rows={rows} />}

      {(above || below) && (
        <div className="flex gap-2">
          {above && (
            <Neighbour
              row={above}
              gap={above.total - me.total}
              above
              active={rival?.entry === above.entry}
              onPick={() => setPick(above.entry)}
            />
          )}
          {below && (
            <Neighbour
              row={below}
              gap={me.total - below.total}
              above={false}
              active={rival?.entry === below.entry}
              onPick={() => setPick(below.entry)}
            />
          )}
        </div>
      )}

      {rival && (
        <div className="border-t border-border pt-3">
          <div className="mb-2 text-sm font-semibold text-foreground">You vs {rival.entry_name}</div>
          <HeadToHead me={me} them={rival} players={players} />
        </div>
      )}
    </div>
  );
}
