# espn.py — ESPN's public soccer endpoints: UEFA/international fixtures and
# lineups, plus international squad news for FPL players.
from __future__ import annotations
import asyncio
import logging
import re
import unicodedata
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple
import httpx
from fastapi import HTTPException
from app.simple_cache import AsyncCache

logger = logging.getLogger("uvicorn.error")

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
# Days either side of the scoreboard's anchor day to also fetch. The day
# before catches ESPN anchoring on a matchday's second day; two days after
# covers a matchday's remaining days when it anchors on the first.
MATCHDAY_NEIGHBOUR_DAYS = (-1, 1, 2)

# International squad news: whether a player has been called up to or
# withdrawn from their national team, surfaced for squad players during
# international breaks. Checking every ESPN national-team roster for every
# player would be impolite (200+ teams) and pointless (most PL players
# only represent a handful of footballing nations), so nationality is
# looked up first via FPL's own (undocumented) `region` code on each
# player, decoded against this table built by cross-referencing ESPN
# national rosters against FPL's player pool, then extended by resolving
# individual players' ESPN `citizenship` directly (the roster-based method
# alone undercounts — it only reflects one active call-up window, missing
# uncapped/fringe internationals) — verified clean (no conflicting country
# for the same code, across 51 codes / 594 of the 667 PL players, 89.1%)
# as of 2026-09-23. `region` reflects birth/federation nationality, not
# necessarily which country a player currently turns out for
# internationally (dual nationals can differ — confirmed one real case,
# Thierno Barry: region says France, he actually plays for Guinea) — so
# this table is a good first guess, not a guarantee, for that edge case.
# Players whose region isn't in this table (~11% of the pool, all
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
    27: ("Bosnia and Herzegovina", "452"),
    30: ("Brazil", "205"),
    38: ("Cameroon", "656"),
    39: ("Canada", "206"),
    44: ("Chile", "207"),
    48: ("Colombia", "208"),
    50: ("DR Congo", "2850"),
    54: ("Ivory Coast", "4789"),
    57: ("Czechia", "450"),
    58: ("Denmark", "479"),
    62: ("Ecuador", "209"),
    63: ("Egypt", "2620"),
    73: ("France", "478"),
    79: ("Georgia", "584"),
    80: ("Germany", "481"),
    81: ("Ghana", "4469"),
    83: ("Greece", "455"),
    97: ("Croatia", "477"),
    98: ("Hungary", "480"),
    104: ("Republic of Ireland", "476"),
    106: ("Italy", "162"),
    107: ("Jamaica", "1038"),
    108: ("Japan", "627"),
    132: ("Mali", "2849"),
    145: ("Morocco", "2869"),
    152: ("Netherlands", "449"),
    154: ("New Zealand", "2666"),
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
    219: ("Turkey", "465"),
    225: ("Ukraine", "457"),
    229: ("United States", "660"),
    230: ("Uruguay", "212"),
    241: ("England", "448"),
    242: ("Northern Ireland", "586"),
    243: ("Scotland", "580"),
    244: ("Wales", "578"),
}

# FPL team id -> (name, ESPN eng.1 club id). Stable for the season (only
# changes on promotion/relegation), built once by cross-referencing FPL's
# own team list against ESPN's — same durability assumption as the
# nationality table above.
FPL_TEAM_TO_ESPN_CLUB: Dict[int, Tuple[str, str]] = {
    1: ("Arsenal", "359"),
    2: ("Aston Villa", "362"),
    3: ("Bournemouth", "349"),
    4: ("Brentford", "337"),
    5: ("Brighton", "331"),
    6: ("Chelsea", "363"),
    7: ("Coventry City", "388"),
    8: ("Crystal Palace", "384"),
    9: ("Everton", "368"),
    10: ("Fulham", "370"),
    11: ("Hull City", "306"),
    12: ("Ipswich Town", "373"),
    13: ("Leeds", "357"),
    14: ("Liverpool", "364"),
    15: ("Man City", "382"),
    16: ("Man Utd", "360"),
    17: ("Newcastle", "361"),
    18: ("Nott'm Forest", "393"),
    19: ("Spurs", "367"),
    20: ("Sunderland", "366"),
}


