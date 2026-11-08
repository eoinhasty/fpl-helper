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
`--projections FILE` (from tools/analysis/export_walkforward.py) adds arms
fed the points model's walk-forward projections: as ep_next through the app's
formula, on their own, and summed over the next 3 or 5 GWs; `--solver` adds
tools/analysis/solver.py's MILP re-planning 5 GWs each GW (run with
tools/analysis/.venv's Python, which has scipy). `--squads N` (default 5),
`--no-hits` (no arm takes hits), `--lineup` (how every arm picks its XI and
captain), `--first-seed` and `--workers` (arms run in a process pool; use 4 on
a 16 GB laptop — 8 ran it out of memory).
Results, 20 squads, solver arm vs the app arm, pts/season (2024-25 / 2025-26),
with model projections scaled by chance of playing (2026-11-01):
  --lineup model, hits:            +218 / +147  (beat app in 20/20, 19/20)
  --lineup model, no hits:         +181 / +66   (19/20, 15/20)
  --lineup model, no hits, seeds 21-40: +204 / +80 (20/20, 17/20)
  --lineup xp-avail, no hits:      +130 / -54   (it only wins with model XIs)
Picking every arm's XI and captain on the model instead of last-GW xP adds
+110 / +220 to every arm on its own (app 1918 -> 2029, 1624 -> 1847, no
hits). The greedy model arms never beat the app consistently. Earlier runs
without chance of playing, on the xp lineup, read as no clear win — both were
handicapping the model arms. Caveat: the archive's fixture list carries
postponed games' final GWs, so a multi-GW arm sees later-arranged doubles early.
`--captaincy` instead scores captain rules (CAPTAIN_RULES) on the app arm's
XIs. Armband pts/season vs CaptaincyCard's formula on last-GW xP, 20 squads,
(2024-25 / 2025-26), XIs on --lineup xp-avail; --lineup model in brackets:
  card formula on the model:        +12 / +19   (+18 / +2, won 9/20)
  same, no FDR/home terms:          +30 / +26   (+33 / +0)
  model x chance of playing alone:  +34 / +31   (+37 / +14)  won 19/20 every
                                    run but 2025-26 model XIs (16/20)
