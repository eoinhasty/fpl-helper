# service.py
from __future__ import annotations
import os
import asyncio
import hashlib
import logging
from collections import defaultdict
from typing import Any, Dict, Optional, Tuple, List
import httpx
from fastapi import HTTPException
from datetime import datetime, timezone
from app.simple_cache import AsyncCache

logger = logging.getLogger("uvicorn.error")

FPL_BASE = "https://fantasy.premierleague.com/api"

# ---- TTL policy  ----
TTL_BOOTSTRAP = 6 * 60 * 60  # 6h fresh
SWR_BOOTSTRAP = 12 * 60 * 60  # +12h stale
TTL_FIXTURES = 24 * 60 * 60  # 24h fresh
SWR_FIXTURES = 7 * 24 * 60 * 60  # +7d stale
TTL_PICKS = 60  # 60s fresh
SWR_PICKS = 5 * 60  # +5m
TTL_MYTEAM = 30  # 30s fresh
SWR_MYTEAM = 2 * 60  # +2m
TTL_ENTRY = 60 * 60  # 1h
SWR_ENTRY = 6 * 60 * 60  # +6h
TTL_ENTRY_HIST = 15 * 60  # 15m
SWR_ENTRY_HIST = 2 * 60 * 60  # +2h
TTL_NEXTMATCH = 5 * 60  # 5m fresh (fixtures change rarely but scorelines can)
SWR_NEXTMATCH = 30 * 60
TTL_NEWS = 30 * 60  # 30m fresh
SWR_NEWS = 6 * 60 * 60
TTL_STANDINGS = 60 * 60  # 1h fresh
SWR_STANDINGS = 6 * 60 * 60
TTL_FDR = 60 * 60  # 1h fresh
SWR_FDR = 24 * 60 * 60  # +24h stale
TTL_PLAYERS = 30 * 60  # 30m fresh
SWR_PLAYERS = 6 * 60 * 60  # +6h stale
TTL_PLAYER_SUMMARY = 24 * 60 * 60  # 24h fresh
SWR_PLAYER_SUMMARY = 7 * 24 * 60 * 60  # +7d stale


def _ua() -> Dict[str, str]:
    return {"User-Agent": "Personal FPL Helper"}


def _auth_headers_from(token: Optional[str]) -> Dict[str, str]:
    if not token:
        raise HTTPException(
            401, detail="Not authenticated. Please log in to view live data."
        )
    return {"X-Api-Authorization": token}


