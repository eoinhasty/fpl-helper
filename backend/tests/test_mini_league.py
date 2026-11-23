import pytest

from app.services.mini_league import (
    auto_subs,
    competition_ranks,
    fixture_states,
    live_entry,
    match_progress,
    player_state,
    pre_gw_total,
    rank_table,
)
from tests.conftest import shared_cases

# 4-4-2: GK, 4 DEF, 4 MID, 2 FWD, then GK, DEF, MID, FWD on the bench.
# Element ids are squad slots.
POSITIONS_442 = [1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 1, 2, 3, 4]


def squad(positions=POSITIONS_442, captain=6, vice=7, cap_mult=2):
    picks = [
        {
            "element": slot,
            "position": slot,
            "multiplier": (cap_mult if slot == captain else 1) if slot <= 11 else 0,
            "is_captain": slot == captain,
            "is_vice_captain": slot == vice,
        }
        for slot in range(1, 16)
    ]
    return picks, {slot: pos for slot, pos in enumerate(positions, start=1)}


def run(picks, positions, *, blank=(), to_play=(), chip=None):
    """Every match over unless listed in to_play; `blank` played 0 minutes."""
    minutes = {el: 0 if el in blank or el in to_play else 90 for el in positions}
    states = {el: "to_play" if el in to_play else "done" for el in positions}
    return auto_subs(
        picks, chip=chip, positions=positions, minutes=minutes, states=states
    )


@pytest.mark.parametrize(
    "case", shared_cases("auto_subs.json"), ids=lambda c: c["name"]
)
def test_auto_subs_shared(case):
    picks, positions = squad(case["positions"], captain=None, vice=None)
    _, subs, _ = run(picks, positions, blank=set(case["blank"]))
    assert [[s["out"], s["in"]] for s in subs] == case["subs"]


def test_sub_moves_the_multiplier():
    picks, positions = squad()
    mult, _, _ = run(picks, positions, blank={3})
    assert mult[3] == 0 and mult[13] == 1


def test_bench_player_still_to_play_holds_the_walk():
    # FPL's choice waits on 13, so 14 can't come on ahead of them
    picks, positions = squad()
    mult, subs, _ = run(picks, positions, blank={3}, to_play={13})
    assert subs == []
    assert mult[3] == 1 and mult[14] == 0


def test_starter_still_to_play_is_assumed_to_play():
    picks, positions = squad()
    _, subs, _ = run(picks, positions, to_play={3})
    assert subs == []


def test_captain_blanks_vice_takes_the_armband():
    picks, positions = squad()
    mult, subs, vice_took = run(picks, positions, blank={6})
    assert vice_took
    assert mult[7] == 2
    assert mult[6] == 0
    assert {"out": 6, "in": 13} in subs


def test_triple_captain_passes_to_the_vice():
    picks, positions = squad(cap_mult=3)
    mult, _, vice_took = run(picks, positions, blank={6}, chip="3xc")
    assert vice_took and mult[7] == 3


def test_captain_and_vice_both_blank_nobody_gets_the_armband():
    picks, positions = squad()
    mult, subs, vice_took = run(picks, positions, blank={6, 7})
    assert not vice_took
    assert max(mult.values()) == 1
    assert [s["out"] for s in subs] == [6, 7]


def test_captain_and_vice_both_blank_with_no_bench_cover():
    # Both stay in the XI (nobody on the bench played): the vice still
    # doesn't get the armband
    picks, positions = squad()
    mult, subs, vice_took = run(picks, positions, blank={6, 7, 12, 13, 14, 15})
    assert subs == [] and not vice_took
    assert mult[6] == 2 and mult[7] == 1


def test_captain_blanks_without_a_sub_keeps_a_single_multiplier():
    # Nobody on the bench played: the captain stays in on 1, the vice doubles
    picks, positions = squad()
    mult, subs, vice_took = run(picks, positions, blank={6, 12, 13, 14, 15})
    assert subs == [] and vice_took
    assert mult[6] == 1 and mult[7] == 2


def test_no_subs_on_a_bench_boost():
    picks, positions = squad()
    for p in picks:
        p["multiplier"] = 2 if p["is_captain"] else 1
    mult, subs, _ = run(picks, positions, blank={3}, chip="bboost")
    assert subs == []
    assert mult[3] == 1 and mult[13] == 1


