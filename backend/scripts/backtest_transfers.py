"""Simulate following the app's transfer-suggestion heuristic across a full
real season (default 2025/26), under real FPL constraints, and compare the
season total to following the same transfer engine driven by plain form.

This answers a different question than backtest.py: not "does the score
correlate with outcomes" but "if a manager mechanically followed what the
app would have suggested each week, budget/hits/club-limits and all, would
they have finished ahead of a manager doing the same with a trivial signal?"

Design (see the CAVEATS block printed at the end for the full list):
  - Three arms share an identical GW1 squad, drafted under real budget/quota
    constraints: (A) follows the app's transfer-suggestion logic scored by
    scoring.score_player (sell<->buy pairs that must beat the owned
    player they replace — the same rules FPLService.transfer_suggestions
    has shipped since 2026-10-19), (B) the
    identical transfer engine scored by plain form (mean of the last 4 GWs'
    points), (C) never transfers.
  - A vs B is the real test: same engine, same budget/hits/club rules, only
    the scoring signal differs. C is context only — randomly drafted squads
    left alone rot (no auto-subs, many non-players), so any transfer policy
    beats C by hundreds of points; an earlier version of this script led
    with A vs C and read as a big win when form actually did better.
  - All arms use an IDENTICAL, simple rule for starting-XI/captain choice
    (best expected-points formation + highest-EP non-GK captain) so lineup
    decisions cancel out of the deltas — only the transfer engine differs.
  - ep_next is sourced from the archive's `xP` column, shifted back one
    gameweek (last GW's xP used as this GW's ep_next), per the archive's own
    README warning that using it unshifted leaks post-match information.
    Unlike backtest.py's forced 0 this exercises the ep_next-primary path,
    but the archive's xP looks like it was recorded after the matches (it
    tracks the same GW's points far better than the next GW's — see
    tools/analysis/README.md), so it's a lagged one-GW signal rather than
    a true pre-deadline ep_next. See CAVEATS.
  - Run across several independently-drafted starting squads (not just one)
    and report mean +/- spread, since a single-squad, single-season result
    is n=1 and can flip on the luck of the draft alone.

Run from the backend/ directory:
`python scripts/backtest_transfers.py [--season 2024-25] [--refresh]`
Results swing by season: with the gentle FDR_FACTOR curve (2026-10-29)
app-minus-form was +49 on 2024-25 and +94 on 2025-26 (the old linear curve:
+77 and -173), so read any single season's number as noise until it agrees
with another.
"""

from __future__ import annotations

import random
import statistics
import sys
from collections import defaultdict
from pathlib import Path
from typing import Callable, Dict, List, Optional

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.services.scoring import score_player  # noqa: E402

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
)

BUDGET = 1000  # £100.0m in 0.1m units, matching FPL's now_cost convention
QUOTA = {1: 2, 2: 5, 3: 5, 4: 3}  # GK, DEF, MID, FWD
MAX_PER_CLUB = 3
FT_START = 1
FT_MAX_BANK = 5
HIT_COST = 4
HIT_EP_THRESHOLD = 4.0  # only take a hit if predicted EP gain exceeds the cost
N_SQUADS = 5
SEEDS = [1, 2, 3, 4, 5]

FORMATIONS = [
    (d, 10 - d - f, f) for d in range(3, 6) for f in range(1, 4) if 2 <= 10 - d - f <= 5
]

# (candidate, fdr_by_team, scoring_pool, played_gws) -> score; same shape as
# scoring.score_player so the arms only differ in this one function.
Scorer = Callable[[dict, dict, List[dict], int], float]


def form_scorer(cand: dict, fdr: dict, pool: List[dict], played_gws: int) -> float:
    return cand["form"]