class FPLService:
    def __init__(self) -> None:
        self.public = httpx.AsyncClient(base_url=FPL_BASE, headers=_ua(), timeout=20.0)
        self.cache = AsyncCache()
        # _position_ranks/_transfer_ranks are pure functions of `boot`, which only
        # changes when the bootstrap cache actually refetches — cache by object
        # identity so repeated squad/live requests within the same 6h window don't
        # redo the same sort on every load.
        self._rank_cache_boot_id: Optional[int] = None
        self._rank_cache: Optional[Tuple[dict, dict]] = None

    async def _get_json_auth(
        self, path: str, token: Optional[str], params: Optional[dict] = None
    ) -> Any:
        r = await self.public.get(
            path, params=params, headers=_auth_headers_from(token)
        )
        if r.status_code in (401, 403):
            raise HTTPException(
                r.status_code,
                detail="Your FPL session has expired. Please log in again.",
            )
        r.raise_for_status()
        return r.json()

    async def close(self):
        await self.cache.close()
        await self.public.aclose()

    # ----------- low-level GET with polite backoff -----------
    async def _get_json(self, path: str, params: Optional[dict] = None) -> Any:
        attempt = 0
        while True:
            r = await self.public.get(path, params=params)
            if r.status_code == 429 or 500 <= r.status_code < 600:
                attempt += 1
                if attempt > 4:
                    r.raise_for_status()
                ra = r.headers.get("Retry-After")
                try:
                    delay = min(float(ra), 60) if ra else (0.6 * (2 ** (attempt - 1)))
                except ValueError:
                    delay = 0.6 * (2 ** (attempt - 1))
                await asyncio.sleep(delay)
                continue
            r.raise_for_status()
            return r.json()

    # ------------- cached helpers -------------
    async def bootstrap(self) -> Tuple[dict, str, float]:
        key = "bootstrap"
        return await self.cache.get_or_set(
            key,
            lambda: self._get_json("/bootstrap-static/"),
            TTL_BOOTSTRAP,
            SWR_BOOTSTRAP,
        )

    async def fixtures(self, gw: Optional[int]) -> Tuple[list, str, float]:
        key = f"fixtures:{gw or 'all'}"
        return await self.cache.get_or_set(
            key,
            lambda: self._get_json("/fixtures/", params={"event": gw} if gw else None),
            TTL_FIXTURES,
            SWR_FIXTURES,
        )

    async def fdr_grid(self, horizon: int) -> Tuple[dict, str, float]:
        key = f"fdr:{horizon}"

        async def _fetch():
            boot, _, _ = await self.bootstrap()
            events = boot["events"]
            teams = boot["teams"]
            team_names = {t["id"]: t for t in teams}

            base_event = next((e for e in events if e["is_next"]), None) or next(
                (e for e in events if e["is_current"]), None
            )
            base_gw = base_event["id"] if base_event else 1
            gw_ids = list(range(base_gw, min(base_gw + horizon, 39)))

            fixtures, _, _ = await self.fixtures(None)
            grid: Dict[int, Dict[int, list]] = {
                t["id"]: {g: [] for g in gw_ids} for t in teams
            }
            for fx in fixtures:
                ev = fx.get("event")
                if ev not in gw_ids:
                    continue
                h, a = fx["team_h"], fx["team_a"]
                if h in grid:
                    grid[h][ev].append(
                        {
                            "opp": team_names[a]["short_name"],
                            "home": True,
                            "difficulty": fx["team_h_difficulty"],
                            "kickoff": fx.get("kickoff_time"),
                        }
                    )
                if a in grid:
                    grid[a][ev].append(
                        {
                            "opp": team_names[h]["short_name"],
                            "home": False,
                            "difficulty": fx["team_a_difficulty"],
                            "kickoff": fx.get("kickoff_time"),
                        }
                    )

            gw_meta = [
                {
                    "id": g,
                    "name": next(
                        (e["name"] for e in events if e["id"] == g), f"Gameweek {g}"
                    ),
                    "deadline": next(
                        (e["deadline_time"] for e in events if e["id"] == g), None
                    ),
                }
                for g in gw_ids
            ]

            team_rows = []
            for t in teams:
                tid = t["id"]
                gws = [grid[tid][g] for g in gw_ids]
                diffs = [f["difficulty"] for gw_fixtures in gws for f in gw_fixtures]
                fixture_count = len(diffs)
                avg_difficulty = (
                    round(sum(diffs) / fixture_count, 2) if fixture_count else None
                )
                team_rows.append(
                    {
                        "id": tid,
                        "name": t["name"],
                        "short_name": t["short_name"],
                        "code": t["code"],
                        "badge_url": f"https://resources.premierleague.com/premierleague/badges/50/t{t['code']}.png",
                        "gws": gws,
                        "avg_difficulty": avg_difficulty,
                        "fixture_count": fixture_count,
                    }
                )

            return {"base_gw": base_gw, "gws": gw_meta, "teams": team_rows}

        return await self.cache.get_or_set(key, _fetch, TTL_FDR, SWR_FDR)

    @staticmethod
    def _upcoming_by_team(
        boot: dict, fixtures: list, n_fixtures: int = 3
    ) -> Dict[int, List[dict]]:
        """Next n_fixtures per team (FixtureLite shape), from the current/next GW onward."""
        events = boot["events"]
        teams = {t["id"]: t for t in boot["teams"]}
        base_event = next((e for e in events if e["is_next"]), None) or next(
            (e for e in events if e["is_current"]), None
        )
        base_gw = base_event["id"] if base_event else 1

        by_team: Dict[int, List[dict]] = defaultdict(list)
        for fx in fixtures:
            ev = fx.get("event")
            if ev is None or ev < base_gw:
                continue
            h, a = fx["team_h"], fx["team_a"]
            if h in teams:
                by_team[h].append(
                    {
                        "opp": teams[a]["short_name"],
                        "home": True,
                        "difficulty": fx["team_h_difficulty"],
                        "kickoff": fx.get("kickoff_time"),
                    }
                )
            if a in teams:
                by_team[a].append(
                    {
                        "opp": teams[h]["short_name"],
                        "home": False,
                        "difficulty": fx["team_a_difficulty"],
                        "kickoff": fx.get("kickoff_time"),
                    }
                )

        for tid in by_team:
            by_team[tid].sort(key=lambda f: f.get("kickoff") or "")
            by_team[tid] = by_team[tid][:n_fixtures]

        return by_team

    async def player_pool(self) -> Tuple[dict, str, float]:
        key = "playerpool"

        async def _fetch():
            boot, _, _ = await self.bootstrap()
            fixtures_data, _, _ = await self.fixtures(None)
            teams = {t["id"]: t for t in boot["teams"]}
            upcoming = self._upcoming_by_team(boot, fixtures_data, 3)
            positions = {1: "GK", 2: "DEF", 3: "MID", 4: "FWD"}

            players = []
            for p in boot["elements"]:
                # status "u" = unavailable for the club they're listed under —
                # permanently transferred out, out on loan elsewhere, or a departed
                # free agent. FPL keeps them in bootstrap-static regardless, but
                # they can't meaningfully be drafted.
                if p.get("status") == "u":
                    continue
                t = teams.get(p.get("team", 0), {})
                team_code = t.get("code")
                is_gk = p.get("element_type") == 1
                suffix = "_1" if is_gk else ""
                shirt_url = (
                    f"https://fantasy.premierleague.com/dist/img/shirts/standard/shirt_{team_code}{suffix}-220.webp"
                    if team_code
                    else None
                )
                full_name = (
                    f"{p.get('first_name', '')} {p.get('second_name', '')}".strip()
                )
                raw = {
                    "id": p["id"],
                    "code": p.get("code"),
                    "web_name": p.get("web_name"),
                    "full_name": full_name or None,
                    "team": p.get("team"),
                    "team_short": t.get("short_name"),
                    "position": positions.get(p.get("element_type")),
                    "now_cost": p.get("now_cost"),
                    "selected_by_percent": p.get("selected_by_percent"),
                    "status": p.get("status"),
                    "news": p.get("news") or None,
                    "ep_next": p.get("ep_next"),
                    "total_points": p.get("total_points"),
                    "form": p.get("form"),
                    "penalties_order": p.get("penalties_order"),
                    "corners_order": p.get("corners_and_indirect_freekicks_order"),
                    "freekicks_order": p.get("direct_freekicks_order"),
                    "shirt_url": shirt_url,
                    "fixtures": upcoming.get(p.get("team"), []),
                }
                players.append(
                    {
                        k: v
                        for k, v in raw.items()
                        if v is not None and v != "" and v != []
                    }
                )

            team_rows = [
                {"id": t["id"], "name": t["name"], "short_name": t["short_name"]}
                for t in boot["teams"]
            ]

            return {"count": len(players), "teams": team_rows, "players": players}

        return await self.cache.get_or_set(key, _fetch, TTL_PLAYERS, SWR_PLAYERS)

    async def player_summary(self, player_id: int) -> Tuple[dict, str, float]:
        key = f"elsum:{player_id}"
        fetch = lambda: self._get_json(f"/element-summary/{player_id}/")
        return await self.cache.get_or_set(
            key, fetch, TTL_PLAYER_SUMMARY, SWR_PLAYER_SUMMARY
        )

    async def picks(
        self, entry_id: int, gw: int, *, no_cache: bool = False
    ) -> Tuple[dict, str, float]:
        key = f"picks:{entry_id}:{gw}"
        fetch = lambda: self._get_json(f"/entry/{entry_id}/event/{gw}/picks/")
        if no_cache:
            return await self.cache.refresh(key, fetch, TTL_PICKS, SWR_PICKS)
        return await self.cache.get_or_set(key, fetch, TTL_PICKS, SWR_PICKS)

    async def my_team(
        self, entry_id: int, *, token: Optional[str] = None, no_cache: bool = False
    ) -> Tuple[dict, str, float]:
        token_hash = hashlib.sha256((token or "").encode()).hexdigest()[:16]
        key = f"myteam:{entry_id}:{token_hash}"
        fetch = lambda: self._get_json_auth(f"/my-team/{entry_id}/", token)
        if no_cache:
            return await self.cache.refresh(key, fetch, TTL_MYTEAM, SWR_MYTEAM)
        return await self.cache.get_or_set(key, fetch, TTL_MYTEAM, SWR_MYTEAM)

    async def entry(self, entry_id: int) -> Tuple[dict, str, float]:
        key = f"entry:{entry_id}"
        fetch = lambda: self._get_json(f"/entry/{entry_id}/")
        return await self.cache.get_or_set(key, fetch, TTL_ENTRY, SWR_ENTRY)

    async def entry_history(self, entry_id: int) -> Tuple[dict, str, float]:
        key = f"entryhist:{entry_id}"
        fetch = lambda: self._get_json(f"/entry/{entry_id}/history/")
        return await self.cache.get_or_set(key, fetch, TTL_ENTRY_HIST, SWR_ENTRY_HIST)

    async def next_match_and_gw(self) -> tuple[dict, list[dict], int]:
        # pick next event (else current), then earliest kickoff fixture
        boot, _, _ = await self.bootstrap()
        events = boot["events"]
        ev = next((e for e in events if e["is_next"]), None) or next(
            (e for e in events if e["is_current"]), None
        )
        if ev is None:
            raise HTTPException(
                status_code=404, detail="No current or next gameweek found."
            )
        gw = ev["id"]
        fixtures, _, _ = await self.fixtures(gw)
        fixtures = [f for f in fixtures if f.get("kickoff_time")]
        fixtures.sort(key=lambda f: f["kickoff_time"])
        first = fixtures[0] if fixtures else {}
        return first, fixtures, gw

    async def hot_news(self, days: int, limit: int) -> list[dict]:
        boot, _, _ = await self.bootstrap()
        teams = {t["id"]: t for t in boot["teams"]}
        out = []
        now = datetime.now(timezone.utc)
        for p in boot["elements"]:
            news = (p.get("news") or "").strip()
            if not news:
                continue
            added = p.get("news_added")
            recent = True
            if added:
                try:
                    dt = datetime.fromisoformat(added.replace("Z", "+00:00"))
                    recent = (now - dt).days <= days
                except Exception:
                    pass
            if not recent:
                continue
            t = teams.get(p["team"])
            team_code = t.get("code") if t else None
            out.append(
                {
                    "id": p["id"],
                    "name": p["web_name"],
                    "team": t["short_name"] if t else None,
                    "badge_url": f"https://resources.premierleague.com/premierleague/badges/50/t{team_code}.png"
                    if team_code
                    else None,
                    "position": p["element_type"],
                    "news": news,
                    "news_added": added,
                    "status": p["status"],
                    "start_probability": self.start_prob_from(p),
                }
            )
        # simple relevance: newest first, then “injury/transfer” hints first
        pri = lambda n: (
            ("injury" in n["news"].lower()) or ("transfer" in n["news"].lower())
        )
        out.sort(key=lambda x: (pri(x), x["news_added"] or ""), reverse=True)
        return out[: max(1, limit)]

    async def standings_pl(self, token: str | None) -> dict:
        """
        Option A: real Premier League table via football-data.org (needs API key).
        Option B: stub data if no key (so the card still renders).
        """
        if token:
            r = await self.public.get(
                "https://api.football-data.org/v4/competitions/PL/standings",
                headers={"X-Auth-Token": token, **_ua()},
            )
            r.raise_for_status()
            logger.info("Fetched real PL standings from football-data.org")
            js = r.json()
            # shape to a compact table
            standing = next((s for s in js["standings"] if s["type"] == "TOTAL"), None)
            if not standing:
                raise HTTPException(
                    status_code=502,
                    detail="Unexpected standings shape from football-data.org",
                )
            table = standing["table"]

            # football-data.org rolls its "current season" pointer over to the
            # new season months before a ball is kicked, but the standings
            # table itself keeps showing the just-finished season's final
            # table (full playedGames counts) until matchday 1 is played. Flag
            # that case so the UI can label it instead of presenting a stale
            # table as if it were live.
            season_start = js.get("season", {}).get("startDate")
            is_previous_season_table = False
            if season_start:
                start_date = datetime.fromisoformat(season_start).replace(
                    tzinfo=timezone.utc
                )
                is_previous_season_table = datetime.now(timezone.utc) < start_date

            return {
                "source": "football-data.org",
                "season_start_date": season_start,
                "is_previous_season_table": is_previous_season_table,
                "rows": [
                    {
                        "pos": row["position"],
                        "team": row["team"]["shortName"] or row["team"]["name"],
                        "crest": row["team"].get("crest"),
                        "played": row["playedGames"],
                        "w": row["won"],
                        "d": row["draw"],
                        "l": row["lost"],
                        "gf": row["goalsFor"],
                        "ga": row["goalsAgainst"],
                        "pts": row["points"],
                    }
                    for row in table
                ],
            }
        # Fallback stub
        return {
            "source": "stub",
            "rows": [
                {
                    "pos": 1,
                    "team": "Man City",
                    "played": 18,
                    "w": 14,
                    "d": 2,
                    "l": 2,
                    "gf": 43,
                    "ga": 15,
                    "pts": 44,
                },
                {
                    "pos": 2,
                    "team": "Arsenal",
                    "played": 18,
                    "w": 13,
                    "d": 4,
                    "l": 1,
                    "gf": 38,
                    "ga": 12,
                    "pts": 43,
                },
                {
                    "pos": 3,
                    "team": "Liverpool",
                    "played": 18,
                    "w": 12,
                    "d": 5,
                    "l": 1,
                    "gf": 41,
                    "ga": 17,
                    "pts": 41,
                },
            ],
        }

    async def live_event(
        self, gw: int, ttl: float = TTL_PICKS, stale_ttl: float = SWR_PICKS
    ) -> Tuple[dict, str, float]:
        # ttl/stale_ttl are overridable so Live mode (genuinely time-sensitive
        # scoring) can poll tighter than a historical squad view of a finished
        # GW, which never needs to re-check this often.
        key = f"live:{gw}"
        return await self.cache.get_or_set(
            key,
            lambda: self._get_json(f"/event/{gw}/live/"),
            ttl,
            stale_ttl,
        )

    # ----------------- utilities for shaping data -----------------
    @staticmethod
    def season_status(events: list) -> str:
        """'in_season' once any GW is current or finished; 'pre_season' otherwise
        (covers FPL's summer window where is_current/is_next can both be false)."""
        for e in events:
            if e.get("is_current") or e.get("finished"):
                return "in_season"
        return "pre_season"

    @staticmethod
    def start_prob_from(player: dict, played_gws: int = 1) -> float:
        status = player.get("status", "a")
        news = (player.get("news") or "").lower()

        # Heuristic: status base blended with actual play-time ratio to catch rotation risk
        status_base = {"a": 0.88, "d": 0.55, "i": 0.0, "s": 0.0, "n": 0.0}.get(
            status, 0.5
        )
        minutes = player.get("minutes", 0)
        if status == "a" and played_gws > 0 and minutes > 0:
            time_ratio = min(minutes / (played_gws * 90), 0.99)
            base = (status_base + time_ratio) / 2
        else:
            base = status_base

        if any(k in news for k in ["ruled out", "surgery", "setback"]):
            base *= 0.2
        elif any(k in news for k in ["doubt", "late test", "assess"]):
            base *= 0.7
        elif any(
            k in news for k in ["back in training", "available", "returned", "fit"]
        ):
            base = max(base, 0.9)

        # FPL's chance field reflects availability, not starting likelihood — use as a multiplier
        chance = player.get("chance_of_playing_next_round")
        if chance is not None:
            base *= chance / 100

        return round(max(0.0, min(0.99, base)), 2)

    @staticmethod
    def _position_ranks(boot: dict) -> dict:
        """Compute within-position stat ranks for active players (minutes > 0)."""

        by_pos: dict = defaultdict(list)
        for p in boot.get("elements", []):
            if (p.get("minutes") or 0) > 0:
                by_pos[p["element_type"]].append(p)

        result: dict = {}
        for group in by_pos.values():
            n = len(group)
            if n == 0:
                continue

            def rank_by(stat_fn, key: str, grp=group, total=n):
                for i, p in enumerate(sorted(grp, key=stat_fn, reverse=True)):
                    r = i + 1
                    pct = round((1 - (r - 1) / total) * 100) if total > 1 else 100
                    result.setdefault(p["id"], {})[key] = {
                        "rank": r,
                        "of": total,
                        "pct": pct,
                    }

            rank_by(lambda p: p.get("goals_scored") or 0, "goals")
            rank_by(lambda p: p.get("assists") or 0, "assists")
            rank_by(lambda p: p.get("clean_sheets") or 0, "clean_sheets")
            rank_by(lambda p: p.get("saves") or 0, "saves")
            rank_by(lambda p: float(p.get("points_per_game") or 0), "ppg")

        return result

    @staticmethod
    def _transfer_ranks(boot: dict) -> dict:
        """Compute within-position rank by net transfers (in - out) for the current GW."""

        by_pos: dict = defaultdict(list)
        for p in boot.get("elements", []):
            by_pos[p["element_type"]].append(p)

        result: dict = {}
        for group in by_pos.values():
            n = len(group)

            def net(p: dict) -> int:
                return (p.get("transfers_in_event") or 0) - (
                    p.get("transfers_out_event") or 0
                )

            for i, p in enumerate(sorted(group, key=net, reverse=True)):
                result[p["id"]] = {"rank": i + 1, "of": n}

        return result

    def _cached_ranks(self, boot: dict) -> Tuple[dict, dict]:
        boot_id = id(boot)
        if self._rank_cache_boot_id != boot_id:
            self._rank_cache = (
                FPLService._position_ranks(boot),
                FPLService._transfer_ranks(boot),
            )
            self._rank_cache_boot_id = boot_id
        return self._rank_cache

    def enrich_picks(
        self, picks: dict, boot: dict, fixtures: list, live: dict
    ) -> Tuple[List[dict], Optional[int], Optional[int]]:

        live_points = {
            e["id"]: (e.get("stats") or {}).get("total_points", 0)
            for e in (live.get("elements") or [])
        }

        played_gws = max(1, sum(1 for e in boot.get("events", []) if e.get("finished")))

        players = {p["id"]: p for p in boot["elements"]}
        teams = {t["id"]: t for t in boot["teams"]}
        pos_ranks, transfer_ranks = self._cached_ranks(boot)

        fdr_by_team: Dict[int, list] = {}
        for fx in fixtures:
            h, a = fx["team_h"], fx["team_a"]
            fdr_by_team.setdefault(h, []).append(
                {
                    "opp": teams[a]["short_name"],
                    "home": True,
                    "difficulty": fx["team_h_difficulty"],
                    "kickoff": fx["kickoff_time"],
                }
            )
            fdr_by_team.setdefault(a, []).append(
                {
                    "opp": teams[h]["short_name"],
                    "home": False,
                    "difficulty": fx["team_a_difficulty"],
                    "kickoff": fx["kickoff_time"],
                }
            )

        enriched = []
        for pick in picks.get("picks", []):
            el = pick["element"]
            p = players.get(el, {})
            t = teams.get(p.get("team", 0), {})
            team_fixtures = fdr_by_team.get(p.get("team", 0), [])
            fdr = team_fixtures[0] if team_fixtures else None
            team_code = t.get("code")
            is_gk = p.get("element_type") == 1
            suffix = "_1" if is_gk else ""
            shirt_url = (
                f"https://fantasy.premierleague.com/dist/img/shirts/standard/shirt_{team_code}{suffix}-220.webp"
                if team_code
                else None
            )
            enriched.append(
                {
                    "element": el,
                    "name": p.get("web_name"),
                    "team": t.get("short_name"),
                    "team_id": p.get("team"),
                    "position": p.get("element_type"),  # 1=GK, 2=DEF, 3=MID, 4=FWD
                    "price": p.get("now_cost"),  # 0.1m units (125 = £12.5m)
                    "status": p.get("status"),  # "a", "d", "i", "s", "n"
                    "news": p.get("news"),
                    "total_points": p.get("total_points"),
                    "gw_points": live_points.get(el),
                    "selected_by_percent": p.get("selected_by_percent"),
                    "start_probability": FPLService.start_prob_from(p, played_gws),
                    "form": p.get("form"),
                    "ict_index": p.get("ict_index"),
                    "minutes": p.get("minutes"),
                    "ep_next": p.get("ep_next"),
                    "points_per_game": p.get("points_per_game"),
                    "goals_scored": p.get("goals_scored"),
                    "assists": p.get("assists"),
                    "clean_sheets": p.get("clean_sheets"),
                    "saves": p.get("saves"),
                    "bonus": p.get("bonus"),
                    "transfers_in_event": p.get("transfers_in_event"),
                    "transfers_out_event": p.get("transfers_out_event"),
                    "cost_change_start": p.get("cost_change_start"),  # 0.1m units
                    "is_captain": pick.get("is_captain"),
                    "is_vice_captain": pick.get("is_vice_captain"),
                    "fixture": fdr,
                    "has_dgw": len(team_fixtures) > 1,
                    "fixtures": team_fixtures,
                    "slot": pick.get(
                        "position"
                    ),  # squad slot 1-15 (starting 1-11, bench 12-15)
                    "multiplier": pick.get("multiplier"),  # 2 if captain, 1 otherwise
                    "shirt_url": shirt_url,
                    "cost_change_event": p.get("cost_change_event"),
                    "transfer_rank": transfer_ranks.get(el),
                    "ranks": pos_ranks.get(el),
                }
            )

        eh = picks.get("entry_history") or {}
        return enriched, eh.get("value"), eh.get("bank")

    @staticmethod
    def _score_player(player: dict, fdr_by_team: dict, candidates: List[dict]) -> float:
        """Score a player for transfer suggestions using the captaincy blend formula."""

        def _norm(vals: List[float], v: float) -> float:
            mn, mx = min(vals), max(vals)
            return 0.5 if mx == mn else (v - mn) / (mx - mn)

        pos = player.get("element_type", 4)

        ep_vals = [float(c.get("ep_next") or 0) for c in candidates]
        form_vals = [float(c.get("form") or 0) for c in candidates]
        ict_vals = [float(c.get("ict_index") or 0) for c in candidates]

        ep = float(player.get("ep_next") or 0)
        if any(v > 0 for v in ep_vals):
            base = _norm(ep_vals, ep)
        else:
            base = (
                _norm(form_vals, float(player.get("form") or 0)) * 0.5
                + _norm(ict_vals, float(player.get("ict_index") or 0)) * 0.5
            )

        team_fixtures = fdr_by_team.get(player.get("team", 0), [])
        if not team_fixtures:
            return 0.0  # BGW

        avg_fdr = sum(f["difficulty"] for f in team_fixtures) / len(team_fixtures)
        fdr_factor = 1 - (avg_fdr - 1) / 4
        home_ratio = sum(1 for f in team_fixtures if f["home"]) / len(team_fixtures)
        home_boost = 1 + home_ratio * 0.08
        dgw_boost = 1.8 if len(team_fixtures) > 1 else 1.0
        pos_mult = {1: 0.65, 2: 0.72, 3: 0.92, 4: 1.0}.get(pos, 1.0)
        start_prob = FPLService.start_prob_from(player)

        return base * fdr_factor * home_boost * dgw_boost * start_prob * pos_mult

    async def transfer_suggestions(self, entry_id: int, top_n: int = 3) -> dict:
        boot, _, _ = await self.bootstrap()
        events = boot["events"]
        current_event = next((e for e in events if e["is_current"]), None)
        next_event = next((e for e in events if e["is_next"]), None)
        if not current_event and not next_event:
            raise HTTPException(404, detail="No active gameweek found.")
        current_gw = current_event["id"] if current_event else next_event["id"]
        next_gw = next_event["id"] if next_event else current_event["id"]

        picks_result = await self.picks_with_fallback(entry_id, next_gw, current_gw)
        if picks_result is None:
            season_status = self.season_status(events)
            if season_status != "pre_season":
                raise HTTPException(404, detail="No picks found for this entry.")
            # Pre-season: no picks exist for anyone yet — nothing to base
            # suggestions on, so return an empty (not error) response.
            return {
                "entry_id": entry_id,
                "bank": 0,
                "suggestions": [],
                "season_status": season_status,
            }
        picks_data, used_gw, _, _, _ = picks_result
        bank = (picks_data.get("entry_history") or {}).get("bank", 0)

        players_dict = {p["id"]: p for p in boot["elements"]}
        owned_ids: set = {p["element"] for p in picks_data.get("picks", [])}
        owned_by_pos: Dict[int, List[dict]] = {}
        for pick in picks_data.get("picks", []):
            pl = players_dict.get(pick["element"], {})
            pos = pl.get("element_type", 4)
            owned_by_pos.setdefault(pos, []).append(pl)

        fixtures_data, _, _ = await self.fixtures(used_gw)
        teams = {t["id"]: t for t in boot["teams"]}
        fdr_by_team: Dict[int, list] = {}
        for fx in fixtures_data:
            h, a = fx["team_h"], fx["team_a"]
            fdr_by_team.setdefault(h, []).append(
                {
                    "opp": teams[a]["short_name"],
                    "home": True,
                    "difficulty": fx["team_h_difficulty"],
                    "kickoff": fx.get("kickoff_time"),
                }
            )
            fdr_by_team.setdefault(a, []).append(
                {
                    "opp": teams[h]["short_name"],
                    "home": False,
                    "difficulty": fx["team_a_difficulty"],
                    "kickoff": fx.get("kickoff_time"),
                }
            )

        suggestions = []
        for pos in [1, 2, 3, 4]:
            owned_in_pos = owned_by_pos.get(pos, [])
            if not owned_in_pos:
                continue
            max_sell = max((p.get("now_cost", 0) for p in owned_in_pos), default=0)
            budget = bank + max_sell

            candidates = [
                p
                for p in boot["elements"]
                if p["id"] not in owned_ids
                and p.get("element_type") == pos
                and p.get("now_cost", 0) <= budget
                and (p.get("minutes") or 0) > 0
            ]
            if not candidates:
                continue

            scored = sorted(
                (
                    (p, self._score_player(p, fdr_by_team, candidates))
                    for p in candidates
                ),
                key=lambda x: x[1],
                reverse=True,
            )

            shaped = []
            for p, score in scored[:top_n]:
                t = teams.get(p.get("team", 0), {})
                team_code = t.get("code")
                suffix = "_1" if pos == 1 else ""
                shirt_url = (
                    f"https://fantasy.premierleague.com/dist/img/shirts/standard/shirt_{team_code}{suffix}-220.webp"
                    if team_code
                    else None
                )
                team_fixtures = fdr_by_team.get(p.get("team", 0), [])
                shaped.append(
                    {
                        "element": p["id"],
                        "name": p.get("web_name"),
                        "team": t.get("short_name"),
                        "price": p.get("now_cost"),
                        "ep_next": p.get("ep_next"),
                        "form": p.get("form"),
                        "score": round(score, 4),
                        "start_probability": self.start_prob_from(p),
                        "selected_by_percent": p.get("selected_by_percent"),
                        "fixture": team_fixtures[0] if team_fixtures else None,
                        "has_dgw": len(team_fixtures) > 1,
                        "shirt_url": shirt_url,
                    }
                )

            suggestions.append({"position": pos, "budget": budget, "players": shaped})

        return {"entry_id": entry_id, "bank": bank, "suggestions": suggestions}

    async def picks_with_fallback(
        self, entry_id: int, next_gw: int, current_gw: int
    ) -> Optional[Tuple[dict, int, str, str, float]]:
        """Try next GW; if 404, fall back to current GW. Return (picks, used_gw, label, cache_status, age).

        Returns None when both GWs 404 — the caller decides whether that means
        pre-season (no picks exist yet) or a genuine error.
        """
        for gw, label in ((next_gw, "next"), (current_gw, "current")):
            try:
                data, status, age = await self.picks(entry_id, gw)
                return data, gw, label, status, age
            except httpx.HTTPStatusError as e:
                if e.response.status_code == 404:
                    continue
                if e.response.status_code == 403:
                    raise HTTPException(
                        403,
                        detail="Team is private; make it public or log in with cookies.",
                    )
                raise
        return None
