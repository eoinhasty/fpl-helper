"""Multi-gameweek transfer planner (mixed-integer program).

Picks the squad, starting XI and captain for each GW in the horizon to maximise
calibrated expected points minus hits, under FPL's rules: budget (using real
selling prices), 2/5/5/3 squad, max 3 per club, valid formations, one free
transfer per GW with rollover (max 5), 4-point hits, optional wildcard.

    python solver.py                                  # best plan, next 5 GWs
    python solver.py --horizon 10 --wildcard 6        # wildcard in GW6
    python solver.py --max-now 1 --exclude Haaland    # one move now, never buy Haaland
    python solver.py --force-out "João Pedro" --scenario scenarios.example.json
"""
import argparse
import json
import sys
from pathlib import Path

import numpy as np
from scipy.optimize import Bounds, LinearConstraint, milp
from scipy.sparse import coo_matrix

import points_model
import projections
from common import POS, Data

sys.path.append(str(Path(__file__).resolve().parents[2] / "backend"))
from app.services import planner
from app.services.planner import HIT_COST


def build_points(d, proj, pool, gws, scenario):
    pts = {}
    for pid in pool:
        name = d.els[pid]["web_name"]
        cop = d.els[pid]["chance_of_playing_next_round"]
        for gw in gws:
            if name in scenario:
                avail = scenario[name].get(str(gw), 1.0)
            elif gw == gws[0] and cop is not None:
                avail = cop / 100
            else:
                avail = 1.0
            pts[(pid, gw)] = proj.expected(pid, gw, avail)
    return pts


def solve(d, proj, state, gws, *, scenario=None, wildcard=None, max_now=None, no_hits=False,
          exclude=(), force_out=(), keep=(), bench_weight=0.1, time_limit=120):
    scenario = scenario or {}
    squad = set(state.squad)
    pool = sorted(
        (set(d.history_past) | squad) - (set(exclude) - squad)
    )
    pool = [p for p in pool if p in squad or d.els[p]["status"] in ("a", "d")]
    pts = build_points(d, proj, pool, gws, scenario)
    cost = {p: state.sell_price[p] if p in squad else d.els[p]["now_cost"] for p in pool}
    budget = sum(state.sell_price.values()) + state.bank
    team = {p: d.els[p]["team"] for p in pool}
    pos = {p: d.els[p]["element_type"] for p in pool}
    plan = optimise(pool, pts, cost, budget, team, pos, state.squad, state.free_transfers, gws, wildcard=wildcard,
                    max_now=max_now, no_hits=no_hits, force_out=force_out, keep=keep, bench_weight=bench_weight,
                    time_limit=time_limit)
    return plan, pts


def optimise(pool, pts, cost, budget, team, pos, squad, free_transfers, gws, *, wildcard=None, max_now=None,
             no_hits=False, force_out=(), keep=(), bench_boost=None, triple_captain=None, bench_weight=0.1,
             time_limit=120):
    """The MILP itself, on plain inputs (so backend/scripts/backtest_transfers.py can drive it from the archive).

    The formulation lives in backend/app/services/planner.py, shared with the app (which solves it in the
    browser); this solves it with scipy. pool: candidate ids, including the current squad. pts[(id, gw)]:
    expected points. cost[id]: selling price for squad players, buying price otherwise. team/pos: id -> club/
    element_type. bench_boost/triple_captain: planner.ChipPlay. Returns the plan, one dict per GW: squad, xi,
    captain, hits, out, into, chip, points.
    """
    m = planner.build(pool, pts, cost, budget, team, pos, squad, free_transfers, gws, wildcard=wildcard,
                      max_now=max_now, no_hits=no_hits, force_out=force_out, keep=keep, bench_boost=bench_boost,
                      triple_captain=triple_captain, bench_weight=bench_weight)
    rows, cols, vals = [], [], []
    for r, (coefs, _, _) in enumerate(m.rows):
        rows += [r] * len(coefs)
        cols += coefs.keys()
        vals += coefs.values()
    A = coo_matrix((vals, (rows, cols)), shape=(len(m.rows), len(m.names))).tocsr()
    lo, hi = zip(*((lo, hi) for _, lo, hi in m.rows))
    res = milp(np.array(m.obj), constraints=LinearConstraint(A, np.array(lo), np.array(hi)),
               integrality=np.ones(len(m.names)), bounds=Bounds(m.lb, m.ub),
               options={"time_limit": time_limit, "mip_rel_gap": 0.002})
    if res.x is None:
        raise SystemExit(f"No feasible plan: {res.message}")
    return planner.read_plan(dict(zip(m.names, res.x)), pool, pts, pos, squad, gws, wildcard=wildcard)


