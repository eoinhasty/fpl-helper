"""What a projected gap is worth: the table behind frontend/src/lib/confidence.ts.

The app labels gains on moves it has *chosen* (the planner's buys, Best XI's
starters), and picking the best-projected option inflates its projected gap
(winner's curse): measured on every pair of players instead, win rates came out
2-5 points higher. So the table is built on chosen upgrades: for each regular
starter A (started 4 of his last 5 GWs) at each deadline GW4+, B is the
best-projected regular starter in the same position costing at most £1.0m more,
and the question is how often B outscored A over the next h GWs (ties count
half), by projected gap. Rates are made non-decreasing in the gap (pooling
adjacent bins, weighted by count) since small-gap bins hold few chosen pairs.
Out-of-sample walk-forward projections, both seasons pooled.

Also prints captaincy: how often the favourite won among pairs from each GW's
top-10 outfield regular starters, by gap.

    python confidence_table.py   # needs data/walkforward/wfm-2024.json and wfm-2025.json
"""
import json

import numpy as np
import pandas as pd

from common import DATA_DIR

SEASONS = {"2025-26": "wfm-2025.json", "2024-25": "wfm-2024.json"}
GAP_FROM = [0, 0.5, 1, 1.5, 2, 3, 5, 8, np.inf]
REGULAR = 0.8
PRICE_HEADROOM = 10  # tenths of £1m


def load(season, wf_file):
    m = pd.read_csv(DATA_DIR / "history" / season / "merged_gw.csv", low_memory=False)
    m = m[m["position"].isin(["GK", "DEF", "MID", "FWD"])]
    pts = m.groupby(["element", "GW"])["total_points"].sum().unstack().fillna(0)
    starts = m.groupby(["element", "GW"])["starts"].sum().unstack().fillna(0).clip(upper=1)
    pos = m.groupby("element")["position"].last()
    price = m.groupby(["element", "GW"])["value"].last()
    wf = json.loads((DATA_DIR / "walkforward" / wf_file).read_text())
    return pts, starts, pos, price, wf, int(m["GW"].max())


def origins(data, h):
    """(origin, projections, regular starters' ids) for each deadline with h GWs of results."""
    _, starts, pos, _, wf, last = data
    for o_s, players in wf.items():
        o = int(o_s)
        if o < 4 or o + h - 1 > last:
            continue
        rate = starts.loc[:, [g for g in starts.columns if g < o]].iloc[:, -5:].mean(axis=1)
        yield o, players, [int(e) for e in players if int(e) in pos.index and rate.get(int(e), 0) >= REGULAR]


def win(d: pd.Series) -> float:
    return float(((d > 0) + 0.5 * (d == 0)).mean())


MIN_PAIRS = 100


def monotone(rates: list[float], counts: list[int]) -> list[float]:
    """Pool bins under MIN_PAIRS into a neighbour, then pool adjacent violators:
    the closest non-decreasing sequence, weighted by count."""
    blocks = [[r, n, 1] for r, n in zip(rates, counts)]  # mean, weight, bins pooled
    i = 0
    while i < len(blocks) and len(blocks) > 1:
        if blocks[i][1] < MIN_PAIRS:
            j = i - 1 if i > 0 else i + 1
            (r1, n1, k1), (r2, n2, k2) = blocks[min(i, j)], blocks[max(i, j)]
            blocks[min(i, j) : max(i, j) + 1] = [[(r1 * n1 + r2 * n2) / max(n1 + n2, 1), n1 + n2, k1 + k2]]
            i = 0
        else:
            i += 1
    i = 0
    while i < len(blocks) - 1:
        if blocks[i][0] > blocks[i + 1][0]:
            (r1, n1, k1), (r2, n2, k2) = blocks[i], blocks[i + 1]
            blocks[i : i + 2] = [[(r1 * n1 + r2 * n2) / (n1 + n2), n1 + n2, k1 + k2]]
            i = max(i - 1, 0)
        else:
            i += 1
    return [r for r, _, k in blocks for _ in range(k)]


def chosen_pairs(data, h):
    pts, _, pos, price, _, _ = data
    for o, players, ids in origins(data, h):
        for p in ("GK", "DEF", "MID", "FWD"):
            ps = [e for e in ids if pos[e] == p]
            proj = {e: sum(players[str(e)][:h]) for e in ps}
            act = pts.reindex(index=ps, columns=range(o, o + h)).fillna(0).sum(axis=1)
            cost = {e: price.get((e, o), np.nan) for e in ps}
            for a in ps:
                cands = [b for b in ps if b != a and cost[b] <= cost[a] + PRICE_HEADROOM]
                if cands and proj[b := max(cands, key=proj.get)] > proj[a]:
                    yield proj[b] - proj[a], act[b] - act[a]


def main():
    data = {s: load(s, f) for s, f in SEASONS.items()}
    print("Chosen upgrade's win rate by GWs covered (h) and projected gap; TS rows for lib/confidence.ts")
    for h in range(1, 6):
        df = pd.DataFrame([r for d in data.values() for r in chosen_pairs(d, h)], columns=["gap", "d"])
        g = df.groupby(pd.cut(df["gap"], GAP_FROM, right=False), observed=False)["d"]
        raw, n = g.apply(win).fillna(0.5).tolist(), g.size().tolist()
        print(f"  h={h} raw: " + "  ".join(f"{b:g}+ {r:.2f} (n={c})" for b, r, c in zip(GAP_FROM, raw, n)))
        print(f"  {h}: [{', '.join(f'{r:.2f}' for r in monotone(raw, n))}],")

    print("\nCaptaincy: pairs within each GW's top-10 outfield regular starters (next GW), by gap")
    rows = []
    for d in data.values():
        pts, _, pos, _, _, _ = d
        for o, players, ids in origins(d, 1):
            top = sorted((e for e in ids if pos[e] != "GK"), key=lambda e: -players[str(e)][0])[:10]
            rows += [(players[str(a)][0] - players[str(b)][0], pts.at[a, o] - pts.at[b, o])
                     for i, a in enumerate(top) for b in top[i + 1 :]]
    df = pd.DataFrame(rows, columns=["gap", "d"])
    for lo, hi in ((0, 1), (1, 2), (2, np.inf)):
        x = df[(df["gap"] >= lo) & (df["gap"] < hi)]
        print(f"  gap {lo}-{hi:g}: favourite wins {win(x['d']):.2f} (n={len(x)})")


if __name__ == "__main__":
    main()
