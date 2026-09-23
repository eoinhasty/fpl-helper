# service.py
from __future__ import annotations
import os
import asyncio
import hashlib
import logging
import re
import unicodedata
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
# ESPN's public soccer endpoints are undocumented/unofficial (no key, no
# published quota or contract — the shape could change without notice), but
# unlike api-football's free tier they actually serve current-season data.
# Verified live against all six competitions below on 2026-09-21.
TTL_ESPN_FOOTBALL = 15 * 60  # 15m fresh
SWR_ESPN_FOOTBALL = 3 * 60 * 60  # +3h stale
# Lineups only exist once a match is close to kickoff or under way, and
# change fast (announced XI, then subs as the game goes on) — a much
# shorter TTL than the fixture-list cache above.
TTL_ESPN_LINEUPS = 2 * 60  # 2m fresh
SWR_ESPN_LINEUPS = 15 * 60  # +15m stale

ESPN_SOCCER_BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer"
# ESPN's "core" API tier — used only to find a national team's most recent
# or next fixture. The site API's own teams/{id}/schedule looked like the
# obvious tool for that, but it's bugged: it silently caps at the first
# half of the calendar year (verified against both Brazil and England —
# both stopped dead at June, missing real September fixtures) and ignores
# every season/half param tried. This core-API events list doesn't have
# that bug, but a team's matches are scoped per-competition here (a
# country's Nations League and friendly fixtures are genuinely separate
# lists, not merged), so both get checked.
ESPN_CORE_BASE = "https://sports.core.api.espn.com/v2/sports/soccer/leagues"
NATIONAL_TEAM_COMPETITIONS = [
    ("nations-league", "uefa.nations"),
    ("international-friendlies", "fifa.friendly"),
]

# ESPN league slugs for the competitions this app cares about beyond the
# Premier League (which football-data.org already covers).
ESPN_LEAGUES: Dict[str, str] = {
    "champions-league": "uefa.champions",
    "europa-league": "uefa.europa",
    "conference-league": "uefa.europa.conf",
    "nations-league": "uefa.nations",
    "international-friendlies": "fifa.friendly",
    "preseason-friendlies": "club.friendly",
}

# International squad news: whether a player has been called up to or
# withdrawn from their national team, surfaced for squad players during
# international breaks. Checking every ESPN national-team roster for every
# player would be impolite (200+ teams) and pointless (most PL players
# only represent a handful of footballing nations), so nationality is
# looked up first via FPL's own (undocumented) `region` code on each
# player, decoded against this table built by cross-referencing ESPN
# national rosters against FPL's player pool — verified clean (no
# conflicting country for the same code, across 40 codes / ~575 of the
# ~667 PL players) on 2026-09-21. `region` reflects birth/federation
# nationality, not necessarily which country a player currently turns out
# for internationally (dual nationals can differ — confirmed one real
# case, Thierno Barry: region says France, he actually plays for Guinea) —
# so this table is a good first guess, not a guarantee, for that edge case.
# Players whose region isn't in this table (~15% of the pool, mostly
# single- or few-player nationalities) are simply skipped rather than
# guessed at.
TTL_ESPN_SQUAD_NEWS = 2 * 60 * 60  # 2h fresh
SWR_ESPN_SQUAD_NEWS = 24 * 60 * 60  # +24h stale

