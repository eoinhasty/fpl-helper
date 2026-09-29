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

import numpy as np
from scipy.optimize import Bounds, LinearConstraint, milp
from scipy.sparse import coo_matrix

from common import MAX_FT, POS, Data
from projections import Projector, load_calibration

SQUAD_QUOTA = {1: 2, 2: 5, 3: 5, 4: 3}
XI_RANGE = {1: (1, 1), 2: (3, 5), 3: (2, 5), 4: (1, 3)}
HIT_COST = 4
CHURN_PENALTY = 0.05  # stops no-op buy+sell pairs in the same GW
ROLL_PENALTY = 0.01  # use free transfers before paying hits, as FPL does


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

    P, G = len(pool), len(gws)
    idx = {p: i for i, p in enumerate(pool)}
    nb = P * G
    X, Y, C, IN, OUT = range(5)

    def v(block, i, g):
        return block * nb + i * G + g

    base = 5 * nb
    T, F, H, FT = (lambda g, k=k: base + k * G + g for k in range(4))
    n = base + 4 * G

    c = np.zeros(n)
    for p in pool:
        i = idx[p]
        for g, gw in enumerate(gws):
            s = pts[(p, gw)]
            c[v(Y, i, g)] -= s * (1 - bench_weight)
            c[v(X, i, g)] -= s * bench_weight
            c[v(C, i, g)] -= s
            c[v(IN, i, g)] += CHURN_PENALTY
            c[v(OUT, i, g)] += CHURN_PENALTY
    for g in range(G):
        c[H(g)] += HIT_COST
        c[FT(g)] += ROLL_PENALTY
        c[F(g)] -= ROLL_PENALTY

    lb, ub = np.zeros(n), np.ones(n)
    ub[base:] = 15
    rows, cols, vals, lo, hi = [], [], [], [], []

    def add(coefs, l, h):
        r = len(lo)
        for k, val in coefs.items():
            rows.append(r)
            cols.append(k)
            vals.append(val)
        lo.append(l)
        hi.append(h)
        return r

    by_club, by_pos = {}, {}
    for p in pool:
        by_club.setdefault(d.els[p]["team"], []).append(p)
        by_pos.setdefault(d.els[p]["element_type"], []).append(p)

    wg = gws.index(wildcard) if wildcard else None
    for g in range(G):
        add({v(X, idx[p], g): cost[p] for p in pool}, 0, budget)
        for pos, quota in SQUAD_QUOTA.items():
            add({v(X, idx[p], g): 1 for p in by_pos[pos]}, quota, quota)
        for ps in by_club.values():
            add({v(X, idx[p], g): 1 for p in ps}, 0, 3)
        add({v(Y, idx[p], g): 1 for p in pool}, 11, 11)
        for pos, (l, h) in XI_RANGE.items():
            add({v(Y, idx[p], g): 1 for p in by_pos[pos]}, l, h)
        add({v(C, idx[p], g): 1 for p in pool}, 1, 1)
        for p in pool:
            i = idx[p]
            add({v(Y, i, g): 1, v(X, i, g): -1}, -np.inf, 0)
            add({v(C, i, g): 1, v(Y, i, g): -1}, -np.inf, 0)
            flow = {v(X, i, g): 1, v(IN, i, g): -1, v(OUT, i, g): 1}
            if g:
                flow[v(X, i, g - 1)] = -1
                add(flow, 0, 0)
            else:
                init = 1 if p in squad else 0
                add(flow, init, init)
        add({**{v(IN, idx[p], g): 1 for p in pool}, T(g): -1}, 0, 0)
        add({F(g): 1, FT(g): -1}, -np.inf, 0)
        add({F(g): 1, T(g): -1}, -np.inf, 0)
        add({H(g): 1, T(g): -1, F(g): 1}, -np.inf if g == wg else 0, np.inf)
        if g == 0:
            add({FT(0): 1}, state.free_transfers, state.free_transfers)
        else:
            add({FT(g): 1, FT(g - 1): -1, F(g - 1): 1}, -np.inf, 1)
        ub[FT(g)] = MAX_FT

    if wg is not None:
        ub[H(wg)] = ub[F(wg)] = 0
    if max_now is not None:
        ub[T(0)] = max_now
    if no_hits:
        for g in range(G):
            if g != wg:
                ub[H(g)] = 0
    for p in force_out:
        if p in idx:
            ub[v(X, idx[p], 0)] = 0
    for p in keep:
        for g in range(G):
            lb[v(X, idx[p], g)] = 1

    A = coo_matrix((vals, (rows, cols)), shape=(len(lo), n)).tocsr()
    res = milp(c, constraints=LinearConstraint(A, np.array(lo), np.array(hi)), integrality=np.ones(n),
               bounds=Bounds(lb, ub), options={"time_limit": time_limit, "mip_rel_gap": 0.002})
    if res.x is None:
        raise SystemExit(f"No feasible plan: {res.message}")
    x = res.x

    plan, prev = [], list(state.squad)
    for g, gw in enumerate(gws):
        sq = [p for p in pool if x[v(X, idx[p], g)] > 0.5]
        xi = [p for p in pool if x[v(Y, idx[p], g)] > 0.5]
        cap = next(p for p in pool if x[v(C, idx[p], g)] > 0.5)
        hits = 0 if g == wg else round(x[H(g)])
        plan.append(dict(
            gw=gw, squad=sq, xi=xi, captain=cap, hits=hits,
            out=[p for p in prev if p not in sq], into=[p for p in sq if p not in prev],
            points=sum(pts[(p, gw)] for p in xi) + pts[(cap, gw)],
        ))
        prev = sq
    return plan, pts


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
    args = ap.parse_args()

    d = Data()
    state = d.squad_state()
    proj = Projector(d, calib=load_calibration())
    gws = list(range(d.next_gw, d.next_gw + args.horizon))
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
