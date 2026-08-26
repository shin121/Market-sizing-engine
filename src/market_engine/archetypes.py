from __future__ import annotations

import csv
import hashlib
import json
from pathlib import Path
from typing import Any

import duckdb

from .io import canonical_json, load_json_yaml, stable_hash
from .paths import CONFIG_DIR, EXPORT_DIR, PROCESSED_DIR, REPORT_DIR, ROOT


REGIONS = [("national", "전국"), ("capital", "수도권"), ("central", "충청권"), ("honam", "호남권"), ("yeongnam", "영남권")]

CATEGORY_AXES: dict[str, tuple[str, list[tuple[str, str]], list[tuple[str, str]]]] = {
    "life_stage": ("person", [("young", "청년"), ("family", "가족형성기"), ("midlife", "중년"), ("senior", "시니어")], [("transition", "전환기"), ("stable", "안정기"), ("solo", "1인가구 지향"), ("care", "돌봄 병행")]),
    "household_family": ("household", [("single", "1인가구"), ("couple", "부부가구"), ("children", "자녀동거가구"), ("multigen", "다세대가구")], [("new", "신규형성"), ("stable", "안정형"), ("care", "돌봄형"), ("transition", "구성변화형")]),
    "children_education": ("child_person", [("preschool", "미취학"), ("elementary", "초등"), ("middle", "중등"), ("high", "고등")], [("public", "공교육 중심"), ("private", "사교육 병행"), ("care", "돌봄 필요"), ("digital", "디지털 학습")]),
    "geography_housing": ("household", [("apartment", "아파트"), ("detached", "단독주택"), ("multi", "연립·다세대"), ("rental", "임차주거")], [("settled", "장기거주"), ("moving", "이사예정"), ("repair", "주거개선"), ("downsizing", "주거축소")]),
    "work_career": ("person", [("entry", "취업초기"), ("experienced", "경력직"), ("transition", "전직기"), ("retired", "은퇴전후")], [("growth", "성장지향"), ("stability", "안정지향"), ("flexible", "유연근무"), ("reskill", "재교육")]),
    "small_business": ("enterprise", [("startup", "창업초기"), ("growth", "성장기"), ("mature", "안정운영"), ("succession", "승계·폐업전환")], [("offline", "오프라인 중심"), ("website_gap", "홈페이지 미보유"), ("commerce", "온라인판매"), ("automation", "운영자동화")]),
    "financial_capacity": ("household", [("low", "저소득"), ("middle", "중간소득"), ("upper", "상위소득"), ("retirement", "은퇴소득")], [("saving", "저축중심"), ("debt", "부채상환"), ("invest", "투자지향"), ("protection", "위험관리")]),
    "home_services": ("household", [("newhome", "신규입주"), ("longterm", "장기거주"), ("moving", "이사준비"), ("seniorhome", "고령가구")], [("cleaning", "청소"), ("repair", "수리"), ("interior", "인테리어"), ("security", "주거안전")]),
    "mobility": ("person", [("commuter", "통근자"), ("driver", "자가운전자"), ("transit", "대중교통 이용자"), ("limited", "이동제약자")], [("cost", "비용민감"), ("time", "시간민감"), ("green", "친환경"), ("access", "접근성중시")]),
    "digital_media": ("person", [("beginner", "디지털 초심자"), ("mainstream", "일반 이용자"), ("creator", "콘텐츠 제작자"), ("senior", "고령 이용자")], [("social", "소셜미디어"), ("video", "영상"), ("ai", "AI도구"), ("privacy", "개인정보보호")]),
    "commerce_payment": ("person", [("offline", "오프라인 구매자"), ("online", "온라인 구매자"), ("omni", "옴니채널 구매자"), ("business", "사업자 구매자")], [("price", "가격중시"), ("speed", "배송중시"), ("trust", "신뢰중시"), ("convenience", "결제편의")]),
    "food_dining": ("person", [("home", "가정식 중심"), ("delivery", "배달 이용"), ("dining", "외식 중심"), ("business", "음식업 운영")], [("health", "건강식"), ("value", "가성비"), ("premium", "프리미엄"), ("convenience", "편의성")]),
    "health_care": ("person", [("preventive", "예방관리"), ("chronic", "만성관리"), ("caregiver", "가족돌봄"), ("senior", "고령건강")], [("exercise", "운동"), ("nutrition", "영양"), ("access", "의료접근"), ("monitoring", "건강모니터링")]),
    "leisure_culture": ("person", [("solo", "혼자여가"), ("family", "가족여가"), ("community", "모임여가"), ("senior", "시니어여가")], [("sports", "스포츠"), ("arts", "문화예술"), ("outdoor", "야외활동"), ("home", "홈엔터테인먼트")]),
    "travel": ("person", [("solo", "혼행"), ("couple", "커플여행"), ("family", "가족여행"), ("senior", "시니어여행")], [("domestic", "국내"), ("overseas", "해외"), ("short", "단기"), ("long", "장기")]),
    "parenting_private_education": ("household", [("infant", "영유아 자녀"), ("elementary", "초등 자녀"), ("middle", "중등 자녀"), ("high", "고등 자녀")], [("care", "돌봄"), ("academy", "학원"), ("tutoring", "개별지도"), ("online", "온라인교육")]),
    "pets": ("household", [("new", "초보 양육"), ("dog", "반려견 양육"), ("cat", "반려묘 양육"), ("multi", "다마리 양육")], [("food", "사료"), ("health", "건강관리"), ("service", "돌봄서비스"), ("travel", "동반여행")]),
    "senior_retirement_care": ("person", [("pre", "은퇴준비"), ("active", "활동시니어"), ("limited", "생활제약 시니어"), ("caregiver", "가족돌봄자")], [("income", "노후소득"), ("health", "건강"), ("housing", "주거"), ("care", "돌봄")]),
}


