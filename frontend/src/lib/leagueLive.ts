// lib/leagueLive.ts — pure helpers over /api/leagues/{id}/live
import type { LeagueLiveEntry, LeagueLivePlayer } from "./types";

export type PlayerMap = Record<string, LeagueLivePlayer>;

/** element → multiplier for one entry (0 = bench, missing = not owned) */
export function multipliers(entry: LeagueLiveEntry): Map<number, number> {
  return new Map((entry.picks ?? []).map((p) => [p.element, p.multiplier]));
}

/**
 * League effective ownership: each player's average multiplier across the
 * scored entries (a starter counts 1, a captain 2, a triple captain 3, the
 * bench 0), so 1.4 = 140%. Every point the player scores moves the league
 * average by this much.
 */
export function leagueEo(entries: LeagueLiveEntry[]): Map<number, number> {
  const scored = entries.filter((e) => e.picks);
  const sums = new Map<number, number>();
  for (const e of scored) for (const p of e.picks ?? []) sums.set(p.element, (sums.get(p.element) ?? 0) + p.multiplier);
  const n = scored.length || 1;
  return new Map([...sums].map(([el, s]) => [el, s / n]));
}

export type Swing = {
  element: number;
  player: LeagueLivePlayer;
  /** Your multiplier */
  mine: number;
  eo: number;
  /** What each point the player scores does to you against the league average */
  perPoint: number;
  /** perPoint × the points scored so far */
  net: number;
};

/** Every player you or the league started, with what they mean for you */
export function swings(me: LeagueLiveEntry, eo: Map<number, number>, players: PlayerMap): Swing[] {
  const mine = multipliers(me);
  const ids = new Set([...eo.keys(), ...mine.keys()]);
  const out: Swing[] = [];
  for (const el of ids) {
    const player = players[el];
    if (!player) continue;
    const m = mine.get(el) ?? 0;
    const e = eo.get(el) ?? 0;
    const perPoint = m - e;
    out.push({ element: el, player, mine: m, eo: e, perPoint, net: perPoint * player.points });
  }
  return out;
}

// Under a tenth of a point per point either way, a player hardly matters
const MIN_PER_POINT = 0.1;

/** Players still to play (or playing) who matter to you: yours that few others
 * have, and the league's that you don't, biggest effect first */
export function stillToCome(all: Swing[], limit = 5) {
  const open = all.filter((s) => s.player.state !== "done" && Math.abs(s.perPoint) >= MIN_PER_POINT);
  const by = (a: Swing, b: Swing) => Math.abs(b.perPoint) - Math.abs(a.perPoint);
  return {
    yours: open
      .filter((s) => s.perPoint > 0)
      .sort(by)
      .slice(0, limit),
    threats: open
      .filter((s) => s.perPoint < 0)
      .sort(by)
      .slice(0, limit),
  };
}

/** The players who've moved you most against the league so far this GW */
export function swungSoFar(all: Swing[], limit = 6): Swing[] {
  return all
    .filter((s) => Math.abs(s.net) >= 0.5)
    .sort((a, b) => Math.abs(b.net) - Math.abs(a.net))
    .slice(0, limit);
}

export type Difference = { element: number; player: LeagueLivePlayer; times: number; points: number };

/**
 * What separates two teams: shared players with the same multiplier cancel
 * out, so what's left on each side adds up to the GW points gap (before hits).
 * A captain both own counts once more for whoever captained them.
 */
export function headToHead(a: LeagueLiveEntry, b: LeagueLiveEntry, players: PlayerMap) {
  const ma = multipliers(a);
  const mb = multipliers(b);
  const ours: Difference[] = [];
  const theirs: Difference[] = [];
  for (const el of new Set([...ma.keys(), ...mb.keys()])) {
    const d = (ma.get(el) ?? 0) - (mb.get(el) ?? 0);
    const player = players[el];
    if (!d || !player) continue;
    const row = { element: el, player, times: Math.abs(d), points: Math.abs(d) * player.points };
    (d > 0 ? ours : theirs).push(row);
  }
  const order = (x: Difference, y: Difference) => y.points - x.points || y.times - x.times;
  ours.sort(order);
  theirs.sort(order);
  const total = (xs: Difference[]) => xs.reduce((s, x) => s + x.points, 0);
  const left = (xs: Difference[]) => xs.filter((x) => x.player.state !== "done").length;
  return {
    ours,
    theirs,
    oursPoints: total(ours),
    theirsPoints: total(theirs),
    oursLeft: left(ours),
    theirsLeft: left(theirs),
  };
}

export function pct(eo: number): string {
  return `${Math.round(eo * 100)}%`;
}

export function signed(n: number, digits = 1): string {
  const v = Number(n.toFixed(digits));
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(digits)}`;
}

/** "3 left" or "done" for an entry's XI */
export function leftLabel(row: LeagueLiveEntry): string | null {
  if (row.playing == null || row.to_play == null) return null;
  const left = row.playing + row.to_play;
  return left ? `${left} left` : "done";
}
