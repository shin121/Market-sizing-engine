from __future__ import annotations

import json
from datetime import date
from typing import Any

from market_engine.dsl import validate_query
from market_engine.models import EstimateResult, Interval
from market_engine.repository import EngineRepository

MODEL_VERSION = "kr-v0.1.0"
RARE_OUTPUT_THRESHOLD = 10
RARE_OUTPUT_UNITS = {"person", "child_person", "household"}
OFFICIAL_DIRECT_METHOD_CODES = {
    "official_direct",
    "official_cross_tab",
    "official_rounded_thousand",
}


def _contains_operator(node: Any, operator: str) -> bool:
    if isinstance(node, dict):
        return operator in node or any(_contains_operator(value, operator) for value in node.values())
    if isinstance(node, list):
        return any(_contains_operator(value, operator) for value in node)
    return False


def _grade(score: int) -> str:
    for grade, threshold in (("A", 85), ("B", 75), ("C", 60), ("D", 40), ("E", 0)):
        if score >= threshold:
            return grade
    return "E"


def _gap(gap_type: str) -> dict[str, Any]:
    catalog = {
        "business_web_presence_unobserved": ("high", "60–69세 음식점 기업체의 자체 홈페이지 보유 여부를 직접 공동관측하지 못함", "업종×대표자연령×자체홈페이지 보유를 함께 측정한 확률표본 또는 사업체 웹 감사"),
        "owner_attribute_unobserved": ("medium", "공표표는 대표자 60세 이상만 제공하여 60–69세를 직접 분리하지 못함", "전국사업체조사 또는 소상공인실태조사 공개 마이크로데이터의 상세 연령대"),
        "missing_joint_distribution": ("high", "연령과 홈페이지 보유의 결합분포가 없음", "동일 표본에서 업종·연령·웹사이트를 공동관측한 교차표"),
        "unknown_unit_conversion": ("medium", "기업체·사업체·대표자 개인 간 일대일 대응을 확인할 자료가 없음", "기업통계등록부의 기업체-사업체 링크와 공동대표 정보"),
        "small_sample": ("high", "가중 Base 추정치가 공개 기준인 10 미만이어서 희귀 결과를 억제함", "동일 모집단에서 유효 표본을 확대한 공식 교차표 또는 확률표본"),
        "other": ("low", "직접 기준셀은 그 정의 범위만 지원하며 추가 행동·욕구 특성을 설명하지 않음", "질문에 필요한 공식 공동분포"),
    }
    impact, description, recommended = catalog.get(gap_type, ("medium", gap_type, "추가 공식자료"))
    return {
        "gap_type": gap_type,
        "impact": impact,
        "description": description,
        "verification_question": description,
        "recommended_source": recommended,
        "expected_improvement": "직접 공동관측 시 구간 축소 및 신뢰도 10–25점 개선 가능",
        "status": "open",
    }


def _single_code_filter(
    conditions: list[dict[str, Any]],
    feature: str,
) -> tuple[str | None, dict[str, Any] | None]:
    matches = [condition for condition in conditions if condition["feature"] == feature]
    if not matches:
        return None, None
    if len(matches) != 1:
        return None, {"feature": feature, "reason": "multiple_filters_require_a_joint_baseline"}
    condition = matches[0]
    value = condition.get("value")
    if condition["op"] == "eq" and isinstance(value, str) and value:
        return value, None
    if (
        condition["op"] == "in"
        and isinstance(value, list)
        and len(value) == 1
        and isinstance(value[0], str)
        and value[0]
    ):
        return value[0], None
    return None, {
        "feature": feature,
        "condition": condition,
        "reason": "only_eq_or_single_value_in_has_a_registered_baseline",
    }