The bare projection wins every run; the card's FDR/home/position/start-prob
terms only dilute it (the model already prices fixtures). Gains are small
next to the lineup effect above, which is mostly XI choice, not the captain.
`--chips bb|tc` instead times one chip on the solver arm (CHIP_RULES; `--rules`
picks some). Chip pts/season (the chip's own actual points, both halves),
2025-26, 10 squads, --lineup model (2026-11-08):
  Bench Boost:    best 24.6 · peak 23.3 · dgw 22.5 · last 18.5 (ceiling 43.3)
  Triple Captain: best 13.0 · peak 13.6 · dgw 17.0 · last 15.0 (ceiling 30.0);
                  best_dgw 17.0, same weeks as dgw
Bench Boost totals vs no chip are noisy (stdev 36-68: the arms' transfers
diverge), so read the chip pts. A Triple Captain on "best" was spent as soon
as a window opened (GW2 / GW21) — within 5 GWs the top captain projects about
the same every week — and lost to the first double in 9/10 squads, so the
app's Triple Captain "best" is chips_best_dgw. Not yet run on 2024-25.
Results swing by season: with the gentle FDR_FACTOR curve (2026-10-29)
app-minus-form was +49 on 2024-25 and +94 on 2025-26 (the old linear curve:
+77 and -173), so read any single season's number as noise until it agrees
with another.
"""

from __future__ import annotations

import json
import multiprocessing
import os
import random
import statistics
import sys
from collections import defaultdict
from pathlib import Path
from typing import Callable, Dict, List, Optional

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.services.planner import ChipPlay  # noqa: E402
from app.services.scoring import fdr_factor, score_player, start_prob_from  # noqa: E402

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
N_SQUADS = 5  # default for --squads; seeds are 1..N

FORMATIONS = [
    (d, 10 - d - f, f) for d in range(3, 6) for f in range(1, 4) if 2 <= 10 - d - f <= 5
]

# (candidate, fdr_by_team, scoring_pool, played_gws) -> score; same shape as
# scoring.score_player so the arms only differ in this one function.
Scorer = Callable[[dict, dict, List[dict], int], float]


def form_scorer(cand: dict, fdr: dict, pool: List[dict], played_gws: int) -> float:
    return cand["form"]


# Multi-GW arms: rank on the projection summed over this many GWs
MODEL_WINDOWS = (3, 5)

# --solver arm: tools/analysis/solver.py's MILP re-plans the next
# SOLVER_WINDOW GWs every GW, over the current squad plus the best
# SOLVER_POOL_PER_POS players per position by projected points in that window.
SOLVER = "solver"
SOLVER_WINDOW = 5
SOLVER_POOL_PER_POS = 25
SOLVER_TIME_LIMIT = 30  # seconds per solve; a pruned pool usually takes ~1s
ANALYSIS_DIR = Path(__file__).resolve().parents[2] / "tools" / "analysis"

# --chips bb|tc: one chip on the solver arm, played once per half-season
# window by each rule below (2025-26's two-per-season rules, used for both
# seasons; GW1 is out of reach since the solver arm starts at GW2). The rule
# arms hand the solver their chosen week as a required play once it's in the
# horizon (the card's "GWx"), so transfers are planned around it either way.
CHIP_HALF = 19
CHIP_RULES = {
    "chips_best": "solver's pick in its 5-GW horizon (the card's Best week)",
    "chips_best_dgw": "solver's pick of the double GWs in sight, else the window's "
    "last GW (the card's Triple Captain Best week)",
    "chips_dgw": "first double gameweek in the window, else its last GW",
    "chips_last": "the window's last GW",
    "chips_peak": "this GW, once its projected value tops every later GW in sight",
}


def _milp():
    """tools/analysis/solver.py, imported only for the --solver arm: it needs
    scipy, so run the script with tools/analysis/.venv's Python for that."""
    if str(ANALYSIS_DIR) not in sys.path:
        sys.path.append(str(ANALYSIS_DIR))
    import solver

    return solver


def model_arms() -> List[tuple]:
    return (
        [("model", "model formula"), ("model_raw", "model raw")]
        + [(f"model_raw_{w}", f"model raw {w}gw") for w in MODEL_WINDOWS]
        + [("model_solver", f"model solver {SOLVER_WINDOW}gw")]
    )


def raw_ep_scorer(cand: dict, fdr: dict, pool: List[dict], played_gws: int) -> float:
    # The projection alone: no FDR/home/DGW terms (the model prices fixtures).
    # start_prob is left out too, but it's constant here anyway — the sim's
    # candidate dicts carry no status/news/minutes (see CAVEATS).
    return cand["ep_next"]


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


CARD_POS_MULT = {2: 0.72, 3: 0.92, 4: 1.0}  # CaptaincyCard's posMult


def card_captain(
    cands: List[dict], fixture_terms: bool = True, pos_term: bool = True
) -> Optional[int]:
    """CaptaincyCard.tsx's score() over XI outfield players: {id, pos, ep,
    form, ict, fixtures, sp}. fixture_terms/pos_term switch off the FDR + home
    and position multipliers, for an ep that already prices them."""
    if not cands:
        return None

    def norm(vals: List[float], v: float) -> float:
        mn, mx = min(vals), max(vals)
        return 0.5 if mx == mn else (v - mn) / (mx - mn)

    eps = [c["ep"] for c in cands]
    forms = [c["form"] for c in cands]
    icts = [c["ict"] for c in cands]
    has_ep = any(v > 0 for v in eps)

    def score(c: dict) -> float:
        fxs = c["fixtures"]
        base = (
            norm(eps, c["ep"])
            if has_ep
            else norm(forms, c["form"]) * 0.5 + norm(icts, c["ict"]) * 0.5
        )
        avg_fdr = sum(f["difficulty"] for f in fxs) / len(fxs) if fxs else 3
        home = sum(1 for f in fxs if f["home"]) / len(fxs) if fxs else 0
        s = base * c["sp"]
        if fixture_terms:
            s *= fdr_factor(avg_fdr) * (1 + home * 0.08)
        if pos_term:
            s *= CARD_POS_MULT[c["pos"]]
        s *= 1.8 if len(fxs) > 1 and not has_ep else 1.0
        return s * (0.1 if not fxs else 1.0)

    return max(cands, key=score)["id"]


# --captaincy: captain rules compared on the same XIs. Each gets the captain's
# actual points (the armband's extra copy) added up over the season.
CAPTAIN_RULES = {
    "card_xp": "card formula on last-GW xP (ships today)",
    "card_model": "card formula on the model",
    "card_model_nofix": "card formula on the model, no FDR/home terms",
    "card_model_bare": "card formula on the model, no FDR/home/position terms",
    "model_avail": "model x chance of playing (the sim's model lineup rule)",
    "oracle": "best outfield XI player in hindsight",
}


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
    projections: Optional[Dict[int, Dict[int, List[float]]]] = None,
    window: int = 1,
    lineup_projections: Optional[Dict[int, Dict[int, List[float]]]] = None,
    chip_rule: Optional[str] = None,
) -> dict:
    """Walk the season week by week, applying the fixed transfer-suggestion
    logic ranked by `scorer` (None = never transfer), and return season
    totals. `projections` ({gw: {element: [pts this GW, next GW, ...]}})
    replaces the scorer's ep_next with the sum of its first `window` GWs; the
    starting XI and captain still use predicted_ep in every arm. `chip_rule`
    (CHIP_RULES, solver arm only) plays the --chips chip.
    """

    def model_pts(el: int, gw: int) -> List[float]:
        # Projections assume the player is available; like solver.py live,
        # scale the first GW by FPL's chance of playing at that deadline
        # (`snap`, set each GW below). The app arm's archived xP is already 0
        # for injured players, so without this the model arms kept buying
        # and holding injured players.
        pts = list(projections.get(gw, {}).get(el, []))
        chance = snap.get(el, {}).get("chance_of_playing_next_round")
        if pts and chance is not None:
            pts[0] *= chance / 100
        return pts

    def lineup_ep(el: int, gw: int) -> float:
        """Points estimate for picking this GW's XI and captain (see --lineup)."""
        chance = snap.get(el, {}).get("chance_of_playing_next_round")
        avail = 1.0 if chance is None else chance / 100
        on_model = _lineup == "model" or (_lineup == "own" and projections is not None)
        if on_model and lineup_projections is not None:
            pts = lineup_projections.get(gw, {}).get(el, [])
            return pts[0] * avail if pts else 0.0
        ep = predicted_ep(el, gw, merged_gw, recent_points)
        return ep * avail if _lineup == "xp-avail" else ep

    def chip_projection(g: int, gw: int) -> float:
        """The squad's projected chip value in GW g, as seen from GW gw."""
        ep = {el: (model_pts(el, gw) + [0.0] * SOLVER_WINDOW)[g - gw] for el in owned}
        xi, captain = pick_best_xi(
            list(owned), {el: owned[el]["element_type"] for el in owned}, ep
        )
        if _chip == "tc":
            return ep.get(captain, 0.0)
        return sum(p for el, p in ep.items() if el not in xi)

    def chip_gws_allowed(w: int, gw: int, gws: List[int]) -> List[int]:
        """GWs of this horizon where chip_rule may play window w's chip."""
        window = [g for g in chip_windows[w] if g >= gw]
        if not window:
            return []
        doubles = [
            g
            for g in window
            if any(
                len(fx) > 1 for fx in fdr_by_team_for_gw(fixtures_by_event, g).values()
            )
        ]
        if chip_rule == "chips_best":
            return [g for g in window if g in gws]
        if chip_rule == "chips_best_dgw":  # mirrors FPLService.transfer_plan
            return [g for g in doubles or window[-1:] if g in gws]
        if chip_rule == "chips_dgw":
            target = (doubles or window[-1:])[0]
        elif chip_rule == "chips_last":
            target = window[-1]
        else:  # chips_peak: decided week by week, so only ever this GW
            if window[0] != gw:
                return []
            value = {g: chip_projection(g, gw) for g in window if g in gws}
            if gw != window[-1] and value[gw] < max(value.values()):
                return []
            target = gw
        return [target] if target in gws else []

    def scoring_ep(el: int, gw: int) -> float:
        if projections is not None:
            return sum(model_pts(el, gw)[:window])
        return predicted_ep(el, gw, merged_gw, recent_points)

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
    captain_pts: Dict[str, int] = defaultdict(int)
    chip_windows = [range(2, CHIP_HALF + 1), range(CHIP_HALF + 1, max_gw + 1)]
    chips_left = set(range(len(chip_windows))) if chip_rule else set()
    chip_gws: List[int] = []
    chip_pts = 0
    chip_value: Dict[int, int] = {}  # GW -> what the chip would have scored

    for gw in range(1, max_gw + 1):
        active_chip = None
        fdr = fdr_by_team_for_gw(fixtures_by_event, gw)
        deadline_proxy = kickoffs.get(gw, "9999")
        snap = snapshot_before(snapshots, deadline_proxy)

        if scorer == SOLVER and gw >= 2:
            # Re-plan the next `window` GWs from the current squad with the
            # MILP, then make only this GW's moves (a rolling horizon).
            gws = list(range(gw, min(gw + window, max_gw + 1)))

            def window_pts(el: int) -> List[float]:
                return (model_pts(el, gw) + [0.0] * len(gws))[: len(gws)]

            # Not eligible_pool: a player blanking this GW can still be worth
            # planning around, so no fixture this GW is required here.
            cands = [
                el
                for el, pos in latest_position.items()
                if pos in (1, 2, 3, 4)
                and el not in owned
                and cum_minutes.get(el, 0) > 0
                and snap.get(el, {}).get("status", "a") != "u"
            ]
            pool = set(owned)
            for pos in (1, 2, 3, 4):
                ranked = sorted(
                    (el for el in cands if latest_position[el] == pos),
                    key=lambda el: sum(window_pts(el)),
                    reverse=True,
                )
                pool.update(ranked[:SOLVER_POOL_PER_POS])
            pool = sorted(pool)
            pos_of = {
                el: owned[el]["element_type"] if el in owned else latest_position[el]
                for el in pool
            }
            team_of = {
                el: owned[el]["team"] if el in owned else latest_team_id[el]
                for el in pool
            }
            sell = {
                el: sell_price(purchase_price[el], owned[el]["price"]) for el in owned
            }
            cost = {el: sell[el] if el in owned else latest_value[el] for el in pool}
            pts = {(el, g): p for el in pool for g, p in zip(gws, window_pts(el))}
            allowed = [chip_gws_allowed(w, gw, gws) for w in sorted(chips_left)]
            play = (
                ChipPlay(
                    [a for a in allowed if a],
                    required=chip_rule not in ("chips_best", "chips_best_dgw"),
                )
                if any(allowed)
                else None
            )
            chip_kw = {"bench_boost" if _chip == "bb" else "triple_captain": play}
            try:
                step = _milp().optimise(
                    pool,
                    pts,
                    cost,
                    bank + sum(sell.values()),
                    team_of,
                    pos_of,
                    list(owned),
                    free_transfers,
                    gws,
                    no_hits=not _allow_hits,
                    time_limit=SOLVER_TIME_LIMIT,
                    **chip_kw,
                )[0]
            except SystemExit:  # infeasible (e.g. a club over 3 after moves): hold
                step = {"out": [], "into": []}
            if step.get("chip"):
                active_chip = step["chip"]
                chip_gws.append(gw)
                chips_left -= {w for w in chips_left if gw in chip_windows[w]}
            for el in step["out"]:
                bank += sell[el]
                del owned[el]
                del purchase_price[el]
            for el in step["into"]:
                bank -= latest_value[el]
                owned[el] = {
                    "element_type": pos_of[el],
                    "team": team_of[el],
                    "price": latest_value[el],
                }
                purchase_price[el] = latest_value[el]
            made_free = min(len(step["into"]), free_transfers)
            hits = len(step["into"]) - made_free
            total_hits += hits
            total_points -= HIT_COST * hits
            transfers_made += len(step["into"])
            free_transfers = min(FT_MAX_BANK, max(0, free_transfers - made_free) + 1)

        elif scorer is not None and gw >= 2:
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
                            "ep_next": scoring_ep(e, gw),
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
                            "ep_next": scoring_ep(c["id"], gw),
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
                    if not _allow_hits or made_hit or ep_gain <= HIT_EP_THRESHOLD:
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
        ep = {el: lineup_ep(el, gw) for el in owned}
        xi, captain = pick_best_xi(
            list(owned.keys()), {el: owned[el]["element_type"] for el in owned}, ep
        )
        total_points += gw_points(xi, captain, gw, merged_gw)
        if scorer == SOLVER and _chip and gw >= 2:
            rows = merged_gw.get(gw, {})
            if _chip == "bb":
                value = sum(
                    rows.get(el, {}).get("total_points", 0)
                    for el in owned
                    if el not in xi
                )
            else:
                value = rows.get(captain, {}).get("total_points", 0)
            chip_value[gw] = value
            if active_chip:
                total_points += value
                chip_pts += value
        if _captaincy and gw >= 2:
            gw_rows = merged_gw.get(gw, {})
            outfield = [el for el in xi if owned[el]["element_type"] != 1]

            def cand(el: int, ep_val: float) -> dict:
                s = snap.get(el, {})
                player = {
                    "status": s.get("status", "a"),
                    "news": s.get("news", ""),
                    "chance_of_playing_next_round": s.get(
                        "chance_of_playing_next_round"
                    ),
                    "minutes": cum_minutes.get(el, 0),
                }
                return {
                    "id": el,
                    "pos": owned[el]["element_type"],
                    "ep": ep_val,
                    "form": form_of(el, recent_points),
                    "ict": cum_ict.get(el, 0.0),
                    "fixtures": fdr.get(owned[el]["team"], []),
                    "sp": start_prob_from(player, gw - 1),
                }

            def model_next(el: int) -> float:
                pts = lineup_projections.get(gw, {}).get(el, [])
                return pts[0] if pts else 0.0

            xp = [
                cand(el, predicted_ep(el, gw, merged_gw, recent_points))
                for el in outfield
            ]
            mdl = [cand(el, model_next(el)) for el in outfield]
            picks = {
                "card_xp": card_captain(xp),
                "card_model": card_captain(mdl),
                "card_model_nofix": card_captain(mdl, fixture_terms=False),
                "card_model_bare": card_captain(
                    mdl, fixture_terms=False, pos_term=False
                ),
                "model_avail": max(
                    outfield,
                    key=lambda el: (
                        model_next(el)
                        * (snap.get(el, {}).get("chance_of_playing_next_round") or 100)
                        / 100
                    ),
                    default=None,
                ),
                "oracle": max(
                    outfield,
                    key=lambda el: gw_rows.get(el, {}).get("total_points", 0),
                    default=None,
                ),
            }
            for rule, el in picks.items():
                captain_pts[rule] += gw_rows.get(el, {}).get("total_points", 0)

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
        "captain_pts": dict(captain_pts),
        "chip_gws": chip_gws,
        "chip_pts": chip_pts,
        "chip_value": chip_value,
    }