def draft_squad(gw1_players: List[dict], seed: int) -> Optional[Dict[int, dict]]:
    """Greedy random draft respecting budget/quota/club-limit constraints.
    No lookahead — only GW1 price + position are used, exactly what a real
    manager has at draft time. Returns {element_id: {element_type, team,
    price}} or None if the random order couldn't complete a legal squad
    (rare; caller retries with a different seed).
    """
    rng = random.Random(seed)
    pool = [p for p in gw1_players]
    rng.shuffle(pool)

    squad: Dict[int, dict] = {}
    club_counts: Dict[int, int] = defaultdict(int)
    need = dict(QUOTA)
    spend = 0

    for pos in (1, 2, 3, 4):
        candidates = [p for p in pool if p["element_type"] == pos]
        filled = 0
        for p in candidates:
            if filled >= QUOTA[pos]:
                break
            if club_counts[p["team"]] >= MAX_PER_CLUB:
                continue
            # reserve minimum plausible spend (£4.0m/slot) for remaining slots
            remaining_slots = sum(need.values()) - 1
            if spend + p["price"] + remaining_slots * 40 > BUDGET:
                continue
            squad[p["id"]] = p
            club_counts[p["team"]] += 1
            spend += p["price"]
            need[pos] -= 1
            filled += 1
        if filled < QUOTA[pos]:
            return None
    return squad


def sell_price(purchase_price: int, current_value: int) -> int:
    if current_value >= purchase_price:
        return purchase_price + (current_value - purchase_price) // 2
    return current_value


def predicted_ep(
    el: int, gw: int, merged_gw: dict, recent_points: Dict[int, List[int]]
) -> float:
    """Simple, identical-across-both-arms points estimate for lineup/captain
    choice: last GW's xP (shifted, so no lookahead) if available, else mean
    of the last 4 GWs' actual points."""
    prev_row = merged_gw.get(gw - 1, {}).get(el)
    if prev_row and prev_row.get("xp") is not None:
        return prev_row["xp"]
    pts = recent_points.get(el, [])
    return sum(pts) / len(pts) if pts else 0.0


def pick_best_xi(
    squad_ids: List[int],
    positions: Dict[int, int],
    ep: Dict[int, float],
) -> tuple:
    by_pos: Dict[int, List[int]] = defaultdict(list)
    for el in squad_ids:
        by_pos[positions[el]].append(el)
    for pos in by_pos:
        by_pos[pos].sort(key=lambda e: ep.get(e, 0.0), reverse=True)

    gk = by_pos[1][0] if by_pos[1] else None
    best_total = -1.0
    best_xi: List[int] = []
    for d, m, f in FORMATIONS:
        if len(by_pos[2]) < d or len(by_pos[3]) < m or len(by_pos[4]) < f:
            continue
        xi = by_pos[2][:d] + by_pos[3][:m] + by_pos[4][:f]
        total = sum(ep.get(e, 0.0) for e in xi)
        if total > best_total:
            best_total = total
            best_xi = xi
    xi = ([gk] if gk else []) + best_xi
    captain = max(best_xi, key=lambda e: ep.get(e, 0.0)) if best_xi else None
    return xi, captain


def gw_points(xi: List[int], captain: Optional[int], gw: int, merged_gw: dict) -> int:
    gw_rows = merged_gw.get(gw, {})
    total = 0
    for el in xi:
        pts = gw_rows.get(el, {}).get("total_points", 0)
        if el == captain:
            pts *= 2
        total += pts
    return total


def eligible_pool(
    latest_position: Dict[int, int],
    cum_minutes: Dict[int, int],
    latest_team_id: Dict[int, int],
    latest_value: Dict[int, int],
    fdr: dict,
    snap: dict,
) -> List[dict]:
    pool = []
    for el, pos in latest_position.items():
        if pos not in (1, 2, 3, 4):
            continue
        if cum_minutes.get(el, 0) <= 0:
            continue
        team_id = latest_team_id.get(el)
        if not fdr.get(team_id):
            continue
        status = snap.get(el, {}).get("status", "a")
        if status == "u":
            continue
        pool.append(
            {
                "id": el,
                "element_type": pos,
                "team": team_id,
                "price": latest_value.get(el, 0),
            }
        )
    return pool


