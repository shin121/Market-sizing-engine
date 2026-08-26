import json
from pathlib import Path

import pytest

from market_engine.build import build_database
from market_engine.estimation import estimate_segment
from market_engine.paths import ROOT


@pytest.fixture(scope="module", autouse=True)
def built_engine() -> None:
    build_database()


def test_website_less_restaurant_owner_60s_is_unit_safe_and_explained() -> None:
    query = json.loads((ROOT / "examples/queries/website_less_restaurant_owner_60s.json").read_text(encoding="utf-8"))
    result = estimate_segment(query)
    assert result.status == "estimated"
    assert result.primary_unit == "enterprise"
    assert result.count is not None
    assert 100_000 <= result.count.low <= result.count.base <= result.count.high <= 250_000
    assert result.confidence_grade == "D"
    assert {gap["gap_type"] for gap in result.validation_gaps} >= {"business_web_presence_unobserved","missing_joint_distribution","unknown_unit_conversion"}
    assert result.related_unit_counts["person"]["status"] == "not_estimable"
    assert len(result.sources) == 2
