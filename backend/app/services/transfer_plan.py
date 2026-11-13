# transfer_plan.py
"""The transfer planner's model for an entry (GET /api/transfer-plan): the
squad, bank, free transfers and chip windows from FPL, fed into planner.py's
MILP and shipped as LP text for the browser to solve."""

from __future__ import annotations
from typing import Dict, Iterable, List, Optional, Tuple, Union

from fastapi import HTTPException

from app.services.chips import ChipChoice, ChipWindows, chip_play, double_gws
from app.services.gameweeks import current_and_next
from app.services.planner import (
    HIT_COST,
    MAX_FT,
    SQUAD_QUOTA,
    bench_boost_gain,
    free_transfers,
    sell_price,
    to_lp,
)
from app.services.planner import build as build_plan_model
from app.services.scoring import horizon_projections
from app.services.service import TTL_MYTEAM, TTL_PICKS, FPLService

# backend/scripts/backtest_transfers.py's solver arm (SOLVER_WINDOW,
# SOLVER_POOL_PER_POS), which beat the app's suggestions in all six fair
# tests. The gap is looser than the backtest's 0.002 (solver.py): in the
# browser that took ~8s vs ~3s, for plans within ~2 pts over 5 GWs.
PLAN_HORIZON = 5
PLAN_POOL_PER_POS = 25
PLAN_MIP_GAP = 0.01


