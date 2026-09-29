"""Check the projection model against what actually happened, and calibrate it.

For each finished GW t >= 3, rebuild the model from GW1..t-1 only, predict GW t,
and compare with actual points — against a naive points-per-game baseline.
Then fit actual ~ a + b * predicted across all of them and save (a, b) to
data/calib.json, which the solver uses to put projections on a real-points scale.
"""
import json
import math
import random

from common import DATA_DIR, Data
from projections import Projector


def spearman(xs: list, ys: list) -> float:
    def ranks(v):
        order = sorted(range(len(v)), key=lambda i: v[i])
        r = [0] * len(v)
        for k, i in enumerate(order):
            r[i] = k
        return r

    rx, ry = ranks(xs), ranks(ys)
    n = len(xs)
    mx, my = sum(rx) / n, sum(ry) / n
    cov = sum((a - mx) * (b - my) for a, b in zip(rx, ry))
    return cov / math.sqrt(sum((a - mx) ** 2 for a in rx) * sum((b - my) ** 2 for b in ry))


def ols(xs: list, ys: list) -> tuple:
    n = len(xs)
    mx, my = sum(xs) / n, sum(ys) / n
    b = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sum((x - mx) ** 2 for x in xs)
    return my - b * mx, b


def main() -> None:
    d = Data()
    pool = list(d.history_past)
    targets = range(3, d.last_finished + 1)
    if not targets:
        raise SystemExit("Need at least 3 finished gameweeks to backtest.")

    all_pred, all_actual = [], []
    summary = {"form": [], "model": []}
    for t in targets:
        proj = Projector(d, upto=t - 1)
        players = [p for p in pool if proj.games(p)]
        actual = [d.games.get((p, t), {}).get("total_points", 0) for p in players]
        preds = {
            "form": [sum(d.games.get((p, g), {}).get("total_points", 0) for g in range(1, t)) / (t - 1) for p in players],
            "model": [proj.raw(p, t) for p in players],
        }
        print(f"GW{t} (model built from GW1-{t - 1}, {len(players)} players)")
        for name, p in preds.items():
            order = sorted(range(len(p)), key=lambda i: -p[i])
            row = dict(
                mae=sum(abs(a - b) for a, b in zip(p, actual)) / len(p),
                rank_corr=spearman(p, actual),
                top15=sum(actual[i] for i in order[:15]) / 15,
            )
            summary[name].append(row)
            print(f"  {name:<6} MAE {row['mae']:.2f}  rank corr {row['rank_corr']:.3f}  top-15 picks avg {row['top15']:.2f} pts")
        all_pred += preds["model"]
        all_actual += actual

    print("\nAverages:")
    for name, rows in summary.items():
        print(f"  {name:<6}" + "  ".join(f"{k} {sum(r[k] for r in rows) / len(rows):.2f}" for k in rows[0]))

    a, b = ols(all_pred, all_actual)
    random.seed(1)
    idx = range(len(all_pred))
    slopes = sorted(
        ols([all_pred[i] for i in s], [all_actual[i] for i in s])[1]
        for s in ([random.choice(idx) for _ in idx] for _ in range(1000))
    )
    ci = (slopes[25], slopes[975])
    print(f"\nCalibration: actual ≈ {a:.2f} + {b:.2f} × predicted   (slope 95% CI {ci[0]:.2f}–{ci[1]:.2f}, n={len(all_pred)})")
    print("A slope below 1 means projected gaps between players overstate real gaps by that factor.")
    (DATA_DIR / "calib.json").write_text(json.dumps({"a": a, "b": b, "slope_ci": ci, "n": len(all_pred)}))
    print(f"Saved to {DATA_DIR / 'calib.json'}")


if __name__ == "__main__":
    main()
