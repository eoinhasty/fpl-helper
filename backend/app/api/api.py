# api.py
from __future__ import annotations
import os
from typing import Optional, List
import httpx
from fastapi import APIRouter, Response, Request, Depends, HTTPException
from app.deps import limiter, verify_api_key, nocache_guard
from app.services.service import (
    FPLService,
    TTL_FIXTURES,
    TTL_PICKS,
    TTL_MYTEAM,
    SWR_MYTEAM,
    TTL_ENTRY,
    TTL_NEXTMATCH,
    TTL_NEWS,
    TTL_STANDINGS,
    TTL_FDR,
    TTL_PLAYERS,
    TTL_PLAYER_SUMMARY,
    SWR_NEXTMATCH,
    SWR_NEWS,
    SWR_STANDINGS,
)
import logging

logger = logging.getLogger("uvicorn.error")

# Health check has no auth or rate limit so Render's healthcheck always works
health_router = APIRouter(prefix="/api")

# All other endpoints require a valid X-Api-Key header
router = APIRouter(prefix="/api", dependencies=[Depends(verify_api_key)])


def set_cache_headers(resp: Response, status: str, age: float, ttl: int):
    resp.headers["x-cache-status"] = status
    resp.headers["x-cache-age"] = f"{age:.1f}"
    resp.headers["cache-control"] = f"public, max-age=0, stale-while-revalidate={ttl}"


_CACHE_STATUS_SEVERITY = {"hit": 0, "bypass-refresh": 1, "miss": 2, "stale-serve": 3}


def _favourite_team_short_name(entry_data: dict, boot: dict) -> Optional[str]:
    fav_team_id = entry_data.get("favourite_team")
    if not fav_team_id:
        return None
    t = next((t for t in boot["teams"] if t["id"] == fav_team_id), None)
    return t.get("short_name") if t else None


async def _entry_summary(
    svc: FPLService,
    entry_id: int,
    boot: dict,
    entry_data: Optional[dict] = None,
) -> dict:
    """Shape the entry_name/player_name/overall_rank/favourite_team fields
    shared by /squad and /live. Pass an already-fetched entry_data to avoid
    refetching it when the caller already has one (e.g. for 404 validation)."""
    if entry_data is None:
        entry_data, _, _ = await svc.entry(entry_id)

    player_name = (
        f"{entry_data.get('player_first_name', '')} "
        f"{entry_data.get('player_last_name', '')}"
    ).strip()

    hist, _, _ = await svc.entry_history(entry_id)
    current = hist.get("current") or []
    overall_rank = None
    for row in reversed(current):
        if row.get("overall_rank"):
            overall_rank = row["overall_rank"]
            break

    return {
        "entry_data": entry_data,
        "entry_name": entry_data.get("name"),
        "player_name": player_name,
        "overall_rank": overall_rank,
        "favourite_team": _favourite_team_short_name(entry_data, boot),
    }


def combine_cache(*readings: tuple[str, float]) -> tuple[str, float]:
    """Combine multiple (status, age) readings from the fetches that actually
    feed a response into one honest composite: the oldest age (a true upper
    bound on how stale anything shown could be) and the most severe status.
    Long-lived, rarely-changing fetches (fixtures, entry, entry history)
    should be excluded — their age is expected and reporting it would just
    make the badge pessimistic without being useful."""
    status = max(readings, key=lambda r: _CACHE_STATUS_SEVERITY.get(r[0], 0))[0]
    age = max(age for _, age in readings)
    return status, age


@health_router.get("/health")
async def health():
    return {"ok": True}


