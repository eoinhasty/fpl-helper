"""Does the fixture ticker's Attack/Defence view rank fixtures better than FDR?

Walk-forward over every archived season with xG: at each origin GW, rate teams
only from fixtures before it, predict each team's expected goals for and against
in GW origin..origin+5 (the ticker's model horizon), then score against what
happened. Three predictors:

  blend    team_model.fit_matches on this season's fixtures, starting from each team's
           last 12 fixtures (team_model.recent_ratings) — what publish_projections.py ships
  season   the same, starting from league average (4 pseudo-games) — the old default
  recent   the same multiplicative form on the last 12 fixtures alone — the points
           model's own team features
  team only  the season model's own-team ratings, opponent ignored: does the fixture add anything?
  fdr      FPL's difficulty rating. The archive holds each season's FINAL FDR, which
           FPL revises during the season, so this flatters FDR a little

    python backtest_ticker.py               # all seasons with xG, origins GW2-33
    python backtest_ticker.py --bands 0.7 0.9 1.1 1.3

Metrics: fixture-level rank correlation with goals scored / AUC for clean sheets;
the ticker's actual use — ranking the 20 teams over the next 6 GWs — as the mean
Spearman across origins; calibration; and goals / clean-sheet rate per colour band.
"""
import argparse
import json
from collections import defaultdict

import numpy as np
import pandas as pd
from sklearn.metrics import roc_auc_score

import history
import team_model
from common import DATA_DIR
from features import team_fixtures

HORIZON = 6
BLEND_GAMES = team_model.RECENT_PRIOR_GAMES  # --blend-games
FIRST_ORIGIN, LAST_ORIGIN = 2, 33


def season_fixtures() -> pd.DataFrame:
    """One row per finished fixture: season, fixture, gw, team codes, scores, FDR."""
    rows = []
    sources = [(history.season_year(d.name), pd.read_csv(d / "fixtures.csv"), pd.read_csv(d / "teams.csv"))
               for d in sorted((DATA_DIR / "history").iterdir())]
    boot = json.loads((DATA_DIR / "bootstrap.json").read_text())
    current = int(boot["events"][0]["deadline_time"][:4])
    sources.append((current, pd.DataFrame(json.loads((DATA_DIR / "fixtures.json").read_text())),
                    pd.DataFrame(boot["teams"])))
    for season, fx, teams in sources:
        code = dict(zip(teams["id"], teams["code"]))
        fx = fx[(fx["finished"].astype(str).str.lower() == "true") & fx["event"].notna()]
        rows.append(pd.DataFrame({
            "season": season, "fixture": fx["id"].astype(int), "gw": fx["event"].astype(int),
            "h": fx["team_h"].map(code), "a": fx["team_a"].map(code),
            "hs": fx["team_h_score"].astype(int), "as_": fx["team_a_score"].astype(int),
            "hd": fx["team_h_difficulty"].astype(int), "ad": fx["team_a_difficulty"].astype(int),
        }))
    return pd.concat(rows, ignore_index=True)


def predictions(fx: pd.DataFrame, tf: pd.DataFrame) -> pd.DataFrame:
    """One row per team per fixture per origin, with each predictor and the outcome."""
    xg = tf.set_index(["season", "fixture", "team"])["xgf"].to_dict()
    # seasons with xG in every GW (2022-23's starts partway through)
    per_gw = tf.groupby(["season", "gw"])["xgf"].sum()
    has_xg = {s for s, g in per_gw.groupby(level=0) if (g > 0).all()}
    out = []
    for season in sorted(fx["season"].unique()):
        if season not in has_xg:
            continue
        sf = fx[fx["season"] == season]
        teams = sorted(set(sf["h"]) | set(sf["a"]))
        # the recent predictor needs last season's xG too (2022-23's is blank)
        recent_ok = (season - 1) in has_xg
        for origin in range(FIRST_ORIGIN, LAST_ORIGIN + 1):
            past = sf[sf["gw"] < origin]
            target = sf[(sf["gw"] >= origin) & (sf["gw"] < origin + HORIZON)]
            if past.empty or target.empty:
                continue
            played = [(r.h, r.a, xg.get((season, r.fixture, r.h), 0.0), xg.get((season, r.fixture, r.a), 0.0))
                      for r in past.itertuples()]
            tm = team_model.fit_matches(played, teams)
            recent = recent_model(tf, season, origin, tm) if recent_ok else None
            # season fit, starting from last-12-fixture ratings instead of league average
            blend = team_model.fit_matches(played, teams, team_model.recent_ratings(tf, season, origin),
                                           BLEND_GAMES) if recent_ok else None
            for r in target.itertuples():
                gh, ga = tm.expected_goals(r.h, r.a)
                rh, ra = recent(r.h, r.a) if recent else (np.nan, np.nan)
                bh, ba = blend.expected_goals(r.h, r.a) if blend else (np.nan, np.nan)
                for team, opp, home, xf, xa, rf, ra_, bf, ba_, gf, gaa, fdr in (
                    (r.h, r.a, 1, gh, ga, rh, ra, bh, ba, r.hs, r.as_, r.hd),
                    (r.a, r.h, 0, ga, gh, ra, rh, ba, bh, r.as_, r.hs, r.ad),
                ):
                    venue = tm.lg_home if home else tm.lg_away
                    # own strength only, opponent ignored: does the fixture add anything?
                    tf_, ta_ = venue * tm.att[team], (tm.lg_away if home else tm.lg_home) * tm.dfn[team]
                    out.append((season, origin, r.gw, r.fixture, team, opp, home, r.gw - origin + 1,
                                xf, xa, rf, ra_, bf, ba_, tf_, ta_, fdr, gf, gaa, tm.lg_home, tm.lg_away))
    return pd.DataFrame(out, columns=[
        "season", "origin", "gw", "fixture", "team", "opp", "home", "lead",
        "season_for", "season_ag", "recent_for", "recent_ag", "blend_for", "blend_ag", "team_for", "team_ag", "fdr", "goals", "conceded", "lg_h", "lg_a",
    ])


