// lib/plannerAdapter.ts
import type { Player, PoolPlayer, PoolPosition } from "./types";

const POSITION_ID: Record<PoolPosition, 1 | 2 | 3 | 4> = { GK: 1, DEF: 2, MID: 3, FWD: 4 };

/** Maps a drafted PoolPlayer into the squad Player shape so PitchView / PlayerDetailModal
 * can be reused as-is. start_probability is deliberately 0 — it's a required Player field,
 * but planner surfaces must hide the StartMeter/start-prob badge rather than show a
 * meaningless 0%, via the hideStartMeter / hideStartProbability props on those components. */
export function poolPlayerToPlayer(p: PoolPlayer, slot: number): Player {
  return {
    element: p.id,
    name: p.web_name,
    team: p.team_short ?? "",
    team_id: p.team,
    position: POSITION_ID[p.position],
    price: p.now_cost,
    status: p.status,
    news: p.news,
    total_points: p.total_points,
    form: p.form,
    ep_next: p.ep_next,
    selected_by_percent: p.selected_by_percent,
    start_probability: 0,
    fixtures: p.fixtures,
    fixture: p.fixtures?.[0] ?? null,
    has_dgw: (p.fixtures?.length ?? 0) > 1,
    slot,
    multiplier: slot <= 11 ? 1 : 0,
    shirt_url: p.shirt_url,
  };
}

function byPriceDesc(picks: PoolPlayer[], pos: PoolPosition): PoolPlayer[] {
  return picks.filter((p) => p.position === pos).sort((a, b) => b.now_cost - a.now_cost);
}

/** Builds a legal starting XI (1 GK + a DEF/MID/FWD split within FPL's 3-5 / 2-5 / 1-3
 * bounds, default 4-4-2) rather than naively slicing slots 1-11 in position order —
 * a fixed slice puts both GKs "in goal" and benches every forward for a full 2/5/5/3
 * squad. Remaining players (by position) go to the bench, slots 12-15. Degrades
 * gracefully for partial (mid-draft) squads: PitchView already tolerates fewer than
 * 11 starters. */
export function poolToSquadPlayers(picks: PoolPlayer[]): Player[] {
  const gk = byPriceDesc(picks, "GK");
  const def = byPriceDesc(picks, "DEF");
  const mid = byPriceDesc(picks, "MID");
  const fwd = byPriceDesc(picks, "FWD");

  const startGk = Math.min(1, gk.length);
  let startDef = Math.min(4, def.length);
  let startMid = Math.min(4, mid.length);
  let startFwd = Math.min(2, fwd.length);

  // Fill any remaining outfield slots (up to 10) from whichever line has spare
  // players, respecting the legal caps (DEF<=5, MID<=5, FWD<=3) — prefer FWD/MID
  // first since a 4-4-2 default already gives DEF its full share.
  let remaining = 10 - (startDef + startMid + startFwd);
  const lines: Array<{ get: () => number; set: (v: number) => void; max: number }> = [
    { get: () => startFwd, set: (v) => (startFwd = v), max: Math.min(3, fwd.length) },
    { get: () => startMid, set: (v) => (startMid = v), max: Math.min(5, mid.length) },
    { get: () => startDef, set: (v) => (startDef = v), max: Math.min(5, def.length) },
  ];
  for (const line of lines) {
    while (remaining > 0 && line.get() < line.max) {
      line.set(line.get() + 1);
      remaining--;
    }
  }

  const xi = [
    ...gk.slice(0, startGk),
    ...def.slice(0, startDef),
    ...mid.slice(0, startMid),
    ...fwd.slice(0, startFwd),
  ];
  const bench = [
    ...gk.slice(startGk),
    ...def.slice(startDef),
    ...mid.slice(startMid),
    ...fwd.slice(startFwd),
  ];

  return [
    ...xi.map((p, i) => poolPlayerToPlayer(p, i + 1)),
    ...bench.map((p, i) => poolPlayerToPlayer(p, 12 + i)),
  ];
}