class _EspnUnavailable(Exception):
    """Raised inside a cached fetch when ESPN returned 403 (throttling or
    UA rejection). Never let this get cached as a false-negative empty
    result — raising here means AsyncCache.get_or_set doesn't store
    anything, so the next request just tries again instead of being
    stuck with "no data" for the full TTL window."""


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
_RECENT_MATCH_MAX_AGE_DAYS = 14


def _int_or_none(v: Any) -> Optional[int]:
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def _parse_date(v: Optional[str]) -> Optional[date]:
    try:
        return date.fromisoformat((v or "")[:10])
    except ValueError:
        return None


# ESPN's edge blocks our normal descriptive User-Agent (and browser-spoofed
# ones) with a 403, but accepts httpx's own default signature — so ESPN
# calls explicitly restore it instead of inheriting the shared client's
# default.
def _espn_ua() -> Dict[str, str]:
    return {"User-Agent": f"python-httpx/{httpx.__version__}"}


class EspnService:
    def __init__(self, client: httpx.AsyncClient, cache: AsyncCache) -> None:
        # Shares FPLService's client and cache; ESPN URLs are absolute, so
        # the client's FPL base_url doesn't apply.
        self.client = client
        self.cache = cache
        # ESPN has no published rate limit or concurrency guidance for
        # these endpoints (checked — nothing documented anywhere), so this
        # caps how many ESPN requests this app has in flight at once
        # rather than trusting a number nobody publishes.
        self._semaphore = asyncio.Semaphore(4)

    async def _get(self, url: str, **kwargs) -> Optional[httpx.Response]:
        """GET an ESPN endpoint, capped for concurrency and tolerant of a
        403. ESPN's 403 is ambiguous — could be the UA rejection we've
        already worked around, or could be undocumented throttling (both
        are known to happen; there's no documented rate limit either way)
        — so callers get None back and can skip/degrade that one piece
        gracefully instead of the whole request 500ing."""
        kwargs.setdefault("headers", _espn_ua())
        async with self._semaphore:
            r = await self.client.get(url, **kwargs)
        if r.status_code == 403:
            logger.warning("ESPN returned 403 (throttling or UA rejection) for %s", url)
            return None
        r.raise_for_status()
        return r

    async def football_fixtures(self, competition: str) -> dict:
        slug = ESPN_LEAGUES.get(competition)
        if not slug:
            raise HTTPException(400, detail=f"Unknown competition '{competition}'.")

        url = f"{ESPN_SOCCER_BASE}/{slug}/scoreboard"
        r = await self._get(url)
        if r is None:
            return {"source": "espn", "competition": competition, "fixtures": []}
        js = r.json()
        events = {e["id"]: e for e in js.get("events", []) if e.get("id")}

        # The undated scoreboard only covers the single day ESPN considers
        # current (the next match day, or the last one between rounds), but
        # a UEFA matchday spans several — e.g. the 20–21 Oct 2026 Champions
        # League matchday has 9 games each day, and the undated call
        # returned only the first. ESPN rejects a `dates=` range (400), so fetch the days
        # around that anchor individually and merge them in.
        anchor = _parse_date((js.get("day") or {}).get("date"))
        if anchor:
            extra = await asyncio.gather(
                *[
                    self._get(
                        url,
                        params={
                            "dates": (anchor + timedelta(days=d)).strftime("%Y%m%d")
                        },
                    )
                    for d in MATCHDAY_NEIGHBOUR_DAYS
                ],
                return_exceptions=True,
            )
            for er in extra:
                # A neighbouring day failing isn't worth losing the anchor
                # day's fixtures over — just show what did come back.
                if isinstance(er, Exception):
                    logger.warning(
                        "ESPN neighbouring-day fetch failed for %s: %s", slug, er
                    )
                elif er is not None:
                    for e in er.json().get("events", []):
                        if e.get("id"):
                            events.setdefault(e["id"], e)

        fixtures = []
        for e in sorted(events.values(), key=lambda e: e.get("date") or ""):
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
                        "short_name": (home.get("team") or {}).get("shortDisplayName"),
                        "logo": (home.get("team") or {}).get("logo"),
                    },
                    "away": {
                        "name": (away.get("team") or {}).get("displayName"),
                        "short_name": (away.get("team") or {}).get("shortDisplayName"),
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

        r = await self._get(
            f"{ESPN_SOCCER_BASE}/{slug}/summary", params={"event": event_id}
        )
        if r is None:
            return {
                "source": "espn",
                "competition": competition,
                "event": event_id,
                "teams": [],
                "available": False,
            }
        js = r.json()

        def _shape_team(roster: dict) -> dict:
            players = []
            for p in roster.get("roster") or []:
                athlete = p.get("athlete") or {}
                stats = {
                    s.get("name"): s.get("displayValue") for s in p.get("stats", [])
                }
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

    async def _country_roster_names(self, espn_team_id: str) -> set[str]:
        key = f"espn:nat-roster:{espn_team_id}"

        async def _fetch():
            r = await self._get(
                f"{ESPN_SOCCER_BASE}/fifa.friendly/teams/{espn_team_id}/roster"
            )
            if r is None:
                raise _EspnUnavailable(espn_team_id)
            js = r.json()
            return [_norm_name(a.get("fullName")) for a in js.get("athletes") or []]

        names, _, _ = await self.cache.get_or_set(
            key, _fetch, TTL_ESPN_SQUAD_NEWS, SWR_ESPN_SQUAD_NEWS
        )
        return set(names)

    async def _team_news(
        self, league_slug: str, espn_team_id: str, cache_ns: str
    ) -> list[dict]:
        """Squad-relevant news for an ESPN team, whether that's a country
        (fifa.friendly) or a PL club (eng.1). A story about a player's
        international withdrawal/injury can get filed under either feed
        depending on how the outlet framed it (e.g. "leaves Sweden camp"
        vs. "returns to Liverpool") — confirmed live: Alexander Isak's
        September 2026 injury only showed up under Liverpool's feed, not
        Sweden's, so both need checking, not just the country."""
        key = f"espn:{cache_ns}-news:{espn_team_id}"

        async def _fetch():
            r = await self._get(
                f"{ESPN_SOCCER_BASE}/{league_slug}/news",
                params={"team": espn_team_id, "limit": 50},
            )
            if r is None:
                raise _EspnUnavailable(espn_team_id)
            js = r.json()
            now = datetime.now(timezone.utc)
            out = []
            for a in js.get("articles") or []:
                headline = a.get("headline") or ""
                if not _SQUAD_NEWS_RE.search(headline):
                    continue
                # No timestamp (or an unparseable one) means we can't
                # verify this is recent — exclude it, same fail-closed
                # reasoning as the news_added handling in FPLService.hot_news().
                published = a.get("published")
                if not published:
                    continue
                try:
                    age_days = (
                        now - datetime.fromisoformat(published.replace("Z", "+00:00"))
                    ).days
                    if age_days > _SQUAD_NEWS_MAX_AGE_DAYS:
                        continue
                except ValueError:
                    continue
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

    async def _country_news(self, espn_team_id: str) -> list[dict]:
        return await self._team_news("fifa.friendly", espn_team_id, "nat")

    async def _club_news(self, espn_club_id: str) -> list[dict]:
        return await self._team_news("eng.1", espn_club_id, "club")

    async def _country_recent_or_next_match(
        self, espn_team_id: str
    ) -> Optional[Tuple[str, str]]:
        """A country's most recently completed match, or its next one if
        none has been played yet this window. Returns (competition, event_id)."""
        key = f"espn:nat-events:{espn_team_id}"

        async def _resolve_ref(ref: str) -> Optional[dict]:
            # A single event among several failing (403) isn't worth
            # losing the whole lookup over — skip just that one.
            er = await self._get(ref)
            return er.json() if er is not None else None

        async def _fetch():
            found: Dict[str, Tuple[str, str, str]] = {}
            for comp_key, slug in NATIONAL_TEAM_COMPETITIONS:
                # The core events list only carries upcoming matches, and the
                # site schedule only carries played ones — need both to know
                # the most recent match mid-window as well as the next one.
                upcoming, played = await asyncio.gather(
                    self._get(
                        f"{ESPN_CORE_BASE}/{slug}/teams/{espn_team_id}/events",
                        params={"limit": 50},
                    ),
                    self._get(
                        f"{ESPN_SOCCER_BASE}/{slug}/teams/{espn_team_id}/schedule"
                    ),
                )
                if upcoming is None or played is None:
                    # Losing a whole list (as opposed to one event in it) is a
                    # bigger deal — don't cache a competition as "no matches"
                    # when we just couldn't ask.
                    raise _EspnUnavailable(espn_team_id)
                for ev in played.json().get("events") or []:
                    if ev.get("id") and ev.get("date"):
                        found[ev["id"]] = (comp_key, ev["id"], ev["date"])
                refs = [
                    item.get("$ref")
                    for item in upcoming.json().get("items") or []
                    if item.get("$ref")
                ]
                # Each upcoming entry needs its own follow-up request to get a
                # date — resolve those concurrently rather than one at a time.
                for ejs in await asyncio.gather(*[_resolve_ref(ref) for ref in refs]):
                    if ejs and ejs.get("id") and ejs.get("date"):
                        found.setdefault(ejs["id"], (comp_key, ejs["id"], ejs["date"]))
            return list(found.values())

        events, _, _ = await self.cache.get_or_set(
            key, _fetch, TTL_ESPN_SQUAD_NEWS, SWR_ESPN_SQUAD_NEWS
        )
        if not events:
            return None

        def _parse(d: str) -> datetime:
            return datetime.fromisoformat(d.replace("Z", "+00:00"))

        now = datetime.now(timezone.utc)
        cutoff = now - timedelta(days=_RECENT_MATCH_MAX_AGE_DAYS)
        # A match from a previous window (e.g. June's friendlies) says nothing
        # about this one, so only count recent results.
        recent = [e for e in events if cutoff <= _parse(e[2]) <= now]
        upcoming = [e for e in events if _parse(e[2]) > now]
        if recent:
            comp_key, event_id, _ = max(recent, key=lambda e: _parse(e[2]))
        elif upcoming:
            comp_key, event_id, _ = min(upcoming, key=lambda e: _parse(e[2]))
        else:
            return None
        return comp_key, event_id

    async def _player_match_involvement(
        self, espn_team_id: str, candidate_names: set[str]
    ) -> Optional[dict]:
        match = await self._country_recent_or_next_match(espn_team_id)
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
                        (
                            t.get("team")
                            for t in lineup.get("teams", [])
                            if t is not team
                        ),
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

    async def international_squad_news(
        self, elements: List[dict], player_ids: List[int]
    ) -> dict:
        """`elements` is bootstrap-static's player list."""
        by_id = {p["id"]: p for p in elements}

        # Resolve each requested player's country and PL club, then only
        # fetch each distinct one once — a 15-player squad is usually
        # 8-12 countries but at most 20 clubs (often far fewer), not 15
        # separate lookups either way.
        wanted = [by_id[i] for i in player_ids if i in by_id]
        by_country: Dict[str, List[dict]] = defaultdict(list)
        by_club: Dict[str, List[dict]] = defaultdict(list)
        results: Dict[int, dict] = {}
        news_by_player: Dict[int, List[dict]] = defaultdict(list)
        for p in wanted:
            results[p["id"]] = {
                "country": None,
                "on_squad": None,
                "news": [],
                "recent_match": None,
            }
            entry = FPL_REGION_TO_ESPN_COUNTRY.get(p.get("region"))
            if entry:
                country, espn_team_id = entry
                by_country[espn_team_id].append(p)
                results[p["id"]]["country"] = country
            club_entry = FPL_TEAM_TO_ESPN_CLUB.get(p.get("team"))
            if club_entry:
                _, espn_club_id = club_entry
                by_club[espn_club_id].append(p)

        def _player_names(p: dict) -> set[str]:
            web = _norm_name(p.get("web_name"))
            # first_name/second_name can be present but explicitly null
            # (not just absent), which .get(key, "") doesn't guard
            # against — `or ""` does.
            first = _norm_name(p.get("first_name")).split()
            second = _norm_name(p.get("second_name")).split()
            names = {web, " ".join(first + second)}
            # FPL carries full legal names, ESPN the playing name — for
            # compound Portuguese/Brazilian names those never match exactly
            # ("Bruno Borges Fernandes" vs "Bruno Fernandes", "Gabriel dos
            # Santos Magalhães" vs "Gabriel Magalhães"), which wrongly showed
            # called-up players as dropped. First + last name bridges that.
            if first and second:
                names.add(f"{first[0]} {second[-1]}")
            names.discard("")
            return names

        async def _process_country(espn_team_id: str, players: List[dict]) -> None:
            try:
                roster_names, news = await asyncio.gather(
                    self._country_roster_names(espn_team_id),
                    self._country_news(espn_team_id),
                )
            except _EspnUnavailable:
                # This one country is throttled/unreachable right now —
                # its players keep the already-initialized "no data yet"
                # defaults rather than failing every other country's
                # results in the same batch.
                logger.warning(
                    "ESPN unavailable for country %s, skipping", espn_team_id
                )
                return
            for p in players:
                names = _player_names(p)
                on_squad = not names.isdisjoint(roster_names)
                results[p["id"]]["on_squad"] = on_squad
                news_by_player[p["id"]].extend(
                    a for a in news if not names.isdisjoint(a["athletes"])
                )
                # Only worth checking match involvement for players actually
                # on the current squad list — if they're not called up at
                # all, there's nothing to check whether they played in.
                if on_squad:
                    try:
                        results[p["id"]][
                            "recent_match"
                        ] = await self._player_match_involvement(espn_team_id, names)
                    except _EspnUnavailable:
                        logger.warning(
                            "ESPN unavailable resolving match involvement for %s, skipping",
                            espn_team_id,
                        )

        async def _process_club(espn_club_id: str, players: List[dict]) -> None:
            # A story about international-duty withdrawal/injury can be
            # filed under either the player's country feed or their club's
            # ("leaves Sweden camp" vs. "returns to Liverpool") — confirmed
            # live (Alexander Isak, Sep 2026: only under Liverpool's feed).
            # Check both rather than assume which one an outlet chose.
            try:
                news = await self._club_news(espn_club_id)
            except _EspnUnavailable:
                logger.warning("ESPN unavailable for club %s, skipping", espn_club_id)
                return
            for p in players:
                names = _player_names(p)
                news_by_player[p["id"]].extend(
                    a for a in news if not names.isdisjoint(a["athletes"])
                )

        # Countries and clubs are all independent — resolve everything
        # concurrently rather than one at a time.
        await asyncio.gather(
            *[_process_country(tid, players) for tid, players in by_country.items()],
            *[_process_club(cid, players) for cid, players in by_club.items()],
        )

        for pid, articles in news_by_player.items():
            seen_links = set()
            deduped = []
            for a in sorted(articles, key=lambda a: a["published"] or "", reverse=True):
                if a["link"] in seen_links:
                    continue
                seen_links.add(a["link"])
                deduped.append(
                    {
                        "headline": a["headline"],
                        "published": a["published"],
                        "link": a["link"],
                    }
                )
            results[pid]["news"] = deduped[:3]

        return {"source": "espn", "players": results}