def run_transfer_policy(
    squad: Dict[int, dict],
    max_gw: int,
    merged_gw: dict,
    fixtures_by_event: dict,
    latest_position: Dict[int, int],
    latest_team_id: Dict[int, int],
    latest_value: Dict[int, int],
    cum_minutes: Dict[int, int],
    cum_ict: Dict[int, float],
    recent_points: Dict[int, List[int]],
    snapshots,
    kickoffs,
    scorer: Optional[Scorer],
) -> dict:
    """Walk the season week by week, applying the fixed transfer-suggestion
    logic ranked by `scorer` (None = never transfer), and return season
    totals."""

    # Copy each player dict too: prices are updated in place below, and the
    # squad's dicts are shared with gw1_players — a shallow copy leaked one
    # arm's end-of-season prices into the next arm and into later drafts.
    owned = {
        el: dict(p) for el, p in squad.items()
    }  # el -> {element_type, team, price}
    purchase_price = {el: p["price"] for el, p in squad.items()}
    bank = BUDGET - sum(purchase_price.values())
    free_transfers = FT_START
    total_points = 0
    total_hits = 0
    transfers_made = 0

    for gw in range(1, max_gw + 1):
        fdr = fdr_by_team_for_gw(fixtures_by_event, gw)
        deadline_proxy = kickoffs.get(gw, "9999")
        snap = snapshot_before(snapshots, deadline_proxy)

        if scorer is not None and gw >= 2:
            made_free = 0
            made_hit = False
            for _ in range(free_transfers + 1):  # up to all FTs, plus 1 possible hit
                if made_free >= free_transfers and made_hit:
                    break

                pool = eligible_pool(
                    latest_position,
                    cum_minutes,
                    latest_team_id,
                    latest_value,
                    fdr,
                    snap,
                )
                by_pos: Dict[int, List[dict]] = defaultdict(list)
                for p in pool:
                    by_pos[p["element_type"]].append(p)

                best_swap = None  # (owned_el, candidate, score_gain, ep_gain)
                for owned_el, info in owned.items():
                    pos = info["element_type"]
                    same_pos_owned = [
                        {
                            "id": e,
                            "element_type": positions_of(owned, latest_position, e),
                            "team": owned[e]["team"],
                            "ep_next": predicted_ep(e, gw, merged_gw, recent_points),
                            "form": form_of(e, recent_points),
                            "ict_index": cum_ict.get(e, 0.0),
                        }
                        for e in owned
                        if owned[e]["element_type"] == pos
                    ]
                    candidates_dicts = [
                        {
                            "id": c["id"],
                            "element_type": pos,
                            "team": c["team"],
                            "ep_next": predicted_ep(
                                c["id"], gw, merged_gw, recent_points
                            ),
                            "form": form_of(c["id"], recent_points),
                            "ict_index": cum_ict.get(c["id"], 0.0),
                        }
                        for c in by_pos.get(pos, [])
                        if c["id"] not in owned
                    ]
                    scoring_pool = same_pos_owned + candidates_dicts
                    if len(scoring_pool) < 3:
                        continue

                    owned_dict = next(
                        (p for p in scoring_pool if p["id"] == owned_el), None
                    )
                    if owned_dict is None:
                        continue
                    owned_score = scorer(owned_dict, fdr, scoring_pool, gw - 1)

                    club_counts = defaultdict(int)
                    for e, i in owned.items():
                        club_counts[i["team"]] += 1
                    sell = sell_price(purchase_price[owned_el], info["price"])
                    budget_avail = bank + sell

                    for cand in candidates_dicts:
                        c_info = next(c for c in by_pos[pos] if c["id"] == cand["id"])
                        if c_info["price"] > budget_avail:
                            continue
                        projected_club = club_counts[c_info["team"]] + (
                            1 if c_info["team"] != info["team"] else 0
                        )
                        if (
                            c_info["team"] != info["team"]
                            and projected_club > MAX_PER_CLUB
                        ):
                            continue
                        cand_score = scorer(cand, fdr, scoring_pool, gw - 1)
                        if cand_score <= owned_score:
                            continue
                        score_gain = cand_score - owned_score
                        ep_gain = cand["ep_next"] - owned_dict["ep_next"]
                        if best_swap is None or score_gain > best_swap[2]:
                            best_swap = (owned_el, c_info, score_gain, ep_gain)

                if best_swap is None:
                    break

                owned_el, c_info, score_gain, ep_gain = best_swap
                will_hit = made_free >= free_transfers
                if will_hit:
                    if made_hit or ep_gain <= HIT_EP_THRESHOLD:
                        break
                    made_hit = True
                    total_hits += 1
                    total_points -= HIT_COST
                else:
                    made_free += 1

                sell = sell_price(purchase_price[owned_el], owned[owned_el]["price"])
                bank = bank + sell - c_info["price"]
                del owned[owned_el]
                del purchase_price[owned_el]
                owned[c_info["id"]] = {
                    "element_type": c_info["element_type"],
                    "team": c_info["team"],
                    "price": c_info["price"],
                }
                purchase_price[c_info["id"]] = c_info["price"]
                transfers_made += 1

            # Current FPL rule: +1 FT every week (capped at the bank), whether
            # or not this week's FTs were used.
            free_transfers = min(FT_MAX_BANK, max(0, free_transfers - made_free) + 1)

        # ---- lineup + score this GW ----
        ep = {el: predicted_ep(el, gw, merged_gw, recent_points) for el in owned}
        xi, captain = pick_best_xi(
            list(owned.keys()), {el: owned[el]["element_type"] for el in owned}, ep
        )
        total_points += gw_points(xi, captain, gw, merged_gw)

        # ---- advance cumulative state + squad market values with GW's real results ----
        gw_rows = merged_gw.get(gw, {})
        for el, row in gw_rows.items():
            cum_minutes[el] += row["minutes"]
            cum_ict[el] += row["ict_index"]
            recent_points[el].append(row["total_points"])
            recent_points[el] = recent_points[el][-4:]
            if row["position"]:
                latest_position[el] = row["position"]
            latest_value[el] = row["value"]
            team_id = _teams_cache.get(row["team_name"])
            if team_id:
                latest_team_id[el] = team_id
            if el in owned:
                owned[el]["price"] = row["value"]

    return {
        "total_points": total_points,
        "total_hits": total_hits,
        "transfers_made": transfers_made,
    }


