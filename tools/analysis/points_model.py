"""Gradient-boosted expected-points model, trained on past seasons' match logs.

Predicts a player's points in one fixture from what was known at the deadline
(features.py). Summed over a gameweek's fixtures it gives expected GW points,
on the real-points scale: it is fitted to actual points, so no extra calibration.
"""
import pickle

import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor

import history
from common import DATA_DIR
from features import FEATURES, MAX_LEAD, FeatureBuilder

PARAMS = dict(max_iter=400, learning_rate=0.04, max_leaf_nodes=31, min_samples_leaf=200, l2_regularization=1.0,
              random_state=0)


def training_table(fb: FeatureBuilder, seasons: list, last_gw: dict = None) -> pd.DataFrame:
    """All (origin, lead) rows for these seasons. last_gw caps a season: only targets before that GW."""
    out = []
    for season in seasons:
        gws = sorted(fb.matches.loc[fb.matches["season"] == season, "gw"].unique())
        cap = (last_gw or {}).get(season)
        for origin in gws:
            if cap is not None and origin >= cap:
                break
            rows = fb.training_rows(season, origin)
            if cap is not None:
                rows = rows[rows["gw"] < cap]
            out.append(rows)
    return pd.concat(out, ignore_index=True)


def fit(table: pd.DataFrame) -> HistGradientBoostingRegressor:
    # Features with no data in the training seasons (defensive contributions before 2025-26) are left out
    cols = [c for c in FEATURES if table[c].notna().any()]
    model = HistGradientBoostingRegressor(categorical_features=[cols.index("pos")], **PARAMS)
    model.fit(table[cols], table["total_points"])
    model.columns_ = cols
    return model


def predict(model, rows: pd.DataFrame) -> pd.Series:
    return pd.Series(model.predict(rows[model.columns_]), index=rows.index)


class Projector:
    """Expected points per player per upcoming GW; same interface as projections.Projector.expected.

    Trains on every season in data/history plus this season's played GWs (cached
    in data/points_model.pkl until new data arrives). Leads beyond MAX_LEAD reuse
    the furthest-lead behaviour.
    """

    def __init__(self, data, horizon: int = 10):
        self.d = data
        matches, schedule, season = history.load()
        fb = FeatureBuilder(matches)
        model = self._model(fb, season, data.next_gw)
        team_code = {t["id"]: t["code"] for t in data.boot["teams"]}
        els = pd.DataFrame(data.boot["elements"])
        roster = pd.DataFrame({
            "code": els["code"], "element": els["id"], "pos": els["element_type"], "team": els["team"].map(team_code),
            "price": els["now_cost"] / 10, "sel_pct": els["selected_by_percent"].astype(float).rank(pct=True),
        })
        rows = fb.live_rows(season, data.next_gw, schedule, roster, horizon)
        rows["lead"] = rows["lead"].clip(upper=MAX_LEAD)
        rows["pred"] = predict(model, rows)
        self.points = rows.groupby(["element", "gw"])["pred"].sum().to_dict()
        self.fixtures = rows.groupby(["element", "gw"])["opp"].apply(list).to_dict()

    @staticmethod
    def _model(fb, season, next_gw):
        path = DATA_DIR / "points_model.pkl"
        key = (sorted(fb.matches["season"].unique().tolist()), season, next_gw, len(fb.matches))
        if path.exists():
            cached = pickle.loads(path.read_bytes())
            if cached["key"] == key:
                return cached["model"]
        print("training points model (about a minute)...", flush=True)
        seasons = sorted(fb.matches["season"].unique())
        model = fit(training_table(fb, seasons, last_gw={season: next_gw}))
        path.write_bytes(pickle.dumps({"key": key, "model": model}))
        return model

    def expected(self, pid: int, gw: int, availability: float = 1.0) -> float:
        return self.points.get((pid, gw), 0.0) * availability


if __name__ == "__main__":
    import argparse

    from common import Data

    ap = argparse.ArgumentParser(description="Show expected points for players over the next gameweeks.")
    ap.add_argument("players", nargs="*", help="web names (Name:TEAM if ambiguous); default = your squad")
    ap.add_argument("--gws", type=int, default=5, help="how many gameweeks ahead")
    args = ap.parse_args()

    d = Data()
    proj = Projector(d, horizon=args.gws)
    ids = [d.find(n) for n in args.players] or d.squad_state().squad
    gws = range(d.next_gw, d.next_gw + args.gws)
    code_name = {t["code"]: t["short_name"] for t in d.boot["teams"]}
    print(f"{'player':<22}" + "".join(f"{'GW' + str(g):>13}" for g in gws) + "   total")
    for pid in sorted(ids, key=lambda p: -sum(proj.expected(p, g) for g in gws)):
        cells = ""
        for g in gws:
            fx = "+".join(code_name[o] for o in proj.fixtures.get((pid, g), [])) or "blank"
            cells += f"{fx:>8}{proj.expected(pid, g):>5.1f}"
        print(f"{d.label(pid):<22}{cells}   {sum(proj.expected(pid, g) for g in gws):5.1f}")