@router.get("/squad/{entry_id}")
@limiter.limit("30/minute")
async def squad(
    request: Request,
    response: Response,
    entry_id: int,
    gw: Optional[int] = None,
    noCache: int = 0,
    _: None = Depends(nocache_guard),
):
    svc: FPLService = request.app.state.svc

    # bootstrap (cached)
    boot, _, _ = await svc.bootstrap()
    events = boot["events"]
    season_status = FPLService.season_status(events)
    current_event = next((e for e in events if e["is_current"]), None)
    next_event = next((e for e in events if e["is_next"]), None)
    if not current_event and not next_event:
        raise HTTPException(404, detail="No active gameweek found.")
    current_gw_id = current_event["id"] if current_event else next_event["id"]
    next_gw_id = next_event["id"] if next_event else current_event["id"]

    # entry info first (cached long) — validates the ID so a bad entry stays a
    # genuine 404 even pre-season, when picks 404 for everyone
    try:
        entry_data, _, _ = await svc.entry(entry_id)
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 404:
            raise HTTPException(
                404, detail=f"FPL entry {entry_id} not found. Check your team ID."
            )
        raise
    entry_name = entry_data.get("name")  # e.g. "ABC FC"
    player_first_name = entry_data.get("player_first_name", "")
    player_last_name = entry_data.get("player_last_name", "")

    # picks (cached with tiny TTL; allow bypass)
    if gw is not None:
        try:
            picks_data, pick_status, pick_age = await svc.picks(
                entry_id, gw, no_cache=bool(noCache)
            )
        except httpx.HTTPStatusError as e:
            if e.response.status_code != 404 or season_status != "pre_season":
                raise
            # Pre-season: picks 404 for everyone — return a structured
            # empty squad so the UI can show a countdown instead of an error.
            fav_team = _favourite_team_short_name(entry_data, boot)
            deadline_event = next_event or current_event
            # No cache headers here — this response is hand-built from bootstrap
            # data, not the product of a real (cached) picks fetch, so there's
            # nothing honest to report. Omitting the header makes the frontend
            # hide the cache indicator instead of claiming a fake "just fetched".
            return {
                "entry_id": entry_id,
                "entry_name": entry_name,
                "player_name": f"{player_first_name} {player_last_name}".strip(),
                "overall_rank": None,
                "favourite_team": fav_team,
                "season_status": season_status,
                "requested_gw": gw,
                "used_gw": gw,
                "current_gw": current_gw_id,
                "used_label": "pre_season",
                "deadline": deadline_event["deadline_time"],
                "active_chip": None,
                "team_value": None,
                "team_bank": None,
                "players": [],
            }
        used_gw, used_label = gw, "explicit"
    else:
        picks_result = await svc.picks_with_fallback(
            entry_id, next_gw_id, current_gw_id
        )
        if picks_result is None:
            if season_status != "pre_season":
                raise HTTPException(
                    404,
                    detail=f"No open picks for GW {next_gw_id} or {current_gw_id}.",
                )
            # Pre-season: no picks exist for anyone yet — return a structured
            # empty squad so the UI can show a countdown instead of an error.
            fav_team = _favourite_team_short_name(entry_data, boot)
            deadline_event = next_event or current_event
            # No cache headers here — this response is hand-built from bootstrap
            # data, not the product of a real (cached) picks fetch, so there's
            # nothing honest to report. Omitting the header makes the frontend
            # hide the cache indicator instead of claiming a fake "just fetched".
            return {
                "entry_id": entry_id,
                "entry_name": entry_name,
                "player_name": f"{player_first_name} {player_last_name}".strip(),
                "overall_rank": None,
                "favourite_team": fav_team,
                "season_status": season_status,
                "requested_gw": next_gw_id,
                "used_gw": next_gw_id,
                "current_gw": current_gw_id,
                "used_label": "pre_season",
                "deadline": deadline_event["deadline_time"],
                "active_chip": None,
                "team_value": None,
                "team_bank": None,
                "players": [],
            }
        picks_data, used_gw, used_label, pick_status, pick_age = picks_result

    try:
        live_data, live_status, live_age = await svc.live_event(used_gw)
    except httpx.HTTPStatusError as e:
        # /event/{gw}/live/ can 404 in the window before a season's first kickoff
        if e.response.status_code != 404:
            raise
        live_data = {"elements": []}
        live_status, live_age = "miss", 0.0

    # fixtures (cached)
    fixtures_data, _, _ = await svc.fixtures(used_gw)

    summary = await _entry_summary(svc, entry_id, boot, entry_data=entry_data)
    overall_rank = summary["overall_rank"]
    fav_team = summary["favourite_team"]

    # shape for UI
    enriched, team_value, team_bank = svc.enrich_picks(
        picks_data, boot, fixtures_data, live_data
    )
    used_event = next((e for e in events if e["id"] == used_gw), None)
    if used_event is None:
        raise HTTPException(404, detail=f"Gameweek {used_gw} not found.")

    # Report the older/worse of picks vs. live scoring — picks alone would
    # understate staleness if live_event hasn't revalidated as recently.
    combined_status, combined_age = combine_cache(
        (pick_status, pick_age), (live_status, live_age)
    )
    set_cache_headers(response, combined_status, combined_age, TTL_PICKS)
    return {
        "entry_id": entry_id,
        "entry_name": entry_name,
        "player_name": f"{player_first_name} {player_last_name}".strip(),
        "overall_rank": overall_rank,
        "favourite_team": fav_team,
        "season_status": season_status,
        "requested_gw": gw or next_gw_id,
        "used_gw": used_gw,
        "current_gw": current_gw_id,
        "used_label": used_label,
        "deadline": used_event["deadline_time"],
        "active_chip": picks_data.get("active_chip"),
        "team_value": team_value,
        "team_bank": team_bank,
        "players": enriched,
    }


