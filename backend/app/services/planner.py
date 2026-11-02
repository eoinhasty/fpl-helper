"""The multi-GW transfer planner's mixed-integer program, as plain data.

Picks the squad, starting XI and captain for each GW in the horizon to
maximise expected points minus hits, under FPL's rules: budget (selling
prices), 2/5/5/3 squad, max 3 per club, valid formations, one free transfer
per GW with rollover (max 5), 4-point hits, optional wildcard.

One formulation, two solvers: tools/analysis/solver.py (and through it
backend/scripts/backtest_transfers.py) solves `build()`'s model with scipy,
and the app ships it to the browser as LP text (`to_lp`) for highs-js, since
Render's free tier is too slow to solve it server-side. Pure: no I/O, no
numpy, so the backend doesn't need scipy.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

INF = float("inf")

SQUAD_QUOTA = {1: 2, 2: 5, 3: 5, 4: 3}
XI_RANGE = {1: (1, 1), 2: (3, 5), 3: (2, 5), 4: (1, 3)}
MAX_PER_CLUB = 3
MAX_FT = 5
HIT_COST = 4
CHURN_PENALTY = 0.05  # stops no-op buy+sell pairs in the same GW
ROLL_PENALTY = 0.01  # use free transfers before paying hits, as FPL does

# Per-player blocks, then per-GW counters, in this variable order:
# x squad, y starting XI, c captain, in bought, out sold;
# t transfers made, f free transfers used, h hits, ft free transfers held
PLAYER_BLOCKS = ("x", "y", "c", "in", "out")
GW_BLOCKS = ("t", "f", "h", "ft")


@dataclass
class Model:
    """min obj·v subject to lo <= row·v <= hi, lb <= v <= ub, v integer."""

    names: List[str]
    obj: List[float]
    lb: List[float]
    ub: List[float]
    rows: List[Tuple[Dict[int, float], float, float]] = field(default_factory=list)

    def add(self, coefs: Dict[int, float], lo: float, hi: float) -> None:
        self.rows.append((coefs, lo, hi))


def build(
    pool: Sequence[int],
    pts: Dict[Tuple[int, int], float],
    cost: Dict[int, int],
    budget: int,
    team: Dict[int, int],
    pos: Dict[int, int],
    squad: Iterable[int],
    free_transfers: int,
    gws: Sequence[int],
    *,
    wildcard: Optional[int] = None,
    max_now: Optional[int] = None,
    no_hits: bool = False,
    force_out: Iterable[int] = (),
    keep: Iterable[int] = (),
    bench_weight: float = 0.1,
) -> Model:
    """pool: candidate ids, including the current squad. pts[(id, gw)]:
    expected points. cost[id]: selling price for squad players, buying price
    otherwise. team/pos: id -> club/element_type."""
    squad = set(squad)
    P, G = len(pool), len(gws)
    idx = {p: i for i, p in enumerate(pool)}
    nb = P * G

    def v(block: int, i: int, g: int) -> int:
        return block * nb + i * G + g

    X, Y, C, IN, OUT = range(len(PLAYER_BLOCKS))
    base = len(PLAYER_BLOCKS) * nb

    def T(g):
        return base + g

    def F(g):
        return base + G + g

    def H(g):
        return base + 2 * G + g

    def FT(g):
        return base + 3 * G + g

    names = [f"{b}_{p}_{g}" for b in PLAYER_BLOCKS for p in pool for g in range(G)]
    names += [f"{b}_{g}" for b in GW_BLOCKS for g in range(G)]
    n = len(names)
    m = Model(names, [0.0] * n, [0.0] * n, [1.0] * base + [15.0] * (n - base))

    c = m.obj
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

    by_club: Dict[int, List[int]] = {}
    by_pos: Dict[int, List[int]] = {}
    for p in pool:
        by_club.setdefault(team[p], []).append(p)
        by_pos.setdefault(pos[p], []).append(p)

    wg = gws.index(wildcard) if wildcard else None
    for g in range(G):
        m.add({v(X, idx[p], g): cost[p] for p in pool}, 0, budget)
        for el_type, quota in SQUAD_QUOTA.items():
            m.add({v(X, idx[p], g): 1 for p in by_pos.get(el_type, [])}, quota, quota)
        for ps in by_club.values():
            m.add({v(X, idx[p], g): 1 for p in ps}, 0, MAX_PER_CLUB)
        m.add({v(Y, idx[p], g): 1 for p in pool}, 11, 11)
        for el_type, (lo, hi) in XI_RANGE.items():
            m.add({v(Y, idx[p], g): 1 for p in by_pos.get(el_type, [])}, lo, hi)
        m.add({v(C, idx[p], g): 1 for p in pool}, 1, 1)
        for p in pool:
            i = idx[p]
            m.add({v(Y, i, g): 1, v(X, i, g): -1}, -INF, 0)
            m.add({v(C, i, g): 1, v(Y, i, g): -1}, -INF, 0)
            flow = {v(X, i, g): 1, v(IN, i, g): -1, v(OUT, i, g): 1}
            if g:
                flow[v(X, i, g - 1)] = -1
                m.add(flow, 0, 0)
            else:
                init = 1 if p in squad else 0
                m.add(flow, init, init)
        m.add({**{v(IN, idx[p], g): 1 for p in pool}, T(g): -1}, 0, 0)
        m.add({F(g): 1, FT(g): -1}, -INF, 0)
        m.add({F(g): 1, T(g): -1}, -INF, 0)
        m.add({H(g): 1, T(g): -1, F(g): 1}, -INF if g == wg else 0, INF)
        if g == 0:
            m.add({FT(0): 1}, free_transfers, free_transfers)
        else:
            m.add({FT(g): 1, FT(g - 1): -1, F(g - 1): 1}, -INF, 1)
        m.ub[FT(g)] = MAX_FT

    if wg is not None:
        m.ub[H(wg)] = m.ub[F(wg)] = 0
    if max_now is not None:
        m.ub[T(0)] = max_now
    if no_hits:
        for g in range(G):
            if g != wg:
                m.ub[H(g)] = 0
    for p in force_out:
        if p in idx:
            m.ub[v(X, idx[p], 0)] = 0
    for p in keep:
        for g in range(G):
            m.lb[v(X, idx[p], g)] = 1
    return m


def read_plan(
    values: Dict[str, float],
    pool: Sequence[int],
    pts: Dict[Tuple[int, int], float],
    pos: Dict[int, int],
    squad: Sequence[int],
    gws: Sequence[int],
    *,
    wildcard: Optional[int] = None,
) -> List[dict]:
    """A solution ({variable name: value}) as one dict per GW: squad, xi,
    captain, hits, out, into, points (XI + captain, before hits)."""

    def on(block: str, p: int, g: int) -> bool:
        return values.get(f"{block}_{p}_{g}", 0) > 0.5

    plan, prev = [], list(squad)
    for g, gw in enumerate(gws):
        sq = [p for p in pool if on("x", p, g)]
        xi = [p for p in pool if on("y", p, g)]
        cap = next(p for p in pool if on("c", p, g))
        hits = 0 if gw == wildcard else round(values.get(f"h_{g}", 0))
        plan.append(
            dict(
                gw=gw,
                squad=sq,
                xi=xi,
                captain=cap,
                hits=hits,
                out=sorted((p for p in prev if p not in sq), key=lambda p: pos[p]),
                into=sorted((p for p in sq if p not in prev), key=lambda p: pos[p]),
                points=sum(pts[(p, gw)] for p in xi) + pts[(cap, gw)],
            )
        )
        prev = sq
    return plan


def sell_price(paid: int, now: int) -> int:
    """What selling returns: FPL keeps half of any rise (rounded down), and
    passes on all of a fall."""
    return now if now <= paid else paid + (now - paid) // 2


def free_transfers(history: List[dict], chips: List[dict]) -> int:
    """Free transfers banked for the next deadline, replayed from the entry's
    GW history: one per GW from GW2, max MAX_FT; a wildcard or free hit week
    keeps the count as it was. Misses transfers already made for the next
    GW (they aren't in the history until its deadline)."""
    played = {c.get("event"): c.get("name") for c in chips}
    ft = 1
    for h in history:
        if h.get("event", 0) < 2 or played.get(h["event"]) in ("wildcard", "freehit"):
            continue
        ft = min(MAX_FT, max(ft - (h.get("event_transfers") or 0), 0) + 1)
    return ft


def _num(x: float) -> str:
    return f"{x:.10g}"


def _expr(coefs: Dict[int, float], names: List[str]) -> List[str]:
    return [
        f"{'-' if val < 0 else '+'} {_num(abs(val))} {names[j]}"
        for j, val in coefs.items()
        if val
    ]


def _wrap(terms: List[str], width: int = 40) -> str:
    # HiGHS's LP reader handles long lines, but short ones keep the text
    # diffable and well under any line-length limit
    return "\n  ".join(
        " ".join(terms[k : k + width]) for k in range(0, len(terms), width)
    )


def to_lp(m: Model) -> str:
    """The model in CPLEX LP format, which highs-js's solve() reads."""
    obj = _expr(dict(enumerate(m.obj)), m.names)
    out = ["Minimize", " obj: " + (_wrap(obj) or "0"), "Subject To"]
    for r, (coefs, lo, hi) in enumerate(m.rows):
        expr = _wrap(_expr(coefs, m.names))
        if not expr:
            # LP text can't express an empty row; one that 0 satisfies binds nothing
            if lo <= 0 <= hi:
                continue
            raise ValueError(f"row {r} is empty but needs {lo}..{hi}")
        if lo == hi:
            out.append(f" r{r}: {expr} = {_num(lo)}")
            continue
        if lo > -INF:
            out.append(f" r{r}l: {expr} >= {_num(lo)}")
        if hi < INF:
            out.append(f" r{r}u: {expr} <= {_num(hi)}")
    out.append("Bounds")
    out += [
        f" {_num(lo)} <= {name} <= {_num(hi)}"
        for name, lo, hi in zip(m.names, m.lb, m.ub)
    ]
    out.append("General")
    out.append(" " + _wrap(m.names, 20))
    out.append("End")
    return "\n".join(out)
