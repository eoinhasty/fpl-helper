"""Predicted vs actual for the points model, one finished GW at a time.

Pure: the service fetches each GW's published projections file
(`projections-{season}-gw{N}.json`, built before that GW) and FPL's
`/event/{gw}/live/`, and these functions score one against the other.

Scored among players who played (minutes > 0) only. Over everyone the many
non-players projected near zero and scoring zero inflate the correlation
(0.68–0.75 vs 0.29–0.45 on 2026-27's GW2–10), and the model's projections
assume availability, so an injured player's 0 says nothing about the model.
"""

from __future__ import annotations

from typing import Dict, List, Optional, Sequence, Tuple

TOP_N = 15  # a squad's worth

# {element: (projected pts, actual pts, minutes)} — what the service caches
# per GW, small enough to keep (the live file it comes from is ~480 KB).
Rows = Dict[int, Tuple[float, int, int]]


def gw_rows(proj: dict, live: dict, gw: int) -> Optional[Rows]:
    """Join a GW's projections file with its live data, or None when the
    file doesn't cover `gw` as its first GW. Players the file leaves out
    (it drops all-zero rows) count as projected 0."""
    gws = proj.get("gws") or []
    if not gws or gws[0] != gw:
        return None
    projected = {int(el): pts[0] for el, pts in (proj.get("players") or {}).items()}
    rows: Rows = {}
    for el in live.get("elements") or []:
        stats = el.get("stats") or {}
        rows[el["id"]] = (
            float(projected.get(el["id"], 0.0)),
            int(stats.get("total_points") or 0),
            int(stats.get("minutes") or 0),
        )
    return rows


def _ranks(xs: Sequence[float]) -> List[float]:
    """1-based ranks, ties sharing their average rank."""
    order = sorted(range(len(xs)), key=lambda i: xs[i])
    ranks = [0.0] * len(xs)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and xs[order[j + 1]] == xs[order[i]]:
            j += 1
        avg = (i + j) / 2 + 1
        for k in range(i, j + 1):
            ranks[order[k]] = avg
        i = j + 1
    return ranks


def spearman(xs: Sequence[float], ys: Sequence[float]) -> Optional[float]:
    """Spearman's rank correlation (Pearson on tie-averaged ranks); None
    with fewer than 3 pairs or no spread on either side."""
    n = len(xs)
    if n < 3 or n != len(ys):
        return None
    rx, ry = _ranks(xs), _ranks(ys)
    mx, my = sum(rx) / n, sum(ry) / n
    cov = sum((a - mx) * (b - my) for a, b in zip(rx, ry))
    vx = sum((a - mx) ** 2 for a in rx)
    vy = sum((b - my) ** 2 for b in ry)
    if vx == 0 or vy == 0:
        return None
    return cov / (vx * vy) ** 0.5


def gw_summary(rows: Rows) -> Optional[dict]:
    """How the model did over the players who played in one GW: rank
    correlation, and the actual points of its top 15 against the GW's best
    15 and an average 15. None if nobody played (a GW not started yet).
    No mean projected vs mean actual: among players who played, actual
    always runs above a projection that allowed for not playing, so it
    would read as a bias the model doesn't have."""
    played = [(p, a) for p, a, mins in rows.values() if mins > 0]
    if not played:
        return None
    n = len(played)
    proj = [p for p, _ in played]
    actual = [a for _, a in played]
    # Ties on projection: break toward the lower actual, so a tie never
    # flatters the model
    by_model = sorted(played, key=lambda r: (-r[0], r[1]))[:TOP_N]
    best = sorted(actual, reverse=True)[:TOP_N]
    corr = spearman(proj, actual)
    return {
        "played": n,
        "rank_corr": None if corr is None else round(corr, 3),
        "top_model": sum(a for _, a in by_model),
        "top_best": sum(best),
        "top_average": round(sum(actual) / n * min(TOP_N, n), 1),
    }


def captain_pick(
    rows: Rows, picks: List[dict], positions: Dict[int, int]
) -> Optional[dict]:
    """The captain the model would have picked from an entry's XI that GW —
    its outfield starters (`multiplier` > 0 among slots 1–11; GKs excluded,
    as CaptaincyCard does) ranked on projection — against the entry's own
    captain and the best outfield starter in hindsight. Points are the
    player's own, not doubled. None without outfield starters or rows."""
    xi = [
        p["element"]
        for p in picks
        if p.get("position", 99) <= 11
        and positions.get(p["element"]) not in (None, 1)
        and p["element"] in rows
    ]
    if not xi:
        return None
    model = max(xi, key=lambda el: (rows[el][0], -rows[el][1]))
    best = max(xi, key=lambda el: rows[el][1])
    own = next((p["element"] for p in picks if p.get("is_captain")), None)

    def row(el: Optional[int]) -> Optional[dict]:
        if el is None or el not in rows:
            return None
        return {"element": el, "projected": rows[el][0], "points": rows[el][1]}

    return {"model": row(model), "yours": row(own), "best": row(best)}


def best_captain(rows: Rows) -> Optional[dict]:
    """The GW's best captain in hindsight: its top scorer across every
    player, ties going to the higher projection. None without rows."""
    el = max(rows, key=lambda e: (rows[e][1], rows[e][0]), default=None)
    if el is None:
        return None
    return {"element": el, "projected": rows[el][0], "points": rows[el][1]}
