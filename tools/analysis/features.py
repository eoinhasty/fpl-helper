"""Features for the points model, computed only from what was known at a deadline.

`origin` = the first gameweek being predicted. Everything about a player or
team is built from fixtures before the origin (plus last season's totals), so
the same code produces leak-free training rows for past seasons and live rows
for the coming gameweeks.

A training row is (player, target fixture in GW origin..origin+5); `lead` is
how many gameweeks ahead that fixture is.
"""
import numpy as np
import pandas as pd

TEAM_WINDOW = 12  # recent fixtures used for team attack/defence (spans the previous season)
MAX_LEAD = 5

PLAYER_FEATURES = [
    "pos", "n_gws", "mins_pg", "start_rate", "form", "pts90", "xg90", "xa90", "xgc90", "bonus90", "bps90",
    "saves90", "dc90", "mins3", "starts3", "pts3", "xgi3", "mins1", "ls_mins", "ls_pts90", "ls_xg90",
    "ls_xa90", "ls_bonus90", "ls_pts_pg", "ls_dc90", "price", "sel_pct",
]
FIXTURE_FEATURES = ["team_xgf", "team_xga", "opp_xgf", "opp_xga", "home", "lead", "origin"]
FEATURES = PLAYER_FEATURES + FIXTURE_FEATURES


def per_gw(matches: pd.DataFrame) -> pd.DataFrame:
    """One row per player per gameweek (doubles summed)."""
    agg = {c: "sum" for c in ["minutes", "starts", "total_points", "expected_goals", "expected_assists",
                              "expected_goals_conceded", "bonus", "bps", "saves", "defensive_contribution"]}
    agg.update(value="last", selected="last", pos="last", team="last", element="last")
    g = matches.sort_values("fixture").groupby(["season", "code", "gw"], as_index=False).agg(agg)
    # sum() turns all-NaN defensive_contribution (pre-2025) into 0; put the NaN back
    has_dc = matches.groupby("season")["defensive_contribution"].apply(lambda s: s.notna().any())
    g.loc[~g["season"].map(has_dc), "defensive_contribution"] = np.nan
    return g.sort_values(["season", "code", "gw"]).reset_index(drop=True)


def last_season(pg: pd.DataFrame) -> pd.DataFrame:
    """Season totals keyed by the *following* season, ready to join."""
    s = pg.groupby(["season", "code"]).agg(
        mins=("minutes", "sum"), pts=("total_points", "sum"), xg=("expected_goals", "sum"),
        xa=("expected_assists", "sum"), bonus=("bonus", "sum"), dc=("defensive_contribution", "sum"),
        n=("gw", "size"), dc_known=("defensive_contribution", lambda x: x.notna().any()),
    ).reset_index()
    p90 = 90 / s["mins"].where(s["mins"] > 0)
    out = pd.DataFrame({
        "season": s["season"] + 1, "code": s["code"], "ls_mins": s["mins"],
        "ls_pts90": s["pts"] * p90, "ls_xg90": s["xg"] * p90, "ls_xa90": s["xa"] * p90,
        "ls_bonus90": s["bonus"] * p90, "ls_pts_pg": s["pts"] / s["n"],
        "ls_dc90": (s["dc"] * p90).where(s["dc_known"]),
    })
    # A season on a PL club's books without playing (loan, injury, new signing)
    # is no evidence either way; leave it missing rather than as 0 pts/game
    return out[s["mins"] > 0]


def team_fixtures(matches: pd.DataFrame) -> pd.DataFrame:
    """xG for and against per team per fixture."""
    xg = matches.groupby(["season", "gw", "fixture", "team", "opp"], as_index=False)["expected_goals"].sum()
    opp = xg.rename(columns={"team": "opp", "opp": "team", "expected_goals": "xga"})[["season", "fixture", "team", "xga"]]
    tf = xg.merge(opp, on=["season", "fixture", "team"]).rename(columns={"expected_goals": "xgf"})
    tf["key"] = tf["season"] * 100 + tf["gw"]
    return tf.sort_values("key")


def team_state(tf: pd.DataFrame, season: int, origin: int) -> pd.DataFrame:
    past = tf[tf["key"] < season * 100 + origin]
    recent = past.groupby("team").tail(TEAM_WINDOW)
    return recent.groupby("team").agg(xgf=("xgf", "mean"), xga=("xga", "mean"))


