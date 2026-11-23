from app.services.planner import MAX_FT, free_transfers


def _history(*transfers):
    return [{"event": gw, "event_transfers": n} for gw, n in enumerate(transfers, 1)]


def test_free_transfers_bank_one_a_week_up_to_the_cap():
    assert free_transfers(_history(0), []) == 1
    assert free_transfers(_history(0, 0, 0), []) == 3
    assert free_transfers(_history(*[0] * 20), []) == MAX_FT
    # Two used from two banked, then a new one
    assert free_transfers(_history(0, 0, 2), []) == 1
    # A hit can't take the bank below zero
    assert free_transfers(_history(0, 5), []) == 1


def test_wildcard_and_free_hit_weeks_keep_the_count():
    chips = [{"name": "freehit", "event": 3}, {"name": "wildcard", "event": 4}]
    # GW3's 11 and GW4's 15 transfers don't count; neither week banks one
    assert free_transfers(_history(0, 0, 11, 15), chips) == 2
    # Another chip's week banks as normal
    assert free_transfers(_history(0, 0, 0), [{"name": "bboost", "event": 3}]) == 3
