from datetime import datetime, timezone

from app.services.prices import price_outlook

NOW = datetime(2026, 11, 23, 12, tzinfo=timezone.utc)


def _player(likelihood, percent=80.0, **kw):
    return {
        "price_change_projections": [
            {"offset": 0, "projected_percent": percent, "likelihood": likelihood}
        ],
        **kw,
    }


def test_only_the_top_band_is_likely():
    assert price_outlook(_player(5), NOW)["likely"] == "rise"
    assert price_outlook(_player(-5, -90), NOW)["likely"] == "fall"
    assert price_outlook(_player(4), NOW)["likely"] is None


def test_lock_suppresses_likely():
    locked = _player(5, price_change_locked_until="2026-11-24T01:00:00Z")
    out = price_outlook(locked, NOW)
    assert out["likely"] is None
    assert out["locked_until"] == "2026-11-24T01:00:00Z"
    # A lock in the past doesn't count
    expired = _player(5, price_change_locked_until="2026-11-22T01:00:00Z")
    assert price_outlook(expired, NOW)["locked_until"] is None


def test_falls_back_to_current_progress():
    out = price_outlook({"price_change_percent": "42.26"}, NOW)
    assert out == {"progress": 42.3, "likely": None, "locked_until": None}


def test_no_forecast():
    assert price_outlook({}, NOW) is None
