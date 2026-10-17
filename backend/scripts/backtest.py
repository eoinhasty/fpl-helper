"""Backtest the captaincy/transfer-suggestion scoring formula and the
start-probability heuristic against a season's realized data (default
2025/26).

Data source: the FPL API itself only retains the *current* season's
per-gameweek data (confirmed empirically 2026-08-03: /event/{gw}/live/ and
element-summary's `history` are both empty pre-season, and reset on
rollover). So this pulls last season's actuals from the community-run
vaastav/Fantasy-Premier-League GitHub archive instead:
  - fixtures.csv / gws/merged_gw.csv: real per-GW actuals (minutes, points,
    team, position) at full fidelity, no gaps.
  - players_raw.csv: a bootstrap-static mirror, but only committed ~12 times
    across the whole season (sparse — see COMMIT DATES below). Used *only*
    for status/news/chance_of_playing_next_round, since those can't be
    derived from box-score actuals the way form/minutes/ict can.

Known fidelity gaps (see README-style notes printed at the end of the run):
  - status/news are stale between snapshots; the Nov-Feb window in
    particular has one snapshot covering ~3 months.
  - ep_next (FPL's own expected-points model) isn't reconstructable at all
    from actuals, and reconstructing it from the sparse snapshots would be
    unreliable, so this backtest forces the formula's form+ICT fallback
    path for every player rather than testing the ep_next-primary path a
    live season actually uses most of the time.

Run from the backend/ directory: `python scripts/backtest.py [--season 2024-25] [--refresh]`
(set GITHUB_TOKEN if the GitHub API rate-limits the snapshot lookup). The
archive lags the live season — e.g. it only had GW1 of 2026-27 at GW7.
"""

from __future__ import annotations

import statistics
import sys
from collections import defaultdict
from pathlib import Path
from typing import Dict, List

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.services.service import FPLService  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))
import _fpl_archive  # noqa: E402
from _fpl_archive import (  # noqa: E402
    fdr_by_team_for_gw,
    first_kickoff_by_gw,
    load_fixtures,
    load_merged_gw,
    load_status_snapshots,
    load_teams,
    snapshot_before,
    spearman,
)

