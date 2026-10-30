"""Out-of-sample next-GW predictions for a past season, for the app's transfer backtest.

Retrains every few gameweeks on earlier seasons plus the season's already-played
gameweeks (as evaluate.py does), and records the model's points for each player
in each gameweek from that gameweek's deadline. Doubles are summed; a blank is
absent. Players are keyed by that season's element id, which is what
backend/scripts/backtest_transfers.py --projections reads.

    python export_walkforward.py 2025 --out wf-2025-26.json
"""
import argparse
import json

import pandas as pd

import history
import points_model as pm
from features import FeatureBuilder


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("season", type=int, help="season by start year, e.g. 2025 for 2025-26")
    ap.add_argument("--out", required=True)
    ap.add_argument("--every", type=int, default=5, help="retrain every N gameweeks")
    args = ap.parse_args()

    matches, _, _ = history.load()
    fb = FeatureBuilder(matches)
    season = args.season
    train = sorted(s for s in matches["season"].unique() if s < season)
    base = pm.training_table(fb, train)
    last_gw = int(matches.loc[matches["season"] == season, "gw"].max())
    # element id within the season, by the season-stable code the features use
    element = matches[matches["season"] == season].groupby("code")["element"].last()

    out = {}
    for start in range(1, last_gw + 1, args.every):
        table = pd.concat([base, pm.training_table(fb, [season], last_gw={season: start})]) if start > 1 else base
        model = pm.fit(table)
        for origin in range(start, min(start + args.every, last_gw + 1)):
            rows = fb.training_rows(season, origin, max_lead=0)
            rows["pred"] = pm.predict(model, rows)
            pts = rows.groupby("code")["pred"].sum()
            out[str(origin)] = {str(int(element[c])): round(float(p), 2) for c, p in pts.items()}
        print(f"  GW{start}-{min(start + args.every, last_gw + 1) - 1} (trained on {len(table):,} rows)", flush=True)

    with open(args.out, "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print(f"wrote {len(out)} GWs to {args.out}")


if __name__ == "__main__":
    main()
