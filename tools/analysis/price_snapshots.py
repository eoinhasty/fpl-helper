"""Snapshot FPL's price-change fields, and check its projections against what actually changed.

bootstrap-static carries FPL's own price-change forecast per player: `price_change_percent`
(progress towards a change, ±100 ≈ a change), `price_change_projections` (projected progress at
each of the next three price updates, banded into a `likelihood` of -5..5), `price_change_hourly_rate`,
`price_change_locked_until` and `price_change_calibrating`; `game_config.settings.price_change_deadlines`
dates the updates. Nothing keeps a history of them, so before the app labels anyone "likely to rise",
the Price snapshots workflow (.github/workflows/price-snapshots.yml) saves them every 2 hours as
assets on the `price-snapshots` pre-release:

    python price_snapshots.py save --out DIR      # what the workflow runs
    gh release download price-snapshots -D data/price_snapshots --skip-existing
    python price_snapshots.py check               # score each update's projections

`check` scores each price update D on the last snapshot before it (whose offset-0 projection
targets D) against the last snapshot before the following update, so it sees D's changes whatever
hour FPL applies them, and none of the next update's.
"""
import argparse
import gzip
import json
from collections import Counter, defaultdict
from datetime import UTC, datetime, timedelta
from pathlib import Path

import httpx

from common import DATA_DIR

FPL = "https://fantasy.premierleague.com/api"
FORMAT_VERSION = 1
SNAPSHOT_DIR = DATA_DIR / "price_snapshots"
PRICE_FIELDS = ("price_change_percent", "price_change_hourly_rate", "price_change_projections",
                "price_change_locked_until", "price_change_calibrating")


def parse_time(s: str) -> datetime:
    return datetime.fromisoformat(s)


def save(out: Path) -> Path:
    boot = httpx.get(f"{FPL}/bootstrap-static/", timeout=30).raise_for_status().json()
    now = datetime.now(UTC)
    current = next((e["id"] for e in boot["events"] if e["is_current"]), None)
    players = {
        str(e["code"]): {
            "id": e["id"], "name": e["web_name"], "team": e["team"], "now_cost": e["now_cost"],
            "status": e["status"], "chance_of_playing_next_round": e["chance_of_playing_next_round"],
            "selected_by_percent": e["selected_by_percent"],
            "transfers_in_event": e["transfers_in_event"], "transfers_out_event": e["transfers_out_event"],
            **{k: e.get(k) for k in PRICE_FIELDS},
        }
        for e in boot["elements"]
    }
    snap = {
        "version": FORMAT_VERSION,
        "fetched_at": now.isoformat(timespec="seconds"),
        "current_gw": current,
        "deadlines": boot["game_config"]["settings"].get("price_change_deadlines", []),
        "players": players,
    }
    out.mkdir(parents=True, exist_ok=True)
    path = out / f"prices-{now:%Y%m%dT%H%MZ}.json.gz"
    path.write_bytes(gzip.compress(json.dumps(snap, separators=(",", ":")).encode()))
    print(f"saved {path.name}: {len(players)} players, next updates {snap['deadlines']}")
    return path


def load(src: Path) -> list[dict]:
    snaps = [json.loads(gzip.decompress(p.read_bytes())) for p in sorted(src.glob("prices-*.json.gz"))]
    for s in snaps:
        s["at"] = parse_time(s["fetched_at"])
    return sorted(snaps, key=lambda s: s["at"])


def likelihood(p: dict) -> int:
    proj = p.get("price_change_projections") or []
    return proj[0]["likelihood"] if proj else 0


def check(src: Path) -> None:
    snaps = load(src)
    if len(snaps) < 2:
        raise SystemExit(f"need at least 2 snapshots in {src}, found {len(snaps)}")
    print(f"{len(snaps)} snapshots, {snaps[0]['fetched_at']} .. {snaps[-1]['fetched_at']}")

    deadlines = sorted({parse_time(d) for s in snaps for d in s["deadlines"]})
    bands: dict[int, Counter] = defaultdict(Counter)
    misses, lag_hours, scored = [], [], 0
    for d in deadlines:
        pre = [s for s in snaps if s["at"] < d and s["deadlines"] and parse_time(s["deadlines"][0]) == d]
        if not pre:
            continue
        pre = pre[-1]
        following = [parse_time(x) for x in pre["deadlines"][1:]] or [d + timedelta(days=1)]
        after = [s for s in snaps if d <= s["at"] < following[0]]
        if not after:
            continue
        post = after[-1]
        scored += 1
        changed = 0
        for code, p in pre["players"].items():
            q = post["players"].get(code)
            if q is None:
                continue
            delta = q["now_cost"] - p["now_cost"]
            band = likelihood(p)
            bands[band]["rise" if delta > 0 else "fall" if delta < 0 else "none"] += 1
            if delta:
                changed += 1
                first = next(s for s in after if s["players"].get(code, q)["now_cost"] != p["now_cost"])
                lag_hours.append((first["at"] - d).total_seconds() / 3600)
                if band * delta <= 0 or abs(band) < 4:
                    misses.append((d.date(), p["name"], delta, band, p["price_change_percent"]))
            elif abs(band) == 5:
                misses.append((d.date(), p["name"], 0, band, p["price_change_percent"]))
        print(f"update {d:%Y-%m-%d %H:%MZ}: {changed} changes "
              f"(pre {pre['at']:%m-%d %H:%M}, post {post['at']:%m-%d %H:%M})")

    if not scored:
        raise SystemExit("no update is bracketed by snapshots on both sides yet")
    print(f"\n{scored} updates scored; offset-0 likelihood band -> outcome at that update")
    for band in sorted(bands):
        c = bands[band]
        moved = c["rise"] + c["fall"]
        total = moved + c["none"]
        print(f"  {band:+d}: {moved:4d}/{total:<4d} changed ({moved / total:6.1%})  rise {c['rise']}  fall {c['fall']}")
    if lag_hours:
        print(f"\nchanges first seen {min(lag_hours):.1f}-{max(lag_hours):.1f} h after the update time")
    print(f"\nsurprises (changed below ±4 or against the band, or ±5 without a change): {len(misses)}")
    for m in misses:
        print("  {} {:<16} change {:+d}  band {:+d}  progress {}".format(*m))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("save").add_argument("--out", type=Path, default=SNAPSHOT_DIR)
    sub.add_parser("check").add_argument("src", type=Path, nargs="?", default=SNAPSHOT_DIR)
    args = ap.parse_args()
    save(args.out) if args.cmd == "save" else check(args.src)


if __name__ == "__main__":
    main()
