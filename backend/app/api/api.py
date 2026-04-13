# api.py
from __future__ import annotations
import os
from typing import Optional, List
from fastapi import APIRouter, Response, Request
from app.services.service import (
    FPLService,
    TTL_BOOTSTRAP,
    TTL_FIXTURES,
    TTL_PICKS,
    TTL_MYTEAM,
    TTL_ENTRY,
    TTL_NEXTMATCH,
    TTL_NEWS,
    TTL_STANDINGS,
    SWR_NEXTMATCH,
    SWR_NEWS,
    SWR_STANDINGS,
)
import logging

logger = logging.getLogger("uvicorn.error")

router = APIRouter(prefix="/api")


def set_cache_headers(resp: Response, status: str, age: float, ttl: int):
    resp.headers["x-cache-status"] = status
    resp.headers["x-cache-age"] = f"{age:.1f}"
    resp.headers["cache-control"] = f"public, max-age=0, stale-while-revalidate={ttl}"


@router.get("/health")
async def health():
    return {"ok": True}



@router.get("/squad/{entry_id}")
async def squad(
    request: Request,
    response: Response,
    entry_id: int,
    gw: Optional[int] = None,
    noCache: int = 0,
):
    svc: FPLService = request.app.state.svc

    # bootstrap (cached)
    boot, _, _ = await svc.bootstrap()
    events = boot["events"]
    current_event = next(e for e in events if e["is_current"])
    next_event = next(e for e in events if e["is_next"])
    current_gw_id = current_event["id"]
    next_gw_id = next_event["id"]

    # picks (cached with tiny TTL; allow bypass)
    if gw is not None:
        picks_data, pick_status, pick_age = await svc.picks(
            entry_id, gw, no_cache=bool(noCache)
        )
        used_gw, used_label = gw, "explicit"
    else:
        picks_data, used_gw, used_label = await svc.picks_with_fallback(
            entry_id, next_gw_id, current_gw_id
        )
        # reflect cache from the actual used gw
        _, pick_status, pick_age = await svc.picks(entry_id, used_gw)
        
    live_data, _, _ = await svc.live_event(used_gw)

    # fixtures (cached)
    fixtures_data, _, _ = await svc.fixtures(used_gw)

    # entry info (cached long)
    entry_data, _, _ = await svc.entry(entry_id)
    entry_name = entry_data.get("name")  # e.g. "ABC FC"
    player_first_name = entry_data.get("player_first_name", "")
    player_last_name = entry_data.get("player_last_name", "")

    hist, _, _ = await svc.entry_history(entry_id)
    current = hist.get("current") or []
    overall_rank = None
    if current:
        for row in reversed(current):
            if row.get("overall_rank"):
                overall_rank = row["overall_rank"]
                break

    fav_team = None
    fav_team_id = entry_data.get("favourite_team")
    if fav_team_id:
        t = next((t for t in boot["teams"] if t["id"] == fav_team_id), None)
        if t:
            fav_team = t.get("short_name")

    # shape for UI
    enriched, team_value, team_bank = svc.enrich_picks(picks_data, boot, fixtures_data, live_data)
    used_event = next(e for e in events if e["id"] == used_gw)

    set_cache_headers(response, pick_status, pick_age, TTL_PICKS)
    return {
        "entry_id": entry_id,
        "entry_name": entry_name,
        "player_name": f"{player_first_name} {player_last_name}".strip(),
        "overall_rank": overall_rank,
        "favourite_team": fav_team,
        "requested_gw": gw or next_gw_id,
        "used_gw": used_gw,
        "current_gw": current_gw_id,
        "used_label": used_label,
        "deadline": used_event["deadline_time"],
        "active_chip": picks_data.get("active_chip"),
        "team_value": team_value,
        "team_bank": team_bank,
        "players": enriched,
        "debug_version": "squad-live-wired-1"
    }


@router.get("/live/{entry_id}")
async def live(request: Request, response: Response, entry_id: int, noCache: int = 0):
    svc: FPLService = request.app.state.svc

    boot, _, _ = await svc.bootstrap()
    events = boot["events"]
    used_event = next((e for e in events if e["is_next"]), None) or next(
        e for e in events if e["is_current"]
    )
    used_gw = used_event["id"]

    # token: prefer per-request header, fall back to server env var
    token = request.headers.get("x-fpl-token") or os.getenv("FPL_BEARER_TOKEN")

    # live (cached micro-TTL + bypass)
    live_data, mt_status, mt_age = await svc.my_team(entry_id, token=token, no_cache=bool(noCache))

    fixtures_data, _, _ = await svc.fixtures(used_gw)
    event_live, _, _ = await svc.live_event(used_gw)

    enriched, _, _ = svc.enrich_picks(
        {"picks": live_data.get("picks", [])},
        boot,
        fixtures_data,
        event_live,
    )

    entry_data, _, _ = await svc.entry(entry_id)
    entry_name = entry_data.get("name")
    player_first_name = entry_data.get("player_first_name", "")
    player_last_name = entry_data.get("player_last_name", "")

    hist, _, _ = await svc.entry_history(entry_id)
    current = hist.get("current") or []
    overall_rank = None
    if current:
        for row in reversed(current):
            if row.get("overall_rank"):
                overall_rank = row["overall_rank"]
                break

    fav_team = None
    fav_team_id = entry_data.get("favourite_team")
    if fav_team_id:
        t = next((t for t in boot["teams"] if t["id"] == fav_team_id), None)
        if t:
            fav_team = t.get("short_name")

    transfers = live_data.get("transfers", {}) or {}
    team_value = transfers.get("value")
    team_bank = transfers.get("bank")

    current_gw_id = next(e for e in events if e["is_current"])["id"]

    set_cache_headers(response, mt_status, mt_age, TTL_MYTEAM)
    return {
        "entry_id": entry_id,
        "entry_name": entry_name,
        "player_name": f"{player_first_name} {player_last_name}".strip(),
        "overall_rank": overall_rank,
        "favourite_team": fav_team,
        "requested_gw": used_gw,
        "used_gw": used_gw,
        "current_gw": current_gw_id,
        "used_label": "live",
        "deadline": used_event["deadline_time"],
        "active_chip": None,
        "team_value": team_value,
        "team_bank": team_bank,
        "players": enriched,
    }



