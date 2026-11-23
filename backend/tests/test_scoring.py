import pytest

from app.services.scoring import (
    XGI_MIN_MINUTES,
    fdr_factor,
    gain_driver,
    gw_projections,
    horizon_projections,
    projected_horizon,
    projected_points,
    score_factors,
    start_prob_from,
    xgi_signal,
)
from tests.conftest import shared_cases


@pytest.mark.parametrize("avg, expected", shared_cases("fdr_factor.json"))
def test_fdr_factor_shared(avg, expected):
    assert fdr_factor(avg) == pytest.approx(expected)


def test_xgi_min_minutes_matches_the_frontend():
    assert XGI_MIN_MINUTES == shared_cases("constants.json")["XGI_MIN_MINUTES"]


# --- start probability ---


def test_start_prob_blends_status_with_play_time():
    # 900 of a possible 900 minutes: (0.88 + 0.99) / 2
    full = {"status": "a", "minutes": 900}
    assert start_prob_from(full, 10) == 0.94
    # ~40 minutes a game is a rotation risk, not a near-certain starter
    rotation = {"status": "a", "minutes": 400}
    assert start_prob_from(rotation, 10) == pytest.approx(0.66, abs=0.01)


def test_start_prob_scales_by_fpl_chance():
    p = {"status": "d", "minutes": 0, "chance_of_playing_next_round": 50}
    assert start_prob_from(p, 5) == pytest.approx(0.55 * 0.5, abs=0.01)


@pytest.mark.parametrize("status", ["i", "s", "n", "u"])
def test_start_prob_unavailable_is_zero(status):
    assert start_prob_from({"status": status, "minutes": 900}, 10) == 0.0


@pytest.mark.parametrize(
    "news, floored",
    [
        ("Back in training", True),
        ("Fit to play", True),
        ("Lack of match fitness", False),
        ("Unavailable for selection", False),
        ("Not fit for the weekend", False),
        ("Has returned to Getafe", False),
    ],
)
def test_start_prob_fit_news_is_whole_word(news, floored):
    p = {"status": "d", "minutes": 0, "news": news}
    assert (start_prob_from(p, 5) == 0.9) is floored


def test_start_prob_bad_news_cuts_it():
    p = {"status": "a", "minutes": 900, "news": "Ruled out after surgery"}
    assert start_prob_from(p, 10) == pytest.approx(0.94 * 0.2, abs=0.01)


def test_start_prob_is_capped():
    p = {"status": "a", "minutes": 900, "news": "back in training"}
    assert start_prob_from(p, 1) <= 0.99


# --- transfer scoring ---


def _player(pid, team, ep, **kw):
    return {
        "id": pid,
        "team": team,
        "ep_next": str(ep),
        "element_type": 3,
        "status": "a",
        "minutes": 900,
        **kw,
    }


def test_score_factors_blank_gw_is_empty():
    p = _player(1, 1, 5)
    assert score_factors(p, {}, [p], 10) == {}


def test_dgw_boost_only_without_ep_next():
    fixtures = {1: [{"difficulty": 3, "home": True}, {"difficulty": 3, "home": False}]}
    # ep_next already covers both fixtures
    with_ep = _player(1, 1, 8)
    assert (
        score_factors(with_ep, fixtures, [with_ep, _player(2, 1, 2)], 10)["dgw"] == 1.0
    )
    # The per-match form/ICT fallback gets the boost
    no_ep = _player(1, 1, 0, form="5", ict_index="50")
    other = _player(2, 1, 0, form="1", ict_index="10")
    assert score_factors(no_ep, fixtures, [no_ep, other], 10)["dgw"] == 1.8


def test_gain_driver():
    base = {"base": 0.5, "fdr": 0.9, "home": 1.0, "dgw": 1.0, "start": 0.9, "pos": 1}
    assert gain_driver(base, {}) == "blank"
    assert gain_driver(base, {**base, "fdr": 0.6}) == "fixture"
    assert gain_driver(base, {**base, "base": 0.2}) == "form"
    # An unavailable player's ep_next is 0 too: the absence is the reason
    assert gain_driver(base, {**base, "base": 0.0, "start": 0.0}) == "minutes"


# --- xGI ---


def _attacker(**kw):
    return {"element_type": 4, "minutes": 900, **kw}


def test_xgi_signal():
    hot = _attacker(goals_scored=8, assists=2, expected_goal_involvements="5.0")
    assert xgi_signal(hot) == {"gap": 5.0, "direction": "over"}
    cold = _attacker(goals_scored=1, assists=0, expected_goal_involvements="4.0")
    assert xgi_signal(cold)["direction"] == "under"


def test_xgi_signal_needs_both_gap_and_share():
    # 2.5 over, but only 25% of a big xGI
    assert (
        xgi_signal(
            _attacker(goals_scored=12, assists=0, expected_goal_involvements="10")
        )
        is None
    )
    # 50% over, but under 2 G+A
    assert (
        xgi_signal(_attacker(goals_scored=3, assists=0, expected_goal_involvements="2"))
        is None
    )


def test_xgi_signal_skips_keepers_and_low_minutes():
    big_gap = {"goals_scored": 6, "assists": 0, "expected_goal_involvements": "1"}
    assert xgi_signal({**big_gap, "element_type": 1, "minutes": 900}) is None
    low = {**big_gap, "element_type": 4, "minutes": XGI_MIN_MINUTES - 1}
    assert xgi_signal(low) is None


# --- projections ---

EVENTS = [{"id": 1, "deadline_time": "2026-08-15T10:00:00Z"}]


def _proj(**kw):
    return {
        "version": 1,
        "season": 2026,
        "gws": [11, 12, 13],
        "last_finished_gw": 10,
        "players": {"7": [5.0, 4.0, 3.0]},
        **kw,
    }


def test_gw_projections_trusted():
    assert gw_projections(_proj(), EVENTS, 11) == {7: 5.0}
    assert gw_projections(_proj(), EVENTS, 12) == {7: 4.0}


@pytest.mark.parametrize(
    "proj, gw",
    [
        (_proj(version=2), 11),
        (_proj(season=2025), 11),
        (_proj(), 14),  # not covered
        (_proj(last_finished_gw=8), 11),  # built too long before the GW
        ({}, 11),
    ],
)
def test_gw_projections_rejected(proj, gw):
    assert gw_projections(proj, EVENTS, gw) is None


def test_horizon_is_cut_at_the_file_end():
    assert horizon_projections(_proj(), EVENTS, 12, 5) == {7: [4.0, 3.0]}


def test_projected_points_scales_by_chance():
    assert projected_points({"id": 7}, {7: 5.0}) == 5.0
    assert (
        projected_points({"id": 7, "chance_of_playing_next_round": 50}, {7: 5.0}) == 2.5
    )
    # Left out of the file: 0, not unknown
    assert projected_points({"id": 8}, {7: 5.0}) == 0.0
    assert projected_points({"id": 7}, None) is None


def test_projected_horizon_scales_only_the_first_gw():
    horizon = {7: [5.0, 4.0]}
    p = {"id": 7, "chance_of_playing_next_round": 50}
    assert projected_horizon(p, horizon) == [2.5, 4.0]
    assert projected_horizon({"id": 8}, horizon) == []
    assert projected_horizon(p, None) is None
