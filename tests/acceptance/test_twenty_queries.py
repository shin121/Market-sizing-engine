import json
from pathlib import Path
from typing import Any

from market_engine.services import compare_segments, estimate_segment_service


ROOT = Path(__file__).resolve().parents[2]

EXPECTED_CASES = [
    ("홈페이지가 없는 60대 음식점 사업체", "estimated", "enterprise"),
    ("초등 자녀·반려동물·수도권 맞벌이 가구", "not_estimable", "household"),
    ("사교육 이용 중학생", "not_estimable", "child_person"),
    ("1인가구 30대 고빈도 국내여행자", "not_estimable", "person"),
    ("모바일 고이용·온라인판매 없는 지방 소상공인", "not_estimable", "enterprise"),
    ("은퇴 전후 돌봄 부담 50~60대 가구", "not_estimable", "household"),
    ("영유아 자녀 맞벌이 보육시장", "not_estimable", "household"),
    ("두 여행 세그먼트 OR 합집합", "not_estimable", "person"),
    ("사람을 사업체로 변환하려는 잘못된 질의", "not_estimable", "person"),
    ("근거 부족 확률 조건", "not_estimable", "enterprise"),
    ("반려동물 1인가구", "not_estimable", "household"),
    ("고소득 자가 가구", "not_estimable", "household"),
    ("사교육 미이용 초등학생", "not_estimable", "child_person"),
    ("고령 1인가구", "not_estimable", "household"),
    ("온라인 판매 보유 음식점", "not_estimable", "enterprise"),
    ("홈페이지 보유 음식점 NOT", "not_estimable", "enterprise"),
    ("수도권 20대", "not_estimable", "person"),
    ("지방 고령 모바일 사업자", "not_estimable", "enterprise"),
    ("보호자가 연결된 18세", "not_estimable", "child_person"),
    ("가구 돌봄 부담 부정 조건", "not_estimable", "household"),
]

SOURCE_LINEAGE_FIELDS = {
    "publisher",
    "dataset_title",
    "official_url",
    "source_tier",
    "release_id",
    "version_label",
    "reference_period_start",
    "reference_period_end",
    "publication_date",
    "checksum",
}

GAP_FIELDS = {
    "gap_type",
    "impact",
    "description",
    "verification_question",
    "recommended_source",
    "expected_improvement",
    "status",
}


def _assert_source_lineage(source: dict[str, Any]) -> None:
    assert SOURCE_LINEAGE_FIELDS <= source.keys()
    assert source["publisher"]
    assert source["dataset_title"]
    assert source["official_url"].startswith("https://")
    assert isinstance(source["source_tier"], int) and source["source_tier"] >= 1
    assert source["release_id"].startswith("REL-")
    assert source["version_label"]
    assert source["reference_period_start"] <= source["reference_period_end"]
    assert source["publication_date"]
    assert len(source["checksum"]) == 64


def _assert_structured_gap(gap: dict[str, Any]) -> None:
    assert GAP_FIELDS <= gap.keys()
    assert gap["gap_type"]
    assert gap["impact"] in {"low", "medium", "high"}
    assert gap["description"]
    assert gap["verification_question"]
    assert gap["recommended_source"]
    assert gap["expected_improvement"]
    assert gap["status"] == "open"


def _assert_common_evidence_contract(
    result: dict[str, Any],
    *,
    expected_status: str,
    expected_unit: str,
) -> None:
    assert result["status"] == expected_status
    assert result["primary_unit"] == expected_unit
    assert result["interpreted_query"]["entity_unit"] == expected_unit
    assert result["query_id"].startswith("QRY-")
    assert result["estimate_id"].startswith("EST-")
    assert result["model_version"] == "kr-v0.1.0"
    assert isinstance(result["confidence_score"], int)
    assert 0 <= result["confidence_score"] <= 100
    assert result["confidence_grade"] in {"A", "B", "C", "D", "E"}
    assert isinstance(result["denominator"], dict)
    assert result["denominator"]["definition"]
    assert "count" in result["denominator"]
    assert isinstance(result["formula_tree"], dict) and result["formula_tree"]
    assert result["as_of_period"]
    assert result["overlap_warning"]
    assert len(result["human_readable_explanation_ko"]) >= 20
    assert result["validation_gaps"]
    for gap in result["validation_gaps"]:
        _assert_structured_gap(gap)

    baseline = result["formula_tree"].get("baseline")
    if baseline is None:
        assert result["denominator"]["count"] is None
        assert result["as_of_period"] == "unknown"
        assert result["sources"] == []
        assert {
            "unsupported_filter",
            "unresolved_features",
            "logical_expression",
        }.intersection(result["formula_tree"])
    else:
        assert baseline["control_id"].startswith("CTL-")
        assert baseline["count"] == result["denominator"]["count"]
        assert baseline["period"] == result["as_of_period"]
        assert baseline["release_id"].startswith("REL-")
        assert baseline["method_code"]
        assert baseline["evidence_locator"]
        assert baseline["count_interval"]["low"] <= baseline["count_interval"]["base"] <= baseline["count_interval"]["high"]
        assert result["sources"]
        assert baseline["release_id"] in {source["release_id"] for source in result["sources"]}

    for source in result["sources"]:
        _assert_source_lineage(source)