@router.get("/team-next/{team_id}")
async def team_next(request: Request, response: Response, team_id: int, count: int = 3):
    svc: FPLService = request.app.state.svc

    boot, _, _ = await svc.bootstrap()
    events = boot["events"]
    base_event = next((e for e in events if e["is_next"]), None) or next(
        e for e in events if e["is_current"]
    )
    base_gw = base_event["id"]

    # get all fixtures (cached + SWR)
    all_fixtures, fx_status, fx_age = await svc.fixtures(None)

    # build for this team
    upcoming: List[dict] = []
    for fx in all_fixtures:
        event = fx.get("event")
        if not event or event < base_gw:
            continue
        if fx["team_h"] == team_id:
            upcoming.append(
                {
                    "event": event,
                    "opp": next(
                        t["short_name"]
                        for t in boot["teams"]
                        if t["id"] == fx["team_a"]
                    ),
                    "home": True,
                    "difficulty": fx["team_h_difficulty"],
                    "kickoff": fx.get("kickoff_time"),  # may be None
                }
            )
        elif fx["team_a"] == team_id:
            upcoming.append(
                {
                    "event": event,
                    "opp": next(
                        t["short_name"]
                        for t in boot["teams"]
                        if t["id"] == fx["team_h"]
                    ),
                    "home": False,
                    "difficulty": fx["team_a_difficulty"],
                    "kickoff": fx.get("kickoff_time"),
                }
            )

    upcoming.sort(key=lambda x: (x["event"], x["kickoff"] or ""))

    # cache headers so your UI’s indicators stay consistent
    set_cache_headers(response, fx_status, fx_age, TTL_FIXTURES)

    count = max(1, min(int(count or 3), 10))
    return {"team_id": team_id, "fixtures": upcoming[:count]}


@router.get("/leagues/{entry_id}")
async def leagues(request: Request, response: Response, entry_id: int):
    svc: FPLService = request.app.state.svc
    entry_json, status, age = await svc.entry(entry_id)

    leagues = entry_json.get("leagues") or {}
    classic = leagues.get("classic") or []
    h2h = leagues.get("h2h") or []

    def map_classic(x):
        return {
            "id": x.get("id"),
            "name": x.get("name"),
            "rank": x.get("entry_rank"),
            "last_rank": x.get("entry_last_rank"),
        }

    def map_h2h(x):
        return {
            "id": x.get("id"),
            "name": x.get("name"),
            "rank": x.get("entry_rank"),  # h2h uses points table rank
            "last_rank": x.get("entry_last_rank"),
        }

    set_cache_headers(response, status, age, TTL_ENTRY)
    return {
        "entry_id": entry_id,
        "overall_rank": entry_json.get("summary_overall_rank"),
        "event_rank": entry_json.get("summary_event_rank"),
        "classic": [map_classic(x) for x in classic],
        "h2h": [map_h2h(x) for x in h2h],
    }


@router.get("/pl/next-match")
async def pl_next_match(request: Request, response: Response):
    svc: FPLService = request.app.state.svc
    key = "pl:nextmatch"

    async def _fetch():
        first, fixtures, gw = await svc.next_match_and_gw()
        boot, _, _ = await svc.bootstrap()
        teams = {t["id"]: t["short_name"] for t in boot["teams"]}

        def shape(fx: dict | None):
            if not fx:
                return None
            return {
                "home": teams.get(fx["team_h"], str(fx["team_h"])),
                "away": teams.get(fx["team_a"], str(fx["team_a"])),
                "home_difficulty": fx.get("team_h_difficulty"),
                "away_difficulty": fx.get("team_a_difficulty"),
                "kickoff": fx.get("kickoff_time"),
            }

        shaped = [s for s in (shape(fx) for fx in fixtures) if s is not None]

        return {"gw": gw, "first": shape(first), "fixtures": shaped}

    data, status, age = await svc.cache.get_or_set(key, _fetch, TTL_NEXTMATCH, SWR_NEXTMATCH)
    set_cache_headers(response, status, age, TTL_NEXTMATCH)
    return data

@router.get("/news/hot")
async def news_hot(
    request: Request, response: Response, days: int = 7, limit: int = 12
):
    svc: FPLService = request.app.state.svc
    key = f"hot:{days}:{limit}"

    async def _fetch():
        return {"items": await svc.hot_news(days, limit)}

    data, status, age = await svc.cache.get_or_set(key, _fetch, TTL_NEWS, SWR_NEWS)
    set_cache_headers(response, status, age, TTL_NEWS)
    return data


@router.get("/pl/standings")
async def pl_standings(request: Request, response: Response):
    svc: FPLService = request.app.state.svc
    key = "pl:standings"
    token = os.getenv("FOOTBALL_DATA_API_KEY")  # optional

    async def _fetch():
        return await svc.standings_pl(token)

    data, status, age = await svc.cache.get_or_set(
        key, _fetch, TTL_STANDINGS, SWR_STANDINGS
    )
    set_cache_headers(response, status, age, TTL_STANDINGS)
    return data
