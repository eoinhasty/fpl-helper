"""Per-fixture points breakdown and bonus standings for a gameweek.

Pure helpers over `/event/{gw}/live/` and `/fixtures/?event={gw}` — no I/O.

`/event/{gw}/live/` gives each player an `explain` list, one entry per fixture,
of the scoring lines (identifier, value, points) that make up `total_points`.
It only has BPS as a gameweek total, though, so per-fixture BPS comes from the
fixture's own `stats` (players with 0 BPS are left out of it).

FPL adds bonus to `total_points` only once it's confirmed, about an hour after
full time; until then the provisional bonus is worked out from the fixture's
BPS here and reported separately, never folded into the points.
"""

from typing import Dict, List, Optional

BONUS_PLACES = 3


def fixture_bps(fixture: dict) -> Dict[int, int]:
    """element → BPS in this fixture, from the fixture's own stats."""
    for stat in fixture.get("stats") or []:
        if stat.get("identifier") == "bps":
            return {
                row["element"]: row["value"]
                for side in ("h", "a")
                for row in stat.get(side) or []
            }
    return {}


def bonus_confirmed(fixture: dict) -> bool:
    """FPL has awarded this fixture's bonus (it's in the players' points)."""
    if fixture.get("finished"):
        return True
    return any(
        stat.get("identifier") == "bonus" and (stat.get("h") or stat.get("a"))
        for stat in fixture.get("stats") or []
    )


def bps_rank(bps: int, table: Dict[int, int]) -> int:
    """Competition rank (1, 1, 3) — ties share the higher place."""
    return 1 + sum(1 for v in table.values() if v > bps)


def bonus_for_rank(rank: int) -> int:
    """3/2/1 by rank: two tied first both get 3 and the next gets 1, three
    tied first all get 3 and nobody else does — FPL's own tie rules."""
    return max(BONUS_PLACES + 1 - rank, 0)


def bonus_cutoff(table: Dict[int, int]) -> Optional[int]:
    """Lowest BPS still in a bonus place, or None while nobody has any."""
    ranked = [v for v in table.values() if bonus_for_rank(bps_rank(v, table)) > 0]
    return min(ranked) if ranked else None


def points_breakdown(
    element: int,
    explain: List[dict],
    team_id: Optional[int],
    fixtures_by_id: Dict[int, dict],
    short_names: Dict[int, str],
) -> List[dict]:
    """One row per fixture in `explain`, in kickoff order.

    `stats` are FPL's scoring lines minus bonus, which gets its own fields so a
    provisional and a confirmed bonus read the same way. `points` counts only
    what FPL has awarded (confirmed bonus included), so the rows add up to the
    player's GW points; `bonus_provisional` says whether `bonus` is in them yet.
    """
    rows = []
    for entry in explain:
        fx = fixtures_by_id.get(entry.get("fixture"))
        stats = entry.get("stats") or []
        lines = [
            {"identifier": s["identifier"], "value": s["value"], "points": s["points"]}
            for s in stats
            if s.get("identifier") != "bonus"
        ]
        awarded_bonus = sum(
            s["points"] for s in stats if s.get("identifier") == "bonus"
        )
        minutes = next(
            (s["value"] for s in stats if s.get("identifier") == "minutes"), 0
        )
        row = {
            "fixture": entry.get("fixture"),
            "opp": None,
            "home": None,
            "kickoff": None,
            "started": False,
            "finished": False,
            "minutes": minutes,
            "stats": lines,
            "points": sum(line["points"] for line in lines) + awarded_bonus,
            "bps": None,
            "bps_rank": None,
            "bps_to_bonus": None,
            "bonus": awarded_bonus,
            "bonus_provisional": False,
        }
        if fx is not None:
            home = fx.get("team_h") == team_id
            opp_id = fx.get("team_a") if home else fx.get("team_h")
            row.update(
                opp=short_names.get(opp_id),
                home=home,
                kickoff=fx.get("kickoff_time"),
                started=bool(fx.get("started")),
                finished=bool(fx.get("finished") or fx.get("finished_provisional")),
            )
            if row["started"] and minutes > 0:
                row.update(_bps_fields(fixture_bps(fx), element))
                if not bonus_confirmed(fx):
                    row["bonus"] = bonus_for_rank(row["bps_rank"])
                    row["bonus_provisional"] = True
        rows.append(row)
    rows.sort(key=lambda r: r["kickoff"] or "")
    return rows


def _bps_fields(table: Dict[int, int], element: int) -> dict:
    # Players on 0 BPS aren't listed in the fixture's stats
    bps = table.get(element, 0)
    rank = bps_rank(bps, table)
    cutoff = bonus_cutoff(table)
    return {
        "bps": bps,
        "bps_rank": rank,
        "bps_to_bonus": (
            cutoff - bps if bonus_for_rank(rank) == 0 and cutoff is not None else None
        ),
    }
