"""Per-player expected FPL points for a gameweek.

Each scoring route (appearance, goals, assists, clean sheet, goals conceded,
defensive contribution, bonus, saves) is projected from the player's own
per-90 rates, adjusted for opponent and venue with the team model. Rates are
shrunk toward the player's last two seasons (or his position's average when
he has <900 PL minutes in them), because five games of data are mostly noise.

`calib` = (a, b) maps raw projections onto the real-points scale:
points ≈ a + b * raw. backtest.py measures it; the model is overconfident, so
b is well below 1.
"""
import json
import math
from pathlib import Path

import team_model
from common import CS_PTS, DATA_DIR, DC_THRESHOLD, GOAL_PTS

PRIOR_MINUTES_OWN = 900  # weight of a player's own history, in minutes
PRIOR_MINUTES_POS = 450  # weight of the positional average
PRIOR_GAMES_RATES = 4  # pseudo-games for def-con hit rate and bonus
POS_DC_RATE = {2: 0.26, 3: 0.12, 4: 0.03}  # league share of 60+ min apps hitting the threshold
DEFAULT_BONUS_PER_GAME = 0.3


def load_calibration(data_dir: Path = DATA_DIR) -> tuple:
    path = data_dir / "calib.json"
    if not path.exists():
        print("note: no calib.json — run backtest.py; using uncalibrated projections")
        return (0.0, 1.0)
    c = json.loads(path.read_text())
    return (c["a"], c["b"])


def _pois_tail(mean: float, k: int) -> float:
    return 1 - sum(math.exp(-mean) * mean**i / math.factorial(i) for i in range(k))