def positions_of(owned, latest_position, el):
    return owned.get(el, {}).get("element_type", latest_position.get(el))


def form_of(el, recent_points):
    pts = recent_points.get(el, [])
    return sum(pts) / len(pts) if pts else 0.0


_teams_cache: Dict[str, int] = {}
_allow_hits = True
# --lineup: how every arm picks its XI and captain each GW.
#   xp       last GW's archived xP (the app arm's own transfer signal), no
#            availability — fields players injured since that xP was taken
#   xp-avail the same, times FPL's chance of playing at the deadline
#   model    the points model's projection times chance of playing, every arm
#   own      model arms on the model, the rest on xp (favours the model arms)
LINEUPS = ("xp", "xp-avail", "model", "own")
_lineup = "xp"
_captaincy = False
_chip: Optional[str] = None  # --chips: "bb" or "tc"

# Every arm, by name: (scorer, fed the model's projections?, GW window).
# Each (squad, arm) run is independent, so main() farms them out to a pool.
ARMS = {
    "app": (score_player, False, 1),
    "form": (form_scorer, False, 1),
    "none": (None, False, 1),
}
MODEL_ARMS = {
    "model": (score_player, True, 1),
    "model_raw": (raw_ep_scorer, True, 1),
    **{f"model_raw_{w}": (raw_ep_scorer, True, w) for w in MODEL_WINDOWS},
    "model_solver": (SOLVER, True, SOLVER_WINDOW),
    **{rule: (SOLVER, True, SOLVER_WINDOW) for rule in CHIP_RULES},
}

