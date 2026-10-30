# gameweeks.py — pure helpers over bootstrap-static's `events` list.
from __future__ import annotations
from typing import Optional, Tuple
from fastapi import HTTPException


def season_status(events: list) -> str:
    """'in_season' once any GW is current or finished; 'pre_season' otherwise
    (covers FPL's summer window where is_current/is_next can both be false)."""
    for e in events:
        if e.get("is_current") or e.get("finished"):
            return "in_season"
    return "pre_season"


def current_and_next(events: list) -> Tuple[Optional[dict], Optional[dict]]:
    """The (current, next) events. Pre-GW1 there's no current, after GW38
    there's no next, and in FPL's summer window there may be neither."""
    current = next((e for e in events if e["is_current"]), None)
    nxt = next((e for e in events if e["is_next"]), None)
    return current, nxt


def upcoming_event(events: list) -> Optional[dict]:
    """The GW whose fixtures matter next: the next GW, else the current one."""
    current, nxt = current_and_next(events)
    return nxt or current


def current_and_next_gw(events: list) -> Tuple[int, int]:
    """(current, next) GW ids, each standing in for the other when missing.
    404s when neither exists."""
    current, nxt = current_and_next(events)
    if not current and not nxt:
        raise HTTPException(404, detail="No active gameweek found.")
    return (current or nxt)["id"], (nxt or current)["id"]


def season_label(events: list) -> Optional[str]:
    """e.g. '2026/27', derived from GW1's deadline year — bootstrap-static has
    no explicit season name field, but the season always starts (GW1 deadline)
    in the calendar year it's named after.

    Pre-season, bootstrap's per-element season totals (goals_scored,
    points_per_game, etc.) haven't reset yet — they're still last season's
    final numbers until GW1 actually kicks off, same rollover-lag as
    StandingsCard's is_previous_season_table. So the label reported here
    must lag by one season too, or it would claim e.g. "2026/27" next to
    stats that are actually 2025/26's."""
    if not events:
        return None
    deadline = events[0].get("deadline_time")
    if not deadline:
        return None
    year = int(deadline[:4])
    if season_status(events) == "pre_season":
        year -= 1
    return f"{year}/{(year + 1) % 100:02d}"


def finished_gw_count(boot: dict) -> int:
    """Finished GWs this season (min 1) — the denominator start_prob_from
    needs to turn cumulative minutes into a per-GW play-time ratio."""
    return max(1, sum(1 for e in boot.get("events", []) if e.get("finished")))