def test_twenty_representative_queries_execute_with_safe_contract() -> None:
    cases = json.loads((ROOT / "examples/queries/acceptance_queries.json").read_text(encoding="utf-8"))
    assert len(cases) == 20
    assert [case["name"] for case in cases] == [name for name, _, _ in EXPECTED_CASES]
    saved = []
    for case, (expected_name, expected_status, expected_unit) in zip(cases, EXPECTED_CASES, strict=True):
        assert case["name"] == expected_name
        assert case["expected_status"] == expected_status
        assert case["query"]["entity_unit"] == expected_unit
        result = estimate_segment_service(case["query"])
        saved.append(result)
        _assert_common_evidence_contract(
            result,
            expected_status=expected_status,
            expected_unit=expected_unit,
        )
        if result["status"] == "estimated":
            assert result["count"]["low"] <= result["count"]["base"] <= result["count"]["high"]
            assert result["count"] == {"low": 130000, "base": 170000, "high": 210000}
            assert 120000 <= result["count"]["low"] <= 140000
            assert 160000 <= result["count"]["base"] <= 180000
            assert 200000 <= result["count"]["high"] <= 220000
            assert result["share"]["low"] <= result["share"]["base"] <= result["share"]["high"]
            assert result["denominator"] == {
                "definition": "2023년 음식점 및 주점업 소상공인 기업체",
                "count": 745196.0,
                "control_id": "CTL-ENT-I56-2023",
            }
            assert result["as_of_period"] == "2023-12-31"
            assert result["formula_tree"]["operation"] == "multiply"
            assert result["formula_tree"]["baseline"]["method_code"] == "official_cross_tab"
            assert result["formula_tree"]["baseline"]["release_id"] == "REL-MSS-SB-2023"
            assert result["formula_tree"]["expression"] == (
                "N(I56 small-business enterprises) × P(owner 60–69 | I56) "
                "× P(no own website | owner 60–69, I56)"
            )
            probability_children = [
                child for child in result["formula_tree"]["children"]
                if child["type"] == "probability_model"
            ]
            assert [child["model_code"] for child in probability_children] == [
                "restaurant_owner_age_60_69",
                "website_absence_restaurant_owner_60_69",
            ]
            assert all(child["formula"] for child in probability_children)
            assert {assumption["method_code"] for assumption in result["assumptions"]} == {
                "proxy_based",
                "expert_assumption",
            }
            assert {source["release_id"] for source in result["sources"]} == {
                "REL-KOSTAT-REA-2024",
                "REL-MSS-SB-2023",
            }
            assert result["confidence_score"] == 48
            assert result["confidence_grade"] == "D"
            assert {gap["gap_type"] for gap in result["validation_gaps"]} == {
                "business_web_presence_unobserved",
                "missing_joint_distribution",
                "owner_attribute_unobserved",
                "unknown_unit_conversion",
            }
            assert "745,196" in result["human_readable_explanation_ko"]
            assert "130,000~210,000" in result["human_readable_explanation_ko"]
            assert result["related_unit_counts"].keys() == {"person", "establishment"}
            assert all(
                related["status"] == "not_estimable"
                and related["count"] is None
                and related["reason"]
                for related in result["related_unit_counts"].values()
            )
            assert result["sources"]
        else:
            assert result["count"] is None
            assert result["share"] is None
            assert result["count_low"] is None
            assert result["count_base"] is None
            assert result["count_high"] is None
            assert result["confidence_score"] == 0
            assert result["confidence_grade"] == "E"
            assert result["validation_gaps"]
    comparison = compare_segments([saved[0]["query_id"], saved[0]["query_id"]])
    assert comparison["comparison"]["status"] == "bounded"
    assert comparison["comparison"]["intersection"] == saved[0]["count"]
    assert comparison["comparison"]["union"] == saved[0]["count"]
    assert comparison["comparison"]["method"] == "identical segment identity"
    assert comparison["unit_compatible"] is True
    assert comparison["validation_gaps"] == []
    assert comparison["overlap_warning"]


def test_unit_mismatch_is_not_silently_converted() -> None:
    cases = json.loads((ROOT / "examples/queries/acceptance_queries.json").read_text(encoding="utf-8"))
    result = estimate_segment_service(cases[8]["query"], persist=False)
    _assert_common_evidence_contract(result, expected_status="not_estimable", expected_unit="person")
    assert result["status"] == "not_estimable"
    assert any(gap["gap_type"] == "unknown_unit_conversion" for gap in result["validation_gaps"])
    assert result["denominator"] == {"definition": "unit-incompatible query", "count": None}
    assert result["formula_tree"] == {"unresolved_features": ["industry_code"]}
    assert "단위" in result["overlap_warning"]
    assert "암묵적 단위 변환 없이" in result["human_readable_explanation_ko"]
