"""Per-fixture match logs for past seasons and this one, in one table.

Past seasons come from data/history/ (fetch_history.py); this season from
data/season_gws.json (fetch_data.py). Players and teams are keyed by FPL's
`code`, which stays the same across seasons (element and team ids don't).
"""
import json

import numpy as np
import pandas as pd

from common import DATA_DIR

POS_CODE = {"GK": 1, "DEF": 2, "MID": 3, "FWD": 4}
STATS = [
    "minutes", "starts", "total_points", "goals_scored", "assists", "clean_sheets", "goals_conceded",
    "saves", "bonus", "bps", "expected_goals", "expected_assists", "expected_goals_conceded",
    "defensive_contribution", "value", "selected", "transfers_balance",
]


def season_year(name: str) -> int:
    return int(name[:4])


def _attach(m: pd.DataFrame, fixtures: pd.DataFrame, team_code: dict, season: int) -> pd.DataFrame:
    fx = fixtures.set_index("id")
    m = m[m["fixture"].isin(fx.index)].copy()
    home = (m["was_home"].astype(str).str.lower() == "true").to_numpy()
    th, ta = fx.loc[m["fixture"], "team_h"].to_numpy(), fx.loc[m["fixture"], "team_a"].to_numpy()
    m["team"] = pd.Series(np.where(home, th, ta), index=m.index).map(team_code)
    m["opp"] = pd.Series(np.where(home, ta, th), index=m.index).map(team_code)
    m["home"] = home.astype(int)
    m["season"] = season
    for c in STATS:
        if c not in m:
            m[c] = float("nan")  # e.g. defensive_contribution before 2025-26
        m[c] = pd.to_numeric(m[c], errors="coerce")
    return m


def _schedule(fixtures: pd.DataFrame, team_code: dict, season: int) -> pd.DataFrame:
    f = fixtures.dropna(subset=["event"]).copy()
    return pd.DataFrame({
        "season": season, "fixture": f["id"], "gw": f["event"].astype(int),
        "team_h": f["team_h"].map(team_code), "team_a": f["team_a"].map(team_code),
    })


def load() -> tuple:
    """(matches, schedule, current_season). matches: one row per player per fixture."""
    matches, schedules = [], []
    for d in sorted((DATA_DIR / "history").iterdir()):
        season = season_year(d.name)
        teams = pd.read_csv(d / "teams.csv")
        team_code = dict(zip(teams["id"], teams["code"]))
        players = pd.read_csv(d / "players_raw.csv")
        fixtures = pd.read_csv(d / "fixtures.csv")
        m = pd.read_csv(d / "merged_gw.csv", low_memory=False)
        m = m[m["position"].isin(POS_CODE)]  # drops 2024-25's assistant managers
        m = m.merge(players[["id", "code"]].rename(columns={"id": "element"}), on="element")
        m["pos"] = m["position"].map(POS_CODE)
        m = m.rename(columns={"GW": "gw"})
        matches.append(_attach(m, fixtures, team_code, season))
        schedules.append(_schedule(fixtures, team_code, season))

    boot = json.loads((DATA_DIR / "bootstrap.json").read_text())
    season = int(boot["events"][0]["deadline_time"][:4])
    team_code = {t["id"]: t["code"] for t in boot["teams"]}
    els = pd.DataFrame(boot["elements"])[["id", "code", "element_type"]]
    els.columns = ["element", "code", "pos"]
    fixtures = pd.DataFrame(json.loads((DATA_DIR / "fixtures.json").read_text()))
    m = pd.DataFrame(json.loads((DATA_DIR / "season_gws.json").read_text()))
    m = m.rename(columns={"round": "gw"}).merge(els, on="element")
    matches.append(_attach(m, fixtures, team_code, season))
    schedules.append(_schedule(fixtures, team_code, season))

    cols = ["season", "gw", "fixture", "element", "code", "pos", "team", "opp", "home"] + STATS
    return pd.concat([x[cols] for x in matches], ignore_index=True), pd.concat(schedules, ignore_index=True), season