# Season data, loaded once per process by _init_world (main and each worker)
_world: dict = {}


def _init_world(
    season: str,
    refresh: bool,
    projections_path: Optional[str],
    allow_hits: bool,
    lineup: str = "xp",
    captaincy: bool = False,
    chip: Optional[str] = None,
) -> None:
    global _teams_cache, _allow_hits, _lineup, _captaincy, _chip
    _lineup = lineup
    _captaincy = captaincy
    _chip = chip
    _fpl_archive.SEASON, _fpl_archive.REFRESH = season, refresh
    _allow_hits = allow_hits
    merged_gw = load_merged_gw()
    _teams_cache = load_teams()
    projections = None
    if projections_path:
        with open(projections_path) as f:
            projections = {
                int(gw): {int(el): pts for el, pts in by_el.items()}
                for gw, by_el in json.load(f).items()
            }
    _world.update(
        merged_gw=merged_gw,
        fixtures_by_event=load_fixtures(),
        snapshots=load_status_snapshots(),
        kickoffs=first_kickoff_by_gw(),
        projections=projections,
        gw1_players=[
            {
                "id": el,
                "element_type": row["position"],
                "team": _teams_cache.get(row["team_name"]),
                "price": row["value"],
            }
            for el, row in merged_gw[1].items()
            if row["position"] and _teams_cache.get(row["team_name"])
        ],
    )


