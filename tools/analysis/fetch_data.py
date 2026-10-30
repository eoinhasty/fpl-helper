"""Download everything the analysis tools need into ./data.

    python fetch_data.py --entry 220253
    python fetch_data.py                  # no entry: enough for publish_projections.py, not solver.py
"""
import argparse
import asyncio
import json
from pathlib import Path

import httpx

FPL = "https://fantasy.premierleague.com/api"
DATA_DIR = Path(__file__).parent / "data"
POOL_MIN_MINUTES = 180


async def get(client: httpx.AsyncClient, sem: asyncio.Semaphore, path: str):
    async with sem:
        for attempt in range(4):
            try:
                r = await client.get(f"{FPL}/{path}")
                r.raise_for_status()
                return r.json()
            except (httpx.HTTPError, ValueError):
                if attempt == 3:
                    raise
                await asyncio.sleep(2**attempt)


async def main(entry_id: int | None) -> None:
    DATA_DIR.mkdir(exist_ok=True)
    sem = asyncio.Semaphore(6)
    async with httpx.AsyncClient(timeout=30) as client:
        boot, fixtures = await asyncio.gather(get(client, sem, "bootstrap-static/"), get(client, sem, "fixtures/"))
        finished = [e["id"] for e in boot["events"] if e["finished"]]
        live_list = await asyncio.gather(*[get(client, sem, f"event/{gw}/live/") for gw in finished])
        entry = None
        if entry_id is not None:
            current = next((e["id"] for e in boot["events"] if e["is_current"]), finished[-1])
            history, transfers, picks = await asyncio.gather(
                get(client, sem, f"entry/{entry_id}/history/"),
                get(client, sem, f"entry/{entry_id}/transfers/"),
                get(client, sem, f"entry/{entry_id}/event/{current}/picks/"),
            )
            entry = {"id": entry_id, "history": history, "transfers": transfers, "picks": picks, "picks_gw": current}

        squad = {p["element"] for p in entry["picks"]["picks"]} if entry else set()
        everyone = [e["id"] for e in boot["elements"]]
        summaries = dict(zip(everyone, await asyncio.gather(*[get(client, sem, f"element-summary/{pid}/") for pid in everyone])))
        pool = [e["id"] for e in boot["elements"] if e["minutes"] >= POOL_MIN_MINUTES or e["id"] in squad]

    files = {
        "bootstrap.json": boot,
        "fixtures.json": fixtures,
        "live.json": dict(zip(map(str, finished), live_list)),
        "history_past.json": {str(pid): summaries[pid]["history_past"] for pid in pool},
        "season_gws.json": [row for pid in everyone for row in summaries[pid]["history"]],  # per-fixture rows, this season
    }
    if entry:
        files["entry.json"] = entry
    for name, payload in files.items():
        (DATA_DIR / name).write_text(json.dumps(payload))
    saved_entry = f" and entry {entry_id}" if entry else ""
    print(f"Saved GW1-{finished[-1]} data, {len(everyone)} players' match logs, {len(pool)} player histories{saved_entry} to {DATA_DIR}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--entry", type=int, help="FPL entry (team) ID; needed by solver.py, not by the projections")
    asyncio.run(main(ap.parse_args().entry))
