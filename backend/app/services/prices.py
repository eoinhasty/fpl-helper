# prices.py — pure helpers over FPL's own price-change forecast fields.
from __future__ import annotations
from datetime import datetime
from typing import Optional

# FPL bands its projected progress at the next update into a likelihood of
# -5..5. Only ±5 is a "tonight" signal: checked against 13 nightly updates
# (tools/analysis/price_snapshots.py check, 2026-11-22) ±5 changed 55/56 times
# in the forecast direction, ±4 only 3/106 (it's more like "within 2-3 days").
LIKELY_BAND = 5


def _float(v) -> Optional[float]:
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _locked_until(player: dict, now: datetime) -> Optional[str]:
    raw = player.get("price_change_locked_until")
    if not raw:
        return None
    try:
        until = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
    except ValueError:
        return None
    if until.tzinfo is None or until <= now:
        return None
    return until.isoformat(timespec="seconds").replace("+00:00", "Z")


def price_outlook(player: dict, now: datetime) -> Optional[dict]:
    """FPL's forecast for this player's price at the next nightly update.

    `progress` is FPL's projected progress towards a change at that update
    (±100 ≈ a change; sign = direction), falling back to the current progress.
    `likely` is "rise"/"fall" only in FPL's top band. `locked_until` is set
    while FPL holds the price (no locked player changed in the snapshots);
    FPL doesn't say why, so callers shouldn't guess. None when FPL sends no
    forecast at all.
    """
    projections = player.get("price_change_projections") or []
    first = next((p for p in projections if p.get("offset") == 0), None)
    progress = _float(first.get("projected_percent")) if first else None
    if progress is None:
        progress = _float(player.get("price_change_percent"))
    if progress is None:
        return None

    locked_until = _locked_until(player, now)
    band = (first or {}).get("likelihood") or 0
    likely = None
    if not locked_until and abs(band) >= LIKELY_BAND:
        likely = "rise" if band > 0 else "fall"
    return {
        "progress": round(progress, 1),
        "likely": likely,
        "locked_until": locked_until,
    }