def _simulate(task: tuple) -> tuple:
    seed, squad, arm = task
    scorer, uses_projections, window = {**ARMS, **MODEL_ARMS}[arm]
    w = _world
    gw1 = w["gw1_players"]
    result = run_transfer_policy(
        dict(squad),
        max(w["merged_gw"].keys()),
        w["merged_gw"],
        w["fixtures_by_event"],
        {p["id"]: p["element_type"] for p in gw1},  # latest_position
        {p["id"]: p["team"] for p in gw1},  # latest_team_id
        {p["id"]: p["price"] for p in gw1},  # latest_value
        defaultdict(int),  # cum_minutes
        defaultdict(float),  # cum_ict
        defaultdict(list),  # recent_points
        w["snapshots"],
        w["kickoffs"],
        scorer=scorer,
        projections=w["projections"] if uses_projections else None,
        lineup_projections=w["projections"],
        window=window,
        chip_rule=arm if arm in CHIP_RULES else None,
    )
    return seed, arm, result


def report_captaincy(per_squad: List[Dict[str, int]]) -> None:
    print("=" * 72)
    print(
        f"CAPTAINCY — armband points/season over GW2+, the app arm's XIs, "
        f"--lineup {_lineup}"
    )
    print("=" * 72)
    base = "card_xp"
    for rule, label in CAPTAIN_RULES.items():
        vals = [s.get(rule, 0) for s in per_squad]
        line = f"  {rule:<17} {statistics.mean(vals):6.1f}"
        if rule != base:
            d = [s.get(rule, 0) - s.get(base, 0) for s in per_squad]
            sd = statistics.stdev(d) if len(d) > 1 else 0.0
            line += (
                f"   vs {base} {statistics.mean(d):+6.1f} (stdev {sd:.1f}, "
                f"won {sum(1 for x in d if x > 0)}/{len(d)})"
            )
        print(f"{line}   {label}")