def _live_entry(picks, *, points, minutes, teams, states, **extra):
    positions = {el: pos for el, pos in enumerate(POSITIONS_442, start=1)}
    payload = {"picks": picks, "entry_history": {"event_transfers_cost": 4}}
    payload.update(extra)
    return live_entry(
        {"entry": 1, "entry_name": "Team", "total": 500, "event_total": 0},
        payload,
        gw=10,
        start_event=5,
        live_points=points,
        bonus={},
        minutes=minutes,
        teams=teams,
        positions=positions,
        names={el: f"P{el}" for el in positions},
        states=states,
    )


def test_live_entry_scores_picks_and_takes_off_hits():
    picks, _ = squad()
    teams = {el: 1 for el in range(1, 16)}
    row = _live_entry(
        picks,
        points={el: 2 for el in range(1, 16)},
        minutes={el: 90 for el in range(1, 16)},
        teams=teams,
        states={1: ["done"]},
    )
    # 10 starters on 2, the captain on 2 × 2, bench not counted, minus a hit
    assert row["gw_points"] == 10 * 2 + 4 - 4
    assert row["total"] == 500 + row["gw_points"]
    assert row["captain"]["element"] == 6 and not row["captain"]["vice"]
    assert row["played"] == 11


def test_live_entry_trusts_fpl_once_subs_are_processed():
    picks, _ = squad()
    # FPL already moved the armband and made a sub: take its multipliers
    for p in picks:
        p["multiplier"] = {6: 0, 7: 2, 13: 1}.get(p["element"], p["multiplier"])
    row = _live_entry(
        picks,
        points={el: 1 for el in range(1, 16)},
        minutes={el: 90 for el in range(1, 16)},
        teams={el: 1 for el in range(1, 16)},
        states={1: ["done"]},
        automatic_subs=[{"element_out": 6, "element_in": 13}],
    )
    assert row["captain"]["element"] == 7 and row["captain"]["vice"]
    assert row["auto_subs"] == [{"out": "P6", "in": "P13"}]


def test_live_entry_lists_no_bench_boost_subs():
    picks, _ = squad()
    row = _live_entry(
        picks,
        points={},
        minutes={},
        teams={},
        states={},
        active_chip="bboost",
        automatic_subs=[{"element_out": 6, "element_in": 13}],
    )
    assert row["auto_subs"] == []


def test_pre_gw_total():
    row = {"total": 600, "event_total": 70}
    picks = {
        "entry_history": {
            "event": 10,
            "total_points": 580,
            "points": 50,
            "event_transfers_cost": 4,
        }
    }
    # From GW1 the picks' own snapshot wins over lagging standings
    assert pre_gw_total(row, picks, 1, 10) == 580 - 50 + 4
    # A league starting later only has its standings
    assert pre_gw_total(row, picks, 5, 10) == 600 - 70
    # Starting this GW: nothing before it
    assert pre_gw_total(row, picks, 10, 10) == 0
    # Snapshot from another GW isn't trusted
    stale = {"entry_history": {**picks["entry_history"], "event": 9}}
    assert pre_gw_total(row, stale, 1, 10) == 530


def test_competition_ranks_share_the_higher_place():
    assert competition_ranks([50, 70, 70, 40]) == [3, 1, 1, 4]


def test_rank_table_sorts_by_live_total():
    rows = [
        {"entry": 1, "entry_name": "A", "total": 100, "pre_total": 90, "gw_points": 10},
        {"entry": 2, "entry_name": "B", "total": 120, "pre_total": 80, "gw_points": 40},
    ]
    ranked = rank_table(rows)
    assert [r["entry"] for r in ranked] == [2, 1]
    assert ranked[0]["pre_rank"] == 2 and ranked[1]["pre_rank"] == 1


def test_fixture_states_and_progress():
    fixtures = [
        {"team_h": 1, "team_a": 2, "started": True, "finished_provisional": True},
        {"team_h": 3, "team_a": 4, "started": True},
        {"team_h": 1, "team_a": 5, "started": False},
    ]
    states = fixture_states(fixtures)
    assert states[1] == ["done", "to_play"]
    assert states[3] == ["playing"]
    assert match_progress(fixtures) == {"done": 1, "playing": 1, "total": 3}
    # A double GW's second match still counts as left
    assert player_state(states[1]) == "to_play"
    assert player_state([]) == "done"
