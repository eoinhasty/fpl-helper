import { useEffect, useState } from "react";
import type { PoolPlayer, PoolPosition } from "../lib/types";

const KEY = "fpl-draft-v2";
const EVT = "fpl:draft:update";

export const BUDGET = 1000; // £100.0m in tenths
export const QUOTAS: Record<PoolPosition, number> = { GK: 2, DEF: 5, MID: 5, FWD: 3 };
export const MAX_PER_CLUB = 3;
const SQUAD_SIZE = 15;

// Picks are stored as `code` (FPL's stable per-player identifier), not `id`
// (which FPL recycles/reassigns to a different player each season) — so a
// saved draft can't silently resolve to the wrong player after a season
// rollover reassigns `id`s.
type DraftState = { version: 2; picks: number[] };

const DEFAULTS: DraftState = { version: 2, picks: [] };

function parseDraft(raw: string | null): DraftState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.version === 2 && Array.isArray(parsed.picks)) {
      return { version: 2, picks: parsed.picks };
    }
    return null;
  } catch {
    return null;
  }
}

export function useDraft(pool: PoolPlayer[] | undefined) {
  const [state, setState] = useState<DraftState>(
    () => parseDraft(localStorage.getItem(KEY)) ?? DEFAULTS
  );

  // persist + tell other instances on this tab
  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(state));
    window.dispatchEvent(new CustomEvent(EVT, { detail: state }));
  }, [state]);

  // pick up changes fired by other useDraft instances on this tab
  useEffect(() => {
    const onEvt = (e: Event) => {
      const next = (e as CustomEvent<DraftState>).detail;
      setState((cur) => (JSON.stringify(next) !== JSON.stringify(cur) ? next : cur));
    };
    window.addEventListener(EVT, onEvt);
    return () => window.removeEventListener(EVT, onEvt);
  }, []);

  // pick up changes from other tabs
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== KEY) return;
      const parsed = parseDraft(e.newValue);
      if (parsed) {
        setState((cur) => (JSON.stringify(parsed) !== JSON.stringify(cur) ? parsed : cur));
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // drop any stored code no longer in the pool (player transferred out of the
  // league entirely) once the pool has actually landed — can't do this at
  // init since the pool is async
  useEffect(() => {
    if (!pool) return;
    const codes = new Set(pool.map((p) => p.code));
    setState((cur) => {
      const filtered = cur.picks.filter((code) => codes.has(code));
      return filtered.length === cur.picks.length ? cur : { ...cur, picks: filtered };
    });
  }, [pool]);

  const byCode = new Map((pool ?? []).map((p) => [p.code, p]));
  const picks = state.picks
    .map((code) => byCode.get(code))
    .filter((p): p is PoolPlayer => !!p);

  const counts: Record<PoolPosition, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  const clubCounts = new Map<number, number>();
  const clubShortNames = new Map<number, string>();
  let spent = 0;
  for (const p of picks) {
    counts[p.position] += 1;
    clubCounts.set(p.team, (clubCounts.get(p.team) ?? 0) + 1);
    if (p.team_short) clubShortNames.set(p.team, p.team_short);
    spent += p.now_cost;
  }
  const bank = BUDGET - spent;

  const violations: string[] = [];
  if (bank < 0) {
    violations.push(`Over budget by £${(Math.abs(bank) / 10).toFixed(1)}m`);
  }
  for (const pos of Object.keys(QUOTAS) as PoolPosition[]) {
    if (counts[pos] > QUOTAS[pos]) {
      violations.push(`Too many ${pos} (${counts[pos]}/${QUOTAS[pos]})`);
    }
  }
  for (const [teamId, n] of clubCounts) {
    if (n > MAX_PER_CLUB) {
      violations.push(
        `Too many players from ${clubShortNames.get(teamId) ?? "one club"} (${n}/${MAX_PER_CLUB})`
      );
    }
  }

  function canAdd(p: PoolPlayer): { ok: boolean; reason?: string } {
    if (state.picks.includes(p.code)) return { ok: false, reason: "Already in squad" };
    if (state.picks.length >= SQUAD_SIZE) return { ok: false, reason: "Squad full (15/15)" };
    if (counts[p.position] >= QUOTAS[p.position]) {
      return { ok: false, reason: `${p.position} slots full (${QUOTAS[p.position]}/${QUOTAS[p.position]})` };
    }
    if ((clubCounts.get(p.team) ?? 0) >= MAX_PER_CLUB) {
      return { ok: false, reason: `Max ${MAX_PER_CLUB} per club reached` };
    }
    if (p.now_cost > bank) {
      return {
        ok: false,
        reason: `Not enough budget (need £${(p.now_cost / 10).toFixed(1)}m, have £${(bank / 10).toFixed(1)}m)`,
      };
    }
    return { ok: true };
  }

  function add(p: PoolPlayer) {
    setState((cur) => (cur.picks.includes(p.code) ? cur : { ...cur, picks: [...cur.picks, p.code] }));
  }

  function remove(code: number) {
    setState((cur) => ({ ...cur, picks: cur.picks.filter((x) => x !== code) }));
  }

  function clear() {
    setState({ version: 2, picks: [] });
  }

  return {
    picks,
    add,
    remove,
    clear,
    canAdd,
    budget: { spent, bank },
    counts,
    clubCounts,
    violations,
  };
}