@router.get("/live/{entry_id}")
@limiter.limit("30/minute")
async def live(
    request: Request,
    response: Response,
    entry_id: int,
    noCache: int = 0,
    _: None = Depends(nocache_guard),
):
    svc: FPLService = request.app.state.svc

    boot, _, _ = await svc.bootstrap()
    events = boot["events"]
    used_event = next((e for e in events if e["is_next"]), None) or next(
        (e for e in events if e["is_current"]), None
    )
    if used_event is None:
        raise HTTPException(404, detail="No active gameweek found.")
    used_gw = used_event["id"]

    # token: prefer per-request header, fall back to server env var
    token = request.headers.get("x-fpl-token") or os.getenv("FPL_BEARER_TOKEN")

    # live (cached micro-TTL + bypass)
    live_data, mt_status, mt_age = await svc.my_team(
        entry_id, token=token, no_cache=bool(noCache)
    )

    fixtures_data, _, _ = await svc.fixtures(used_gw)
    try:
        # Tighter TTL than the default (matches my_team's 30s cadence) — Live
        # mode is exactly the time-sensitive case this endpoint exists for.
        event_live, ev_status, ev_age = await svc.live_event(
            used_gw, ttl=TTL_MYTEAM, stale_ttl=SWR_MYTEAM
        )
    except httpx.HTTPStatusError as e:
        # /event/{gw}/live/ can 404 pre-season while /my-team/ already works
        if e.response.status_code != 404:
            raise
        event_live = {"elements": []}
        ev_status, ev_age = "miss", 0.0

    enriched, _, _ = svc.enrich_picks(
        {"picks": live_data.get("picks", [])},
        boot,
        fixtures_data,
        event_live,
    )

    summary = await _entry_summary(svc, entry_id, boot)
    entry_name = summary["entry_name"]
    player_name = summary["player_name"]
    overall_rank = summary["overall_rank"]
    fav_team = summary["favourite_team"]

    transfers = live_data.get("transfers", {}) or {}
    team_value = transfers.get("value")
    team_bank = transfers.get("bank")

    current_event = next((e for e in events if e["is_current"]), None)
    current_gw_id = current_event["id"] if current_event else used_gw

    # Report the older/worse of team data vs. live scoring — the badge should
    # reflect whichever is staler, not just whichever this endpoint happens
    # to name first in the response headers.
    combined_status, combined_age = combine_cache(
        (mt_status, mt_age), (ev_status, ev_age)
    )
    set_cache_headers(response, combined_status, combined_age, TTL_MYTEAM)
    return {
        "entry_id": entry_id,
        "entry_name": entry_name,
        "player_name": player_name,
        "overall_rank": overall_rank,
        "favourite_team": fav_team,
        "season_status": FPLService.season_status(events),
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
@limiter.limit("30/minute")
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
                    "kickoff": fx.get("kickoff_time"),
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

    set_cache_headers(response, fx_status, fx_age, TTL_FIXTURES)

    count = max(1, min(int(count or 3), 10))
    return {"team_id": team_id, "fixtures": upcoming[:count]}


@router.get("/fixtures/grid")
@limiter.limit("30/minute")
async def fixtures_grid(request: Request, response: Response, horizon: int = 6):
    svc: FPLService = request.app.state.svc
    horizon = max(1, min(int(horizon or 6), 12))
    data, status, age = await svc.fdr_grid(horizon)
    set_cache_headers(response, status, age, TTL_FDR)
    return data


@router.get("/leagues/{entry_id}")
@limiter.limit("30/minute")
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
            "league_type": x.get("league_type"),
        }

    def map_h2h(x):
        return {
            "id": x.get("id"),
            "name": x.get("name"),
            "rank": x.get("entry_rank"),
            "last_rank": x.get("entry_last_rank"),
            "league_type": x.get("league_type"),
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
@limiter.limit("30/minute")
async def pl_next_match(request: Request, response: Response):
    svc: FPLService = request.app.state.svc
    key = "pl:nextmatch"

    async def _fetch():
        first, fixtures, gw = await svc.next_match_and_gw()
        boot, _, _ = await svc.bootstrap()
        teams = {t["id"]: t for t in boot["teams"]}

        def badge(team_id: int) -> str | None:
            code = teams.get(team_id, {}).get("code")
            return (
                f"https://resources.premierleague.com/premierleague/badges/50/t{code}.png"
                if code
                else None
            )

        def shape(fx: dict | None):
            if not fx:
                return None
            return {
                "home": teams.get(fx["team_h"], {}).get(
                    "short_name", str(fx["team_h"])
                ),
                "away": teams.get(fx["team_a"], {}).get(
                    "short_name", str(fx["team_a"])
                ),
                "home_badge": badge(fx["team_h"]),
                "away_badge": badge(fx["team_a"]),
                "home_difficulty": fx.get("team_h_difficulty"),
                "away_difficulty": fx.get("team_a_difficulty"),
                "kickoff": fx.get("kickoff_time"),
            }

        shaped = [s for s in (shape(fx) for fx in fixtures) if s is not None]

        return {"gw": gw, "first": shape(first), "fixtures": shaped}

    data, status, age = await svc.cache.get_or_set(
        key, _fetch, TTL_NEXTMATCH, SWR_NEXTMATCH
    )
    set_cache_headers(response, status, age, TTL_NEXTMATCH)
    return data


@router.get("/news/hot")
@limiter.limit("30/minute")
async def news_hot(
    request: Request, response: Response, days: int = 7, limit: int = 12
):
    svc: FPLService = request.app.state.svc
    days = max(1, min(int(days or 7), 30))
    limit = max(1, min(int(limit or 12), 50))
    key = f"hot:{days}:{limit}"

    async def _fetch():
        return {"items": await svc.hot_news(days, limit)}

    data, status, age = await svc.cache.get_or_set(key, _fetch, TTL_NEWS, SWR_NEWS)
    set_cache_headers(response, status, age, TTL_NEWS)
    return data


@router.get("/transfer-suggestions/{entry_id}")
@limiter.limit("30/minute")
async def transfer_suggestions(
    request: Request,
    response: Response,
    entry_id: int,
    top_n: int = 3,
):
    svc: FPLService = request.app.state.svc
    top_n = max(1, min(int(top_n), 5))
    data = await svc.transfer_suggestions(entry_id, top_n=top_n)
    # suggestions are derived from bootstrap (6h) + picks (60s); use the shorter TTL
    response.headers["x-cache-status"] = "live"
    response.headers["cache-control"] = (
        f"public, max-age=0, stale-while-revalidate={TTL_PICKS}"
    )
    return data


@router.get("/players")
@limiter.limit("30/minute")
async def players(request: Request, response: Response):
    svc: FPLService = request.app.state.svc
    data, status, age = await svc.player_pool()
    set_cache_headers(response, status, age, TTL_PLAYERS)
    return data


@router.get("/player/{player_id}/summary")
@limiter.limit("60/minute")
async def player_summary(request: Request, response: Response, player_id: int):
    svc: FPLService = request.app.state.svc
    boot, _, _ = await svc.bootstrap()
    if not any(p["id"] == player_id for p in boot["elements"]):
        raise HTTPException(404, detail=f"Player {player_id} not found.")
    data, status, age = await svc.player_summary(player_id)
    set_cache_headers(response, status, age, TTL_PLAYER_SUMMARY)
    return data


@router.get("/pl/standings")
@limiter.limit("30/minute")
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
