# service.py
from __future__ import annotations
import asyncio
import hashlib
import logging
from collections import defaultdict
from typing import Any, Dict, Optional, Tuple, List
import httpx
from fastapi import HTTPException
from datetime import datetime, timezone
from math import prod
from app.simple_cache import AsyncCache
from app.services.espn import EspnService
from app.services.gameweeks import (
    current_and_next_gw,
    finished_gw_count,
    season_label,
    season_status,
    upcoming_event,
)
from app.services.scoring import (
    gain_driver,
    position_ranks,
    score_factors,
    start_prob_from,
    transfer_ranks,
    xgi_signal,
)

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

MAX_PER_CLUB = 3  # FPL squad rule


# One honest User-Agent for FPL, its auth server and football-data.org. The
# "Mozilla/5.0 (compatible; ...)" prefix is what the auth flow has always sent
# and is known to get through every login step. ESPN is the exception
# (_espn_ua in espn.py).
USER_AGENT = "Mozilla/5.0 (compatible; FPL-Helper/1.0)"


def _ua() -> Dict[str, str]:
    return {"User-Agent": USER_AGENT}


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
        # position_ranks/transfer_ranks are pure functions of `boot`, which only
        # changes when the bootstrap cache actually refetches — cache by object
        # identity so repeated squad/live requests within the same 6h window don't
        # redo the same sort on every load.
        self._rank_cache_boot_id: Optional[int] = None
        self._rank_cache: Optional[Tuple[dict, dict]] = None
        self.espn = EspnService(self.public, self.cache)

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

            base_event = upcoming_event(events)
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
                            "opp": team_names.get(a, {}).get("short_name", "UNK"),
                            "home": True,
                            "difficulty": fx["team_h_difficulty"],
                            "kickoff": fx.get("kickoff_time"),
                        }
                    )
                if a in grid:
                    grid[a][ev].append(
                        {
                            "opp": team_names.get(h, {}).get("short_name", "UNK"),
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
        base_event = upcoming_event(events)
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
                        "opp": teams.get(a, {}).get("short_name", "UNK"),
                        "home": True,
                        "difficulty": fx["team_h_difficulty"],
                        "kickoff": fx.get("kickoff_time"),
                    }
                )
            if a in teams:
                by_team[a].append(
                    {
                        "opp": teams.get(h, {}).get("short_name", "UNK"),
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
            pos_ranks, transfer_ranks = self._cached_ranks(boot)

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
                    "ict_index": p.get("ict_index"),
                    "minutes": p.get("minutes"),
                    "points_per_game": p.get("points_per_game"),
                    "goals_scored": p.get("goals_scored"),
                    "assists": p.get("assists"),
                    "clean_sheets": p.get("clean_sheets"),
                    "saves": p.get("saves"),
                    "bonus": p.get("bonus"),
                    "expected_goals": p.get("expected_goals"),
                    "expected_assists": p.get("expected_assists"),
                    "expected_goal_involvements": p.get("expected_goal_involvements"),
                    "xgi_signal": xgi_signal(p),
                    "ranks": pos_ranks.get(p["id"]),
                    "transfer_rank": transfer_ranks.get(p["id"]),
                    # PlayerDetailModal's Market section (transfers + price)
                    "transfers_in_event": p.get("transfers_in_event"),
                    "transfers_out_event": p.get("transfers_out_event"),
                    "cost_change_start": p.get("cost_change_start"),
                    "cost_change_event": p.get("cost_change_event"),
                }
                players.append(
                    {
                        k: v
                        for k, v in raw.items()
                        if v is not None and v != "" and (v != [] or k == "fixtures")
                    }
                )

            team_rows = [
                {"id": t["id"], "name": t["name"], "short_name": t["short_name"]}
                for t in boot["teams"]
            ]

            return {
                "count": len(players),
                "teams": team_rows,
                "players": players,
                "season": season_label(boot.get("events", [])),
            }

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
        ev = upcoming_event(events)
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
        played_gws = finished_gw_count(boot)
        out = []
        now = datetime.now(timezone.utc)
        for p in boot["elements"]:
            news = (p.get("news") or "").strip()
            if not news:
                continue
            added = p.get("news_added")
            # No timestamp (or an unparseable one) means we can't verify
            # this is actually recent — fail closed (hide) rather than open
            # (show), so months-old news can't pass itself off as current.
            recent = False
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
                    "start_probability": start_prob_from(p, played_gws),
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

    def _cached_ranks(self, boot: dict) -> Tuple[dict, dict]:
        boot_id = id(boot)
        if self._rank_cache_boot_id != boot_id:
            self._rank_cache = (
                position_ranks(boot),
                transfer_ranks(boot),
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

        played_gws = finished_gw_count(boot)

        players = {p["id"]: p for p in boot["elements"]}
        teams = {t["id"]: t for t in boot["teams"]}
        pos_ranks, transfer_ranks = self._cached_ranks(boot)

        fdr_by_team: Dict[int, list] = {}
        for fx in fixtures:
            h, a = fx["team_h"], fx["team_a"]
            fdr_by_team.setdefault(h, []).append(
                {
                    "opp": teams.get(a, {}).get("short_name", "UNK"),
                    "home": True,
                    "difficulty": fx["team_h_difficulty"],
                    "kickoff": fx["kickoff_time"],
                }
            )
            fdr_by_team.setdefault(a, []).append(
                {
                    "opp": teams.get(h, {}).get("short_name", "UNK"),
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
                    "start_probability": start_prob_from(p, played_gws),
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
                    "expected_goals": p.get("expected_goals"),
                    "expected_assists": p.get("expected_assists"),
                    "expected_goal_involvements": p.get("expected_goal_involvements"),
                    "xgi_signal": xgi_signal(p),
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

    async def transfer_suggestions(
        self, entry_id: int, top_n: int = 3, *, token: Optional[str] = None
    ) -> Tuple[dict, List[Tuple[str, float]], int]:
        boot, boot_status, boot_age = await self.bootstrap()
        played_gws = finished_gw_count(boot)
        events = boot["events"]
        current_gw, next_gw = current_and_next_gw(events)

        # Prefer my_team when a token is available — it's auth-gated but (1)
        # already reflects the drafted GW1 squad before picks exist for
        # anyone (unlocks suggestions pre-season, matching how Live mode
        # already sources from my_team) and (2) reflects transfers made
        # since the last picks snapshot, so suggestions don't go stale right
        # after a Live-mode transfer. Falls back to picks (no auth required)
        # if there's no token, or the token is rejected.
        picks_list: List[dict] = []
        bank = 0
        reading_status: Optional[str] = None
        reading_age: Optional[float] = None

        if token:
            try:
                my_team_data, mt_status, mt_age = await self.my_team(
                    entry_id, token=token
                )
                picks_list = my_team_data.get("picks", [])
                bank = (my_team_data.get("transfers") or {}).get("bank", 0)
                reading_status, reading_age = mt_status, mt_age
            except httpx.HTTPStatusError as e:
                if e.response.status_code not in (401, 403):
                    raise
                token = None  # rejected token — fall through to picks below

        if reading_status is None:
            picks_result = await self.picks_with_fallback(entry_id, next_gw, current_gw)
            if picks_result is None:
                status = season_status(events)
                if status != "pre_season":
                    raise HTTPException(404, detail="No picks found for this entry.")
                # Pre-season, no token: no picks exist for anyone yet —
                # nothing to base suggestions on, so return an empty (not
                # error) response. No short-lived fetch happened (picks
                # 404s for everyone pre-season) — bootstrap is the only
                # signal available, even though it's normally excluded as
                # long-lived.
                return (
                    {
                        "entry_id": entry_id,
                        "bank": 0,
                        "suggestions": [],
                        "season_status": status,
                    },
                    [(boot_status, boot_age)],
                    TTL_PICKS,
                )
            picks_data, _, _, reading_status, reading_age = picks_result
            picks_list = picks_data.get("picks", [])
            bank = (picks_data.get("entry_history") or {}).get("bank", 0)

        ttl_used = TTL_MYTEAM if token else TTL_PICKS

        players_dict = {p["id"]: p for p in boot["elements"]}
        owned_ids: set = {p["element"] for p in picks_list}
        # Each owned player with what selling them actually returns: FPL keeps
        # half of any price rise, so my_team's selling_price can be below
        # now_cost. Public picks don't carry it, so that path falls back to
        # now_cost (can overstate the budget for risen players).
        owned_by_pos: Dict[int, List[Tuple[dict, int]]] = {}
        club_counts: Dict[int, int] = defaultdict(int)
        for pick in picks_list:
            pl = players_dict.get(pick["element"])
            if not pl:
                continue
            sell = pick.get("selling_price") or pl.get("now_cost", 0)
            owned_by_pos.setdefault(pl.get("element_type", 4), []).append((pl, sell))
            club_counts[pl.get("team", 0)] += 1

        # Suggestions are for the next transfer, so score against the upcoming
        # GW's fixtures even when the squad itself came from current-GW picks.
        fixtures_data, _, _ = await self.fixtures(next_gw)
        teams = {t["id"]: t for t in boot["teams"]}
        fdr_by_team: Dict[int, list] = {}
        for fx in fixtures_data:
            h, a = fx["team_h"], fx["team_a"]
            fdr_by_team.setdefault(h, []).append(
                {
                    "opp": teams.get(a, {}).get("short_name", "UNK"),
                    "home": True,
                    "difficulty": fx["team_h_difficulty"],
                    "kickoff": fx.get("kickoff_time"),
                }
            )
            fdr_by_team.setdefault(a, []).append(
                {
                    "opp": teams.get(h, {}).get("short_name", "UNK"),
                    "home": False,
                    "difficulty": fx["team_a_difficulty"],
                    "kickoff": fx.get("kickoff_time"),
                }
            )

        suggestions = []
        for pos in [1, 2, 3, 4]:
            owned_here = owned_by_pos.get(pos, [])
            if not owned_here:
                continue

            buyable = [
                p
                for p in boot["elements"]
                if p["id"] not in owned_ids
                and p.get("element_type") == pos
                and (p.get("minutes") or 0) > 0
                # "u" = left the club; can't be bought (player_pool drops them too)
                and p.get("status") != "u"
                and fdr_by_team.get(p.get("team", 0))
            ]
            if not buyable:
                continue

            # A suggestion is a sell->buy pair: it has to beat the specific
            # owned player it replaces, be affordable from *that* player's
            # sale, and keep the squad within 3 per club. Score owned and
            # buyable players against one shared pool — score_player
            # normalises within the pool it's given, so separate pools would
            # put the two sides on different scales. Same rules as the
            # season simulation in backend/scripts/backtest_transfers.py.
            pool = [pl for pl, _ in owned_here] + buyable
            factors = {
                p["id"]: score_factors(p, fdr_by_team, pool, played_gws) for p in pool
            }
            score = {pid: prod(f.values()) if f else 0.0 for pid, f in factors.items()}
            best: Dict[int, Tuple[float, dict, dict, int]] = {}
            for owned, sell in owned_here:
                for c in buyable:
                    if c.get("now_cost", 0) > bank + sell:
                        continue
                    if (
                        c.get("team") != owned.get("team")
                        and club_counts[c.get("team", 0)] >= MAX_PER_CLUB
                    ):
                        continue
                    gain = score[c["id"]] - score[owned["id"]]
                    if gain <= 0:
                        continue
                    # Keep each buy once, paired with the sale it improves most
                    if c["id"] not in best or gain > best[c["id"]][0]:
                        best[c["id"]] = (gain, c, owned, sell)
            if not best:
                continue
            ranked = sorted(best.values(), key=lambda x: x[0], reverse=True)

            shaped = []
            for gain, p, owned, sell in ranked[:top_n]:
                t = teams.get(p.get("team", 0), {})
                team_code = t.get("code")
                suffix = "_1" if pos == 1 else ""
                shirt_url = (
                    f"https://fantasy.premierleague.com/dist/img/shirts/standard/shirt_{team_code}{suffix}-220.webp"
                    if team_code
                    else None
                )
                team_fixtures = fdr_by_team.get(p.get("team", 0), [])
                driver = gain_driver(factors[p["id"]], factors[owned["id"]])
                # ep_next already covers both DGW fixtures, so there the
                # double gameweek surfaces as a form (base) gap, not a dgw term
                owned_fixtures = fdr_by_team.get(owned.get("team", 0), [])
                if driver == "form" and len(team_fixtures) > len(owned_fixtures) > 0:
                    driver = "dgw"
                shaped.append(
                    {
                        "element": p["id"],
                        "name": p.get("web_name"),
                        "team": t.get("short_name"),
                        "price": p.get("now_cost"),
                        "ep_next": p.get("ep_next"),
                        "form": p.get("form"),
                        "score": round(score[p["id"]], 4),
                        "gain": round(gain, 4),
                        "driver": driver,
                        "start_probability": start_prob_from(p, played_gws),
                        "selected_by_percent": p.get("selected_by_percent"),
                        "fixture": team_fixtures[0] if team_fixtures else None,
                        "has_dgw": len(team_fixtures) > 1,
                        "shirt_url": shirt_url,
                        "replaces": {
                            "element": owned["id"],
                            "name": owned.get("web_name"),
                            "sell_price": sell,
                            "ep_next": owned.get("ep_next"),
                            "start_probability": start_prob_from(owned, played_gws),
                        },
                    }
                )

            suggestions.append(
                {
                    "position": pos,
                    "budget": bank + max(sell for _, sell in owned_here),
                    "players": shaped,
                }
            )

        # Bootstrap (6h/12h TTL) is excluded from the reading set — it's
        # long-lived like /squad and /live exclude fixtures/entry, and
        # including it would make the badge pessimistic without being useful.
        return (
            {"entry_id": entry_id, "bank": bank, "suggestions": suggestions},
            [(reading_status, reading_age)],
            ttl_used,
        )

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