FPL_REGION_TO_ESPN_COUNTRY: Dict[int, Tuple[str, str]] = {
    3: ("Algeria", "624"),
    10: ("Argentina", "202"),
    13: ("Australia", "628"),
    14: ("Austria", "474"),
    21: ("Belgium", "459"),
    30: ("Brazil", "205"),
    38: ("Cameroon", "656"),
    57: ("Czechia", "450"),
    58: ("Denmark", "479"),
    62: ("Ecuador", "209"),
    63: ("Egypt", "2620"),
    79: ("Georgia", "584"),
    80: ("Germany", "481"),
    81: ("Ghana", "4469"),
    83: ("Greece", "455"),
    97: ("Croatia", "477"),
    98: ("Hungary", "480"),
    106: ("Italy", "162"),
    107: ("Jamaica", "1038"),
    108: ("Japan", "627"),
    132: ("Mali", "2849"),
    145: ("Morocco", "2869"),
    152: ("Netherlands", "449"),
    157: ("Nigeria", "657"),
    161: ("Norway", "464"),
    168: ("Paraguay", "210"),
    172: ("Poland", "471"),
    173: ("Portugal", "482"),
    189: ("Senegal", "654"),
    190: ("Serbia", "6757"),
    194: ("Slovakia", "468"),
    195: ("Slovenia", "472"),
    200: ("Spain", "164"),
    206: ("Sweden", "466"),
    207: ("Switzerland", "475"),
    230: ("Uruguay", "212"),
    241: ("England", "448"),
    243: ("Scotland", "580"),
    244: ("Wales", "578"),
}


def _norm_name(s: Optional[str]) -> str:
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode()
    return s.lower().strip()


# ESPN tags any article that so much as name-drops a player (Ballon d'Or
# takes, "FC 100" rankings, unrelated quotes) with that athlete, which
# drowns out the actual squad call-up/withdrawal/injury news this feature
# is for. Narrow to headlines that are plausibly about squad status itself.
_SQUAD_NEWS_RE = re.compile(
    r"injur|withdraw|knock\b|doubt|fitness|\bscan\b|surgery|ruled out|"
    r"sideline|recall|call-up|called up|call up|snub|omit|left out|\baxe|"
    r"\breplace|\bmiss(es|ed|ing)?\b|setback|return to training|operation",
    re.IGNORECASE,
)
# The keyword match alone isn't enough — e.g. a 2024 Euros injury story
# about a teammate matches "injur" just as well as this week's actual
# squad news. International squad status is only ever current for the
# length of a break, so anything older than this is stale by definition.
_SQUAD_NEWS_MAX_AGE_DAYS = 30


def _ua() -> Dict[str, str]:
    return {"User-Agent": "Personal FPL Helper"}


def _int_or_none(v: Any) -> Optional[int]:
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


