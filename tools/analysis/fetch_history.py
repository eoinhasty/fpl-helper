"""Download per-gameweek FPL history for past seasons.

Source: github.com/vaastav/Fantasy-Premier-League (MIT licence), which archives
the official FPL API every gameweek. Files land in data/history/<season>/.

    python fetch_history.py                  # default seasons
    python fetch_history.py 2024-25 2025-26
"""
import sys

import httpx

from common import DATA_DIR

BASE = "https://raw.githubusercontent.com/vaastav/Fantasy-Premier-League/master/data"
SEASONS = ["2022-23", "2023-24", "2024-25", "2025-26"]  # xG data starts 2022-23; this season comes from fetch_data.py
FILES = ["gws/merged_gw.csv", "players_raw.csv", "teams.csv", "fixtures.csv"]


def main(seasons: list) -> None:
    with httpx.Client(timeout=120, follow_redirects=True) as client:
        for season in seasons:
            out = DATA_DIR / "history" / season
            out.mkdir(parents=True, exist_ok=True)
            for f in FILES:
                r = client.get(f"{BASE}/{season}/{f}")
                r.raise_for_status()
                (out / f.split("/")[-1]).write_bytes(r.content)
            print(f"{season}: saved {', '.join(f.split('/')[-1] for f in FILES)}")


if __name__ == "__main__":
    main(sys.argv[1:] or SEASONS)
