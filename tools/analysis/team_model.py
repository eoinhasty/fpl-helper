"""Team attack/defence ratings from match xG, shrunk toward a prior.

FPL zeroed its own team strength ratings this season, so by default the prior
is "average": each team gets PRIOR_GAMES pseudo-matches at a rating of 1.0.
The fixture ticker's numbers (publish_projections.team_goals) instead start
each team from its last RECENT_WINDOW fixtures, reaching into last season
(recent_ratings, RECENT_PRIOR_GAMES pseudo-matches) — backtest_ticker.py found
that better early in a season and no worse later.
"""
import math
from collections import defaultdict
from dataclasses import dataclass

PRIOR_GAMES = 4
RECENT_WINDOW = 12  # features.TEAM_WINDOW: the points model's own team-form window
RECENT_PRIOR_GAMES = 8  # 4-12 scored within noise of each other in backtest_ticker.py


@dataclass
class TeamModel:
    lg_home: float
    lg_away: float
    att: dict  # >1 = creates more xG than average
    dfn: dict  # >1 = concedes more xG than average
    xgf: dict  # raw xG per game
    xga: dict

    def expected_goals(self, home: int, away: int) -> tuple:
        return (
            self.lg_home * self.att[home] * self.dfn[away],
            self.lg_away * self.att[away] * self.dfn[home],
        )

    def fixtures_for(self, data, team: int, gw: int) -> list:
        """[(opponent, is_home, goals_for, goals_against)] — empty for a blank, two for a double."""
        out = []
        for f in data.fixtures_by_gw.get(gw, []):
            if team not in (f["team_h"], f["team_a"]):
                continue
            home = f["team_h"] == team
            gh, ga = self.expected_goals(f["team_h"], f["team_a"])
            opp = f["team_a"] if home else f["team_h"]
            out.append((opp, home, gh if home else ga, ga if home else gh))
        return out


def fit(data, upto: int, prior: tuple | None = None, prior_games: float = PRIOR_GAMES) -> TeamModel:
    """Ratings from this season's finished fixtures up to GW `upto` (common.Data);
    `prior` as in fit_matches, keyed by FPL team id."""
    xg = defaultdict(float)
    for (pid, gw), s in data.games.items():
        if gw > upto or not s["fixture"] or pid not in data.els:
            continue
        f = data.fixture_by_id[s["fixture"]]
        team = data.els[pid]["team"]
        if team in (f["team_h"], f["team_a"]):  # skip players who've since changed clubs
            xg[(f["id"], team)] += float(s["expected_goals"])

    played = [
        (f["team_h"], f["team_a"], xg[(f["id"], f["team_h"])], xg[(f["id"], f["team_a"])])
        for f in data.fixtures
        if f["finished"] and f["event"] is not None and f["event"] <= upto
    ]
    return fit_matches(played, data.team_name, prior, prior_games)


def recent_ratings(tf, season: int, origin: int) -> tuple:
    """({team: att}, {team: dfn}) from each team's last RECENT_WINDOW fixtures before
    `origin` of `season`, relative to the league mean over those rows. `tf` is
    features.team_fixtures(history.load()[0]) — teams keyed by FPL team *code*.
    Promoted teams without top-flight rows are left out (league average)."""
    past = tf[tf["key"] < season * 100 + origin]
    recent = past.groupby("team").tail(RECENT_WINDOW)
    state = recent.groupby("team").agg(xgf=("xgf", "mean"), xga=("xga", "mean"))
    mean = recent["xgf"].mean()
    return (state["xgf"] / mean).to_dict(), (state["xga"] / mean).to_dict()


def fit_matches(played: list, teams, prior: tuple | None = None, prior_games: float = PRIOR_GAMES) -> TeamModel:
    """Ratings from [(home team, away team, home xG, away xG)] of played
    fixtures; `teams` lists every team to rate. Each team starts from
    `prior_games` pseudo-games at its prior rating — `prior` = ({team: att},
    {team: dfn}), 1.0 (league average) for teams it leaves out or without one."""
    prior_att, prior_dfn = prior or ({}, {})
    rows = defaultdict(lambda: {"for_h": [], "ag_h": [], "for_a": [], "ag_a": []})
    for h, a, xh, xa in played:
        rows[h]["for_h"].append(xh)
        rows[h]["ag_h"].append(xa)
        rows[a]["for_a"].append(xa)
        rows[a]["ag_a"].append(xh)

    home_xg = [x for r in rows.values() for x in r["for_h"]]
    away_xg = [x for r in rows.values() for x in r["for_a"]]
    lg_h, lg_a = sum(home_xg) / len(home_xg), sum(away_xg) / len(away_xg)

    att, dfn, xgf, xga = {}, {}, {}, {}
    for team in teams:
        r = rows[team]
        n = len(r["for_h"]) + len(r["for_a"])
        pa, pd_ = prior_att.get(team, 1.0), prior_dfn.get(team, 1.0)
        if n == 0:
            att[team], dfn[team] = pa, pd_
            xgf[team], xga[team] = (lg_h + lg_a) / 2, (lg_h + lg_a) / 2
            continue
        exp_for = lg_h * len(r["for_h"]) + lg_a * len(r["for_a"])
        exp_ag = lg_a * len(r["ag_h"]) + lg_h * len(r["ag_a"])
        att_obs = sum(r["for_h"] + r["for_a"]) / exp_for
        dfn_obs = sum(r["ag_h"] + r["ag_a"]) / exp_ag
        att[team] = (att_obs * n + pa * prior_games) / (n + prior_games)
        dfn[team] = (dfn_obs * n + pd_ * prior_games) / (n + prior_games)
        xgf[team] = sum(r["for_h"] + r["for_a"]) / n
        xga[team] = sum(r["ag_h"] + r["ag_a"]) / n
    return TeamModel(lg_h, lg_a, att, dfn, xgf, xga)


def clean_sheet_prob(goals_against: float) -> float:
    return math.exp(-goals_against)


if __name__ == "__main__":
    from common import Data

    d = Data()
    m = fit(d, d.last_finished)
    print(f"League xG/game: home {m.lg_home:.2f}, away {m.lg_away:.2f}\n")
    print(f"{'team':<5}{'xGF/g':>7}{'xGA/g':>7}{'att':>6}{'def':>6}   (att >1 better, def >1 leakier)")
    for t in sorted(d.team_name, key=lambda t: -m.att[t] / m.dfn[t]):
        print(f"{d.team_name[t]:<5}{m.xgf[t]:>7.2f}{m.xga[t]:>7.2f}{m.att[t]:>6.2f}{m.dfn[t]:>6.2f}")
    print(f"\nGW{d.next_gw} projections:")
    for f in d.fixtures_by_gw.get(d.next_gw, []):
        gh, ga = m.expected_goals(f["team_h"], f["team_a"])
        h, a = d.team_name[f["team_h"]], d.team_name[f["team_a"]]
        print(f"  {h:<4}{gh:.2f} - {ga:.2f} {a:<4}  clean sheet: {h} {clean_sheet_prob(ga):.0%}, {a} {clean_sheet_prob(gh):.0%}")
