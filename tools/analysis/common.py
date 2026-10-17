import json
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

DATA_DIR = Path(__file__).parent / "data"
POS = {1: "GK", 2: "DEF", 3: "MID", 4: "FWD"}
GOAL_PTS = {1: 6, 2: 6, 3: 5, 4: 4}
CS_PTS = {1: 4, 2: 4, 3: 1, 4: 0}
DC_THRESHOLD = {2: 10, 3: 12, 4: 12}
MAX_FT = 5


@dataclass
class SquadState:
    squad: list
    bank: int
    sell_price: dict
    free_transfers: int
    chips_used: list


class Data:
    def __init__(self, data_dir: Path = DATA_DIR):
        def load(name):
            path = data_dir / name
            if not path.exists():
                raise SystemExit(f"{path} missing — run fetch_data.py --entry <id> first")
            return json.loads(path.read_text())

        self.boot = load("bootstrap.json")
        self.fixtures = load("fixtures.json")
        self.live = {int(k): v for k, v in load("live.json").items()}
        self.history_past = {int(k): v for k, v in load("history_past.json").items()}
        self.entry = load("entry.json")

        self.els = {e["id"]: e for e in self.boot["elements"]}
        self.team_name = {t["id"]: t["short_name"] for t in self.boot["teams"]}
        self.fixture_by_id = {f["id"]: f for f in self.fixtures}
        self.fixtures_by_gw = defaultdict(list)
        for f in self.fixtures:
            if f["event"]:
                self.fixtures_by_gw[f["event"]].append(f)
        self.last_finished = max(self.live)
        self.next_gw = self.last_finished + 1

        # (player, gw) -> that GW's stats plus the fixture id they came from
        self.games = {}
        for gw, d in self.live.items():
            for x in d["elements"]:
                fid = x["explain"][0]["fixture"] if x["explain"] else None
                self.games[(x["id"], gw)] = dict(x["stats"], fixture=fid)

    def find(self, name: str) -> int:
        """Resolve a web_name, or 'Name:TEAM' when the name is ambiguous."""
        web, _, team = name.partition(":")
        hits = [
            e["id"]
            for e in self.boot["elements"]
            if e["web_name"].lower() == web.lower() and (not team or self.team_name[e["team"]].lower() == team.lower())
        ]
        if len(hits) != 1:
            raise SystemExit(f"'{name}' matches {len(hits)} players — use Name:TEAM (e.g. King:FUL)")
        return hits[0]

    def label(self, pid: int) -> str:
        e = self.els[pid]
        return f"{e['web_name']} ({self.team_name[e['team']]})"

    def squad_state(self) -> SquadState:
        picks = self.entry["picks"]
        squad = [p["element"] for p in picks["picks"]]
        bank = picks["entry_history"]["bank"]

        bought = {}
        for t in sorted(self.entry["transfers"], key=lambda t: t["time"]):
            bought[t["element_in"]] = t["element_in_cost"]

        def sell(pid):
            e = self.els[pid]
            now = e["now_cost"]
            paid = bought.get(pid, now - e["cost_change_start"])
            return now if now <= paid else paid + (now - paid) // 2

        # One FT per GW from GW2, max 5 banked; wildcard/free hit weeks keep them.
        chips = {c["event"]: c["name"] for c in self.entry["history"]["chips"]}
        ft = 1
        for h in self.entry["history"]["current"]:
            if h["event"] < 2:
                continue
            if chips.get(h["event"]) in ("wildcard", "freehit"):
                ft = min(MAX_FT, ft + 1)
            else:
                ft = min(MAX_FT, max(ft - h["event_transfers"], 0) + 1)

        return SquadState(
            squad=squad,
            bank=bank,
            sell_price={pid: sell(pid) for pid in squad},
            free_transfers=ft,
            chips_used=[(c["name"], c["event"]) for c in self.entry["history"]["chips"]],
        )
