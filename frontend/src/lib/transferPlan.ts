// lib/transferPlan.ts — the multi-GW transfer planner, solved in the browser.
// /api/transfer-plan ships the model as LP text (backend/app/services/planner.py);
// a Web Worker solves it with highs-js and decodePlan reads the solution back
// by variable name, mirroring planner.py's read_plan.
import type { SolveRequest, SolveResponse } from "../workers/planSolver";
import { FORMATIONS } from "./lineup";

export type PlanPlayer = {
  name: string;
  team: string | null;
  team_code: number | null;
  position: 1 | 2 | 3 | 4;
  /** Selling price for squad players, buying price otherwise */
  cost: number;
  /** Projected points per planned GW, the first × chance of playing */
  pts: number[];
};

/** A GW to play a chip in, or "best" for the solver to pick the week */
export type ChipChoice = number | "best" | null;

/** The card's options, as planner.build's (see FPLService.transfer_plan) */
export type PlanOptions = {
  no_hits: boolean;
  /** GW to play a wildcard in, from wildcard_gws */
  wildcard: number | null;
  /** From bench_boost_gws / triple_captain_gws */
  bench_boost: ChipChoice;
  triple_captain: ChipChoice;
  /** Squad players held for the whole horizon */
  keep: number[];
  /** Never bought; names kept since they drop out of the response's players */
  exclude: { id: number; name: string }[];
};

export const DEFAULT_PLAN_OPTIONS: PlanOptions = {
  no_hits: false,
  wildcard: null,
  bench_boost: null,
  triple_captain: null,
  keep: [],
  exclude: [],
};

export function planQuery(o: PlanOptions): string {
  const q = new URLSearchParams();
  if (o.no_hits) q.set("no_hits", "true");
  if (o.wildcard != null) q.set("wildcard", String(o.wildcard));
  if (o.bench_boost != null) q.set("bench_boost", String(o.bench_boost));
  if (o.triple_captain != null) q.set("triple_captain", String(o.triple_captain));
  for (const id of [...o.keep].sort((a, b) => a - b)) q.append("keep", String(id));
  for (const id of o.exclude.map((p) => p.id).sort((a, b) => a - b)) q.append("exclude", String(id));
  const s = q.toString();
  return s ? `?${s}` : "";
}

export type TransferPlanResponse =
  | { entry_id: number; available: false; reason: "season_over" | "no_projections" | "no_squad" | "free_hit" }
  | {
      entry_id: number;
      available: true;
      gws: number[];
      deadline: string | null;
      source: "my_team" | "picks";
      bank: number;
      free_transfers: number;
      /** Unlimited free transfers this GW (pre-season, or a wildcard): planned as a wildcard */
      unlimited_transfers: boolean;
      /** GWs in the horizon a wildcard could be played in (none while transfers are unlimited) */
      wildcard_gws: number[];
      /** GWs in the horizon each chip could be played in (none once used, or while active) */
      bench_boost_gws: number[];
      triple_captain_gws: number[];
      /** A Bench Boost / Triple Captain played for the next GW (logged in only): planned in gws[0] */
      active_chip: "bboost" | "3xc" | null;
      /** The options as applied: invalid ones (a sold player kept, a closed wildcard week) are dropped */
      options: PlanOptions;
      squad: number[];
      players: Record<string, PlanPlayer>;
      hit_cost: number;
      mip_rel_gap: number;
      model: string;
    };

export type PlanChip = "bboost" | "3xc";

export type PlanWeek = {
  gw: number;
  squad: number[];
  /** All 15 under a Bench Boost */
  xi: number[];
  captain: number;
  hits: number;
  /** Optional, as plans stored before chips have none */
  chip?: PlanChip | null;
  /** Sold and bought vs the previous GW's squad, by position */
  out: number[];
  into: number[];
  /** XI + captain (twice under a Triple Captain), before hits */
  points: number;
};

export type Plan = {
  weeks: PlanWeek[];
  /** Points over the horizon, net of hits */
  total: number;
  /** HiGHS's status: "Optimal" (within mip_rel_gap) or "Time limit reached" (best plan found in time) */
  status: string;
};

type Available = Extract<TransferPlanResponse, { available: true }>;

/** The GW the model plans as a wildcard: the chosen one, or this GW while transfers are unlimited */
export function planWildcard(resp: Available): number | null {
  return resp.unlimited_transfers ? resp.gws[0] : resp.options.wildcard;
}

export function decodePlan(values: Record<string, number>, resp: Available, status: string): Plan {
  const pool = Object.keys(resp.players).map(Number);
  const pos = (p: number) => resp.players[p].position;
  const byPos = (a: number, b: number) => pos(a) - pos(b);
  const on = (block: string, p: number, g: number) => (values[`${block}_${p}_${g}`] ?? 0) > 0.5;

  let prev = resp.squad;
  const weeks = resp.gws.map((gw, g) => {
    const squad = pool.filter((p) => on("x", p, g));
    const xi = pool.filter((p) => on("y", p, g));
    const captain = pool.find((p) => on("c", p, g));
    const chip: PlanChip | null =
      (values[`bb_${g}`] ?? 0) > 0.5 ? "bboost" : (values[`tc_${g}`] ?? 0) > 0.5 ? "3xc" : null;
    if (squad.length !== 15 || xi.length !== (chip === "bboost" ? 15 : 11) || captain == null) {
      throw new Error(`Incomplete plan for GW${gw}`);
    }
    const pts = (p: number) => resp.players[p].pts[g] ?? 0;
    const hits = gw === planWildcard(resp) ? 0 : Math.round(values[`h_${g}`] ?? 0);
    const week: PlanWeek = {
      gw,
      squad,
      xi,
      captain,
      hits,
      chip,
      out: prev.filter((p) => !squad.includes(p)).sort(byPos),
      into: squad.filter((p) => !prev.includes(p)).sort(byPos),
      points: xi.reduce((s, p) => s + pts(p), 0) + (chip === "3xc" ? 2 : 1) * pts(captain),
    };
    prev = squad;
    return week;
  });
  const total = weeks.reduce((s, w) => s + w.points - w.hits * resp.hit_cost, 0);
  return { weeks, total, status };
}