# ESPN's edge blocks our normal descriptive User-Agent (and browser-spoofed
# ones) with a 403, but accepts httpx's own default signature — so ESPN
# calls explicitly restore it instead of inheriting self.public's default.
def _espn_ua() -> Dict[str, str]:
    return {"User-Agent": f"python-httpx/{httpx.__version__}"}


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
                    "ranks": pos_ranks.get(p["id"]),
                    "transfer_rank": transfer_ranks.get(p["id"]),
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
                "season": self.season_label(boot.get("events", [])),
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
            # No timestamp (or an unparseable one) means we can't verify
            # this is actually recent — same failure mode as the stale
            # ESPN squad-news article that slipped through earlier, so
            # fail closed (hide) rather than open (show) here too.
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

    # ----------------- ESPN (international / preseason / UEFA) -----------------
    async def football_fixtures(self, competition: str) -> dict:
        slug = ESPN_LEAGUES.get(competition)
        if not slug:
            raise HTTPException(400, detail=f"Unknown competition '{competition}'.")

        r = await self.public.get(
            f"{ESPN_SOCCER_BASE}/{slug}/scoreboard", headers=_espn_ua()
        )
        r.raise_for_status()
        js = r.json()

        fixtures = []
        for e in js.get("events", []):
            comp = (e.get("competitions") or [{}])[0]
            competitors = comp.get("competitors") or []
            home = next((c for c in competitors if c.get("homeAway") == "home"), None)
            away = next((c for c in competitors if c.get("homeAway") == "away"), None)
            if not home or not away:
                continue
            status = comp.get("status", {}).get("type", {})
            fixtures.append(
                {
                    "id": e.get("id"),
                    "date": e.get("date"),
                    "completed": bool(status.get("completed")),
                    "status_detail": status.get("shortDetail"),
                    "round": comp.get("altGameNote"),
                    "home": {
                        "name": (home.get("team") or {}).get("displayName"),
                        "logo": (home.get("team") or {}).get("logo"),
                    },
                    "away": {
                        "name": (away.get("team") or {}).get("displayName"),
                        "logo": (away.get("team") or {}).get("logo"),
                    },
                    "home_goals": _int_or_none(home.get("score")),
                    "away_goals": _int_or_none(away.get("score")),
                }
            )
        return {"source": "espn", "competition": competition, "fixtures": fixtures}

    async def football_lineups(self, competition: str, event_id: str) -> dict:
        slug = ESPN_LEAGUES.get(competition)
        if not slug:
            raise HTTPException(400, detail=f"Unknown competition '{competition}'.")

        r = await self.public.get(
            f"{ESPN_SOCCER_BASE}/{slug}/summary",
            params={"event": event_id},
            headers=_espn_ua(),
        )
        r.raise_for_status()
        js = r.json()

        def _shape_team(roster: dict) -> dict:
            players = []
            for p in roster.get("roster") or []:
                athlete = p.get("athlete") or {}
                stats = {s.get("name"): s.get("displayValue") for s in p.get("stats", [])}
                players.append(
                    {
                        "id": athlete.get("id"),
                        "name": athlete.get("fullName"),
                        "jersey": p.get("jersey"),
                        "position": (p.get("position") or {}).get("abbreviation"),
                        "starter": bool(p.get("starter")),
                        "subbed_in": bool(p.get("subbedIn")),
                        "subbed_out": bool(p.get("subbedOut")),
                        "goals": stats.get("totalGoals"),
                        "assists": stats.get("goalAssists"),
                        "yellow_cards": stats.get("yellowCards"),
                        "red_cards": stats.get("redCards"),
                    }
                )
            team = roster.get("team") or {}
            return {
                "team": team.get("displayName"),
                "home_away": roster.get("homeAway"),
                "formation": roster.get("formation"),
                "players": players,
            }

        teams = [_shape_team(r) for r in (js.get("rosters") or [])]
        return {
            "source": "espn",
            "competition": competition,
            "event": event_id,
            "teams": teams,
            "available": any(t["players"] for t in teams),
        }

    async def _espn_country_roster_names(self, espn_team_id: str) -> set[str]:
        key = f"espn:nat-roster:{espn_team_id}"

        async def _fetch():
            r = await self.public.get(
                f"{ESPN_SOCCER_BASE}/fifa.friendly/teams/{espn_team_id}/roster",
                headers=_espn_ua(),
            )
            r.raise_for_status()
            js = r.json()
            return [_norm_name(a.get("fullName")) for a in js.get("athletes") or []]

        names, _, _ = await self.cache.get_or_set(
            key, _fetch, TTL_ESPN_SQUAD_NEWS, SWR_ESPN_SQUAD_NEWS
        )
        return set(names)

    async def _espn_country_news(self, espn_team_id: str) -> list[dict]:
        key = f"espn:nat-news:{espn_team_id}"

        async def _fetch():
            r = await self.public.get(
                f"{ESPN_SOCCER_BASE}/fifa.friendly/news",
                params={"team": espn_team_id, "limit": 50},
                headers=_espn_ua(),
            )
            r.raise_for_status()
            js = r.json()
            now = datetime.now(timezone.utc)
            out = []
            for a in js.get("articles") or []:
                headline = a.get("headline") or ""
                if not _SQUAD_NEWS_RE.search(headline):
                    continue
                published = a.get("published")
                if published:
                    try:
                        age_days = (now - datetime.fromisoformat(published.replace("Z", "+00:00"))).days
                        if age_days > _SQUAD_NEWS_MAX_AGE_DAYS:
                            continue
                    except ValueError:
                        pass
                athletes = [
                    _norm_name(c.get("description"))
                    for c in a.get("categories") or []
                    if c.get("type") == "athlete"
                ]
                out.append(
                    {
                        "headline": headline,
                        "published": a.get("published"),
                        "link": (a.get("links") or {}).get("web", {}).get("href"),
                        "athletes": athletes,
                    }
                )
            return out

        data, _, _ = await self.cache.get_or_set(
            key, _fetch, TTL_ESPN_SQUAD_NEWS, SWR_ESPN_SQUAD_NEWS
        )
        return data

    async def _espn_country_recent_or_next_match(
        self, espn_team_id: str
    ) -> Optional[Tuple[str, str]]:
        """A country's most recently completed match, or its next one if
        none has been played yet this window. Returns (competition, event_id)."""
        key = f"espn:nat-events:{espn_team_id}"

        async def _fetch():
            found = []
            for comp_key, slug in NATIONAL_TEAM_COMPETITIONS:
                r = await self.public.get(
                    f"{ESPN_CORE_BASE}/{slug}/teams/{espn_team_id}/events",
                    params={"limit": 50},
                    headers=_espn_ua(),
                )
                r.raise_for_status()
                for item in r.json().get("items") or []:
                    ref = item.get("$ref")
                    if not ref:
                        continue
                    er = await self.public.get(ref, headers=_espn_ua())
                    er.raise_for_status()
                    ejs = er.json()
                    if ejs.get("id") and ejs.get("date"):
                        found.append((comp_key, ejs["id"], ejs["date"]))
            return found

        events, _, _ = await self.cache.get_or_set(
            key, _fetch, TTL_ESPN_SQUAD_NEWS, SWR_ESPN_SQUAD_NEWS
        )
        if not events:
            return None

        def _parse(d: str) -> datetime:
            return datetime.fromisoformat(d.replace("Z", "+00:00"))

        now = datetime.now(timezone.utc)
        played = [e for e in events if _parse(e[2]) <= now]
        comp_key, event_id, _ = (
            max(played, key=lambda e: _parse(e[2]))
            if played
            else min(events, key=lambda e: _parse(e[2]))
        )
        return comp_key, event_id

    async def _espn_player_match_involvement(
        self, espn_team_id: str, candidate_names: set[str]
    ) -> Optional[dict]:
        match = await self._espn_country_recent_or_next_match(espn_team_id)
        if not match:
            return None
        competition, event_id = match
        key = f"espn:lineups:{competition}:{event_id}"

        async def _fetch():
            return await self.football_lineups(competition, event_id)

        lineup, _, _ = await self.cache.get_or_set(
            key, _fetch, TTL_ESPN_LINEUPS, SWR_ESPN_LINEUPS
        )
        if not lineup.get("available"):
            return None  # lineup not announced yet — nothing to report either way

        for team in lineup.get("teams", []):
            for p in team["players"]:
                if _norm_name(p.get("name")) in candidate_names:
                    opponent = next(
                        (t.get("team") for t in lineup.get("teams", []) if t is not team),
                        None,
                    )
                    return {
                        "competition": competition,
                        "opponent": opponent,
                        "in_squad": True,
                        "starter": p["starter"],
                        "subbed_in": p["subbed_in"],
                        "subbed_out": p["subbed_out"],
                    }
        # Lineup is out but this player isn't in it at all — an unused
        # squad member (or not selected), a stronger signal than "unknown".
        return {"competition": competition, "opponent": None, "in_squad": False}

    async def international_squad_news(self, player_ids: List[int]) -> dict:
        boot, _, _ = await self.bootstrap()
        by_id = {p["id"]: p for p in boot["elements"]}

        # Resolve each requested player's country, then only fetch each
        # distinct country once — a 15-player squad is usually 8-12
        # countries, not 15 separate lookups, and never one of the 190+
        # ESPN tracks that aren't actually represented.
        wanted = [by_id[i] for i in player_ids if i in by_id]
        by_country: Dict[str, List[dict]] = defaultdict(list)
        results: Dict[int, dict] = {}
        for p in wanted:
            entry = FPL_REGION_TO_ESPN_COUNTRY.get(p.get("region"))
            if not entry:
                results[p["id"]] = {"country": None, "on_squad": None, "news": [], "recent_match": None}
                continue
            country, espn_team_id = entry
            by_country[espn_team_id].append(p)
            results[p["id"]] = {"country": country, "on_squad": None, "news": [], "recent_match": None}

        for espn_team_id, players in by_country.items():
            roster_names, news = await asyncio.gather(
                self._espn_country_roster_names(espn_team_id),
                self._espn_country_news(espn_team_id),
            )
            for p in players:
                web = _norm_name(p.get("web_name"))
                full = _norm_name(p.get("first_name", "") + " " + p.get("second_name", ""))
                on_squad = web in roster_names or full in roster_names
                results[p["id"]]["on_squad"] = on_squad
                matched = [
                    {"headline": a["headline"], "published": a["published"], "link": a["link"]}
                    for a in news
                    if web in a["athletes"] or full in a["athletes"]
                ]
                matched.sort(key=lambda a: a["published"] or "", reverse=True)
                results[p["id"]]["news"] = matched[:3]
                # Only worth checking match involvement for players actually
                # on the current squad list — if they're not called up at
                # all, there's nothing to check whether they played in.
                if on_squad:
                    results[p["id"]]["recent_match"] = await self._espn_player_match_involvement(
                        espn_team_id, {web, full}
                    )

        return {"source": "espn", "players": results}

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
    def season_label(events: list) -> Optional[str]:
        """e.g. '2026/27', derived from GW1's deadline year — bootstrap-static has
        no explicit season name field, but the season always starts (GW1 deadline)
        in the calendar year it's named after.

        Pre-season, bootstrap's per-element season totals (goals_scored,
        points_per_game, etc.) haven't reset yet — they're still last season's
        final numbers until GW1 actually kicks off, same rollover-lag as
        StandingsCard's is_previous_season_table. So the label reported here
        must lag by one season too, or it would claim e.g. "2026/27" next to
        stats that are actually 2025/26's."""
        if not events:
            return None
        deadline = events[0].get("deadline_time")
        if not deadline:
            return None
        year = int(deadline[:4])
        if FPLService.season_status(events) == "pre_season":
            year -= 1
        return f"{year}/{(year + 1) % 100:02d}"

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

    async def transfer_suggestions(
        self, entry_id: int, top_n: int = 3, *, token: Optional[str] = None
    ) -> Tuple[dict, List[Tuple[str, float]], int]:
        boot, boot_status, boot_age = await self.bootstrap()
        events = boot["events"]
        current_event = next((e for e in events if e["is_current"]), None)
        next_event = next((e for e in events if e["is_next"]), None)
        if not current_event and not next_event:
            raise HTTPException(404, detail="No active gameweek found.")
        current_gw = current_event["id"] if current_event else next_event["id"]
        next_gw = next_event["id"] if next_event else current_event["id"]

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
        used_gw = next_gw

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
                season_status = self.season_status(events)
                if season_status != "pre_season":
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
                        "season_status": season_status,
                    },
                    [(boot_status, boot_age)],
                    TTL_PICKS,
                )
            picks_data, used_gw, _, reading_status, reading_age = picks_result
            picks_list = picks_data.get("picks", [])
            bank = (picks_data.get("entry_history") or {}).get("bank", 0)

        ttl_used = TTL_MYTEAM if token else TTL_PICKS

        players_dict = {p["id"]: p for p in boot["elements"]}
        owned_ids: set = {p["element"] for p in picks_list}
        owned_by_pos: Dict[int, List[dict]] = {}
        for pick in picks_list:
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
                and fdr_by_team.get(p.get("team", 0))
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