def player_state(pg: pd.DataFrame, ls: pd.DataFrame, season: int, origin: int) -> pd.DataFrame:
    """One row per player known this season, as of the origin's deadline."""
    cur = pg[pg["season"] == season]
    before = cur[cur["gw"] < origin]
    g = before.groupby("code")
    s = g.agg(n_gws=("gw", "size"), mins=("minutes", "sum"), starts=("starts", "sum"), pts=("total_points", "sum"),
              xg=("expected_goals", "sum"), xa=("expected_assists", "sum"), xgc=("expected_goals_conceded", "sum"),
              bonus=("bonus", "sum"), bps=("bps", "sum"), saves=("saves", "sum"),
              dc=("defensive_contribution", lambda x: x.sum(min_count=1)))
    tail3 = before.groupby("code").tail(3).groupby("code")
    s["mins3"] = tail3["minutes"].mean()
    s["starts3"] = tail3["starts"].mean()
    s["pts3"] = tail3["total_points"].mean()
    s["xgi3"] = tail3["expected_goals"].mean() + tail3["expected_assists"].mean()
    s["mins1"] = before.groupby("code").tail(1).set_index("code")["minutes"]

    p90 = 90 / s["mins"].where(s["mins"] >= 90)  # per-90 rates from a few minutes are noise
    out = pd.DataFrame(index=s.index)
    out["n_gws"] = s["n_gws"]
    out["mins_pg"] = s["mins"] / s["n_gws"]
    out["start_rate"] = s["starts"] / s["n_gws"]
    out["form"] = s["pts"] / s["n_gws"]
    for k in ("pts", "xg", "xa", "xgc", "bonus", "bps", "saves", "dc"):
        out[f"{k}90"] = s[k] * p90
    for k in ("mins3", "starts3", "pts3", "xgi3", "mins1"):
        out[k] = s[k]

    # Price and ownership at the origin's deadline (row for the origin GW if present, else latest)
    known = cur[cur["gw"] <= origin].groupby("code").tail(1).set_index("code")
    roster = known[["pos", "team", "element", "value", "selected"]]
    out = roster.join(out, how="left")
    out["price"] = out.pop("value") / 10
    out["sel_pct"] = out.pop("selected").rank(pct=True)
    out = out.reset_index().merge(ls[ls["season"] == season].drop(columns="season"), on="code", how="left")
    return out


def fixture_rows(state: pd.DataFrame, teams: pd.DataFrame, targets: pd.DataFrame, origin: int) -> pd.DataFrame:
    """Join player state to target fixtures (columns code, gw, team, opp, home[, total_points])."""
    rows = targets.merge(state.drop(columns=["team"]), on="code", how="inner")
    rows["team_xgf"] = rows["team"].map(teams["xgf"])
    rows["team_xga"] = rows["team"].map(teams["xga"])
    rows["opp_xgf"] = rows["opp"].map(teams["xgf"])
    rows["opp_xga"] = rows["opp"].map(teams["xga"])
    rows["lead"] = rows["gw"] - origin
    rows["origin"] = origin
    return rows


class FeatureBuilder:
    def __init__(self, matches: pd.DataFrame):
        self.matches = matches
        self.pg = per_gw(matches)
        self.ls = last_season(self.pg)
        self.tf = team_fixtures(matches)

    def training_rows(self, season: int, origin: int, max_lead: int = MAX_LEAD) -> pd.DataFrame:
        state = player_state(self.pg, self.ls, season, origin)
        teams = team_state(self.tf, season, origin)
        m = self.matches
        targets = m[(m["season"] == season) & (m["gw"] >= origin) & (m["gw"] <= origin + max_lead)]
        rows = fixture_rows(state, teams, targets[["code", "gw", "fixture", "team", "opp", "home", "total_points"]], origin)
        rows["season"] = season
        return rows

    def live_rows(self, season: int, origin: int, schedule: pd.DataFrame, roster: pd.DataFrame,
                  horizon: int) -> pd.DataFrame:
        """Rows for upcoming fixtures. roster: code, team, price, sel_pct for current players."""
        state = player_state(self.pg, self.ls, season, origin)
        state = roster.merge(state.drop(columns=["team", "price", "sel_pct", "pos", "element"], errors="ignore"),
                             on="code", how="left")
        teams = team_state(self.tf, season, origin)
        sch = schedule[(schedule["season"] == season) & (schedule["gw"] >= origin) & (schedule["gw"] < origin + horizon)]
        targets = pd.concat([
            pd.DataFrame({"gw": sch["gw"], "fixture": sch["fixture"], "team": sch["team_h"], "opp": sch["team_a"], "home": 1}),
            pd.DataFrame({"gw": sch["gw"], "fixture": sch["fixture"], "team": sch["team_a"], "opp": sch["team_h"], "home": 0}),
        ])
        targets = roster[["code", "team"]].merge(targets, on="team")
        return fixture_rows(state, teams, targets, origin)
