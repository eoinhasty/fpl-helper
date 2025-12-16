# service.py
from __future__ import annotations
import os, asyncio
from typing import Any, Dict, Optional, Tuple, List
import httpx
from fastapi import HTTPException
from datetime import datetime, timezone
from app.simple_cache import AsyncCache

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
TTL_ENTRY = 60 * 60       # 1h
SWR_ENTRY = 6 * 60 * 60   # +6h
TTL_ENTRY_HIST = 15 * 60   # 15m
SWR_ENTRY_HIST = 2 * 60 * 60  # +2h
TTL_NEXTMATCH = 5 * 60        # 5m fresh (fixtures change rarely but scorelines can)
SWR_NEXTMATCH = 30 * 60
TTL_NEWS = 30 * 60            # 30m fresh
SWR_NEWS = 6 * 60 * 60
TTL_STANDINGS = 60 * 60       # 1h fresh
SWR_STANDINGS = 6 * 60 * 60

def _ua() -> Dict[str, str]:
    return {"User-Agent": "Personal FPL Helper"}


def _auth_headers_from(token: Optional[str]) -> Dict[str, str]:
    if not token:
        raise HTTPException(400, detail="Missing FPL_BEARER_TOKEN (env or set-token).")
    return {"X-Api-Authorization": token}


