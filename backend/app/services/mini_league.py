# mini_league.py — pure live scoring for a classic league's table. No I/O.
"""A classic league's table with this gameweek's points worked out live.

FPL's own standings and each entry's picks summary only catch up with the
scores every so often, so the GW points here come from the picks themselves:
each pick's live points × its multiplier (captain, triple captain and bench
boost are all in the multiplier), plus the bonus FPL hasn't awarded yet,
minus the entry's hits. No auto-subs: FPL applies them once the GW is over.
"""

from __future__ import annotations
from typing import Dict, Iterable, List, Optional

# A fixture reads as over once FPL marks it provisionally finished; the
# `finished` flag waits for bonus to be confirmed about an hour later.
_DONE = "finished_provisional"


SHIRT_BASE = "https://fantasy.premierleague.com/dist/img/shirts/standard/"


def fixture_states(fixtures: List[dict]) -> Dict[int, List[str]]:
    """team id → the state of each of its fixtures this GW: "to_play",
    "playing" or "done". A team with a blank isn't in it."""
    out: Dict[int, List[str]] = {}
    for fx in fixtures:
        if fx.get(_DONE) or fx.get("finished"):
            state = "done"
        elif fx.get("started"):
            state = "playing"
        else:
            state = "to_play"
        for team in (fx.get("team_h"), fx.get("team_a")):
            if team is not None:
                out.setdefault(team, []).append(state)
    return out


def match_progress(fixtures: List[dict]) -> Dict[str, int]:
    """How many of the GW's matches are done, in play and in all."""
    states = [
        "done" if fx.get(_DONE) or fx.get("finished") else "playing"
        for fx in fixtures
        if fx.get("started")
    ]
    return {
        "done": states.count("done"),
        "playing": states.count("playing"),
        "total": len(fixtures),
    }


def player_state(states: List[str]) -> str:
    """One state for a player from their team's fixtures: playing beats to
    play beats done, so a double GW's second match still counts as left."""
    for s in ("playing", "to_play"):
        if s in states:
            return s
    return "done"


def pre_gw_total(row: dict, picks: dict, start_event: Optional[int], gw: int) -> int:
    """The entry's league total before this GW.

    For a league scored from GW1 that's the entry's overall total, taken from
    the picks' own snapshot of this GW (total − GW points + hits), which stays
    right however far FPL's standings lag. A league that started later only
    has its standings: their total minus their GW figure. A league starting
    this GW has nothing before it.
    """
    if start_event == gw:
        return 0
    eh = picks.get("entry_history") or {}
    if (start_event or 1) <= 1 and eh.get("event") == gw:
        return (
            eh.get("total_points", 0)
            - eh.get("points", 0)
            + eh.get("event_transfers_cost", 0)
        )
    return (row.get("total") or 0) - (row.get("event_total") or 0)


def competition_ranks(values: List[int]) -> List[int]:
    """Rank each value, highest first, ties sharing the higher place (1, 1, 3)."""
    return [1 + sum(1 for v in values if v > x) for x in values]


def live_entry(
    row: dict,
    picks: dict,
    *,
    gw: int,
    start_event: Optional[int],
    live_points: Dict[int, int],
    bonus: Dict[int, int],
    teams: Dict[int, int],
    names: Dict[int, str],
    states: Dict[int, List[str]],
) -> dict:
    """One entry's live row, before ranking. `live_points` and `bonus` are
    element → this GW's awarded points / not-yet-awarded bonus; `teams` and
    `names` element → club id / web name."""
    eh = picks.get("entry_history") or {}
    hits = eh.get("event_transfers_cost", 0) or 0
    gw_points = 0
    counts = {"done": 0, "playing": 0, "to_play": 0}
    captain = None
    for p in picks.get("picks") or []:
        mult = p.get("multiplier") or 0
        el = p["element"]
        pts = live_points.get(el, 0) + bonus.get(el, 0)
        gw_points += mult * pts
        if mult:
            counts[player_state(states.get(teams.get(el), []))] += 1
        if p.get("is_captain"):
            captain = {
                "element": el,
                "name": names.get(el),
                "multiplier": mult,
                "points": mult * pts,
                "state": player_state(states.get(teams.get(el), [])),
            }
    pre = pre_gw_total(row, picks, start_event, gw)
    return {
        "entry": row["entry"],
        "entry_name": row.get("entry_name"),
        "player_name": row.get("player_name"),
        "gw_points": gw_points - hits,
        "hits": hits,
        "pre_total": pre,
        "total": pre + gw_points - hits,
        "chip": picks.get("active_chip"),
        "captain": captain,
        # Every pick with its multiplier (0 on the bench), for league
        # ownership and head-to-head comparisons on the page
        "picks": [
            {"element": p["element"], "multiplier": p.get("multiplier") or 0}
            for p in picks.get("picks") or []
        ],
        "played": counts["done"],
        "playing": counts["playing"],
        "to_play": counts["to_play"],
    }


def player_summaries(
    elements: Iterable[int],
    *,
    players: Dict[int, dict],
    live_points: Dict[int, int],
    bonus: Dict[int, int],
    short_names: Dict[int, str],
    team_codes: Dict[int, int],
    fixtures: List[dict],
) -> Dict[int, dict]:
    """element → what the page shows for a picked player: name, club, FPL
    position, this GW's points (provisional bonus in), state and fixtures
    ("ARS (H)"). `players` is bootstrap's elements by id."""
    labels: Dict[int, List[str]] = {}
    for fx in fixtures:
        h, a = fx.get("team_h"), fx.get("team_a")
        labels.setdefault(h, []).append(f"{short_names.get(a, '?')} (H)")
        labels.setdefault(a, []).append(f"{short_names.get(h, '?')} (A)")
    states = fixture_states(fixtures)
    out: Dict[int, dict] = {}
    for el in elements:
        p = players.get(el) or {}
        team = p.get("team")
        code = team_codes.get(team)
        gk = "_1" if p.get("element_type") == 1 else ""
        out[el] = {
            "name": p.get("web_name"),
            "team": short_names.get(team),
            "position": p.get("element_type"),
            "points": live_points.get(el, 0) + bonus.get(el, 0),
            "state": player_state(states.get(team, [])),
            "fixtures": labels.get(team, []),
            "shirt_url": (f"{SHIRT_BASE}shirt_{code}{gk}-220.webp" if code else None),
        }
    return out


def unscored_entry(row: dict) -> dict:
    """An entry whose picks couldn't be read: FPL's own standings figures,
    flagged so the table can say they aren't live."""
    total = row.get("total") or 0
    event_total = row.get("event_total") or 0
    return {
        "entry": row["entry"],
        "entry_name": row.get("entry_name"),
        "player_name": row.get("player_name"),
        "gw_points": event_total,
        "hits": None,
        "pre_total": total - event_total,
        "total": total,
        "chip": None,
        "captain": None,
        "picks": None,
        "played": None,
        "playing": None,
        "to_play": None,
        "unscored": True,
    }


def rank_table(rows: List[dict]) -> List[dict]:
    """Add `rank` (on the live total) and `pre_rank` (before this GW), both
    within these rows, and sort by live rank."""
    live = competition_ranks([r["total"] for r in rows])
    pre = competition_ranks([r["pre_total"] for r in rows])
    ranked = [{**r, "rank": lr, "pre_rank": pr} for r, lr, pr in zip(rows, live, pre)]
    ranked.sort(key=lambda r: (r["rank"], -r["gw_points"], r["entry_name"] or ""))
    return ranked
