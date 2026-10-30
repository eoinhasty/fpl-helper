# scoring.py — pure player scoring: start probability, transfer scoring,
# within-position ranks. No I/O, so backend/scripts/backtest*.py can call
# the exact functions that ship.
from __future__ import annotations
import re
from collections import defaultdict
from math import log, prod
from typing import Dict, List

# Fixture multiplier by FDR, interpolated for a DGW's fractional average.
# Deliberately gentle: ep_next already carries FPL's own fixture adjustment
# between GWs (mostly at FDR 1 and 5), so this only has to nudge. Chosen
# 2026-10-29 with backend/scripts/backtest*.py over 2024-25 and 2025-26
# against the old linear 1.0 -> 0.0 curve, which zeroed every FDR 5 player:
# best per-GW ranking in both seasons, +239 pts over the two simulated
# seasons. Mirrored by fdrFactor() in frontend/src/lib/utils.ts.
FDR_FACTOR = {1: 1.0, 2: 0.95, 3: 0.9, 4: 0.8, 5: 0.6}


def fdr_factor(avg_fdr: float) -> float:
    lo = max(1, min(4, int(avg_fdr)))
    t = min(max(avg_fdr - lo, 0.0), 1.0)
    return FDR_FACTOR[lo] + (FDR_FACTOR[lo + 1] - FDR_FACTOR[lo]) * t


# start_prob_from's positive-news floor. Whole words only: as substrings,
# "fit" matched "lack of match fitness" (~200 doubtful player-GWs across the
# 2024-26 archive, each read ~27 points too likely to start) and "available"
# matched "unavailable"; bare "returned" matched departures ("has returned to
# Getafe"). Every archived string that hit the old floor was one of these.
_FIT_NEWS_RE = re.compile(
    r"\b(?:back in training|returned to training|available|fit)\b"
)
_NOT_FIT_NEWS_RE = re.compile(r"\b(?:not|isn't|unlikely to be)\s+(?:available|fit)\b")


def start_prob_from(player: dict, played_gws: int) -> float:
    # played_gws is deliberately required: it used to default to 1, and
    # three callers relied on that, so from GW2 on any player past ~90
    # season minutes pinned time_ratio at its cap and a ~40-min/game
    # rotation risk read as ~93% to start instead of ~60%.
    status = player.get("status", "a")
    news = (player.get("news") or "").lower()

    # Heuristic: status base blended with actual play-time ratio to catch rotation risk
    status_base = {
        "a": 0.88,
        "d": 0.55,
        "i": 0.0,
        "s": 0.0,
        "n": 0.0,
        "u": 0.0,  # left the club (transferred, loaned out, released)
    }.get(status, 0.5)
    minutes = player.get("minutes", 0)
    if status == "a" and played_gws > 0 and minutes > 0:
        time_ratio = min(minutes / (played_gws * 90), 0.99)
        base = (status_base + time_ratio) / 2
    else:
        base = status_base

    if any(k in news for k in ["ruled out", "surgery", "setback"]):
        base *= 0.2
    elif any(k in news for k in ["doubt", "late test", "assess"]):
        base *= 0.7
    elif _FIT_NEWS_RE.search(news) and not _NOT_FIT_NEWS_RE.search(news):
        base = max(base, 0.9)

    # FPL's chance field reflects availability, not starting likelihood — use as a multiplier
    chance = player.get("chance_of_playing_next_round")
    if chance is not None:
        base *= chance / 100

    return round(max(0.0, min(0.99, base)), 2)


def score_player(
    player: dict, fdr_by_team: dict, candidates: List[dict], played_gws: int
) -> float:
    """Score a player for transfer suggestions using the captaincy blend formula."""
    factors = score_factors(player, fdr_by_team, candidates, played_gws)
    return prod(factors.values()) if factors else 0.0