class FPLService:
    def __init__(self) -> None:
        self.public = httpx.AsyncClient(base_url=FPL_BASE, headers=_ua(), timeout=20.0)
        self._auth_client: Optional[httpx.AsyncClient] = None
        self.cache = AsyncCache()
        self._token_override: Optional[str] = None  # <— NEW

    # optionally expose helpers
    def set_token(self, token: Optional[str]) -> None:
        self._token_override = token or None

    def current_token(self) -> Optional[str]:
        return self._token_override or os.getenv("FPL_BEARER_TOKEN") or None

    async def _get_json_auth(self, path: str, params: Optional[dict] = None) -> Any:
        if not self._auth_client:
            self._auth_client = httpx.AsyncClient(
                base_url=FPL_BASE, headers=_ua(), timeout=20.0
            )
        token = self.current_token()
        r = await self._auth_client.get(
            path, params=params, headers=_auth_headers_from(token)
        )
        if r.status_code in (401, 403):
            raise HTTPException(
                r.status_code,
                detail="Unauthorized for /my-team. Paste a fresh token in Settings or use the extension.",
            )
        r.raise_for_status()
        return r.json()

    async def close(self):
        await self.public.aclose()
        if self._auth_client:
            await self._auth_client.aclose()

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
                delay = (
                    float(ra) if (ra and ra.isdigit()) else (0.6 * (2 ** (attempt - 1)))
                )
                await asyncio.sleep(delay)
                continue
            r.raise_for_status()
            return r.json()

    # ------------- cached helpers (the only ones routes call) -------------
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

    async def picks(
        self, entry_id: int, gw: int, *, no_cache: bool = False
    ) -> Tuple[dict, str, float]:
        key = f"picks:{entry_id}:{gw}"
        fetch = lambda: self._get_json(f"/entry/{entry_id}/event/{gw}/picks/")
        if no_cache:
            return await self.cache.refresh(key, fetch, TTL_PICKS, SWR_PICKS)
        return await self.cache.get_or_set(key, fetch, TTL_PICKS, SWR_PICKS)

    async def my_team(
        self, entry_id: int, *, no_cache: bool = False
    ) -> Tuple[dict, str, float]:
        key = f"myteam:{entry_id}"
        fetch = lambda: self._get_json_auth(f"/my-team/{entry_id}/")
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
    
    def _iso(dt: str | None) -> str | None:
        return dt

    async def next_match_and_gw(self) -> tuple[dict, list[dict], int]:
        # pick next event (else current), then earliest kickoff fixture
        boot, _, _ = await self.bootstrap()
        events = boot["events"]
        ev = next((e for e in events if e["is_next"]), None) or next(e for e in events if e["is_current"])
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
            if not news: continue
            added = p.get("news_added")
            recent = True
            if added:
                try:
                    dt = datetime.fromisoformat(added.replace("Z","+00:00"))
                    recent = (now - dt).days <= days
                except Exception:
                    pass
            if not recent: continue
            t = teams.get(p["team"])
            out.append({
                "id": p["id"],
                "name": p["web_name"],
                "team": t["short_name"] if t else None,
                "position": p["element_type"],
                "news": news,
                "news_added": added,
                "status": p["status"],
                "start_probability": self.start_prob_from(p),
            })
        # simple relevance: newest first, then “injury/transfer” hints first
        pri = lambda n: (("injury" in n["news"].lower()) or ("transfer" in n["news"].lower()))
        out.sort(key=lambda x: (not pri(x), x["news_added"] or ""), reverse=False)
        return out[: max(1, limit)]

    async def standings_pl(self, token: str | None) -> dict:
        """
        Option A: real Premier League table via football-data.org (needs API key).
        Option B: stub data if no key (so the card still renders).
        """
        if token:
            client = self.public  # reuse base client
            r = await client.get("https://api.football-data.org/v4/competitions/2021/standings",
                                headers={"X-Auth-Token": token, **_ua()})
            r.raise_for_status()
            print("Fetched real PL standings from football-data.org")
            js = r.json()
            # shape to a compact table
            table = next(s for s in js["standings"] if s["type"] == "TOTAL")["table"]
            return {
                "source": "football-data.org",
                "rows": [
                    {
                        "pos": row["position"],
                        "team": row["team"]["shortName"] or row["team"]["name"],
                        "played": row["playedGames"],
                        "w": row["won"], "d": row["draw"], "l": row["lost"],
                        "gf": row["goalsFor"], "ga": row["goalsAgainst"], "pts": row["points"],
                    } for row in table
                ],
            }
        # Fallback stub
        return {
            "source": "stub",
            "rows": [
                {"pos":1,"team":"Man City","played":18,"w":14,"d":2,"l":2,"gf":43,"ga":15,"pts":44},
                {"pos":2,"team":"Arsenal","played":18,"w":13,"d":4,"l":1,"gf":38,"ga":12,"pts":43},
                {"pos":3,"team":"Liverpool","played":18,"w":12,"d":5,"l":1,"gf":41,"ga":17,"pts":41},
            ],
        }

    # ----------------- utilities for shaping data -----------------
    @staticmethod
    def start_prob_from(player: dict) -> float:
        status = player.get("status", "a")
        news = (player.get("news") or "").lower()
        base = {"a": 0.88, "d": 0.55, "i": 0.0, "s": 0.0, "n": 0.0}.get(status, 0.5)
        if any(k in news for k in ["ruled out", "surgery", "setback"]):
            base *= 0.2
        elif any(k in news for k in ["doubt", "late test", "assess"]):
            base *= 0.7
        elif any(
            k in news for k in ["back in training", "available", "returned", "fit"]
        ):
            base = max(base, 0.9)
        return round(max(0.0, min(0.99, base)), 2)

    @staticmethod
    def enrich_picks(
        picks: dict, boot: dict, fixtures: list
    ) -> Tuple[List[dict], Optional[int], Optional[int]]:
        players = {p["id"]: p for p in boot["elements"]}
        teams = {t["id"]: t for t in boot["teams"]}

        fdr_by_team: Dict[int, dict] = {}
        for fx in fixtures:
            h, a = fx["team_h"], fx["team_a"]
            fdr_by_team[h] = {
                "opp": teams[a]["short_name"],
                "home": True,
                "difficulty": fx["team_h_difficulty"],
                "kickoff": fx["kickoff_time"],
            }
            fdr_by_team[a] = {
                "opp": teams[h]["short_name"],
                "home": False,
                "difficulty": fx["team_a_difficulty"],
                "kickoff": fx["kickoff_time"],
            }

        enriched = []
        for pick in picks.get("picks", []):
            el = pick["element"]
            p = players.get(el, {})
            t = teams.get(p.get("team", 0), {})
            fdr = fdr_by_team.get(p.get("team", 0), {})
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
                    "element": el,                                      # player ID (e.g. 254)
                    "name": p.get("web_name"),                          # player short name (e.g. "Salah")
                    "team": t.get("short_name"),                        # team short name (e.g. "LIV")
                    "team_id": p.get("team"),                           # team ID (e.g. 14)
                    "position": p.get("element_type"),                  # position ID (1=GK, 2=DEF, 3=MID, 4=FWD)
                    "price": p.get("now_cost"),                         # current price (e.g. 125 = £12.5m)
                    "status": p.get("status"),                          # "a", "d", "i", "s", "n"
                    "news": p.get("news"),                              # injury news (e.g. "" or "Knee Injury - Expected back 01 Jan")
                    "total_points": p.get("total_points"),              # total points this season
                    "selected_by_percent": p.get("selected_by_percent"),# e.g. "28.5"
                    "start_probability": FPLService.start_prob_from(p), # estimated start probability
                    "is_captain": pick.get("is_captain"),               # is captain this GW? (e.g. True/False)
                    "is_vice_captain": pick.get("is_vice_captain"),     # is vice-captain this GW? (e.g. True/False)
                    "fixture": fdr or None,                             # next fixture details or None (e.g. {"opp": "CHE", "home": True, "difficulty": 3, "kickoff": "2024-08-09T19:45:00Z"})
                    "slot": pick.get("position"),                       # squad slot 1-15 (starting 1-11, bench 12-15)
                    "multiplier": pick.get("multiplier"),               # points multiplier (2 if captain, 1 otherwise)
                    "shirt_url": shirt_url,                             # shirt image URL
                }
            )

        eh = picks.get("entry_history") or {}
        return enriched, eh.get("value"), eh.get("bank")

    async def picks_with_fallback(
        self, entry_id: int, next_gw: int, current_gw: int
    ) -> Tuple[dict, int, str]:
        """Try next GW; if 404, fall back to current GW. Return (picks, used_gw, label)."""
        for gw, label in ((next_gw, "next"), (current_gw, "current")):
            try:
                data, _, _ = await self.picks(entry_id, gw)
                return data, gw, label
            except httpx.HTTPStatusError as e:
                if e.response.status_code == 404:
                    continue
                if e.response.status_code == 403:
                    raise HTTPException(
                        403,
                        detail="Team is private; make it public or log in with cookies.",
                    )
                raise
        raise HTTPException(
            404, detail=f"No open picks for GW {next_gw} or {current_gw}."
        )