def _representatives() -> list[str]:
    mart = PROCESSED_DIR / "nemotron_feature_mart.parquet"
    if not mart.exists():
        return []
    con = duckdb.connect()
    values = [row[0] for row in con.execute(f"SELECT synthetic_person_id FROM read_parquet('{mart.as_posix()}') ORDER BY synthetic_person_id LIMIT 5000").fetchall()]
    con.close()
    return values


def generate_archetypes() -> list[dict[str, Any]]:
    taxonomy = load_json_yaml(CONFIG_DIR / "categories.yml")
    category_names = {x["code"]: x["name_ko"] for x in taxonomy["categories"]}
    persona_ids = _representatives()
    rows: list[dict[str, Any]] = []
    for category_index, category in enumerate(taxonomy["categories"], start=1):
        code = category["code"]
        unit, stages, focuses = CATEGORY_AXES[code]
        ordinal = 0
        for region_code, region_name in REGIONS:
            for stage_code, stage_name in stages:
                for focus_code, focus_name in focuses:
                    ordinal += 1
                    archetype_id = f"ARC-{category_index:02d}-{ordinal:03d}"
                    rule = {"and":[
                        {"feature":"archetype_category","op":"eq","value":code,"evidence_status":"taxonomy_axis"},
                        {"feature":"geography_cluster","op":"eq","value":region_code,"evidence_status":"derived_geography"},
                        {"feature":"profile_stage","op":"eq","value":stage_code,"evidence_status":"taxonomy_axis"},
                        {"feature":"profile_focus","op":"eq","value":focus_code,"evidence_status":"inferred_need_axis"},
                    ]}
                    status = "not_estimable"
                    count = {"low":None,"base":None,"high":None}
                    share = {"low":None,"base":None,"high":None}
                    denominator = "No compatible observed joint denominator"
                    period = "latest_registered"
                    method = "not_estimable"
                    formula = "Not estimated: required joint distribution is unavailable"
                    sources: list[str] = []
                    gaps = ["missing_joint_distribution"]
                    confidence = {"score":0,"grade":"E"}
                    name = f"{region_name} {stage_name}·{focus_name} {category_names[code]}"
                    definition = f"{region_name} 범위에서 {stage_name} 특성과 {focus_name} 관심축이 겹치는 {unit} 세그먼트"
                    if code == "small_business" and ordinal == 1:
                        name = "대한민국 홈페이지 미보유 60대 음식점 사업자"
                        definition = "대한민국 음식점·주점업 소상공인 기업체 중 대표자가 60–69세이고 자체 홈페이지가 없는 것으로 추정되는 세그먼트"
                        rule = {"and":[
                            {"feature":"archetype_category","op":"eq","value":code,"evidence_status":"taxonomy_axis"},
                            {"feature":"industry_code","op":"in","value":["I56"]},
                            {"feature":"owner_age","op":"between","value":[60,69]},
                            {"feature":"has_website","op":"eq","value":False},
                        ]}
                        status = "estimated"
                        count = {"low":130000,"base":170000,"high":210000}
                        share = {"low":16.956,"base":22.6746,"high":27.936}
                        denominator = "2023 음식점 및 주점업 소상공인 기업체 745,196개"
                        period = "2023-12-31"
                        method = "official_baseline_times_proxy_scenario"
                        formula = "745196 × P(owner age 60–69 | I56) × P(no own website | owner age 60–69, I56)"
                        sources = ["REL-MSS-SB-2023", "REL-KOSTAT-REA-2024"]
                        gaps = ["business_web_presence_unobserved", "owner_attribute_unobserved", "missing_joint_distribution", "unknown_unit_conversion"]
                        confidence = {"score":48,"grade":"D"}
                    if unit == "person" and persona_ids:
                        pos = int(hashlib.sha256(archetype_id.encode()).hexdigest()[:8], 16) % len(persona_ids)
                        rep = {"source_kind":"nemotron","source_persona_key":persona_ids[pos],"provenance":"synthetic representative; not a real person"}
                    else:
                        rep = {"source_kind":f"synthetic_{unit}","source_persona_key":f"{unit}-{stable_hash(rule)[:16]}","provenance":"deterministic synthetic representative; not observed"}
                    rows.append({
                        "archetype_id":archetype_id, "category_code":code, "name_ko":name,
                        "one_line_definition":definition, "primary_entity_unit":unit,
                        "rule":rule, "rule_hash":stable_hash(rule),
                        "observable_traits":[region_name, stage_name],
                        "inferred_needs":[{"label":focus_name,"provenance":"inferred_need_not_observed"}],
                        "channels":[{"channel":"to_be_validated","provenance":"inferred_not_observed"}],
                        "overlap_note":"비상호배타 아키타입; 다른 아키타입과 단순 합산 금지",
                        "representative":rep, "estimate_status":status, "count":count, "share":share,
                        "denominator":denominator, "reference_period":period, "method_code":method,
                        "formula":formula, "source_release_ids":sources, "confidence":confidence,
                        "validation_gaps":gaps, "version":taxonomy["version"],
                    })
    return rows


