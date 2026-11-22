// components/league/parts.tsx — small shared pieces of the live league page
import type { LeagueLiveEntry, LeagueLivePlayer } from "../../lib/types";
import { CHIP_NAMES } from "../../lib/utils";

export function LiveDot() {
  return <span aria-hidden className="inline-block h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-success" />;
}

/** Where a player is in the GW: live, their fixture still to come, or done */
export function PlayerState({ player }: { player: LeagueLivePlayer }) {
  if (player.state === "playing")
    return (
      <span className="inline-flex items-center gap-1 font-medium text-success">
        <LiveDot />
        Live
      </span>
    );
  if (player.state === "to_play") return <span>{player.fixtures.join(", ") || "To play"}</span>;
  return <span>{player.fixtures.length ? "Played" : "Blank"}</span>;
}

export function Movement({ row }: { row: LeagueLiveEntry }) {
  const d = row.pre_rank - row.rank;
  if (d === 0) return null;
  const up = d > 0;
  return (
    <span
      className={`text-[10px] font-semibold tabular-nums ${up ? "text-success" : "text-destructive"}`}
      title={`${up ? "Up" : "Down"} ${Math.abs(d)} since the gameweek started`}
    >
      {up ? "▲" : "▼"}
      {Math.abs(d)}
    </span>
  );
}

export function Chip({ chip }: { chip: string | null }) {
  if (!chip) return null;
  const [short, full] = CHIP_NAMES[chip] ?? [chip, chip];
  return (
    <span className="badge pill-warn shrink-0 font-semibold" title={full}>
      {short}
    </span>
  );
}

/** A club shirt, the same treatment as the captaincy and transfer cards */
export function Shirt({ url, size = "h-7 w-7" }: { url: string | null | undefined; size?: string }) {
  return url ? (
    <img src={url} alt="" loading="lazy" className={`${size} shrink-0 object-contain`} />
  ) : (
    <span aria-hidden className={`${size} shrink-0`} />
  );
}
