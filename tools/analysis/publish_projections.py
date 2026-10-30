"""Write the points model's projections as a small JSON file for the app to read.

Run after fetch_history.py and fetch_data.py (no --entry needed):

    python publish_projections.py --out projections.json
    python publish_projections.py --check <published url>   # is a newer finished GW available?

The scheduled GitHub Action (.github/workflows/projections.yml) runs both: --check
first, so the model is only retrained once a gameweek's data is final.

Projections assume the player is available: they include what recent minutes say
about rotation, but not FPL's chance-of-playing or news. Consumers apply that.
"""
import argparse
import json
import os
from datetime import UTC, datetime
from types import SimpleNamespace

import httpx

from common import DATA_DIR

FPL = "https://fantasy.premierleague.com/api"
FORMAT_VERSION = 1
HORIZON = 6  # GWs from the first unfinished one; the model's MAX_LEAD is 5 GWs ahead


def season_of(boot: dict) -> int:
    return int(boot["events"][0]["deadline_time"][:4])


def final_gw(boot: dict) -> int:
    """Latest GW whose results and bonus are final (data_checked), 0 before GW1 is."""
    return max((e["id"] for e in boot["events"] if e["finished"] and e["data_checked"]), default=0)


def check(url: str) -> bool:
    """True if FPL has a finished GW newer than the published file (or nothing is published)."""
    boot = httpx.get(f"{FPL}/bootstrap-static/", timeout=30).raise_for_status().json()
    target = (season_of(boot), final_gw(boot))
    if target[1] == 0 or target[1] == len(boot["events"]):
        print(f"nothing to project (season {target[0]}, last final GW {target[1]})")
        return False
    r = httpx.get(url, timeout=30, follow_redirects=True)
    if r.status_code == 404:
        print("no published projections yet")
        return True
    published = r.raise_for_status().json()
    current = (published.get("season"), published.get("last_finished_gw"))
    print(f"published: season {current[0]} GW{current[1]}; FPL: season {target[0]} GW{target[1]}")
    return current != target


def build() -> dict:
    # Imported here so --check runs without pandas/scikit-learn installed
    from points_model import Projector

    boot = json.loads((DATA_DIR / "bootstrap.json").read_text())
    live = json.loads((DATA_DIR / "live.json").read_text())
    last_finished = max(map(int, live), default=0)
    if last_finished == 0:
        raise SystemExit("no finished GW yet: the model needs this season's match logs")
    if last_finished != final_gw(boot):
        # fetch_data.py takes every finished GW; a GW finished but not yet data_checked
        # may still lack bonus, and would be labelled as the final one below
        raise SystemExit(f"GW{last_finished} is finished but not data_checked yet; re-run once it is")
    next_gw = last_finished + 1
    gws = [g for g in range(next_gw, next_gw + HORIZON) if g <= len(boot["events"])]
    if not gws:
        raise SystemExit("season is over")

    proj = Projector(SimpleNamespace(boot=boot, next_gw=next_gw), horizon=len(gws))
    players = {}
    for e in boot["elements"]:
        pts = [round(proj.expected(e["id"], g), 2) for g in gws]
        if any(pts):
            players[str(e["id"])] = pts
    return {
        "version": FORMAT_VERSION,
        "season": season_of(boot),
        "generated_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "last_finished_gw": last_finished,
        "gws": gws,
        "players": players,
    }


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    mode = ap.add_mutually_exclusive_group(required=True)
    mode.add_argument("--out", help="where to write the projections JSON")
    mode.add_argument("--check", metavar="URL", help="currently published projections; sets stale=true|false")
    args = ap.parse_args()

    if args.check:
        stale = check(args.check)
        print(f"stale={str(stale).lower()}")
        if "GITHUB_OUTPUT" in os.environ:
            with open(os.environ["GITHUB_OUTPUT"], "a") as f:
                f.write(f"stale={str(stale).lower()}\n")
    else:
        out = build()
        with open(args.out, "w") as f:
            json.dump(out, f, separators=(",", ":"))
        print(f"wrote {len(out['players'])} players x GW{out['gws'][0]}-{out['gws'][-1]} to {args.out}")