/** A Bench Boost's projected gain for these 15 in the g-th planned GW: their
 * total minus their best XI's (planner.bench_boost_gain) */
export function benchBoostGain(squad: number[], g: number, resp: Available): number {
  const pts = (p: number) => resp.players[p].pts[g] ?? 0;
  const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
  const [gks, defs, mids, fwds] = [1, 2, 3, 4].map((pos) =>
    squad
      .filter((p) => resp.players[p].position === pos)
      .map(pts)
      .sort((a, b) => b - a),
  );
  const bestXi = Math.max(
    ...FORMATIONS.map(([d, m, f]) => gks[0] + sum(defs.slice(0, d)) + sum(mids.slice(0, m)) + sum(fwds.slice(0, f))),
  );
  return sum(squad.map(pts)) - bestXi;
}

/** Projected points the week's chip adds: the captain's third score under a
 * Triple Captain, the bench's under a Bench Boost */
export function chipGain(week: PlanWeek, g: number, resp: Available): number {
  if (week.chip === "3xc") return resp.players[week.captain].pts[g] ?? 0;
  return week.chip === "bboost" ? benchBoostGain(week.squad, g, resp) : 0;
}

// One worker, reused across solves; a failed WASM instance isn't reusable, so
// any failure terminates it and the next solve spawns a fresh one.
let worker: Worker | null = null;
let queue: Promise<unknown> = Promise.resolve();

function runSolve(req: SolveRequest): Promise<SolveResponse> {
  return new Promise((resolve) => {
    worker ??= new Worker(new URL("../workers/planSolver.ts", import.meta.url), { type: "module" });
    const w = worker;
    const done = (res: SolveResponse) => {
      w.onmessage = null;
      w.onerror = null;
      if (!res.ok) {
        w.terminate();
        if (worker === w) worker = null;
      }
      resolve(res);
    };
    w.onmessage = (e: MessageEvent<SolveResponse>) => done(e.data);
    w.onerror = (e) => {
      e.preventDefault();
      done({ ok: false, error: e.message || "Solver crashed" });
    };
    w.postMessage(req);
  });
}

/** Seconds; a desktop solves in ~3, a slow phone may hit this and use the best plan found so far. */
const SOLVE_TIME_LIMIT = 30;

/** Solves are cached by model text, so revisiting the dashboard doesn't re-solve an unchanged model. */
const solved = new Map<string, Promise<Plan>>();
const MAX_CACHED = 3;

// The last solved plan also persists across reloads, keyed by a hash of the
// model: a mid-range phone takes ~20 s to solve (4× CPU throttle, 2026-11-02),
// and the model only changes with prices, projections or the squad.
const STORAGE_KEY = "fpl-plan-v1";

async function modelHash(model: string): Promise<string | null> {
  try {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(model));
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return null; // no crypto.subtle outside a secure context — just don't persist
  }
}

function readStoredPlan(hash: string | null): Plan | null {
  if (!hash) return null;
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as { hash: string; plan: Plan } | null;
    return stored?.hash === hash ? stored.plan : null;
  } catch {
    return null;
  }
}

function storePlan(hash: string | null, plan: Plan) {
  if (!hash) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ hash, plan }));
  } catch {
    // storage full or blocked — the in-memory cache still covers this visit
  }
}

// The model asked for last: a queued solve for an older one (the card's
// options changed again meanwhile) is skipped rather than holding up this one
let latest: string | null = null;

/** Solves the plan, or rejects (the caller falls back to transfer suggestions). */
export function solvePlan(resp: Available): Promise<Plan> {
  latest = resp.model;
  const cached = solved.get(resp.model);
  if (cached) return cached;
  const options = { mip_rel_gap: resp.mip_rel_gap, time_limit: SOLVE_TIME_LIMIT, output_flag: false };
  const result = modelHash(resp.model).then(async (hash) => {
    const stored = readStoredPlan(hash);
    if (stored) return stored;
    // Serialise: the worker handles one model at a time
    const run = queue.then(() =>
      latest === resp.model
        ? runSolve({ model: resp.model, options })
        : ({ ok: false, error: "Superseded" } satisfies SolveResponse),
    );
    queue = run.catch(() => {});
    const res = await run;
    if (!res.ok) throw new Error(res.error);
    const plan = decodePlan(res.values, resp, res.status);
    storePlan(hash, plan);
    return plan;
  });
  solved.set(resp.model, result);
  result.catch(() => solved.delete(resp.model));
  if (solved.size > MAX_CACHED) solved.delete(solved.keys().next().value!);
  return result;
}