def score_factors(
    player: dict, fdr_by_team: dict, candidates: List[dict], played_gws: int
) -> Dict[str, float]:
    """score_player's multiplicative terms by name; empty for a blank GW."""

    def _norm(vals: List[float], v: float) -> float:
        mn, mx = min(vals), max(vals)
        return 0.5 if mx == mn else (v - mn) / (mx - mn)

    pos = player.get("element_type", 4)

    ep_vals = [float(c.get("ep_next") or 0) for c in candidates]
    form_vals = [float(c.get("form") or 0) for c in candidates]
    ict_vals = [float(c.get("ict_index") or 0) for c in candidates]

    ep = float(player.get("ep_next") or 0)
    uses_ep = any(v > 0 for v in ep_vals)
    if uses_ep:
        base = _norm(ep_vals, ep)
    else:
        base = (
            _norm(form_vals, float(player.get("form") or 0)) * 0.5
            + _norm(ict_vals, float(player.get("ict_index") or 0)) * 0.5
        )

    team_fixtures = fdr_by_team.get(player.get("team", 0), [])
    if not team_fixtures:
        return {}  # BGW

    avg_fdr = sum(f["difficulty"] for f in team_fixtures) / len(team_fixtures)
    home_ratio = sum(1 for f in team_fixtures if f["home"]) / len(team_fixtures)
    home_boost = 1 + home_ratio * 0.08
    # ep_next is already a whole-GW total (a DGW player's covers both fixtures
    # — in the 2024-25 archive it's ~2x a single GW), so only the per-match
    # form/ICT fallback needs the DGW boost.
    dgw_boost = 1.8 if len(team_fixtures) > 1 and not uses_ep else 1.0
    pos_mult = {1: 0.65, 2: 0.72, 3: 0.92, 4: 1.0}.get(pos, 1.0)
    start_prob = start_prob_from(player, played_gws)

    return {
        "base": base,
        "fdr": fdr_factor(avg_fdr),
        "home": home_boost,
        "dgw": dgw_boost,
        "start": start_prob,
        "pos": pos_mult,
    }


def gain_driver(buy: Dict[str, float], sell: Dict[str, float]) -> str:
    """Name the factor that most explains why `buy` outscores `sell`.

    Scores are products, so each factor's share of the gain is its log
    ratio. Fixture difficulty and home advantage are reported together as
    "fixture"; position is shared by both sides and never differs.
    """
    if not sell:
        return "blank"  # the owned player has no fixture this GW

    def _ratio(*keys: str) -> float:
        # The buy side is never zero (its score beats the sale's), so a
        # zero here is the sale's — e.g. an FDR 5 fixture or a pool-minimum
        # base — and that term alone sinks the owned score.
        b = prod(buy[k] for k in keys)
        s = prod(sell[k] for k in keys)
        return log(b / s) if s > 0 else float("inf")

    # max() keeps the first of a tie, so minutes leads: an unavailable
    # player's ep_next is 0 too, and the absence is the real reason.
    shares = {
        "minutes": _ratio("start"),
        "form": _ratio("base"),
        "fixture": _ratio("fdr", "home"),
        "dgw": _ratio("dgw"),
    }
    return max(shares, key=lambda k: shares[k])


def position_ranks(boot: dict) -> dict:
    """Compute within-position stat ranks for active players (minutes > 0)."""

    by_pos: dict = defaultdict(list)
    for p in boot.get("elements", []):
        if (p.get("minutes") or 0) > 0:
            by_pos[p["element_type"]].append(p)

    result: dict = {}
    for group in by_pos.values():
        n = len(group)
        if n == 0:
            continue

        def rank_by(stat_fn, key: str, grp=group, total=n):
            for i, p in enumerate(sorted(grp, key=stat_fn, reverse=True)):
                r = i + 1
                pct = round((1 - (r - 1) / total) * 100) if total > 1 else 100
                result.setdefault(p["id"], {})[key] = {
                    "rank": r,
                    "of": total,
                    "pct": pct,
                }

        rank_by(lambda p: p.get("goals_scored") or 0, "goals")
        rank_by(lambda p: p.get("assists") or 0, "assists")
        rank_by(lambda p: p.get("clean_sheets") or 0, "clean_sheets")
        rank_by(lambda p: p.get("saves") or 0, "saves")
        rank_by(lambda p: float(p.get("points_per_game") or 0), "ppg")

    return result


def transfer_ranks(boot: dict) -> dict:
    """Compute within-position rank by net transfers (in - out) for the current GW."""

    by_pos: dict = defaultdict(list)
    for p in boot.get("elements", []):
        by_pos[p["element_type"]].append(p)

    result: dict = {}
    for group in by_pos.values():
        n = len(group)

        def net(p: dict) -> int:
            return (p.get("transfers_in_event") or 0) - (
                p.get("transfers_out_event") or 0
            )

        for i, p in enumerate(sorted(group, key=net, reverse=True)):
            result[p["id"]] = {"rank": i + 1, "of": n}

    return result
