from __future__ import annotations

import pytest

from market_engine.market_sizing import estimate_market
from market_engine.models import EstimateResult, Interval


def audience() -> EstimateResult:
    return EstimateResult(
        interpreted_query={},
        primary_unit="enterprise",
        count=Interval(800, 1_000, 1_200),
        share=Interval(1, 1, 1),
        denominator={"definition": "test", "count": 1_200},
        related_unit_counts={},
        formula_tree={},
        sources=[],
        assumptions=[],
        confidence_score=80,
        confidence_grade="B",
        validation_gaps=[],
        overlap_warning="test",
        model_version="test-v1",
        as_of_period="2026",
        status="estimated",
        human_readable_explanation_ko="test",
    )


def scenario(**overrides: object) -> dict[str, object]:
    value: dict[str, object] = {
        "name": "three-year scenario",
        "market_unit": "enterprise",
        "currency": "KRW",
        "horizon_months": 36,
        "annual_addressable_spend_per_entity": {"low": 1_250, "base": 2_000, "high": 2_500},
        "serviceability_rate": {"low": 0.4, "base": 0.5, "high": 0.6},
        "attainable_share": {"low": 0.1, "base": 0.2, "high": 0.3},
        "operational_capacity_entities": {"low": 100, "base": 200, "high": 300},
        "realized_arpu": {"low": 1_000, "base": 1_500, "high": 2_000},
    }
    value.update(overrides)
    return value


def test_three_year_horizon_scales_annual_money_but_not_entities() -> None:
    result = estimate_market(audience(), scenario())

    assert result["tam_entities"] == {"low": 800, "base": 1_000, "high": 1_200}
    assert result["tam_revenue"] == {"low": 3_000_000, "base": 6_000_000, "high": 9_000_000}
    assert result["som_revenue"] == {"low": 0, "base": 1_000_000, "high": 2_000_000}
    assert result["horizon_years"] == 3


@pytest.mark.parametrize("field", ["serviceability_rate", "attainable_share"])
def test_rates_outside_zero_to_one_are_rejected(field: str) -> None:
    with pytest.raises(ValueError, match="between 0 and 1"):
        estimate_market(audience(), scenario(**{
            field: {"low": 1.1, "base": 1.2, "high": 1.3},
        }))


@pytest.mark.parametrize("field", [
    "annual_addressable_spend_per_entity",
    "operational_capacity_entities",
    "realized_arpu",
])
def test_negative_market_inputs_are_rejected(field: str) -> None:
    with pytest.raises(ValueError, match="non-negative"):
        estimate_market(audience(), scenario(**{
            field: {"low": -1, "base": 0, "high": 1},
        }))


def test_premium_realized_arpu_is_allowed_and_only_caps_capacity_revenue() -> None:
    result = estimate_market(audience(), scenario(
        realized_arpu={"low": 2_000, "base": 3_000, "high": 4_000},
    ))

    assert result["som_revenue"] == {"low": 0, "base": 1_000_000, "high": 2_000_000}
    assert "SAM revenue×attainable share" in result["formula"]


@pytest.mark.parametrize("horizon", [0, -1, 12.5, True])
def test_horizon_must_be_a_positive_whole_month_count(horizon: object) -> None:
    with pytest.raises(ValueError, match="horizon_months"):
        estimate_market(audience(), scenario(horizon_months=horizon))
