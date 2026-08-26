from market_engine.models import Interval


def test_interval_multiplication_preserves_order() -> None:
    value = Interval(100, 120, 140).multiply(Interval(0.5, 0.7, 0.9))
    assert value == Interval(50, 84, 126)


def test_interval_rejects_bad_order() -> None:
    try:
        Interval(2, 1, 3)
    except ValueError as exc:
        assert "low <= base <= high" in str(exc)
    else:
        raise AssertionError("bad interval accepted")