def _expected_floor_half(lam: float) -> float:
    return sum(math.exp(-lam) * lam**k / math.factorial(k) * (k // 2) for k in range(15))


class Projector:
    def __init__(self, data, upto: int = None, calib: tuple = (0.0, 1.0)):
        self.d = data
        self.upto = upto or data.last_finished
        self.tm = team_model.fit(data, self.upto)
        self.calib = calib
        self._pos_prior = self._positional_priors()

    def games(self, pid: int) -> list:
        return [
            self.d.games[(pid, gw)]
            for gw in range(1, self.upto + 1)
            if (pid, gw) in self.d.games and self.d.games[(pid, gw)]["minutes"] > 0
        ]

    def _positional_priors(self) -> dict:
        tot = {p: [0.0, 0.0, 0.0] for p in (1, 2, 3, 4)}  # minutes, xG, xA
        regular = 45 * self.upto  # played at least half the available minutes
        for pid, e in self.d.els.items():
            g = self.games(pid)
            mins = sum(x["minutes"] for x in g)
            if mins >= regular:
                t = tot[e["element_type"]]
                t[0] += mins
                t[1] += sum(float(x["expected_goals"]) for x in g)
                t[2] += sum(float(x["expected_assists"]) for x in g)
        return {p: (t[1] / t[0] * 90, t[2] / t[0] * 90) for p, t in tot.items() if t[0]}

    def prior(self, pid: int) -> dict:
        pos = self.d.els[pid]["element_type"]
        seasons = self.d.history_past.get(pid, [])[-2:]
        mins = sum(s["minutes"] for s in seasons)
        if mins >= 900:
            m90 = mins / 90
            last = seasons[-1]
            last90 = last["minutes"] / 90
            if pos == 1:
                dc = 0.0
            elif last90 >= 10:
                dc = _pois_tail(last["defensive_contribution"] / last90, DC_THRESHOLD[pos])
            else:
                dc = POS_DC_RATE[pos]
            return dict(
                xg=sum(float(s["expected_goals"]) for s in seasons) / m90,
                xa=sum(float(s["expected_assists"]) for s in seasons) / m90,
                bonus=sum(s["bonus"] for s in seasons) / m90,
                dc=dc,
                weight=PRIOR_MINUTES_OWN,
                source="last 2 seasons",
            )
        xg, xa = self._pos_prior[pos]
        return dict(xg=xg, xa=xa, bonus=DEFAULT_BONUS_PER_GAME, dc=POS_DC_RATE.get(pos, 0.0),
                    weight=PRIOR_MINUTES_POS, source="position average")

    def start_rate(self, pid: int) -> float:
        """Half season-long start rate, half the last three GWs (catches new signings bedding in)."""
        starts = [self.d.games.get((pid, gw), {}).get("starts", 0) for gw in range(1, self.upto + 1)]
        recent = starts[-3:]
        return 0.5 * sum(starts) / self.upto + 0.5 * sum(recent) / len(recent)

    def if_starts(self, pid: int, gw: int) -> dict:
        """Expected points if he starts, by component (summed over a double gameweek)."""
        e = self.d.els[pid]
        pos, team = e["element_type"], e["team"]
        games = self.games(pid)
        mins = sum(g["minutes"] for g in games)
        fixtures = self.tm.fixtures_for(self.d, team, gw)
        zero = dict(app=0, goal=0, ast=0, cs=0, conc=0, dc=0, bonus=0, saves=0, total=0, fixtures=[])
        if mins == 0 or not fixtures:
            return zero

        pr = self.prior(pid)
        starts = sum(g["starts"] for g in games)
        mins_per_start = min(90, mins / max(starts, 1))
        frac = mins_per_start / 90
        p60 = 1.0 if mins_per_start >= 60 else 0.3
        xg90 = (sum(float(g["expected_goals"]) for g in games) + pr["xg"] * pr["weight"] / 90) / (mins + pr["weight"]) * 90
        xa90 = (sum(float(g["expected_assists"]) for g in games) + pr["xa"] * pr["weight"] / 90) / (mins + pr["weight"]) * 90
        full = [g for g in games if g["minutes"] >= 60]
        dc_rate = 0.0
        if pos != 1:
            hits = sum(1 for g in full if g["defensive_contribution"] >= DC_THRESHOLD[pos])
            dc_rate = (hits + pr["dc"] * PRIOR_GAMES_RATES) / (len(full) + PRIOR_GAMES_RATES)
        bonus_rate = (sum(g["bonus"] for g in games) + pr["bonus"] * PRIOR_GAMES_RATES) / (len(games) + PRIOR_GAMES_RATES)
        saves90 = sum(g["saves"] for g in games) / mins * 90

        out = dict(zero, fixtures=[])
        for opp, home, gf, ga in fixtures:
            venue_avg = self.tm.lg_home if home else self.tm.lg_away
            factor = gf / (venue_avg * self.tm.att[team])  # pure opponent+venue effect on his attack
            out["app"] += 2 * p60 + (1 - p60)
            out["goal"] += xg90 * frac * factor * GOAL_PTS[pos]
            out["ast"] += xa90 * frac * factor * 3
            out["cs"] += math.exp(-ga * frac) * CS_PTS[pos] * p60
            if pos in (1, 2):
                out["conc"] -= _expected_floor_half(ga * frac)
            out["dc"] += dc_rate * 2
            out["bonus"] += bonus_rate * factor**0.5
            if pos == 1:
                avg_against = (self.tm.lg_home + self.tm.lg_away) / 2 * self.tm.dfn[team]
                out["saves"] += saves90 * (ga / avg_against) / 3
            out["fixtures"].append(f"{self.d.team_name[opp]}({'H' if home else 'a'})")
        out["total"] = sum(out[k] for k in ("app", "goal", "ast", "cs", "conc", "dc", "bonus", "saves"))
        return out

    def raw(self, pid: int, gw: int) -> float:
        return self.start_rate(pid) * self.if_starts(pid, gw)["total"]

    def expected(self, pid: int, gw: int, availability: float = 1.0) -> float:
        """Calibrated expected points. availability = injury/news factor on top of the start rate."""
        fx = self.tm.fixtures_for(self.d, self.d.els[pid]["team"], gw)
        if not fx or not self.games(pid):
            return 0.0
        a, b = self.calib
        return (a * len(fx) + b * self.raw(pid, gw)) * availability


if __name__ == "__main__":
    import argparse

    from common import Data

    ap = argparse.ArgumentParser(description="Show projections for players over the next gameweeks.")
    ap.add_argument("players", nargs="*", help="web names (Name:TEAM if ambiguous); default = your squad")
    ap.add_argument("--gws", type=int, default=5, help="how many gameweeks ahead")
    args = ap.parse_args()

    d = Data()
    proj = Projector(d, calib=load_calibration())
    ids = [d.find(n) for n in args.players] or d.squad_state().squad
    gws = range(d.next_gw, d.next_gw + args.gws)
    print(f"{'player':<22}{'prior':<17}{'start%':>7}  " + "".join(f"{'GW' + str(g):>13}" for g in gws) + "   total")
    for pid in ids:
        cells, tot = "", 0.0
        for g in gws:
            pts = proj.expected(pid, g)
            tot += pts
            fx = "+".join(proj.if_starts(pid, g)["fixtures"]) or "blank"
            cells += f"{fx:>8}{pts:>5.1f}"
        print(f"{d.label(pid):<22}{proj.prior(pid)['source']:<17}{proj.start_rate(pid):>7.0%}  {cells}   {tot:5.1f}")
