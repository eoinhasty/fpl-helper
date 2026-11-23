from app.services.live_points import (
    bonus_confirmed,
    bonus_cutoff,
    bonus_for_rank,
    bps_rank,
    fixture_side,
    points_breakdown,
    provisional_bonus,
)


def _fixture(home_bps, away_bps=(), **kw):
    return {
        "id": 1,
        "team_h": 1,
        "team_a": 2,
        "started": True,
        "stats": [
            {
                "identifier": "bps",
                "h": [{"element": el, "value": v} for el, v in home_bps],
                "a": [{"element": el, "value": v} for el, v in away_bps],
            }
        ],
        **kw,
    }


def test_bonus_ties_follow_fpl():
    # Two tied first both get 3 and the next gets 1
    table = {1: 40, 2: 40, 3: 30, 4: 20}
    assert [bonus_for_rank(bps_rank(v, table)) for v in table.values()] == [3, 3, 1, 0]
    # Three tied first all get 3, nobody else any
    table = {1: 40, 2: 40, 3: 40, 4: 30}
    assert [bonus_for_rank(bps_rank(v, table)) for v in table.values()] == [3, 3, 3, 0]
    assert bonus_cutoff({1: 40, 2: 30, 3: 20, 4: 10}) == 20
    assert bonus_cutoff({}) is None


def test_bonus_confirmed():
    assert bonus_confirmed({"finished": True})
    assert bonus_confirmed(
        {"stats": [{"identifier": "bonus", "h": [{"element": 1, "value": 3}]}]}
    )
    assert not bonus_confirmed(_fixture([(1, 30)]))


def test_provisional_bonus_sums_over_a_double():
    fixtures = [
        _fixture([(1, 50), (2, 40)], [(3, 30)]),
        _fixture([(1, 60)], [(4, 20), (5, 10)]),
        _fixture([(9, 99)], started=False),
        _fixture([(8, 99)], finished=True),
    ]
    assert provisional_bonus(fixtures) == {1: 6, 2: 2, 3: 1, 4: 2, 5: 1}


def test_fixture_side_for_a_player_who_moved_clubs():
    fx = _fixture([(1, 10)], [(7, 20)])
    assert fixture_side(fx, 1, 1) is True
    assert fixture_side(fx, 2, 7) is False
    # Now at club 9: found in the BPS lists instead
    assert fixture_side(fx, 9, 7) is False
    assert fixture_side(fx, 9, 99) is None


def test_points_breakdown_keeps_provisional_bonus_out_of_points():
    fx = _fixture([(1, 50), (2, 40), (3, 30), (4, 5)], kickoff_time="2026-11-22T15:00Z")
    explain = [
        {
            "fixture": 1,
            "stats": [
                {"identifier": "minutes", "value": 90, "points": 2},
                {"identifier": "goals_scored", "value": 1, "points": 5},
            ],
        }
    ]
    [row] = points_breakdown(1, explain, 1, {1: fx}, {2: "ARS"})
    assert row["opp"] == "ARS" and row["home"] is True
    assert row["points"] == 7
    assert row["bonus"] == 3 and row["bonus_provisional"]
    assert row["bps_rank"] == 1 and row["bps_to_bonus"] is None

    [row] = points_breakdown(4, explain, 1, {1: fx}, {2: "ARS"})
    assert row["bonus"] == 0 and row["bps_to_bonus"] == 25


def test_points_breakdown_counts_confirmed_bonus():
    fx = _fixture([(1, 50)], finished=True)
    explain = [
        {
            "fixture": 1,
            "stats": [
                {"identifier": "minutes", "value": 90, "points": 2},
                {"identifier": "bonus", "value": 3, "points": 3},
            ],
        }
    ]
    [row] = points_breakdown(1, explain, 1, {1: fx}, {})
    assert row["points"] == 5 and row["bonus"] == 3
    assert not row["bonus_provisional"]
    assert [s["identifier"] for s in row["stats"]] == ["minutes"]