def print_plan(d, plan, pts, wildcard=None):
    total = 0.0
    for step in plan:
        gw = step["gw"]
        net = step["points"] - HIT_COST * step["hits"]
        total += net
        tag = " WILDCARD" if gw == wildcard else ""
        moves = ", ".join(f"{d.label(o)} → {d.label(i)}" for o, i in zip(step["out"], step["into"])) or "no transfers"
        if gw == wildcard:
            moves = f"{len(step['into'])} changes"
        hits = f"  (-{HIT_COST * step['hits']} hits)" if step["hits"] else ""
        print(f"\nGW{gw}{tag}: {moves}{hits}   projected {net:.1f}")
        if gw == wildcard or gw == plan[0]["gw"]:
            for pos in (1, 2, 3, 4):
                line = [p for p in step["squad"] if d.els[p]["element_type"] == pos]
                cells = []
                for p in sorted(line, key=lambda p: -pts[(p, gw)]):
                    mark = " (C)" if p == step["captain"] else ("" if p in step["xi"] else " [bench]")
                    cells.append(f"{d.els[p]['web_name']}{mark} {pts[(p, gw)]:.1f}")
                print(f"   {POS[pos]:<4}" + ", ".join(cells))
        else:
            print(f"   captain {d.els[step['captain']]['web_name']}")
    print(f"\nTotal over GW{plan[0]['gw']}-{plan[-1]['gw']}: {total:.1f} (calibrated, net of hits)")
    return total


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--horizon", type=int, default=5, help="number of GWs to plan (default 5)")
    ap.add_argument("--wildcard", type=int, help="play the wildcard in this GW")
    ap.add_argument("--max-now", type=int, help="max transfers in the first GW")
    ap.add_argument("--no-hits", action="store_true", help="never take a points hit")
    ap.add_argument("--exclude", nargs="*", default=[], help="never buy these players")
    ap.add_argument("--force-out", nargs="*", default=[], help="sell these in the first GW")
    ap.add_argument("--keep", nargs="*", default=[], help="keep these for the whole horizon")
    ap.add_argument("--scenario", help='JSON availability overrides: {"Isak": {"6": 0.75}}')
    ap.add_argument("--legacy", action="store_true", help="use the old hand-built projections (projections.py)")
    args = ap.parse_args()

    d = Data()
    state = d.squad_state()
    gws = list(range(d.plan_gw, d.plan_gw + args.horizon))
    if args.legacy:
        proj = projections.Projector(d, calib=projections.load_calibration())
    else:
        # Projections start at the first GW without results, which can be a
        # locked one being played now — project far enough to cover the plan.
        proj = points_model.Projector(d, horizon=args.horizon + d.plan_gw - d.next_gw)
    scenario = json.loads(open(args.scenario).read()) if args.scenario else {}
    print(f"Entry {d.entry['id']}: bank £{state.bank / 10:.1f}m, {state.free_transfers} free transfer(s), "
          f"chips used {state.chips_used or 'none'}")
    plan, pts = solve(
        d, proj, state, gws, scenario=scenario, wildcard=args.wildcard, max_now=args.max_now,
        no_hits=args.no_hits, exclude=[d.find(n) for n in args.exclude],
        force_out=[d.find(n) for n in args.force_out], keep=[d.find(n) for n in args.keep],
    )
    print_plan(d, plan, pts, args.wildcard)


if __name__ == "__main__":
    main()