OUTFIELD_POS = (2, 3, 4)  # DEF, MID, FWD — mirrors CaptaincyCard's GK exclusion
MIN_GW_FOR_EVAL = 2  # need at least one prior GW of trailing data


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    _fpl_archive.configure("Backtest captaincy scoring and start probability.")
    season = _fpl_archive.SEASON
    print(
        f"Backtesting captaincy scoring + start-probability against {season} season data...\n"
    )

    fixtures_by_event = load_fixtures()
    merged_gw = load_merged_gw()
    teams_by_name = load_teams()
    snapshots = load_status_snapshots()
    kickoffs = first_kickoff_by_gw()

    print(
        f"Loaded {len(fixtures_by_event)} gameweeks of fixtures, results for "
        f"GW1-{max(merged_gw)} ({sum(len(v) for v in merged_gw.values())} player-GW rows), "
        f"{len(snapshots)} status/news snapshots.\n"
    )

    max_gw = max(merged_gw.keys())

    # Running cumulative state as we walk the season chronologically.
    cum_minutes: Dict[int, int] = defaultdict(int)
    cum_ict: Dict[int, float] = defaultdict(float)
    recent_points: Dict[int, List[int]] = defaultdict(list)  # last 4 GWs, for "form"
    latest_position: Dict[int, int] = {}
    latest_team_id: Dict[int, int] = {}
    season_total_points: Dict[int, int] = defaultdict(int)

    captaincy_rows = []
    pooled_scores: List[float] = []
    pooled_actuals: List[float] = []
    per_gw_spearman: List[float] = []

    brier_terms: List[float] = []
    start_pred_for_starters: List[float] = []
    start_pred_for_nonstarters: List[float] = []

    for gw in range(1, max_gw + 1):
        gw_rows = merged_gw.get(gw, {})
        fdr = fdr_by_team_for_gw(fixtures_by_event, gw)
        deadline_proxy = kickoffs.get(gw, "9999")
        snap = snapshot_before(snapshots, deadline_proxy)

        if gw >= MIN_GW_FOR_EVAL:
            # ---- Build candidate pool from state as-of end of gw-1 ----
            def form_of(el: int) -> float:
                pts = recent_points.get(el, [])
                return sum(pts) / len(pts) if pts else 0.0

            candidates_by_pos: Dict[int, List[dict]] = defaultdict(list)
            for el, pos in latest_position.items():
                if pos not in OUTFIELD_POS:
                    continue
                if cum_minutes.get(el, 0) <= 0:
                    continue
                team_id = latest_team_id.get(el)
                if not fdr.get(team_id):
                    continue
                candidates_by_pos[pos].append(
                    {
                        "id": el,
                        "element_type": pos,
                        "team": team_id,
                        "ep_next": 0,  # not reconstructable — forces form+ICT fallback
                        "form": form_of(el),
                        "ict_index": cum_ict.get(el, 0.0),
                    }
                )

            all_scored = []
            for pos, cands in candidates_by_pos.items():
                if len(cands) < 3:
                    continue
                for c in cands:
                    score = FPLService._score_player(c, fdr, cands, max(1, gw - 1))
                    all_scored.append((c["id"], score))

            # ---- Start-probability check for every player active this season ----
            for el, pos in latest_position.items():
                if cum_minutes.get(el, 0) <= 0:
                    continue
                team_id = latest_team_id.get(el)
                if not fdr.get(team_id):
                    continue  # blank GW for this team — not what the heuristic predicts
                snap_p = snap.get(
                    el,
                    {"status": "a", "news": "", "chance_of_playing_next_round": None},
                )
                player = {
                    "status": snap_p["status"],
                    "news": snap_p["news"],
                    "chance_of_playing_next_round": snap_p[
                        "chance_of_playing_next_round"
                    ],
                    "minutes": cum_minutes.get(el, 0),
                }
                pred = FPLService.start_prob_from(player, played_gws=max(1, gw - 1))
                actual_minutes = gw_rows.get(el, {}).get("minutes", 0)
                actual_started = 1.0 if actual_minutes >= 60 else 0.0
                brier_terms.append((pred - actual_started) ** 2)
                if actual_started:
                    start_pred_for_starters.append(pred)
                else:
                    start_pred_for_nonstarters.append(pred)

            if all_scored:
                all_scored.sort(key=lambda x: x[1], reverse=True)
                top3 = all_scored[:3]
                top1_id, top1_score = top3[0]
                top1_actual = gw_rows.get(top1_id, {}).get("total_points", 0)

                field_actuals = [
                    gw_rows.get(el, {}).get("total_points", 0) for el, _ in all_scored
                ]
                field_avg = statistics.mean(field_actuals)
                field_max = max(field_actuals)

                # naive baseline: captain whoever has the most cumulative
                # points so far this season, among the same eligible pool
                baseline_id = max(
                    (el for el, _ in all_scored),
                    key=lambda el: season_total_points.get(el, 0),
                )
                baseline_actual = gw_rows.get(baseline_id, {}).get("total_points", 0)

                captaincy_rows.append(
                    {
                        "gw": gw,
                        "top1_actual": top1_actual,
                        "top3_avg_actual": statistics.mean(
                            gw_rows.get(el, {}).get("total_points", 0) for el, _ in top3
                        ),
                        "field_avg": field_avg,
                        "field_max": field_max,
                        "baseline_actual": baseline_actual,
                        "beat_field_avg": top1_actual >= field_avg,
                    }
                )
                gw_scores = []
                gw_actuals = []
                for el, score in all_scored:
                    actual = gw_rows.get(el, {}).get("total_points", 0)
                    pooled_scores.append(score)
                    pooled_actuals.append(actual)
                    gw_scores.append(score)
                    gw_actuals.append(actual)
                gw_rho = spearman(gw_scores, gw_actuals)
                if gw_rho is not None:
                    per_gw_spearman.append(gw_rho)

        # ---- advance cumulative state with this GW's real results ----
        for el, row in gw_rows.items():
            cum_minutes[el] += row["minutes"]
            cum_ict[el] += row["ict_index"]
            season_total_points[el] += row["total_points"]
            recent_points[el].append(row["total_points"])
            recent_points[el] = recent_points[el][-4:]
            if row["position"]:
                latest_position[el] = row["position"]
            team_id = teams_by_name.get(row["team_name"])
            if team_id:
                latest_team_id[el] = team_id

    # ---------------- Report ----------------
    print("=" * 72)
    print("CAPTAINCY / TRANSFER-SUGGESTION SCORING BACKTEST")
    print(f"(scoring FPLService._score_player against {season} realized points)")
    print("=" * 72)
    n = len(captaincy_rows)
    if n == 0:
        print("No evaluable gameweeks.")
    else:
        avg_top1 = statistics.mean(r["top1_actual"] for r in captaincy_rows)
        avg_top3 = statistics.mean(r["top3_avg_actual"] for r in captaincy_rows)
        avg_field = statistics.mean(r["field_avg"] for r in captaincy_rows)
        avg_max = statistics.mean(r["field_max"] for r in captaincy_rows)
        avg_baseline = statistics.mean(r["baseline_actual"] for r in captaincy_rows)
        hit_rate = statistics.mean(
            1 if r["beat_field_avg"] else 0 for r in captaincy_rows
        )
        rho = spearman(pooled_scores, pooled_actuals)
        mean_gw_rho = statistics.mean(per_gw_spearman) if per_gw_spearman else None

        print(f"Gameweeks evaluated: {n} (GW{MIN_GW_FOR_EVAL}-{max_gw})")
        print("HEADLINE (form+ICT fallback path ONLY — ep_next forced to 0, see")
        print("caveats): #1 pick vs. naive baseline ('captain your highest")
        print(
            f"cumulative scorer'): {avg_top1:.2f} vs {avg_baseline:.2f} pts/GW "
            f"({avg_top1 - avg_baseline:+.2f}) — a tie, not a win. The"
        )
        print("ep_next-primary path production mostly uses, and the actual")
        print("shipped CaptaincyCard.tsx implementation, are NOT what this tests.")
        print("(field average/max below are context, not the real bar — most")
        print(" of the field is fringe players who were never live captaincy")
        print(" candidates; the naive baseline above is the fair comparison)")
        print(f"  #1 pick (heuristic's top captain choice):     {avg_top1:.2f}")
        print(f"  top-3 average:                                {avg_top3:.2f}")
        print(f"  naive baseline (most cumulative points):      {avg_baseline:.2f}")
        print(f"  field average (all eligible candidates):      {avg_field:.2f}")
        print(f"  best possible pick that GW:                   {avg_max:.2f}")
        print(f"#1 pick beat field average in {hit_rate * 100:.0f}% of gameweeks")
        print(
            f"Pooled Spearman correlation (score vs. actual points, all GWs "
            f"pooled): {rho:.3f}"
            if rho is not None
            else "Pooled Spearman correlation: n/a"
        )
        print(
            f"Mean per-GW Spearman correlation (within-GW ranking quality, "
            f"the more relevant number for a captaincy pick): "
            f"{mean_gw_rho:.3f}"
            if mean_gw_rho is not None
            else "Mean per-GW Spearman: n/a"
        )

    print()
    print("=" * 72)
    print("START-PROBABILITY HEURISTIC BACKTEST")
    print("(FPLService.start_prob_from vs. actual minutes >= 60)")
    print("=" * 72)
    if brier_terms:
        brier = statistics.mean(brier_terms)
        n_start = len(start_pred_for_starters)
        n_nonstart = len(start_pred_for_nonstarters)
        p_start = n_start / (n_start + n_nonstart) if (n_start + n_nonstart) else 0
        baseline_brier = p_start * (1 - p_start)
        print(f"Samples: {len(brier_terms)}")
        print(
            f"Base rate: {p_start * 100:.1f}% of eligible player-GWs actually started"
        )
        print(
            f"Brier score — heuristic: {brier:.4f}   "
            f"vs. constant-{p_start:.2f}-baseline: {baseline_brier:.4f}   "
            f"(heuristic {'beats' if brier < baseline_brier else 'does NOT beat'} "
            f"just guessing the base rate every time)"
        )
        if start_pred_for_starters:
            print(
                f"Avg predicted prob for players who DID start:     "
                f"{statistics.mean(start_pred_for_starters):.3f}"
            )
        if start_pred_for_nonstarters:
            print(
                f"Avg predicted prob for players who did NOT start:  "
                f"{statistics.mean(start_pred_for_nonstarters):.3f}"
            )
        print(
            "(discrimination = gap between the two lines above; a nonzero gap "
            "can still lose to the baseline above if it's not well-calibrated)"
        )
    else:
        print("No evaluable samples.")

    print()
    print("=" * 72)
    print("CAVEATS")
    print("=" * 72)
    print("- ep_next forced to 0 for every player (not reconstructable from")
    print("  archived actuals), so this only exercises the form+ICT fallback")
    print("  path of the scoring formula, not the ep_next-primary path a live")
    print("  season mostly uses.")
    print(
        f"- status/news/chance_of_playing_next_round come from only "
        f"{len(snapshots)} snapshots"
    )
    print("  across the season (sparse — gaps of months in the archive), so")
    print("  those inputs can be stale for individual gameweeks.")
    print("- 'form' is approximated as the mean of the last 4 GWs' points,")
    print("  not FPL's actual 30-day-window calculation.")
    print("- start_prob_from gets played_gws = GWs played so far, matching")
    print("  production since every caller passes the finished-GW count (it")
    print("  used to default to 1 in 3 of 4 callers, inflating start% once a")
    print("  player passed ~90 season minutes).")
    print("- Candidate pool per GW = outfield players (DEF/MID/FWD) with any")
    print("  minutes so far this season and a fixture that GW — not real XIs")
    print("  from real squads, since no historical squad data is used here.")
    print("- Start-prob's start-probability pool (GK+DEF+MID+FWD, same 'any")
    print("  minutes this season' filter) is roughly half fringe/rotation")
    print("  players, which is an easy population to separate on minutes")
    print("  ratio alone. Its edge over the base-rate baseline would likely")
    print("  shrink on a starters-only pool.")


if __name__ == "__main__":
    main()
