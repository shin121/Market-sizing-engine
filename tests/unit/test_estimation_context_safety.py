from __future__ import annotations

import pytest

from market_engine.build import build_database
from market_engine.estimation import estimate_segment


@pytest.fixture(scope="module", autouse=True)
def built_engine() -> None:
    build_database()


def test_probability_model_requires_its_declared_context() -> None:
    result = estimate_segment({
        "entity_unit": "enterprise",
        "where": {"feature": "has_website", "op": "eq", "value": False},
    })

    assert result.status == "not_estimable"
    assert result.count is None
    assert result.formula_tree["unresolved_condition"]["feature"] == "has_website"


def test_probability_model_requires_its_declared_entity_unit() -> None:
    result = estimate_segment({
        "entity_unit": "household",
        "where": {"feature": "has_website", "op": "eq", "value": False},
    })

    assert result.status == "not_estimable"
    assert result.count is None
    assert "has_website" in result.formula_tree["unresolved_features"]


def test_unknown_geography_is_not_treated_as_a_national_filter() -> None:
    result = estimate_segment({
        "entity_unit": "enterprise",
        "geography": {"level": "country", "codes": ["ZZ-UNKNOWN"]},
        "where": {"feature": "geography_code", "op": "eq", "value": "ZZ-UNKNOWN"},
    })

    assert result.status == "not_estimable"
    assert result.count is None
    assert result.formula_tree["unsupported_filter"]["feature"] == "geography_code"


def test_industry_eq_selects_the_matching_baseline() -> None:
    result = estimate_segment({
        "entity_unit": "enterprise",
        "geography": {"level": "country", "codes": ["KR"]},
        "where": {"and": [
            {"feature": "industry_code", "op": "eq", "value": "I56"},
            {"feature": "owner_age", "op": "between", "value": [60, 69]},
            {"feature": "has_website", "op": "eq", "value": False},
        ]},
    })

    assert result.status == "estimated"
    assert result.denominator["control_id"] == "CTL-ENT-I56-2023"
    assert result.count is not None
    assert result.count.base == 170_000


def test_multi_industry_union_without_joint_baseline_is_not_estimable() -> None:
    result = estimate_segment({
        "entity_unit": "enterprise",
        "where": {"feature": "industry_code", "op": "in", "value": ["I56", "J"]},
    })

    assert result.status == "not_estimable"
    assert result.count is None
    assert result.formula_tree["unsupported_filter"]["feature"] == "industry_code"


def test_duplicate_probability_condition_is_not_multiplied_twice() -> None:
    duplicate = {"feature": "has_website", "op": "eq", "value": False}
    result = estimate_segment({
        "entity_unit": "enterprise",
        "where": {"and": [
            {"feature": "industry_code", "op": "in", "value": ["I56"]},
            {"feature": "owner_age", "op": "between", "value": [60, 69]},
            duplicate,
            duplicate,
        ]},
    })

    assert result.status == "not_estimable"
    assert result.formula_tree["unsupported_filter"]["reason"] == "duplicate_condition"


def test_child_age_range_selects_the_exact_registered_control() -> None:
    result = estimate_segment({
        "entity_unit": "child_person",
        "where": {"feature": "age", "op": "between", "value": [0, 14]},
    })

    assert result.status == "estimated"
    assert result.denominator["control_id"] == "CTL-CHILD-0-14-2024"
    assert result.count is not None
    assert result.count.base == 5_421_000


def test_household_size_selects_the_exact_registered_control() -> None:
    result = estimate_segment({
        "entity_unit": "household",
        "where": {"feature": "household_size", "op": "eq", "value": 1},
    })

    assert result.status == "estimated"
    assert result.denominator["control_id"] == "CTL-HH-GENERAL-SIZE1-2024"
    assert result.count is not None
    assert result.count.base == 8_045_000


def test_validation_gaps_are_structured_records() -> None:
    result = estimate_segment({
        "entity_unit": "enterprise",
        "where": {"feature": "has_website", "op": "eq", "value": False},
    })

    assert result.validation_gaps
    assert all(isinstance(gap, dict) for gap in result.validation_gaps)
    assert result.validation_gaps[0]["gap_type"] == "missing_joint_distribution"