async def build_transfer_plan(
    svc: FPLService,
    entry_id: int,
    *,
    token: Optional[str] = None,
    no_hits: bool = False,
    wildcard: Optional[int] = None,
    keep: Iterable[int] = (),
    exclude: Iterable[int] = (),
    bench_boost: Union[int, str, None] = None,
    triple_captain: Union[int, str, None] = None,
) -> Tuple[dict, List[Tuple[str, float]], int]:
    """The multi-GW transfer planner's model for this entry (planner.py),
    as LP text for the browser to solve, plus what it needs to show the
    plan. Same setup as backtest_transfers.py's solver arm: the next
    PLAN_HORIZON GWs, the squad plus the PLAN_POOL_PER_POS best players
    per position by projected points, the first GW scaled by chance of
    playing. Without usable projections or a squad, returns
    {"available": False, "reason": ...} — the card falls back to
    transfer suggestions.

    The card's options, as planner.build's: no_hits; wildcard, a GW to
    play it in (ignored unless a wildcard window is open then); keep,
    squad players held for the whole horizon; exclude, players never
    bought; bench_boost and triple_captain, a GW to play the chip in or
    "best" for the solver to pick its week (at most once per open
    window; a Triple Captain only in a double GW, see chip_play). A Bench Boost or Triple Captain already active for the next
    GW is planned there regardless. What was applied is echoed back as
    "options"."""
    boot, boot_status, boot_age = await svc.bootstrap()
    events = boot["events"]
    current, nxt = current_and_next(events)

    def unavailable(reason: str, readings: List[Tuple[str, float]]):
        body = {"entry_id": entry_id, "available": False, "reason": reason}
        return body, readings, TTL_PICKS

    if nxt is None:
        return unavailable("season_over", [(boot_status, boot_age)])
    first_gw = nxt["id"]
    proj = await svc.projections_file()
    horizon = horizon_projections(proj, events, first_gw, PLAN_HORIZON)
    if not horizon:
        return unavailable("no_projections", [(boot_status, boot_age)])
    gws = [g for g in proj["gws"] if g >= first_gw][:PLAN_HORIZON]
    els = {e["id"]: e for e in boot["elements"]}

    # Squad, bank, selling prices and free transfers: exact from my_team
    # when logged in (as transfer_suggestions), else rebuilt from the
    # public picks, GW history and transfer log.
    picks_list: List[dict] = []
    sell: Dict[int, int] = {}
    bank = 0
    ft = 1
    unlimited = False
    # The chip played for the next deadline, known only from my_team
    active_chip: Optional[str] = None
    reading: Optional[Tuple[str, float]] = None
    if token:
        try:
            my_team_data, mt_status, mt_age = await svc.my_team(entry_id, token=token)
            picks_list = my_team_data.get("picks", [])
            transfers = my_team_data.get("transfers") or {}
            bank = transfers.get("bank", 0)
            sell = {
                p["element"]: p["selling_price"]
                for p in picks_list
                if p.get("selling_price")
            }
            # A free hit squad reverts after the GW, so neither planning
            # it as a wildcard nor from the squad it replaces is right
            # (the card falls back to suggestions). "active" = played for
            # the next deadline, as FPL's own web app reads it.
            active_chip = next(
                (
                    c.get("name")
                    for c in my_team_data.get("chips") or []
                    if c.get("status_for_entry") == "active"
                ),
                None,
            )
            if active_chip == "freehit":
                return unavailable("free_hit", [(mt_status, mt_age)])
            # e.g. {"limit": 2, "made": 0, "bank": 23, "status": "cost"}.
            # FPL's web app charges no hits when limit is null or status
            # is "unlimited" (pre-season, or a wildcard this GW): plan the
            # first GW as a wildcard
            limit = transfers.get("limit")
            unlimited = limit is None or transfers.get("status") == "unlimited"
            ft = 0 if unlimited else max(0, limit - (transfers.get("made") or 0))
            reading = (mt_status, mt_age)
        except HTTPException as e:
            # _get_json_auth turns FPL's 401/403 into an HTTPException
            if e.status_code not in (401, 403):
                raise
            token = None  # rejected token — fall through to picks below

    if reading is None:
        picks_result = await svc.picks_with_fallback(
            entry_id, first_gw, (current or nxt)["id"]
        )
        if picks_result is None:
            return unavailable("no_squad", [(boot_status, boot_age)])
        picks_data, _, _, p_status, p_age = picks_result
        picks_list = picks_data.get("picks", [])
        history, _, _ = await svc.entry_history(entry_id)
        log, _, _ = await svc.entry_transfers(entry_id)
        bank = (picks_data.get("entry_history") or {}).get("bank", 0)
        ft = free_transfers(history.get("current", []), history.get("chips", []))
        paid: Dict[int, int] = {}
        for t in sorted(log, key=lambda t: t.get("time", "")):
            paid[t["element_in"]] = t["element_in_cost"]
        for p in picks_list:
            el = els.get(p["element"])
            if el:
                now = el["now_cost"]
                bought = paid.get(el["id"], now - el.get("cost_change_start", 0))
                sell[el["id"]] = sell_price(bought, now)
        reading = (p_status, p_age)

    squad = [p["element"] for p in picks_list if p["element"] in els]
    if len(squad) != 15:
        return unavailable("no_squad", [reading])

    # GWs of the horizon each chip could be played in, per window in
    # bootstrap's chips (one of each per half: GW1/2–19, GW20–38) unless
    # the GW history shows it played there. A chip already active for the
    # next GW uses its window up, and holds that GW (one chip per GW).
    history, _, _ = await svc.entry_history(entry_id)
    played = [(c.get("name"), c.get("event", 0)) for c in history.get("chips", [])]
    if active_chip:
        played.append((active_chip, gws[0]))

    # The first GW is taken by the active chip, or by unlimited transfers
    # (planned as a wildcard — pre-season too, which isn't one, but a
    # GW1 Bench Boost is rare enough not to model)
    active_gw = gws[0] if active_chip or unlimited else None

    # GWs where some club plays twice, for Triple Captain's "best"
    fixtures, _, _ = await svc.fixtures(None)
    cw = ChipWindows(
        boot.get("chips", []), played, gws, active_gw, double_gws(fixtures)
    )

    # Not offered while transfers are already unlimited
    wildcard_gws = [] if unlimited else sum(cw.windows("wildcard"), [])
    if wildcard not in wildcard_gws:
        wildcard = gws[0] if unlimited else None

    def window(el: dict) -> List[float]:
        row = (horizon.get(el["id"], []) + [0.0] * len(gws))[: len(gws)]
        chance = el.get("chance_of_playing_next_round")
        if chance is not None:  # projections assume availability
            row[0] *= chance / 100
        return row

    # The current squad's projected Bench Boost gain in each GW
    squad_pts = {el: window(els[el]) for el in squad}
    squad_pos = {el: els[el]["element_type"] for el in squad}
    bb_gain = [
        bench_boost_gain({el: row[g] for el, row in squad_pts.items()}, squad_pos)
        for g in range(len(gws))
    ]

    def chip(name: str, choice: ChipChoice):
        return chip_play(
            cw,
            name,
            choice,
            active_chip=active_chip,
            wildcard=wildcard,
            bb_gain=bb_gain,
        )

    bb_play, bench_boost_gws, bench_boost = chip("bboost", bench_boost)
    tc_play, triple_captain_gws, triple_captain = chip("3xc", triple_captain)
    # Two chips can't share a fixed week; keep the Bench Boost
    if isinstance(bench_boost, int) and triple_captain == bench_boost:
        tc_play, triple_captain = None, None
    keep = sorted(set(keep) & set(squad))
    exclude = sorted(set(exclude) - set(squad))

    candidates = [
        e
        for e in boot["elements"]
        if e.get("element_type") in SQUAD_QUOTA
        and e["id"] not in sell
        and (e.get("minutes") or 0) > 0
        # "u" = left the club; can't be bought (player_pool drops them too)
        and e.get("status") != "u"
        # before the top-N cut, so the next best takes the slot
        and e["id"] not in exclude
    ]
    pts_by_el = {el: window(els[el]) for el in squad}
    for pos in SQUAD_QUOTA:
        ranked = sorted(
            (e for e in candidates if e["element_type"] == pos),
            key=lambda e: sum(window(e)),
            reverse=True,
        )
        for e in ranked[:PLAN_POOL_PER_POS]:
            pts_by_el[e["id"]] = window(e)
    pool = sorted(pts_by_el)
    cost = {el: sell[el] if el in sell else els[el]["now_cost"] for el in pool}
    model = build_plan_model(
        pool,
        {(el, gw): pts_by_el[el][g] for el in pool for g, gw in enumerate(gws)},
        cost,
        bank + sum(sell[el] for el in squad),
        {el: els[el]["team"] for el in pool},
        {el: els[el]["element_type"] for el in pool},
        squad,
        min(ft, MAX_FT),
        gws,
        wildcard=wildcard,
        no_hits=no_hits,
        keep=keep,
        bench_boost=bb_play,
        triple_captain=tc_play,
    )

    teams = {t["id"]: t for t in boot["teams"]}
    players = {}
    for el in pool:
        e = els[el]
        t = teams.get(e["team"], {})
        players[el] = {
            "name": e.get("web_name"),
            "team": t.get("short_name"),
            "team_code": t.get("code"),
            "position": e["element_type"],
            "cost": cost[el],
            "pts": [round(x, 2) for x in pts_by_el[el]],
        }
    body = {
        "entry_id": entry_id,
        "available": True,
        "gws": gws,
        "deadline": nxt.get("deadline_time"),
        "source": "my_team" if token else "picks",
        "bank": bank,
        "free_transfers": ft,
        "unlimited_transfers": unlimited,
        "wildcard_gws": wildcard_gws,
        # GWs Bench Boost / Triple Captain could be played in (empty when
        # used, or active this GW — see active_chip)
        "bench_boost_gws": bench_boost_gws,
        "triple_captain_gws": triple_captain_gws,
        # "bboost" or "3xc" when played for the next GW (logged in only):
        # the model plays it in gws[0]
        "active_chip": active_chip if active_chip in ("bboost", "3xc") else None,
        # The wildcard chosen from wildcard_gws (the model also plans
        # gws[0] as one when transfers are unlimited)
        "options": {
            "no_hits": no_hits,
            "wildcard": None if unlimited else wildcard,
            "bench_boost": bench_boost,
            "triple_captain": triple_captain,
            "keep": keep,
            "exclude": [
                {"id": el, "name": els[el].get("web_name")}
                for el in exclude
                if el in els
            ],
        },
        "squad": squad,
        "players": players,
        "hit_cost": HIT_COST,
        "mip_rel_gap": PLAN_MIP_GAP,
        "model": to_lp(model),
    }
    return body, [reading], TTL_MYTEAM if token else TTL_PICKS
