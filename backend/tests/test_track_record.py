import pytest

from app.services.track_record import (
    best_captain,
    captain_pick,
    gw_rows,
    gw_summary,
    spearman,
)


def test_spearman():
    assert spearman([1, 2, 3, 4], [10, 20, 30, 40]) == pytest.approx(1.0)
    assert spearman([1, 2, 3, 4], [4, 3, 2, 1]) == pytest.approx(-1.0)
    # Ties share their average rank
    assert spearman([1, 1, 2], [1, 2, 3]) == pytest.approx(0.866, abs=0.001)
    assert spearman([1, 2], [1, 2]) is None
    assert spearman([1, 1, 1], [1, 2, 3]) is None


def test_gw_rows():
    proj = {"gws": [11, 12], "players": {"1": [5.0, 4.0]}}
    live = {
        "elements": [
            {"id": 1, "stats": {"total_points": 8, "minutes": 90}},
            {"id": 2, "stats": {"total_points": 0, "minutes": 0}},
        ]
    }
    assert gw_rows(proj, live, 11) == {1: (5.0, 8, 90), 2: (0.0, 0, 0)}
    # Only a file whose first GW is this one
    assert gw_rows(proj, live, 12) is None


def test_gw_summary_scores_only_players_who_played():
    rows = {
        1: (6.0, 10, 90),
        2: (4.0, 6, 90),
        3: (2.0, 2, 60),
        4: (9.0, 0, 0),  # didn't play: says nothing about the model
    }
    s = gw_summary(rows)
    assert s["played"] == 3
    assert s["rank_corr"] == 1.0
    assert s["top_model"] == s["top_best"] == 18
    assert gw_summary({1: (5.0, 0, 0)}) is None


def test_captain_pick_skips_keepers_and_the_bench():
    rows = {1: (9.0, 2, 90), 2: (5.0, 12, 90), 3: (6.0, 3, 90), 12: (8.0, 15, 90)}
    positions = {1: 1, 2: 3, 3: 4, 12: 3}
    picks = [
        {"element": 1, "position": 1},
        {"element": 2, "position": 2, "is_captain": True},
        {"element": 3, "position": 3},
        {"element": 12, "position": 12},
    ]
    out = captain_pick(rows, picks, positions)
    assert out["model"]["element"] == 3
    assert out["yours"]["element"] == 2
    assert out["best"]["element"] == 2


def test_best_captain_is_the_top_scorer():
    assert best_captain({1: (3.0, 10, 90), 2: (5.0, 10, 90)})["element"] == 2
    assert best_captain({}) is None