def export_archetypes(rows: list[dict[str, Any]]) -> dict[str, Any]:
    EXPORT_DIR.mkdir(parents=True, exist_ok=True)
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    csv_path = EXPORT_DIR / "archetypes.csv"
    fields = ["archetype_id","category_code","name_ko","primary_entity_unit","estimate_status","count_low","count_base","count_high","confidence_grade","rule_hash"]
    with csv_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for row in rows:
            writer.writerow({
                "archetype_id":row["archetype_id"], "category_code":row["category_code"], "name_ko":row["name_ko"],
                "primary_entity_unit":row["primary_entity_unit"], "estimate_status":row["estimate_status"],
                "count_low":row["count"]["low"], "count_base":row["count"]["base"], "count_high":row["count"]["high"],
                "confidence_grade":row["confidence"]["grade"], "rule_hash":row["rule_hash"],
            })
    jsonl_path = EXPORT_DIR / "archetypes.jsonl"
    jsonl_path.write_text("".join(canonical_json(row) + "\n" for row in rows), encoding="utf-8")
    con = duckdb.connect()
    con.execute("CREATE TABLE rows(payload JSON)")
    con.executemany("INSERT INTO rows VALUES (?)", [(canonical_json(row),) for row in rows])
    parquet_path = PROCESSED_DIR / "archetypes.parquet"
    con.execute(f"COPY (SELECT payload FROM rows) TO '{parquet_path.as_posix()}' (FORMAT PARQUET, COMPRESSION ZSTD)")
    con.close()
    counts: dict[str, int] = {}
    for row in rows:
        counts[row["category_code"]] = counts.get(row["category_code"], 0) + 1
    estimated = sum(row["estimate_status"] == "estimated" for row in rows)
    report = REPORT_DIR / "archetype_coverage.md"
    lines = ["# Archetype coverage", "", "Generated: 2026-08-24", "", f"- Categories: {len(counts)}", f"- Archetypes: {len(rows)}", f"- Estimated: {estimated}", f"- Explicitly not estimable: {len(rows)-estimated}", "", "| Category | Count |", "|---|---:|"]
    lines.extend(f"| {code} | {count} |" for code, count in counts.items())
    lines.extend(["", "All rules have unique hashes. The catalog is intentionally overlapping; counts must not be summed. Inferred needs and channels are labeled and are not factual observations.", ""])
    report.write_text("\n".join(lines), encoding="utf-8")
    return {"rows":len(rows),"categories":len(counts),"estimated":estimated,"not_estimable":len(rows)-estimated,"csv":str(csv_path.relative_to(ROOT)),"jsonl":str(jsonl_path.relative_to(ROOT)),"parquet":str(parquet_path.relative_to(ROOT)),"report":str(report.relative_to(ROOT))}


def build_archetypes() -> dict[str, Any]:
    rows = generate_archetypes()
    hashes = [row["rule_hash"] for row in rows]
    if len(rows) < 1200 or len(set(hashes)) != len(rows):
        raise RuntimeError("archetype cardinality or uniqueness check failed")
    return export_archetypes(rows)