def recent_model(tf: pd.DataFrame, season: int, origin: int, tm):
    """expected_goals(home, away) from each team's last 12 fixtures (team_model.recent_ratings),
    in team_model's multiplicative form with this season's venue averages."""
    att, dfn = team_model.recent_ratings(tf, season, origin)

    def expected(h, a):
        return (tm.lg_home * att.get(h, 1.0) * dfn.get(a, 1.0), tm.lg_away * att.get(a, 1.0) * dfn.get(h, 1.0))

    return expected


def fixture_metrics(p: pd.DataFrame) -> dict:
    cs = (p["conceded"] == 0).astype(int)
    out = {
        "goals rho: season": p["season_for"].corr(p["goals"], method="spearman"),
        "goals rho: fdr": (-p["fdr"]).corr(p["goals"], method="spearman"),
        "CS AUC: season": roc_auc_score(cs, -p["season_ag"]),
        "CS AUC: fdr": roc_auc_score(cs, -p["fdr"]),
        "goals rho: team only": p["team_for"].corr(p["goals"], method="spearman"),
        "CS AUC: team only": roc_auc_score(cs, -p["team_ag"]),
    }
    q = p.dropna(subset=["recent_for"])
    if len(q):
        qcs = (q["conceded"] == 0).astype(int)
        out["goals rho: recent"] = q["recent_for"].corr(q["goals"], method="spearman")
        out["CS AUC: recent"] = roc_auc_score(qcs, -q["recent_ag"])
        out["goals rho: blend"] = q["blend_for"].corr(q["goals"], method="spearman")
        out["CS AUC: blend"] = roc_auc_score(qcs, -q["blend_ag"])
        # same rows, for a like-for-like comparison
        out["goals rho: season (recent rows)"] = q["season_for"].corr(q["goals"], method="spearman")
        out["goals rho: fdr (recent rows)"] = (-q["fdr"]).corr(q["goals"], method="spearman")
        out["CS AUC: season (recent rows)"] = roc_auc_score(qcs, -q["season_ag"])
        out["CS AUC: fdr (recent rows)"] = roc_auc_score(qcs, -q["fdr"])
    return out


def team_ranking(p: pd.DataFrame) -> dict:
    """The ticker's sort: per origin, rank the 20 teams over the next 6 GWs and correlate
    with what they actually scored / how many clean sheets they kept. Model views sort by
    sums (doubles count), FDR by average difficulty — as FdrGrid does."""
    p = p.assign(cs=(p["conceded"] == 0).astype(int), cs_season=np.exp(-p["season_ag"]),
                 cs_recent=np.exp(-p["recent_ag"]), cs_team=np.exp(-p["team_ag"]), cs_blend=np.exp(-p["blend_ag"]))
    res = defaultdict(list)
    for _, g in p.groupby(["season", "origin"]):
        t = g.groupby("team").agg(goals=("goals", "sum"), cs=("cs", "sum"), fdr=("fdr", "mean"),
                                  season_for=("season_for", "sum"), cs_season=("cs_season", "sum"),
                                  recent_for=("recent_for", "sum"), cs_recent=("cs_recent", "sum"),
                                  team_for=("team_for", "sum"), cs_team=("cs_team", "sum"),
                                  blend_for=("blend_for", "sum"), cs_blend=("cs_blend", "sum"))
        res["goals: season"].append(t["season_for"].corr(t["goals"], method="spearman"))
        res["goals: fdr"].append((-t["fdr"]).corr(t["goals"], method="spearman"))
        res["CS: season"].append(t["cs_season"].corr(t["cs"], method="spearman"))
        res["CS: fdr"].append((-t["fdr"]).corr(t["cs"], method="spearman"))
        res["goals: team only"].append(t["team_for"].corr(t["goals"], method="spearman"))
        res["CS: team only"].append(t["cs_team"].corr(t["cs"], method="spearman"))
        if g["recent_for"].notna().all():
            res["goals: recent"].append(t["recent_for"].corr(t["goals"], method="spearman"))
            res["CS: recent"].append(t["cs_recent"].corr(t["cs"], method="spearman"))
            res["goals: blend"].append(t["blend_for"].corr(t["goals"], method="spearman"))
            res["CS: blend"].append(t["cs_blend"].corr(t["cs"], method="spearman"))
    return {k: (float(np.nanmean(v)), len(v)) for k, v in res.items()}