def _requested_geography(
    query: dict[str, Any],
    conditions: list[dict[str, Any]],
) -> tuple[str | None, dict[str, Any] | None]:
    condition_code, error = _single_code_filter(conditions, "geography_code")
    if error:
        return None, error
    envelope = query.get("geography")
    envelope_code: str | None = None
    if envelope is not None:
        if not isinstance(envelope, dict):
            return None, {"feature": "geography", "reason": "geography_must_be_an_object"}
        codes = envelope.get("codes")
        if not isinstance(codes, list) or len(codes) != 1 or not isinstance(codes[0], str) or not codes[0]:
            return None, {
                "feature": "geography_code",
                "reason": "exactly_one_geography_code_is_required_without_a_registered_union",
            }
        envelope_code = codes[0]
    if condition_code and envelope_code and condition_code != envelope_code:
        return None, {
            "feature": "geography_code",
            "reason": "where_and_geography_envelope_conflict",
        }
    return condition_code or envelope_code or "KR", None


def _requested_as_of(query: dict[str, Any]) -> tuple[str | None, dict[str, Any] | None]:
    value = query.get("as_of")
    if value in (None, "latest"):
        return None, None
    if not isinstance(value, str):
        return None, {"feature": "as_of", "reason": "as_of_must_be_latest_or_an_iso_date"}
    try:
        return date.fromisoformat(value).isoformat(), None
    except ValueError:
        return None, {"feature": "as_of", "reason": "as_of_must_be_latest_or_an_iso_date"}


def _condition_context(
    conditions: list[dict[str, Any]],
    baseline_dimensions: dict[str, Any],
    geography_code: str,
) -> dict[str, Any]:
    context = {**baseline_dimensions, "geography_code": geography_code}
    for condition in conditions:
        operator = condition["op"]
        value = condition.get("value")
        if operator == "eq":
            context[condition["feature"]] = value
        elif operator == "in" and isinstance(value, list) and len(value) == 1:
            context[condition["feature"]] = value[0]
        elif operator == "between" and isinstance(value, list) and len(value) == 2:
            context[condition["feature"]] = value
    return context


def _duplicate_condition(conditions: list[dict[str, Any]]) -> dict[str, Any] | None:
    seen: set[str] = set()
    for condition in conditions:
        key = json.dumps(
            {
                "feature": condition.get("feature"),
                "op": condition.get("op"),
                "value": condition.get("value"),
                "negated": condition.get("negated", False),
            },
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        )
        if key in seen:
            return condition
        seen.add(key)
    return None


def _unsupported_filter_result(
    query: dict[str, Any],
    unsupported_filter: dict[str, Any],
) -> EstimateResult:
    return EstimateResult(
        interpreted_query={**query, "interpretation_notes": [
            f"지원되지 않는 필터 범위: {unsupported_filter.get('feature', 'unknown')}",
        ]},
        primary_unit=query["entity_unit"],
        count=None,
        share=None,
        denominator={"definition": "no compatible baseline", "count": None},
        related_unit_counts={},
        formula_tree={"unsupported_filter": unsupported_filter},
        sources=[],
        assumptions=[],
        confidence_score=0,
        confidence_grade="E",
        validation_gaps=[_gap("missing_joint_distribution")],
        overlap_warning="지원되지 않는 필터를 전국 또는 첫 번째 코드로 대체하지 않습니다.",
        model_version=MODEL_VERSION,
        as_of_period="unknown",
        status="not_estimable",
        human_readable_explanation_ko="요청 범위와 정확히 일치하는 기준 모집단이 없어 추정을 중단했습니다.",
    )


def _safe_suppressed_formula_tree(
    expression: str,
    baseline: dict[str, Any],
    formula_children: list[dict[str, Any]],
) -> dict[str, Any]:
    """Keep reproducibility identifiers while withholding reconstructable values."""
    safe_baseline = {
        key: baseline[key]
        for key in (
            "control_id",
            "period",
            "release_id",
            "dimensions",
            "evidence_locator",
            "method_code",
            "geography_code",
        )
        if key in baseline
    }
    safe_children = []
    for child in formula_children:
        safe_children.append({
            key: child[key]
            for key in ("type", "condition", "model_code", "formula")
            if key in child
        })
    return {
        "operation": "suppressed",
        "expression": expression,
        "baseline": safe_baseline,
        "children": safe_children,
        "release_policy": {
            "rule": "weighted_base_count_below_threshold",
            "threshold": RARE_OUTPUT_THRESHOLD,
        },
    }