def positions_of(owned, latest_position, el):
    return owned.get(el, {}).get("element_type", latest_position.get(el))


def form_of(el, recent_points):
    pts = recent_points.get(el, [])
    return sum(pts) / len(pts) if pts else 0.0


_teams_cache: Dict[str, int] = {}


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    _fpl_archive.configure("Simulate a season of following transfer suggestions.")
    print(
        f"Simulating {_fpl_archive.SEASON}: (fixed) transfer suggestions scored by the "
        "app's formula vs. by plain form vs. never transferring...\n"
    )

    fixtures_by_event = load_fixtures()
    merged_gw = load_merged_gw()
    teams_by_name = load_teams()
    global _teams_cache
    _teams_cache = teams_by_name
    snapshots = load_status_snapshots()
    kickoffs = first_kickoff_by_gw()

    max_gw = max(merged_gw.keys())
    gw1_rows = merged_gw[1]
    gw1_players = [
        {
            "id": el,
            "element_type": row["position"],
            "team": teams_by_name.get(row["team_name"]),
            "price": row["value"],
        }
        for el, row in gw1_rows.items()
        if row["position"] and teams_by_name.get(row["team_name"])
    ]

    print(f"Loaded {len(gw1_players)} draftable players at GW1 prices.\n")

    results = []
    drafted = 0
    for seed in SEEDS:
        squad = None
        for attempt_seed in range(seed * 1000, seed * 1000 + 20):
            squad = draft_squad(gw1_players, attempt_seed)
            if squad:
                break
        if not squad:
            print(f"Seed {seed}: could not draft a legal squad, skipping.")
            continue
        drafted += 1

        def fresh_state():
            return (
                defaultdict(int),  # cum_minutes
                defaultdict(float),  # cum_ict
                defaultdict(list),  # recent_points
                {p["id"]: p["element_type"] for p in gw1_players},  # latest_position
                {p["id"]: p["team"] for p in gw1_players},  # latest_team_id
                {p["id"]: p["price"] for p in gw1_players},  # latest_value
            )

        def simulate(scorer: Optional[Scorer]) -> dict:
            cm, ci, rp, lp, lt, lv = fresh_state()
            return run_transfer_policy(
                dict(squad),
                max_gw,
                merged_gw,
                fixtures_by_event,
                lp,
                lt,
                lv,
                cm,
                ci,
                rp,
                snapshots,
                kickoffs,
                scorer=scorer,
            )

        app = simulate(score_player)
        form = simulate(form_scorer)
        none = simulate(None)
        results.append({"seed": seed, "app": app, "form": form, "none": none})
        print(
            f"Squad {drafted} (seed {seed}): app={app['total_points']}  "
            f"form={form['total_points']}  "
            f"app-form={app['total_points'] - form['total_points']:+d}  "
            f"(never-transfer={none['total_points']})  "
            f"transfers app/form={app['transfers_made']}/{form['transfers_made']}  "
            f"hits app/form={app['total_hits']}/{form['total_hits']}"
        )

    print()
    print("=" * 72)
    print("SEASON SIMULATION RESULT")
    print("=" * 72)
    if not results:
        print("No squads could be drafted.")
        return

    def mean_of(arm: str, key: str = "total_points") -> float:
        return statistics.mean(r[arm][key] for r in results)

    deltas = [r["app"]["total_points"] - r["form"]["total_points"] for r in results]
    spread = statistics.stdev(deltas) if len(deltas) > 1 else 0.0

    print(f"Squads simulated: {len(results)}")
    print("HEADLINE — same transfer engine, only the scoring signal differs:")
    print(
        f"  app formula: {mean_of('app'):.1f} pts/season   plain form: "
        f"{mean_of('form'):.1f} pts/season   "
        f"app - form: {statistics.mean(deltas):+.1f} (stdev {spread:.1f})"
    )
    print(
        f"  app formula beat plain form in {sum(1 for d in deltas if d > 0)}/"
        f"{len(deltas)} squads"
    )
    print(
        f"  transfers/season app {mean_of('app', 'transfers_made'):.1f} "
        f"(hits {mean_of('app', 'total_hits'):.1f}), form "
        f"{mean_of('form', 'transfers_made'):.1f} (hits {mean_of('form', 'total_hits'):.1f})"
    )
    print(
        f"Context only: never transferring scored {mean_of('none'):.1f} pts/season — "
        "random squads left alone rot, so beating this says nothing about the formula."
    )

    print()
    print("=" * 72)
    print("CAVEATS")
    print("=" * 72)
    print("- Tests the shipped transfer-suggestion logic: a sell<->buy pair")
    print("  must beat the owned player it replaces.")
    print("- ep_next is last GW's archived xP, shifted back one gameweek per")
    print("  the archive's own README warning against using it unshifted.")
    print("  The archive's xP appears to be recorded post-match, so this is a")
    print("  lagged one-GW signal, not a true pre-deadline ep_next — the app")
    print("  arm may be handicapped by its input as much as by its formula.")
    print("- form = mean of the last 4 GWs' points, not FPL's 30-day window.")
    print("- Starting XI and captain use an identical, simple EP-based rule")
    print("  in both arms, deliberately not the CaptaincyCard formula, so")
    print("  lineup decisions cancel out of the delta between arms.")
    print("- No auto-subs modeled: an XI player who scores 0 (injury, non-")
    print("  selection) just scores 0, bench players never come on. Equally")
    print("  pessimistic in both arms, so it shouldn't bias the delta.")
    print("- No vice-captain fallback modeled.")
    print("- Squads are drafted via random-greedy quota-filling at GW1 prices")
    print("  only (no lookahead) — not real managers' actual squads.")
    print("- Transfer candidate pool = players with any minutes so far this")
    print("  season and a fixture that GW, mirroring backtest.py's pool.")
    print("- At most 1 hit-taking transfer per gameweek, only if predicted EP")
    print("  gain exceeds the 4-point hit cost — a simplification of real")
    print("  manager hit-taking judgement, not a tuned threshold.")


if __name__ == "__main__":
    main()