def report_chips(results: List[dict], max_gw: int) -> None:
    name = {"bb": "Bench Boost", "tc": "Triple Captain"}[_chip]
    print("=" * 72)
    print(f"CHIPS — {name} on the solver arm, one per half season, --lineup {_lineup}")
    print("=" * 72)
    base = [r["model_solver"]["total_points"] for r in results]
    print(f"  no chip      {statistics.mean(base):7.1f} pts/season")
    rules = {rule: label for rule, label in CHIP_RULES.items() if rule in results[0]}
    for rule, label in rules.items():
        d = [r[rule]["total_points"] - b for r, b in zip(results, base)]
        sd = statistics.stdev(d) if len(d) > 1 else 0.0
        played = [g for r in results for g in r[rule]["chip_gws"]]
        first = [g for g in played if g <= CHIP_HALF]
        print(
            f"  {rule:<12} {statistics.mean(d):+7.1f} vs no chip (stdev {sd:.1f})   "
            f"chip {statistics.mean(r[rule]['chip_pts'] for r in results):5.1f} pts   "
            f"played {len(played)}/{2 * len(results)}, median GW "
            f"{_median(first)} / {_median([g for g in played if g > CHIP_HALF])}"
            f"   {label}"
        )
    for rule in rules if len(rules) > 1 else ():
        won = sum(
            r[rule]["total_points"]
            > max(r[o]["total_points"] for o in rules if o != rule)
            for r in results
        )
        print(f"  {rule:<12} best rule outright in {won}/{len(results)} squads")
    # Hindsight: the chip in each window's best week, on the no-chip squads
    windows = [range(2, CHIP_HALF + 1), range(CHIP_HALF + 1, max_gw + 1)]
    oracle = [
        sum(
            max((r["model_solver"]["chip_value"].get(g, 0) for g in w), default=0)
            for w in windows
        )
        for r in results
    ]
    print(
        f"  hindsight best week on the no-chip squads: {statistics.mean(oracle):.1f} "
        "chip pts (a ceiling for the rules' chip pts)"
    )


