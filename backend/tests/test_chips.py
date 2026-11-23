from app.services.chips import ChipWindows, chip_play, double_gws
from app.services.planner import ChipPlay

GWS = [18, 19, 20, 21, 22]
CHIPS = [
    {"name": name, "start_event": lo, "stop_event": hi}
    for name in ("bboost", "3xc")
    for lo, hi in ((1, 19), (20, 38))
]


def _cw(played=(), active_gw=None, doubles=()):
    return ChipWindows(CHIPS, list(played), GWS, active_gw, set(doubles))


def test_double_gws():
    fixtures = [
        {"event": 21, "team_h": 1, "team_a": 2},
        {"event": 21, "team_h": 1, "team_a": 3},
        {"event": 22, "team_h": 4, "team_a": 5},
        {"event": None, "team_h": 6, "team_a": 7},  # unscheduled
    ]
    assert double_gws(fixtures) == {21}


def test_windows_per_half_and_played_chips_close_them():
    assert _cw().windows("bboost") == [[18, 19], [20, 21, 22]]
    assert _cw(played=[("bboost", 5)]).windows("bboost") == [[20, 21, 22]]
    # A GW taken by another chip or unlimited transfers is out
    assert _cw(active_gw=18).windows("bboost") == [[19], [20, 21, 22]]


def test_triple_captain_waits_for_a_double():
    cw = _cw(doubles=[21])
    # No double left in the first half: its last GW
    assert cw.windows("3xc", doubles=True) == [[19], [21]]


def test_active_chip_is_required_this_gw():
    play, open_gws, choice = chip_play(
        _cw(), "3xc", None, active_chip="3xc", wildcard=None, bb_gain=[0] * 5
    )
    assert play == ChipPlay([[18]], required=True)
    assert open_gws == [] and choice is None


def test_chosen_gw():
    play, _, choice = chip_play(
        _cw(), "bboost", 20, active_chip=None, wildcard=None, bb_gain=[0] * 5
    )
    assert play == ChipPlay([[20]], required=True) and choice == 20


def test_chosen_gw_not_open_is_dropped():
    play, _, choice = chip_play(
        _cw(played=[("bboost", 5)]),
        "bboost",
        19,
        active_chip=None,
        wildcard=None,
        bb_gain=[0] * 5,
    )
    assert play is None and choice is None


def test_no_chip_in_the_wildcard_week():
    _, open_gws, _ = chip_play(
        _cw(), "bboost", None, active_chip=None, wildcard=20, bb_gain=[0] * 5
    )
    assert 20 not in open_gws


def test_bench_boost_best_plays_at_the_peak():
    play, _, choice = chip_play(
        _cw(),
        "bboost",
        "best",
        active_chip=None,
        wildcard=None,
        bb_gain=[9, 4, 1, 1, 1],
    )
    assert play == ChipPlay([[18]], required=True) and choice == "best"


def test_bench_boost_best_holds_before_the_peak():
    play, _, choice = chip_play(
        _cw(),
        "bboost",
        "best",
        active_chip=None,
        wildcard=None,
        bb_gain=[4, 9, 1, 1, 1],
    )
    assert play is None and choice == "best"


def test_triple_captain_best_offers_the_double():
    play, _, _ = chip_play(
        _cw(played=[("3xc", 3)], doubles=[21]),
        "3xc",
        "best",
        active_chip=None,
        wildcard=None,
        bb_gain=[0] * 5,
    )
    assert play == ChipPlay([[21]])
