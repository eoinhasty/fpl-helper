"""Team attack/defence ratings from match xG, shrunk toward league average.

FPL zeroed its own team strength ratings this season, so the only prior is
"average": each team gets PRIOR_GAMES pseudo-matches at a rating of 1.0.
"""
import math
from collections import defaultdict
from dataclasses import dataclass

PRIOR_GAMES = 4


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


def fit(data, upto: int) -> TeamModel:
    xg = defaultdict(float)
    for (pid, gw), s in data.games.items():
        if gw > upto or not s["fixture"] or pid not in data.els:
            continue
        f = data.fixture_by_id[s["fixture"]]
        team = data.els[pid]["team"]
        if team in (f["team_h"], f["team_a"]):  # skip players who've since changed clubs
            xg[(f["id"], team)] += float(s["expected_goals"])

    rows = defaultdict(lambda: {"for_h": [], "ag_h": [], "for_a": [], "ag_a": []})
    for f in data.fixtures:
        if not f["finished"] or f["event"] is None or f["event"] > upto:
            continue
        h, a = f["team_h"], f["team_a"]
        xh, xa = xg[(f["id"], h)], xg[(f["id"], a)]
        rows[h]["for_h"].append(xh)
        rows[h]["ag_h"].append(xa)
        rows[a]["for_a"].append(xa)
        rows[a]["ag_a"].append(xh)

    home_xg = [x for r in rows.values() for x in r["for_h"]]
    away_xg = [x for r in rows.values() for x in r["for_a"]]
    lg_h, lg_a = sum(home_xg) / len(home_xg), sum(away_xg) / len(away_xg)

    att, dfn, xgf, xga = {}, {}, {}, {}
    for team in data.team_name:
        r = rows[team]
        n = len(r["for_h"]) + len(r["for_a"])
        if n == 0:
            att[team] = dfn[team] = 1.0
            xgf[team], xga[team] = (lg_h + lg_a) / 2, (lg_h + lg_a) / 2
            continue
        exp_for = lg_h * len(r["for_h"]) + lg_a * len(r["for_a"])
        exp_ag = lg_a * len(r["ag_h"]) + lg_h * len(r["ag_a"])
        att_obs = sum(r["for_h"] + r["for_a"]) / exp_for
        dfn_obs = sum(r["ag_h"] + r["ag_a"]) / exp_ag
        att[team] = (att_obs * n + PRIOR_GAMES) / (n + PRIOR_GAMES)
        dfn[team] = (dfn_obs * n + PRIOR_GAMES) / (n + PRIOR_GAMES)
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
