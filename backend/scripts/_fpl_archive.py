"""Shared loaders for the vaastav/Fantasy-Premier-League GitHub archive,
used by backtest.py and backtest_transfers.py.

See backtest.py's module docstring for why this archive is used instead of
FPL's own API (which only retains the current season).
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import os
from collections import defaultdict
from pathlib import Path
from typing import Callable, Dict, List, Optional

import httpx

REPO = "vaastav/Fantasy-Premier-League"
API_COMMITS = f"https://api.github.com/repos/{REPO}/commits"
CACHE_ROOT = Path(__file__).resolve().parent / ".backtest_cache"

# Set by configure() from each script's CLI args before any loader runs.
SEASON = "2025-26"
REFRESH = False


def _raw_base() -> str:
    return f"https://raw.githubusercontent.com/{REPO}/master/data/{SEASON}"


def configure(
    description: str, add_args: Optional[Callable] = None
) -> argparse.Namespace:
    """Parse the shared --season/--refresh flags (plus any a script adds via
    add_args(parser)) and point the loaders at that season. Cache is per
    season; --refresh re-downloads, which the in-progress season needs since
    the archive gains a GW every week."""
    global SEASON, REFRESH
    parser = argparse.ArgumentParser(description=description)
    if add_args:
        add_args(parser)
    parser.add_argument(
        "--season",
        default=SEASON,
        help=f"archive season folder, e.g. 2026-27 (default {SEASON})",
    )
    parser.add_argument(
        "--refresh", action="store_true", help="re-download instead of using the cache"
    )
    args = parser.parse_args()
    SEASON, REFRESH = args.season, args.refresh
    return args


def _cached_get(url: str, cache_key: str, immutable: bool = False) -> str:
    cache_dir = CACHE_ROOT / SEASON
    cache_dir.mkdir(parents=True, exist_ok=True)
    path = cache_dir / cache_key
    if path.exists() and (immutable or not REFRESH):
        return path.read_text(encoding="utf-8")
    headers = {}
    # The commits API allows only 60 unauthenticated requests/hour per IP;
    # an optional token (e.g. GITHUB_TOKEN=$(gh auth token)) raises that to
    # 5,000. Only ever sent to GitHub's own API, never to raw file URLs.
    token = os.environ.get("GITHUB_TOKEN")
    if token and url.startswith("https://api.github.com/"):
        headers["Authorization"] = f"Bearer {token}"
    resp = httpx.get(url, headers=headers, timeout=30.0, follow_redirects=True)
    resp.raise_for_status()
    path.write_text(resp.text, encoding="utf-8")
    return resp.text


def _cached_json(url: str, cache_key: str) -> dict:
    return json.loads(_cached_get(url, cache_key))


def load_fixtures() -> Dict[int, List[dict]]:
    """event -> list of raw fixture rows (team ids as ints, difficulty as ints)."""
    text = _cached_get(f"{_raw_base()}/fixtures.csv", "fixtures.csv")
    by_event: Dict[int, List[dict]] = defaultdict(list)
    for row in csv.DictReader(io.StringIO(text)):
        if not row.get("event"):
            continue
        by_event[int(row["event"])].append(
            {
                "team_h": int(row["team_h"]),
                "team_a": int(row["team_a"]),
                "team_h_difficulty": int(row["team_h_difficulty"]),
                "team_a_difficulty": int(row["team_a_difficulty"]),
            }
        )
    return by_event


def fdr_by_team_for_gw(
    fixtures_by_event: Dict[int, List[dict]], gw: int
) -> Dict[int, List[dict]]:
    fdr: Dict[int, List[dict]] = defaultdict(list)
    for fx in fixtures_by_event.get(gw, []):
        fdr[fx["team_h"]].append({"home": True, "difficulty": fx["team_h_difficulty"]})
        fdr[fx["team_a"]].append({"home": False, "difficulty": fx["team_a_difficulty"]})
    return fdr


def load_merged_gw() -> Dict[int, Dict[int, dict]]:
    """round -> element_id -> {minutes, total_points, team, position, ict_index,
    value, xp}.

    DGWs give a player two rows for the same round (one per fixture) — sum
    minutes/points/ict across them rather than letting the second overwrite
    the first, or DGW players (exactly who dgw_boost targets) get silently
    undercounted. value/xp are taken from the last row seen (they don't
    meaningfully differ between a DGW player's two rows).
    """
    text = _cached_get(f"{_raw_base()}/gws/merged_gw.csv", "merged_gw.csv")
    by_round: Dict[int, Dict[int, dict]] = defaultdict(dict)
    pos_map = {"GK": 1, "DEF": 2, "MID": 3, "FWD": 4}
    for row in csv.DictReader(io.StringIO(text)):
        rnd = int(row["round"])
        el = int(row["element"])
        existing = by_round[rnd].get(el)
        if existing is None:
            by_round[rnd][el] = {
                "minutes": int(row["minutes"] or 0),
                "total_points": int(row["total_points"] or 0),
                "team_name": row["team"],
                "position": pos_map.get(row["position"]),
                "ict_index": float(row["ict_index"] or 0),
                "value": int(row["value"] or 0),
                "xp": float(row["xP"]) if row.get("xP") not in (None, "") else None,
            }
        else:
            existing["minutes"] += int(row["minutes"] or 0)
            existing["total_points"] += int(row["total_points"] or 0)
            existing["ict_index"] += float(row["ict_index"] or 0)
    return by_round


def load_player_names() -> Dict[int, str]:
    text = _cached_get(f"{_raw_base()}/player_idlist.csv", "player_idlist.csv")
    names = {}
    for row in csv.DictReader(io.StringIO(text)):
        names[int(row["id"])] = f"{row['first_name']} {row['second_name']}"
    return names


def load_teams() -> Dict[str, int]:
    text = _cached_get(f"{_raw_base()}/teams.csv", "teams.csv")
    name_to_id = {}
    for row in csv.DictReader(io.StringIO(text)):
        name_to_id[row["name"]] = int(row["id"])
    return name_to_id


def load_status_snapshots() -> List[tuple]:
    """Returns [(commit_date_iso, {element_id: {status, news, chance}})], sorted ascending."""
    commits = _cached_json(
        f"{API_COMMITS}?path=data/{SEASON}/players_raw.csv&per_page=100",
        "commits.json",
    )
    commits = sorted(commits, key=lambda c: c["commit"]["author"]["date"])
    snapshots = []
    for c in commits:
        sha = c["sha"]
        date = c["commit"]["author"]["date"]
        text = _cached_get(
            f"https://raw.githubusercontent.com/{REPO}/{sha}/data/{SEASON}/players_raw.csv",
            f"players_raw_{sha[:8]}.csv",
            immutable=True,
        )
        snap = {}
        for row in csv.DictReader(io.StringIO(text)):
            chance_raw = row.get("chance_of_playing_next_round")
            snap[int(row["id"])] = {
                "status": row.get("status") or "a",
                "news": row.get("news") or "",
                "chance_of_playing_next_round": (
                    int(chance_raw) if chance_raw and chance_raw != "None" else None
                ),
            }
        snapshots.append((date, snap))
    return snapshots


def snapshot_before(snapshots: List[tuple], iso_date: str) -> dict:
    """Nearest snapshot at or before iso_date; falls back to the earliest one."""
    chosen = snapshots[0][1]
    for date, snap in snapshots:
        if date <= iso_date:
            chosen = snap
        else:
            break
    return chosen


def first_kickoff_by_gw() -> Dict[int, str]:
    text = _cached_get(f"{_raw_base()}/fixtures.csv", "fixtures.csv")
    earliest: Dict[int, str] = {}
    for row in csv.DictReader(io.StringIO(text)):
        if not row.get("event") or not row.get("kickoff_time"):
            continue
        gw = int(row["event"])
        ko = row["kickoff_time"]
        if gw not in earliest or ko < earliest[gw]:
            earliest[gw] = ko
    return earliest


def spearman(xs: List[float], ys: List[float]) -> Optional[float]:
    if len(xs) < 3:
        return None

    def ranks(vals: List[float]) -> List[float]:
        order = sorted(range(len(vals)), key=lambda i: vals[i])
        r = [0.0] * len(vals)
        i = 0
        while i < len(order):
            j = i
            while j + 1 < len(order) and vals[order[j + 1]] == vals[order[i]]:
                j += 1
            avg_rank = (i + j) / 2 + 1
            for k in range(i, j + 1):
                r[order[k]] = avg_rank
            i = j + 1
        return r

    rx, ry = ranks(xs), ranks(ys)
    n = len(xs)
    mx, my = sum(rx) / n, sum(ry) / n
    cov = sum((a - mx) * (b - my) for a, b in zip(rx, ry))
    sx = (sum((a - mx) ** 2 for a in rx)) ** 0.5
    sy = (sum((b - my) ** 2 for b in ry)) ** 0.5
    if sx == 0 or sy == 0:
        return None
    return cov / (sx * sy)
