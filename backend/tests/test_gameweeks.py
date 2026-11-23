import pytest
from fastapi import HTTPException

from app.services.gameweeks import (
    current_and_next_gw,
    finished_gw_count,
    season_label,
    season_status,
    upcoming_event,
)


def _events(current=None, nxt=None, finished=()):
    return [
        {
            "id": gw,
            "deadline_time": "2026-08-15T10:00:00Z" if gw == 1 else None,
            "is_current": gw == current,
            "is_next": gw == nxt,
            "finished": gw in finished,
        }
        for gw in range(1, 39)
    ]


def test_pre_season():
    events = _events(nxt=1)
    assert season_status(events) == "pre_season"
    # Bootstrap's totals are still last season's until GW1 starts
    assert season_label(events) == "2025/26"


def test_in_season():
    events = _events(current=10, nxt=11, finished=range(1, 10))
    assert season_status(events) == "in_season"
    assert season_label(events) == "2026/27"
    assert upcoming_event(events)["id"] == 11
    assert current_and_next_gw(events) == (10, 11)
    assert finished_gw_count({"events": events}) == 9


def test_after_gw38():
    events = _events(current=38, finished=range(1, 39))
    assert current_and_next_gw(events) == (38, 38)
    assert upcoming_event(events)["id"] == 38


def test_no_gameweek_at_all():
    with pytest.raises(HTTPException) as e:
        current_and_next_gw(_events())
    assert e.value.status_code == 404


def test_finished_gw_count_is_at_least_one():
    assert finished_gw_count({"events": _events(nxt=1)}) == 1
    assert finished_gw_count({}) == 1