def _median(gws: List[int]) -> str:
    return f"{statistics.median(gws):.0f}" if gws else "-"


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    def add_args(p):
        p.add_argument(
            "--projections",
            help="walk-forward model predictions for this season "
            "(tools/analysis/export_walkforward.py); adds model-driven arms",
        )
        p.add_argument("--squads", type=int, default=N_SQUADS)
        p.add_argument(
            "--no-hits",
            action="store_true",
            help="no arm takes hits, so hit-taking can't drive the deltas",
        )
        p.add_argument(
            "--solver",
            action="store_true",
            help="add the MILP planner arm (needs --projections and scipy)",
        )
        p.add_argument(
            "--only-model",
            action="store_true",
            help="skip the model arms other than those asked for (e.g. just --solver)",
        )
        p.add_argument(
            "--lineup",
            choices=LINEUPS,
            default="xp",
            help="how every arm picks its XI and captain (see LINEUPS); 'model' "
            "needs --projections",
        )
        p.add_argument(
            "--first-seed",
            type=int,
            default=1,
            help="draft seeds run from here (e.g. 21 for a fresh set of squads)",
        )
        p.add_argument("--workers", type=int, default=os.cpu_count())
        p.add_argument(
            "--captaincy",
            action="store_true",
            help="compare captain rules (CAPTAIN_RULES) on the app arm's XIs "
            "instead of transfer arms; needs --projections",
        )
        p.add_argument(
            "--chips",
            choices=("bb", "tc"),
            help="compare when to play Bench Boost or Triple Captain (CHIP_RULES) "
            "on the solver arm instead of the usual arms; needs --projections",
        )
        p.add_argument(
            "--rules",
            nargs="+",
            choices=CHIP_RULES,
            help="with --chips, only these rules (default all)",
        )

    args = _fpl_archive.configure(
        "Simulate a season of following transfer suggestions.", add_args
    )
    world_args = (
        _fpl_archive.SEASON,
        _fpl_archive.REFRESH,
        args.projections,
        not args.no_hits,
        args.lineup,
        args.captaincy,
        args.chips,
    )
    print(
        f"Simulating {_fpl_archive.SEASON}: (fixed) transfer suggestions scored by the "
        "app's formula vs. by plain form vs. never transferring"
        f"{' (no hits)' if args.no_hits else ''}...\n"
    )
    _init_world(*world_args)  # also downloads and caches the archive for the workers
    gw1_players = _world["gw1_players"]
    print(f"Loaded {len(gw1_players)} draftable players at GW1 prices.\n")

    squads = {}
    for seed in range(args.first_seed, args.first_seed + args.squads):
        for attempt_seed in range(seed * 1000, seed * 1000 + 20):
            squad = draft_squad(gw1_players, attempt_seed)
            if squad:
                squads[seed] = squad
                break
        else:
            print(f"Seed {seed}: could not draft a legal squad, skipping.")

    arms = list(ARMS)
    if args.captaincy:
        arms = ["app"]
    elif args.chips:
        arms = ["model_solver", *(args.rules or CHIP_RULES)]
    elif args.projections:
        arms += (
            [] if args.only_model else [a for a in MODEL_ARMS if a != "model_solver"]
        )
        arms += ["model_solver"] if args.solver else []
    tasks = [(seed, squad, arm) for seed, squad in squads.items() for arm in arms]
    by_seed: Dict[int, dict] = defaultdict(dict)
    with multiprocessing.Pool(
        args.workers, initializer=_init_world, initargs=world_args
    ) as pool:
        for i, (seed, arm, res) in enumerate(pool.imap_unordered(_simulate, tasks)):
            by_seed[seed][arm] = res
            print(f"\r  {i + 1}/{len(tasks)} runs", end="", flush=True)
    print("\n")

    if args.captaincy:
        report_captaincy([by_seed[s]["app"]["captain_pts"] for s in sorted(by_seed)])
        return
    if args.chips:
        report_chips(
            [by_seed[s] for s in sorted(by_seed)], max(_world["merged_gw"].keys())
        )
        return

    results = []
    for n, seed in enumerate(sorted(by_seed), 1):
        r = {"seed": seed, **by_seed[seed]}
        results.append(r)
        app, form, none = r["app"], r["form"], r["none"]
        print(
            f"Squad {n} (seed {seed}): app={app['total_points']}  "
            f"form={form['total_points']}  "
            f"app-form={app['total_points'] - form['total_points']:+d}  "
            f"(never-transfer={none['total_points']})  "
            f"transfers app/form={app['transfers_made']}/{form['transfers_made']}  "
            f"hits app/form={app['total_hits']}/{form['total_hits']}"
        )
        if args.projections:
            print(
                "    "
                + "  ".join(
                    f"{label}={r[arm]['total_points']} "
                    f"(transfers {r[arm]['transfers_made']}, "
                    f"hits {r[arm]['total_hits']})"
                    for arm, label in model_arms()
                    if arm in r
                )
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
    if args.projections:
        print("MODEL — the same engine and formula fed the points model's")
        print("walk-forward projections as ep_next ('formula'), or ranking on the")
        print("projection alone ('raw'), over the next GW or the next N GWs ('Ngw');")
        print("an Ngw hit needs N-GW projected gain over the 4-point cost. 'solver'")
        print("re-plans the next GWs with tools/analysis/solver.py's MILP each GW:")
        for arm, label in model_arms():
            if arm not in results[0]:
                continue
            vs_form = [
                r[arm]["total_points"] - r["form"]["total_points"] for r in results
            ]
            vs_app = [
                r[arm]["total_points"] - r["app"]["total_points"] for r in results
            ]
            sd = statistics.stdev(vs_app) if len(vs_app) > 1 else 0.0
            print(
                f"  {label}: {mean_of(arm):.1f} pts/season   - form "
                f"{statistics.mean(vs_form):+.1f}   - app {statistics.mean(vs_app):+.1f} "
                f"(stdev {sd:.1f}, beat app in {sum(1 for d in vs_app if d > 0)}/"
                f"{len(vs_app)})   transfers {mean_of(arm, 'transfers_made'):.1f} "
                f"(hits {mean_of(arm, 'total_hits'):.1f})"
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
