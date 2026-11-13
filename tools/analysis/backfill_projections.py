"""Rebuild this season's per-GW projection files for GWs that were never archived.

The Projections workflow keeps each GW's file (projections-{season}-gw{N}.json) from
2026-11-13 on; earlier ones were overwritten or never published. This retrains the
model as publish_projections.py would have after each earlier GW finished, on past
seasons plus this season's GWs before the origin, and writes the same format with
"backfilled": true. Each player is projected at his club, price and ownership as of
the origin's deadline (from this season's match logs, as export_walkforward.py does),
not today's bootstrap. Not identical to what was live: today's code and fixture list
(a since-rescheduled game moves), and this season's stats as FPL reports them now.

Run after fetch_history.py and fetch_data.py; about a minute of training per GW:

    python backfill_projections.py 2 10 --out-dir data/backfill
"""
import argparse
import json
from datetime import UTC, datetime
from pathlib import Path

import history
import points_model as pm
from features import MAX_LEAD, FeatureBuilder, player_state
from publish_projections import FORMAT_VERSION, HORIZON


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("first", type=int, help="first GW projected (the file's gws[0]); at least 2")
    ap.add_argument("last", type=int, help="last GW projected; must already be played")
    ap.add_argument("--out-dir", required=True)
    args = ap.parse_args()

    matches, schedule, season = history.load()
    played = int(matches.loc[matches["season"] == season, "gw"].max())
    if not 2 <= args.first <= args.last <= played:
        raise SystemExit(f"GWs must be 2..{played} (GW1 had no finished GW to train on)")
    fb = FeatureBuilder(matches)
    seasons = sorted(matches["season"].unique())
    n_gws = int(schedule.loc[schedule["season"] == season, "gw"].max())
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    for origin in range(args.first, args.last + 1):
        model = pm.fit(pm.training_table(fb, seasons, last_gw={season: origin}))
        gws = list(range(origin, min(origin + HORIZON, n_gws + 1)))
        state = player_state(fb.pg, fb.ls, season, origin)
        roster = state[["code", "team", "price", "sel_pct", "pos", "element"]]
        rows = fb.live_rows(season, origin, schedule, roster, len(gws))
        rows["lead"] = rows["lead"].clip(upper=MAX_LEAD)
        rows["pred"] = pm.predict(model, rows)
        pts = rows.groupby(["element", "gw"])["pred"].sum().unstack("gw").reindex(columns=gws).fillna(0.0)
        players = {}
        for element, r in pts.iterrows():
            row = [round(float(p), 2) for p in r]
            if any(row):
                players[str(int(element))] = row
        doc = {
            "version": FORMAT_VERSION,
            "season": season,
            "generated_at": datetime.now(UTC).isoformat(timespec="seconds"),
            "last_finished_gw": origin - 1,
            "gws": gws,
            "players": players,
            "backfilled": True,
        }
        path = out_dir / f"projections-{season}-gw{origin}.json"
        path.write_text(json.dumps(doc, separators=(",", ":")))
        print(f"wrote {len(players)} players x GW{gws[0]}-{gws[-1]} to {path}", flush=True)


if __name__ == "__main__":
    main()
