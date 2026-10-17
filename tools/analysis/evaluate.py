"""Walk-forward test of the points model against simple baselines.

For each test season the model is retrained every few gameweeks on earlier
seasons plus the test season's already-played gameweeks, then predicts the
next gameweek and the next five from each deadline. Nothing after a deadline
is used to predict it.

    python evaluate.py                 # test 2024-25, 2025-26 and this season
    python evaluate.py --seasons 2025

Predictors compared on the same players (anyone with minutes so far this season):
  model  — points_model.py
  form   — points per gameweek so far this season (what we were losing to)

FPL's own expected points (the archive's xP column) is not used: it tracks the
same gameweek's points far better than the next one's, so it was evidently
recorded after the games.
"""
import argparse
import warnings

import numpy as np
import pandas as pd
from scipy.stats import spearmanr

import history
import points_model as pm
from features import FeatureBuilder

TOP_N = 15
warnings.filterwarnings("ignore", category=RuntimeWarning)
warnings.filterwarnings("ignore", message="An input array is constant")


def metrics(df: pd.DataFrame, col: str, actual: str, per_gw: int) -> dict:
    d = df.dropna(subset=[col])
    top = d.nlargest(TOP_N, col)[actual].mean() / per_gw
    within = [spearmanr(g[col], g[actual])[0] for _, g in d.groupby("pos") if len(g) > 10]
    starters = d[d["mins1"] >= 60]
    return dict(
        rank=spearmanr(d[col], d[actual])[0],
        rank_pos=float(np.nanmean(within)),
        rank_starters=spearmanr(starters[col], starters[actual])[0],
        top15=top,
        mae=(d[col] - d[actual]).abs().mean() / per_gw,
    )


def score_origin(fb, model, season, origin, horizon, last_gw):
    rows = fb.training_rows(season, origin, max_lead=horizon - 1)
    rows["model"] = pm.predict(model, rows)
    out = {}
    for label, h in (("next GW", 1), (f"next {horizon} GWs", horizon)):
        if origin + h - 1 > last_gw:
            continue
        r = rows[rows["lead"] < h]
        agg = r.groupby("code").agg(model=("model", "sum"), actual=("total_points", "sum"), n_fix=("gw", "size"),
                                    form=("form", "first"), pos=("pos", "first"), mins1=("mins1", "first"),
                                    mins_pg=("mins_pg", "first"))
        agg = agg[agg["mins_pg"] > 0]
        agg["form"] = agg["form"] * agg["n_fix"]
        out[label] = {c: metrics(agg, c, "actual", h) for c in ("model", "form")}
    return out


def evaluate(fb, season, train_seasons, first, last, every, horizon, base_table):
    last_gw = int(fb.matches.loc[fb.matches["season"] == season, "gw"].max())
    results = []
    for start in range(1, last + 1, every):
        block = [o for o in range(start, start + every) if first <= o <= last]
        if not block:
            continue
        table = pd.concat([base_table, pm.training_table(fb, [season], last_gw={season: start})]) if start > 1 else base_table
        model = pm.fit(table)
        for origin in block:
            results.append((origin, score_origin(fb, model, season, origin, horizon, last_gw)))
        print(f"  {season}: scored GW{block[0]}-{block[-1]} (trained on {len(table):,} rows)", flush=True)
    return results


def summarise(season, results):
    print(f"\n=== {season}-{str(season + 1)[2:]}  ({len(results)} deadlines) ===")
    labels = sorted({k for _, r in results for k in r}, reverse=True)
    for label in labels:
        per = [r[label] for _, r in results if label in r]
        print(f"{label}  (n={len(per)} deadlines)")
        print(f"   {'':<8}{'rank':>14}{'rank in pos':>14}{'rank starters':>15}{'top-15 pts/GW':>16}{'MAE/GW':>9}")
        for col in per[0]:
            vals = {k: [p[col][k] for p in per if col in p] for k in per[0][col]}
            cell = lambda k: f"{np.nanmean(vals[k]):.3f}±{np.nanstd(vals[k]) / np.sqrt(len(vals[k])):.3f}"
            print(f"   {col:<8}{cell('rank'):>14}{cell('rank_pos'):>14}{cell('rank_starters'):>15}"
                  f"{np.mean(vals['top15']):>11.2f}±{np.std(vals['top15']) / np.sqrt(len(vals['top15'])):.2f}"
                  f"{np.mean(vals['mae']):>9.2f}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--seasons", nargs="*", type=int, help="test seasons by start year, e.g. 2025")
    ap.add_argument("--horizon", type=int, default=5)
    ap.add_argument("--every", type=int, default=5, help="retrain every N gameweeks")
    args = ap.parse_args()

    matches, _, current = history.load()
    fb = FeatureBuilder(matches)
    seasons = sorted(matches["season"].unique())
    tests = args.seasons or [s for s in seasons if s >= seasons[0] + 2]
    cache = {}
    for season in tests:
        train = [s for s in seasons if s < season]
        base = pd.concat([cache.setdefault(s, pm.training_table(fb, [s])) for s in train], ignore_index=True)
        last_gw = int(matches.loc[matches["season"] == season, "gw"].max())
        first = 4
        last = last_gw if season == current else last_gw - args.horizon + 1
        every = 1 if season == current else args.every
        res = evaluate(fb, season, train, first, last, every, args.horizon, base)
        summarise(season, res)


if __name__ == "__main__":
    main()
