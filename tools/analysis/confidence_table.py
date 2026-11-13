"""What a projected gap is worth: the table behind frontend/src/lib/confidence.ts.

For every pair of regular starters (started 4 of their last 5 GWs) in the same
position, from each deadline GW4+, how often the player the model favoured
outscored the other over the next h GWs (ties count half), by projected gap.
Uses the walk-forward exports (out-of-sample), pooled over both seasons. Also
prints how often each GW's top captain pick beat the second (top-10 outfield
regular starters by next-GW projection).

    python confidence_table.py   # needs data/walkforward/wfm-2024.json and wfm-2025.json
"""
import json

import numpy as np
import pandas as pd

from common import DATA_DIR

SEASONS = {"2025-26": "wfm-2025.json", "2024-25": "wfm-2024.json"}
GAP_FROM = [0, 0.5, 1, 1.5, 2, 3, 5, 8, np.inf]
REGULAR = 0.8


def load(season, wf_file):
    m = pd.read_csv(DATA_DIR / "history" / season / "merged_gw.csv", low_memory=False)
    m = m[m["position"].isin(["GK", "DEF", "MID", "FWD"])]
    pts = m.groupby(["element", "GW"])["total_points"].sum().unstack().fillna(0)
    starts = m.groupby(["element", "GW"])["starts"].sum().unstack().fillna(0).clip(upper=1)
    pos = m.groupby("element")["position"].last()
    wf = json.loads((DATA_DIR / "walkforward" / wf_file).read_text())
    return pts, starts, pos, wf, int(m["GW"].max())


def origins(data, h):
    """(origin, projections, regular starters' ids) for each deadline with h GWs of results."""
    _, starts, pos, wf, last = data
    for o_s, players in wf.items():
        o = int(o_s)
        if o < 4 or o + h - 1 > last:
            continue
        rate = starts.loc[:, [g for g in starts.columns if g < o]].iloc[:, -5:].mean(axis=1)
        yield o, players, [int(e) for e in players if int(e) in pos.index and rate.get(int(e), 0) >= REGULAR]


def win(d: pd.Series) -> float:
    return float(((d > 0) + 0.5 * (d == 0)).mean())


def main():
    data = {s: load(s, f) for s, f in SEASONS.items()}
    print("Favourite's win rate by remaining GWs (h) and projected gap")
    for h in range(1, 6):
        frames = []
        for d in data.values():
            pts, _, pos, _, _ = d
            for o, players, ids in origins(d, h):
                for p in ("GK", "DEF", "MID", "FWD"):
                    ps = [e for e in ids if pos[e] == p]
                    proj = np.array([sum(players[str(e)][:h]) for e in ps])
                    act = pts.reindex(index=ps, columns=range(o, o + h)).fillna(0).sum(axis=1).to_numpy()
                    i, j = np.triu_indices(len(ps), 1)
                    fav = np.where(proj[i] >= proj[j], act[i] - act[j], act[j] - act[i])
                    frames.append(pd.DataFrame({"gap": np.abs(proj[i] - proj[j]), "d": fav}))
        df = pd.concat(frames)
        rates = df.groupby(pd.cut(df["gap"], GAP_FROM, right=False), observed=True)["d"].apply(win)
        print(f"  h={h}: " + "  ".join(f"{b.left:g}+ {v:.2f}" for b, v in rates.items()))

    print("\nCaptaincy: model's #1 vs #2 (top-10 outfield regular starters, next GW)")
    for season, d in data.items():
        pts, _, pos, _, _ = d
        rows = []
        for o, players, ids in origins(d, 1):
            a, b = sorted((e for e in ids if pos[e] != "GK"), key=lambda e: -players[str(e)][0])[:2]
            rows.append((players[str(a)][0] - players[str(b)][0], pts.at[a, o] - pts.at[b, o]))
        df = pd.DataFrame(rows, columns=["gap", "d"])
        print(f"  {season}: {len(df)} GWs, median gap {df['gap'].median():.2f}, #1 wins {win(df['d']):.2f}")


if __name__ == "__main__":
    main()