def calibration(p: pd.DataFrame, col_for: str, col_ag: str) -> None:
    q = p.dropna(subset=[col_for])
    print(f"  mean predicted goals {q[col_for].mean():.2f} vs actual {q['goals'].mean():.2f}")
    cs_pred = np.exp(-q[col_ag])
    cs = (q["conceded"] == 0).astype(int)
    bins = pd.qcut(cs_pred, 5, duplicates="drop")
    tab = pd.DataFrame({"pred": cs_pred, "actual": cs}).groupby(bins, observed=True).mean()
    print("  clean sheets by predicted quintile (predicted -> actual):",
          ", ".join(f"{r.pred:.0%}->{r.actual:.0%}" for r in tab.itertuples()))


def bands(p: pd.DataFrame, cuts: list, col_for: str, col_ag: str) -> None:
    """Goals / CS per colour band (1 = easiest), as lib/utils.ts xgBand bands them."""
    q = p.dropna(subset=[col_for])
    league = (q["lg_h"] + q["lg_a"]) / 2

    def band(r, higher_easier):
        r = r if higher_easier else 2 - r
        return np.select([r >= cuts[3], r >= cuts[2], r > cuts[1], r > cuts[0]], [1, 2, 3, 4], 5)

    q = q.assign(att=band(q[col_for] / league, True), dfn=band(q[col_ag] / league, False),
                 cs=(q["conceded"] == 0).astype(int))
    for name, col, target in (("attack", "att", "goals"), ("defence", "dfn", "cs"), ("FDR", "fdr", None)):
        g = q.groupby(col)
        cells = []
        for b, grp in g:
            if target == "cs":
                cells.append(f"{b}: {grp['cs'].mean():.0%} CS ({len(grp) / len(q):.0%})")
            elif target == "goals":
                cells.append(f"{b}: {grp['goals'].mean():.2f} g ({len(grp) / len(q):.0%})")
            else:
                cells.append(f"{b}: {grp['goals'].mean():.2f} g / {grp['cs'].mean():.0%} CS ({len(grp) / len(q):.0%})")
        print(f"  {name:<8}" + " · ".join(cells))


def main():
    global BLEND_GAMES
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--bands", type=float, nargs=4, default=[0.7, 0.9, 1.1, 1.3],
                    help="ratio cut-offs for bands 4|3|2|1 (xgBand in lib/utils.ts)")
    ap.add_argument("--blend-games", type=float, default=BLEND_GAMES,
                    help="pseudo-games of last-12-fixture prior in the blend predictor")
    args = ap.parse_args()
    BLEND_GAMES = args.blend_games

    matches, _, _ = history.load()
    tf = team_fixtures(matches)
    p = predictions(season_fixtures(), tf)
    print(f"{len(p)} team-fixture predictions, seasons {sorted(p['season'].unique())}\n")

    for label, sub in [("ALL", p)] + [(str(s), g) for s, g in p.groupby("season")] + [
        ("early origins GW2-8", p[p["origin"] <= 8]), ("later origins GW9+", p[p["origin"] > 8]),
    ]:
        print(f"== {label} ({len(sub)} rows)")
        for k, v in fixture_metrics(sub).items():
            print(f"  fixture  {k:<34}{v:.3f}")
        for k, (v, n) in team_ranking(sub).items():
            print(f"  6-GW team ranking, {k:<20}{v:.3f}  (over {n} origins)")
        print()

    print("== calibration, season model")
    calibration(p, "season_for", "season_ag")
    print("== calibration, recent model")
    calibration(p, "recent_for", "recent_ag")
    print("== calibration, blend model")
    calibration(p, "blend_for", "blend_ag")
    print(f"\n== bands {args.bands}, season model")
    bands(p, args.bands, "season_for", "season_ag")
    print("== same bands, recent model")
    bands(p, args.bands, "recent_for", "recent_ag")
    print("== same bands, blend model")
    bands(p, args.bands, "blend_for", "blend_ag")


if __name__ == "__main__":
    main()
