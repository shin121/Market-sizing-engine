from __future__ import annotations

import json
from typing import Any

import pytest

from market_engine.estimation import estimate_segment
from market_engine import services


class RareEstimateRepository:
    def __init__(
        self,
        entity_unit: str,
        *,
        direct_control: bool = False,
        exact_derived: bool = False,
    ) -> None:
        self.entity_unit = entity_unit
        self.direct_control = direct_control
        self.exact_derived = exact_derived

    def queryable_features(self) -> set[str]:
        return {"rare_feature"}

    def feature_units(self) -> dict[str, str]:
        return {"rare_feature": self.entity_unit}

    def baseline_for(
        self,
        unit: str,
        industry_code: str | None,
        geography_code: str,
        as_of_date: str | None,
        conditions: list[dict[str, Any]],
    ) -> dict[str, Any] | None:
        del industry_code, as_of_date
        assert unit == self.entity_unit
        return {
            "control_id": f"CTL-TEST-{self.entity_unit}",
            "count": 5.0 if self.direct_control or self.exact_derived else 100.0,
            "count_interval": (
                {"low": 100.0, "base": 100.0, "high": 100.0}
                if not self.direct_control and not self.exact_derived
                else {"low": 5.0, "base": 5.0, "high": 5.0}
            ),
            "period": "2026",
            "release_id": "REL-TEST-OFFICIAL",
            "dimensions": {},
            "evidence_locator": "integration fixture table",
            "method_code": "official_direct" if self.direct_control else "weighted_microdata",
            "geography_code": geography_code,
            "matched_conditions": conditions if self.direct_control or self.exact_derived else [],
        }

    def probability_model(
        self,
        condition: dict[str, Any],
        *,
        entity_unit: str,
        context: dict[str, Any],
    ) -> dict[str, Any] | None:
        del condition, context
        assert entity_unit == self.entity_unit
        return {
            "model_code": "rare-weighted-cell-v1",
            "probability": {"low": 0.04, "base": 0.05, "high": 0.06},
            "formula": "registered conditional probability for the requested cell",
            "components": [{"release_id": "REL-TEST-OFFICIAL"}],
            "method_code": "weighted_microdata",
            "validation_gaps": ["missing_joint_distribution"],
        }

    def source(self, release_id: str) -> dict[str, Any]:
        return {
            "release_id": release_id,
            "publisher": "Official test publisher",
            "reference_period_start": "2026-01-01",
            "reference_period_end": "2026-12-31",
            "checksum": "test-checksum",
        }


def query(entity_unit: str) -> dict[str, Any]:
    return {
        "entity_unit": entity_unit,
        "where": {"feature": "rare_feature", "op": "eq", "value": "rare"},
    }


@pytest.mark.parametrize("entity_unit", ["person", "child_person", "household"])
def test_derived_human_outputs_below_ten_are_suppressed(entity_unit: str) -> None:
    result = estimate_segment(query(entity_unit), RareEstimateRepository(entity_unit))
    payload = result.to_dict()

    assert result.status == "suppressed"
    assert result.count is None
    assert result.share is None
    assert payload["count_low"] is None
    assert payload["count_base"] is None
    assert payload["count_high"] is None
    assert payload["share_low"] is None
    assert payload["share_base"] is None
    assert payload["share_high"] is None
    assert result.denominator["count"] is None
    assert {gap["gap_type"] for gap in result.validation_gaps} >= {"small_sample"}
    assert result.formula_tree["release_policy"] == {
        "rule": "weighted_base_count_below_threshold",
        "threshold": 10,
    }
    assert "unrounded_count" not in result.formula_tree
    assert "count_interval" not in result.formula_tree["baseline"]
    assert all("factor" not in child for child in result.formula_tree["children"])
    assert all("value" not in assumption for assumption in result.assumptions)
    assert "5개" not in result.human_readable_explanation_ko
    assert '"count_base": 5' not in json.dumps(payload, ensure_ascii=False)
    assert '"count": 5' not in json.dumps(payload, ensure_ascii=False)


def test_official_direct_human_control_is_not_rewritten_as_suppressed() -> None:
    result = estimate_segment(
        query("person"),
        RareEstimateRepository("person", direct_control=True),
    )

    assert result.status == "estimated"
    assert result.count is not None
    assert result.count.base == 5


def test_exact_weighted_human_cell_is_not_misclassified_as_official_direct() -> None:
    result = estimate_segment(
        query("person"),
        RareEstimateRepository("person", exact_derived=True),
    )

    assert result.status == "suppressed"
    assert result.count is None
    assert result.share is None
    assert result.denominator["count"] is None
    assert {gap["gap_type"] for gap in result.validation_gaps} >= {"small_sample"}


def test_business_output_is_not_subject_to_human_rare_cell_suppression() -> None:
    result = estimate_segment(query("enterprise"), RareEstimateRepository("enterprise"))

    assert result.status == "estimated"
    assert result.count is not None


def test_service_persist_and_explain_sanitize_legacy_suppressed_values(
    tmp_path: Any,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    payload = estimate_segment(
        query("person"),
        RareEstimateRepository("person", exact_derived=True),
    ).to_dict()
    payload["denominator"]["count"] = 5.0
    payload["formula_tree"] = {
        "operation": "multiply",
        "baseline": {"count_interval": {"low": 5.0, "base": 5.0, "high": 5.0}},
        "children": [{"factor": {"low": 1.0, "base": 1.0, "high": 1.0}}],
    }
    payload["assumptions"] = [{
        "code": "legacy_rare_factor",
        "method_code": "weighted_microdata",
        "statement": "Legacy Base 5",
        "value": 5.0,
    }]
    payload["related_unit_counts"] = {
        "household": {"status": "estimated", "count": {"base": 5.0}},
    }
    payload["sources"][0]["used_value"] = 5.0

    class LegacySuppressedResult:
        def to_dict(self) -> dict[str, Any]:
            return payload

    monkeypatch.setattr(services, "RESULT_DIR", tmp_path)
    monkeypatch.setattr(services, "estimate_segment", lambda _query: LegacySuppressedResult())

    saved = services.estimate_segment_service(query("person"), persist=True)
    persisted = json.loads((tmp_path / f"{saved['estimate_id']}.json").read_text(encoding="utf-8"))
    explained = services.explain_estimate(saved["estimate_id"])

    for released in (saved, persisted, explained):
        serialized = json.dumps(released, ensure_ascii=False)
        assert released["status"] == "suppressed"
        assert released["count"] is None
        assert released["share"] is None
        assert released["denominator"]["count"] is None
        assert '"count": 5' not in serialized
        assert '"base": 5' not in serialized
        assert "used_value" not in serialized
        assert "Legacy Base 5" not in serialized
    assert saved["formula_tree"] == {
        "operation": "suppressed",
        "values_withheld": True,
        "release_policy": {
            "rule": "weighted_base_count_below_threshold",
            "threshold": 10,
        },
        "lineage": {
            "control_id": "CTL-TEST-person",
            "source_release_ids": ["REL-TEST-OFFICIAL"],
            "model_version": "kr-v0.1.0",
        },
    }
    assert saved["assumptions"] == [{
        "code": "legacy_rare_factor",
        "method_code": "weighted_microdata",
    }]
    assert saved["related_unit_counts"]["household"]["count"] is None