def estimate_segment(query: dict[str, Any], repository: EngineRepository | None = None) -> EstimateResult:
    owns_repository = repository is None
    repo = repository or EngineRepository()
    try:
        conditions = validate_query(query, repo.queryable_features())
        unit_map = repo.feature_units()
        incompatible = sorted({c["feature"] for c in conditions if unit_map.get(c["feature"]) not in {query["entity_unit"], "all"}})
        has_or_not = _contains_operator(query["where"], "or") or _contains_operator(query["where"], "not")
        if incompatible:
            return EstimateResult(
                interpreted_query={**query,"interpretation_notes":[f"조건 단위 불일치: {incompatible}"]}, primary_unit=query["entity_unit"], count=None, share=None,
                denominator={"definition":"unit-incompatible query","count":None}, related_unit_counts={}, formula_tree={"unresolved_features":incompatible},
                sources=[], assumptions=[], confidence_score=0, confidence_grade="E", validation_gaps=[_gap("unknown_unit_conversion")],
                overlap_warning="사람·가구·사업체·기업체 단위는 승인된 변환자료 없이 서로 바꿀 수 없습니다.", model_version=MODEL_VERSION,
                as_of_period="unknown", status="not_estimable", human_readable_explanation_ko="질의 조건과 결과 단위가 다르므로 암묵적 단위 변환 없이 추정을 중단했습니다."
            )
        if has_or_not:
            return EstimateResult(
                interpreted_query={**query,"interpretation_notes":["OR/NOT 구문은 유효하지만 현재 등록된 공동분포로 확률을 합성할 수 없음"]}, primary_unit=query["entity_unit"], count=None, share=None,
                denominator={"definition":"logical-combination joint denominator unavailable","count":None}, related_unit_counts={}, formula_tree={"logical_expression":query["where"]},
                sources=[], assumptions=[], confidence_score=0, confidence_grade="E", validation_gaps=[_gap("missing_joint_distribution")],
                overlap_warning="OR 합집합은 중복률 없이 단순 합산하지 않습니다.", model_version=MODEL_VERSION, as_of_period="unknown", status="not_estimable",
                human_readable_explanation_ko="논리식은 파싱되었지만 교집합 자료가 없어 OR/NOT 확률을 임의 계산하지 않았습니다."
            )
        duplicate = _duplicate_condition(conditions)
        if duplicate:
            return _unsupported_filter_result(query, {
                "feature": duplicate["feature"],
                "condition": duplicate,
                "reason": "duplicate_condition",
            })
        industry, unsupported = _single_code_filter(conditions, "industry_code")
        if unsupported:
            return _unsupported_filter_result(query, unsupported)
        geography_code, unsupported = _requested_geography(query, conditions)
        if unsupported or geography_code is None:
            return _unsupported_filter_result(query, unsupported or {"feature": "geography_code"})
        as_of_date, unsupported = _requested_as_of(query)
        if unsupported:
            return _unsupported_filter_result(query, unsupported)
        baseline = repo.baseline_for(
            query["entity_unit"],
            industry,
            geography_code,
            as_of_date,
            conditions,
        )
        if baseline is None:
            missing_scope = (
                {"feature": "as_of", "value": as_of_date, "reason": "no_baseline_on_or_before_requested_date"}
                if as_of_date is not None
                else {"feature": "industry_code", "value": industry, "reason": "no_matching_baseline"}
                if industry is not None
                else {"feature": "geography_code", "value": geography_code, "reason": "no_matching_baseline"}
            )
            return _unsupported_filter_result(query, missing_scope)

        probability = Interval(1.0, 1.0, 1.0)
        formula_children: list[dict[str, Any]] = []
        assumptions: list[dict[str, Any]] = []
        gap_types: set[str] = set()
        release_ids: set[str] = {baseline["release_id"]}
        context = _condition_context(conditions, baseline["dimensions"], geography_code)
        for condition in conditions:
            dims = baseline["dimensions"]
            is_exact_dimension = condition in baseline["matched_conditions"]
            is_exact_industry = condition["feature"] == "industry_code" and dims.get("industry_code") == industry
            is_exact_geography = condition["feature"] == "geography_code" and baseline["geography_code"] == geography_code
            if is_exact_industry or is_exact_geography or is_exact_dimension:
                formula_children.append({"type":"deterministic_filter","condition":condition,"factor":{"low":1,"base":1,"high":1}})
                continue
            model = repo.probability_model(
                condition,
                entity_unit=query["entity_unit"],
                context=context,
            )
            if model is None:
                return EstimateResult(
                    interpreted_query=query, primary_unit=query["entity_unit"], count=None, share=None,
                    denominator={"definition":baseline["control_id"],"count":baseline["count"]}, related_unit_counts={},
                    formula_tree={"baseline":baseline,"unresolved_condition":condition}, sources=[repo.source(baseline["release_id"])],
                    assumptions=[], confidence_score=0, confidence_grade="E",
                    validation_gaps=[_gap("missing_joint_distribution")], overlap_warning="Segments may overlap.",
                    model_version=MODEL_VERSION, as_of_period=baseline["period"], status="not_estimable",
                    human_readable_explanation_ko=f"조건 {condition['feature']}을 추정할 공동분포나 승인된 모형이 없습니다.",
                )
            interval = Interval(**model["probability"])
            probability = probability.multiply(interval)
            formula_children.append({"type":"probability_model","condition":condition,"model_code":model["model_code"],"factor":interval.to_dict(),"formula":model["formula"]})
            assumptions.append({"code":model["model_code"],"statement":model["formula"],"value":interval.to_dict(),"method_code":model["method_code"]})
            gap_types.update(model["validation_gaps"])
            for component in model["components"]:
                if component.get("release_id"):
                    release_ids.add(component["release_id"])

        raw_count = Interval(**baseline["count_interval"]).multiply(probability)
        exact_baseline_match = not assumptions
        official_direct_control = (
            exact_baseline_match
            and baseline.get("method_code") in OFFICIAL_DIRECT_METHOD_CODES
        )
        if exact_baseline_match:
            gap_types.add("other")
        confidence_score = (
            82 if baseline.get("method_code") == "official_rounded_thousand" else 90
        ) if official_direct_control else (
            48 if "business_web_presence_unobserved" in gap_types else 62
        )
        rounded_count = raw_count.rounded(
            None if exact_baseline_match else (10_000 if confidence_score < 60 else 5_000)
        )
        share = Interval(probability.low * 100, probability.base * 100, probability.high * 100)
        related = {}
        for unit in query.get("return_related_units", []):
            related[unit] = {"status":"not_estimable","count":None,"reason":"unit conversion is not observed; no one-to-one assumption applied"}
            gap_types.add("unknown_unit_conversion")
        sources = [repo.source(rid) for rid in sorted(release_ids)]
        interpretation_notes = (
            ["등록된 공식 기준셀을 조건과 동일한 단위·범위로 직접 반환"]
            if official_direct_control
            else ["등록된 파생·가중 기준셀을 동일 범위로 적용; 희귀 결과 공개 기준 적용"]
            if exact_baseline_match
            else ["60대는 만 60–69세로 해석","음식점은 KSIC I56 음식점 및 주점업 소상공인 기업체","홈페이지 미보유는 직접 관측이 아닌 시나리오 모형"]
        )
        expression = (
            f"N({baseline['control_id']})"
            if exact_baseline_match
            else "N(I56 small-business enterprises) × P(owner 60–69 | I56) × P(no own website | owner 60–69, I56)"
        )
        if (
            not official_direct_control
            and query["entity_unit"] in RARE_OUTPUT_UNITS
            and raw_count.base < RARE_OUTPUT_THRESHOLD
        ):
            gap_types.add("small_sample")
            safe_assumptions = [{
                key: assumption[key]
                for key in ("code", "statement", "method_code")
                if key in assumption
            } for assumption in assumptions]
            return EstimateResult(
                interpreted_query={
                    **query,
                    "interpretation_notes": [
                        *interpretation_notes,
                        "가중 Base 추정치가 10 미만이어서 희귀 결과 공개를 억제",
                    ],
                },
                primary_unit=query["entity_unit"],
                count=None,
                share=None,
                denominator={
                    "definition": (
                        f"등록된 파생·가중 기준 모집단 {baseline['control_id']}"
                        if exact_baseline_match
                        else f"공식 기준 모집단 {baseline['control_id']}"
                    ),
                    "count": None,
                    "control_id": baseline["control_id"],
                },
                related_unit_counts=related,
                formula_tree=_safe_suppressed_formula_tree(
                    expression,
                    baseline,
                    formula_children,
                ),
                sources=sources,
                assumptions=safe_assumptions,
                confidence_score=confidence_score,
                confidence_grade=_grade(confidence_score),
                validation_gaps=[_gap(g) for g in sorted(gap_types)],
                overlap_warning="희귀 결과는 다른 세그먼트와의 중복 여부와 무관하게 공개하지 않습니다.",
                model_version=MODEL_VERSION,
                as_of_period=baseline["period"],
                status="suppressed",
                human_readable_explanation_ko=(
                    "가중 Base 추정치가 공개 기준인 10 미만이어서 수량, 비중, "
                    "Low/Base/High 구간을 반환하지 않습니다. 더 큰 공식 교차표 또는 "
                    "확률표본이 확보되면 재검토할 수 있습니다."
                ),
            )
        explanation = ((
                f"2023년 음식점·주점업 소상공인 기업체 {baseline['count']:,.0f}개를 분모로, "
                f"대표자 60–69세 비율과 자체 홈페이지 미보유 조건부 시나리오를 적용하면 "
                f"약 {rounded_count.low:,.0f}~{rounded_count.high:,.0f}개(기준 {rounded_count.base:,.0f}개)입니다. "
                "자체 홈페이지 여부를 직접 측정한 공식 공동분포가 없어 의사결정 전 표본 검증이 필요합니다."
            ) if not exact_baseline_match else (
                f"공식 기준셀 {baseline['control_id']}을 동일 단위와 범위로 직접 적용한 결과 "
                f"{rounded_count.base:,.0f}{'명' if query['entity_unit'] in {'person','child_person'} else '개'}입니다."
            ) if official_direct_control else (
                f"등록된 파생·가중 기준셀 {baseline['control_id']}을 동일 단위와 범위로 적용한 결과 "
                f"{rounded_count.base:,.0f}{'명' if query['entity_unit'] in {'person','child_person'} else '개'}입니다."
            ))
        result = EstimateResult(
            interpreted_query={**query,"interpretation_notes":interpretation_notes},
            primary_unit=query["entity_unit"], count=rounded_count, share=share,
            denominator={"definition":(
                f"공식 기준 모집단 {baseline['control_id']}"
                if official_direct_control
                else f"등록된 파생·가중 기준 모집단 {baseline['control_id']}"
                if exact_baseline_match
                else "2023년 음식점 및 주점업 소상공인 기업체"
            ),"count":baseline["count"],"control_id":baseline["control_id"]},
            related_unit_counts=related,
            formula_tree={"operation":"multiply","expression":expression,"baseline":baseline,"children":formula_children,"unrounded_count":raw_count.to_dict()},
            sources=sources, assumptions=assumptions, confidence_score=confidence_score,
            confidence_grade=_grade(confidence_score), validation_gaps=[_gap(g) for g in sorted(gap_types)],
            overlap_warning="이 결과는 중복 가능한 시장 세그먼트이며 다른 아키타입과 합산해 전체 모집단으로 해석할 수 없습니다.",
            model_version=MODEL_VERSION, as_of_period=baseline["period"], status="estimated",
            human_readable_explanation_ko=explanation,
        )
        return result
    finally:
        if owns_repository:
            repo.close()
