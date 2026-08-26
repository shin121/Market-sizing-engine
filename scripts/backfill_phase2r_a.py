from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb


ROOT = Path(__file__).resolve().parents[1]
VERSION = "phase2r-a-2026-08-26-v2"

# Phase 1 intentionally retains the rounded controls with which its immutable
# artifacts were built. Phase 2R-A uses the more precise appendix values in its
# isolated production schema without changing that historical baseline.
PHASE2R_CONTROL_OVERRIDES = {
    "CTL-POP-2024": (51_805_547, "appendix table 1, PDF p.113 (printed p.104): exact total population 51,805,547", "official_direct"),
    "CTL-CHILD-0-14-2024": (5_420_798, "appendix table 3, PDF pp.124-125 (printed pp.115-116): exact age 0-14 population 5,420,798", "official_direct"),
    "CTL-HH-TOTAL-2024": (22_997_120, "appendix table 1, PDF p.113 (printed p.104): exact total households 22,997,120", "official_direct"),
    "CTL-HH-GENERAL-2024": (22_294_419, "appendix table 7, PDF p.130 (printed p.121): exact general households 22,294,419", "official_direct"),
    "CTL-HH-GENERAL-SIZE1-2024": (8_044_948, "appendix table 7, PDF p.130 (printed p.121): exact one-person general households", "official_direct"),
    "CTL-HH-GENERAL-SIZE2-2024": (6_476_024, "appendix table 7, PDF p.130 (printed p.121): exact two-person general households", "official_direct"),
    "CTL-HH-GENERAL-SIZE3-2024": (4_202_129, "appendix table 7, PDF p.130 (printed p.121): exact three-person general households", "official_direct"),
    "CTL-HH-GENERAL-SIZE4P-2024": (3_571_318, "appendix table 7, PDF p.130 (printed p.121): exact four-person plus five-or-more general households", "official_derived_sum"),
    "CTL-ENT-ALL-2024": (7_641_749, "statistical table 1.1, PDF p.41 (printed p.35): exact all-industry active enterprises 7,641,749", "official_direct"),
}


AXIS_LABELS = {
    "object": ("대상", "Object"),
    "format": ("형식", "Format"),
    "occasion": ("이용 상황", "Occasion"),
    "location": ("장소", "Location"),
    "frequency_intensity": ("빈도·강도", "Frequency and intensity"),
    "discovery": ("발견 경로", "Discovery"),
    "acquisition_access": ("획득·접근", "Acquisition and access"),
    "consumption_mode": ("소비 방식", "Consumption mode"),
    "device_channel_platform": ("기기·채널·플랫폼", "Device, channel, and platform"),
    "payment_monetization": ("결제·수익화", "Payment and monetization"),
    "decision_unit": ("의사결정 단위", "Decision unit"),
    "engagement_participation": ("참여 방식", "Engagement and participation"),
    "motivation_job": ("동기·과업", "Motivation and job"),
    "barrier_risk_trust": ("장벽·위험·신뢰", "Barrier, risk, and trust"),
    "loyalty_switching": ("충성·전환", "Loyalty and switching"),
    "spending_value": ("지출·가치", "Spending and value"),
}


STATUS_LABELS = {
    "complete_with_evidence_constraints": "근거 제약 내 구축 완료",
    "estimated": "추정 완료",
    "not_estimable": "추정 근거 부족",
    "suppressed": "소수집단 보호로 비공개",
    "active": "활성",
    "draft": "초안",
    "superseded": "대체됨",
    "approved": "승인됨",
    "pending": "검토 대기",
    "not_required": "승인 불필요",
}


PERSON_DIMENSIONS = [
    ("total_population", "전체 인구", "Total population", "대한민국 상주 인구 총계", "number", "observed", "control_total"),
    ("age", "연령·연령구간", "Age and age band", "연령 또는 연령구간별 인구", "category", "partially_observed", "marginal"),
    ("sex", "성별", "Sex", "공식 통계의 성별 구분", "category", "schema_ready", "marginal"),
    ("region", "지역", "Region", "시도 및 가용한 하위 지역", "category", "schema_ready", "marginal"),
    ("economic_activity", "경제활동 상태", "Economic activity", "취업·실업·비경제활동 상태", "category", "schema_ready", "calibration_target"),
    ("occupation", "직업", "Occupation", "직업분류 또는 고용상 지위", "category", "schema_ready", "calibration_target"),
    ("income", "소득", "Income", "개인 또는 가구 소득 구간", "category", "schema_ready", "calibration_target"),
    ("education", "교육", "Education", "최종 학력 또는 재학 상태", "category", "schema_ready", "calibration_target"),
    ("marital_status", "혼인 상태", "Marital status", "혼인 상태 구분", "category", "schema_ready", "marginal"),
    ("household_role", "가구 내 역할", "Household role", "가구주·배우자·자녀 등 가구 내 역할", "category", "schema_ready", "calibration_target"),
]

HOUSEHOLD_DIMENSIONS = [
    ("total_households", "전체 가구", "Total households", "대한민국 총가구", "number", "observed", "control_total"),
    ("region", "지역", "Region", "시도 및 가용한 하위 지역", "category", "schema_ready", "marginal"),
    ("household_size", "가구원 수", "Household size", "가구원 수별 일반가구", "integer", "observed", "marginal"),
    ("head_age", "가구주 연령", "Householder age", "가구주 연령 또는 연령구간", "category", "schema_ready", "calibration_target"),
    ("children_presence", "자녀 유무", "Children presence", "18세 이하 자녀 동거 여부", "boolean", "partially_observed", "marginal"),
    ("children_age", "자녀 연령", "Children age", "가구 내 자녀 연령구간", "category", "partially_observed", "calibration_target"),
    ("dual_income", "맞벌이 여부", "Dual income", "부부 취업 상태에 따른 맞벌이 여부", "boolean", "schema_ready", "calibration_target"),
    ("household_income", "가구소득", "Household income", "가구소득 구간", "category", "schema_ready", "calibration_target"),
    ("housing_tenure", "주거형태", "Housing tenure", "자가·전세·월세 등 점유 형태", "category", "schema_ready", "marginal"),
    ("single_person", "1인 가구", "Single-person household", "가구원 수 1명 여부", "boolean", "observed", "marginal"),
    ("elderly_household", "고령가구", "Elderly household", "고령가구 또는 고령자 포함 가구", "boolean", "schema_ready", "calibration_target"),
]

BUSINESS_DIMENSIONS = [
    ("total_entities", "전체 사업체·기업", "Total businesses", "조사 단위별 전체 사업체 또는 활동기업", "number", "observed", "control_total"),
    ("industry", "업종", "Industry", "한국표준산업분류 업종", "category", "partially_observed", "marginal"),
    ("region", "지역", "Region", "시도 및 가용한 하위 지역", "category", "schema_ready", "marginal"),
    ("employee_band", "종사자 규모", "Employee band", "종사자 수 구간", "category", "schema_ready", "calibration_target"),
    ("legal_form", "조직 형태", "Legal form", "개인·법인 등 조직 형태", "category", "schema_ready", "marginal"),
    ("owner_sex", "대표자 성별", "Owner sex", "대표자 성별 구분", "category", "schema_ready", "marginal"),
    ("owner_age", "대표자 연령", "Owner age", "대표자 연령 또는 가용 Proxy", "category", "proxy_only", "calibration_target"),
    ("sales_band", "매출 규모", "Sales band", "매출액 구간", "category", "schema_ready", "calibration_target"),
    ("business_age", "사업 연령", "Business age", "개업 이후 존속기간", "category", "schema_ready", "calibration_target"),
    ("online_sales", "온라인 판매채널", "Online sales", "온라인 판매채널 보유·이용 여부", "boolean", "proxy_only", "calibration_target"),
    ("digital_tools", "디지털 도구 이용", "Digital tools", "홈페이지·플랫폼·업무도구 이용", "json", "proxy_only", "calibration_target"),
    ("store_format", "점포형·무점포형", "Store format", "점포 보유 형태", "category", "schema_ready", "calibration_target"),
]


@dataclass(frozen=True)
class ObservationSeed:
    observation_id: str
    universe_id: str
    dimension_code: str | None
    dimension_values: dict[str, Any]
    low: float
    base: float
    high: float
    unit: str
    geography_id: int
    period_id: int
    reference_year: int
    release_id: str
    citation_id: str | None
    directness: str
    grade: str
    method_code: str
    formula: str
    confidence_score: int
    is_direct: bool


def fetch_one(cursor: psycopg.Cursor[Any], sql: str, params: tuple[Any, ...] = ()) -> dict[str, Any]:
    cursor.execute(sql, params)
    row = cursor.fetchone()
    if row is None:
        raise RuntimeError(f"required source row missing for query: {sql}")
    return dict(row)


def upsert_universe(cursor: psycopg.Cursor[Any], seed: dict[str, Any]) -> None:
    cursor.execute(
        """
        INSERT INTO production.universe (
          universe_id, universe_code, display_name_ko, display_name_en, description_ko,
          entity_unit, geography_id, period_id, denominator_definition,
          source_release_id, status, data_scope, version
        ) VALUES (
          %(universe_id)s, %(universe_code)s, %(display_name_ko)s, %(display_name_en)s,
          %(description_ko)s, %(entity_unit)s, %(geography_id)s, %(period_id)s,
          %(denominator_definition)s, %(source_release_id)s, 'active', 'production', %(version)s
        )
        ON CONFLICT (universe_id) DO UPDATE SET
          universe_code=excluded.universe_code,
          display_name_ko=excluded.display_name_ko,
          display_name_en=excluded.display_name_en,
          description_ko=excluded.description_ko,
          entity_unit=excluded.entity_unit,
          geography_id=excluded.geography_id,
          period_id=excluded.period_id,
          denominator_definition=excluded.denominator_definition,
          source_release_id=excluded.source_release_id,
          status='active', version=excluded.version, updated_at=now()
        """,
        seed,
    )


def upsert_dimensions(cursor: psycopg.Cursor[Any], universe_id: str, items: Iterable[tuple[str, ...]], release_id: str) -> None:
    for order, (code, ko, en, description, data_type, coverage, role) in enumerate(items, start=1):
        cursor.execute(
            """
            INSERT INTO production.universe_dimension (
              universe_dimension_id, universe_id, dimension_code, display_name_ko,
              display_name_en, description_ko, data_type, coverage_status,
              calibration_role, source_release_id, sort_order, version
            ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (universe_dimension_id) DO UPDATE SET
              display_name_ko=excluded.display_name_ko,
              display_name_en=excluded.display_name_en,
              description_ko=excluded.description_ko,
              data_type=excluded.data_type,
              coverage_status=excluded.coverage_status,
              calibration_role=excluded.calibration_role,
              source_release_id=excluded.source_release_id,
              sort_order=excluded.sort_order,
              version=excluded.version,
              updated_at=now()
            """,
            (f"{universe_id}:{code}", universe_id, code, ko, en, description, data_type, coverage, role, release_id, order, VERSION),
        )


def upsert_observation(cursor: psycopg.Cursor[Any], seed: ObservationSeed) -> None:
    dimension_id = f"{seed.universe_id}:{seed.dimension_code}" if seed.dimension_code else None
    cursor.execute(
        """
        INSERT INTO production.universe_observation (
          observation_id, universe_id, universe_dimension_id, dimension_values,
          value_type, value_low, value_base, value_high, unit, geography_id, period_id,
          reference_year, source_release_id, citation_id, directness, estimate_grade,
          method_code, formula, confidence_score, assumptions_json,
          validation_variables, is_direct_value, version
        ) VALUES (
          %s,%s,%s,%s,'count',%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,
          '[]'::jsonb,'[]'::jsonb,%s,%s
        )
        ON CONFLICT (observation_id) DO UPDATE SET
          universe_id=excluded.universe_id,
          universe_dimension_id=excluded.universe_dimension_id,
          dimension_values=excluded.dimension_values,
          value_low=excluded.value_low,
          value_base=excluded.value_base,
          value_high=excluded.value_high,
          unit=excluded.unit,
          geography_id=excluded.geography_id,
          period_id=excluded.period_id,
          reference_year=excluded.reference_year,
          source_release_id=excluded.source_release_id,
          citation_id=excluded.citation_id,
          directness=excluded.directness,
          estimate_grade=excluded.estimate_grade,
          method_code=excluded.method_code,
          formula=excluded.formula,
          confidence_score=excluded.confidence_score,
          is_direct_value=excluded.is_direct_value,
          version=excluded.version,
          updated_at=now()
        """,
        (
            seed.observation_id,
            seed.universe_id,
            dimension_id,
            Jsonb(seed.dimension_values),
            seed.low,
            seed.base,
            seed.high,
            seed.unit,
            seed.geography_id,
            seed.period_id,
            seed.reference_year,
            seed.release_id,
            seed.citation_id,
            seed.directness,
            seed.grade,
            seed.method_code,
            seed.formula,
            seed.confidence_score,
            seed.is_direct,
            VERSION,
        ),
    )


def upsert_citation(
    cursor: psycopg.Cursor[Any],
    citation_id: str,
    release_id: str,
    locator: str,
    claim: str,
    used_value: float,
    unit: str,
    extraction_method: str = "official_table_transcription",
) -> None:
    cursor.execute(
        """
        INSERT INTO production.citation (
          citation_id, source_document_id, locator, claim, used_value, unit,
          extraction_method, reviewer_status
        ) VALUES (%s,%s,%s,%s,%s,%s,%s,'machine_checked')
        ON CONFLICT (citation_id) DO UPDATE SET
          source_document_id=excluded.source_document_id,
          locator=excluded.locator,
          claim=excluded.claim,
          used_value=excluded.used_value,
          unit=excluded.unit,
          extraction_method=excluded.extraction_method,
          reviewer_status=excluded.reviewer_status,
          updated_at=now()
        """,
        (citation_id, f"DOC-{release_id}", locator, claim, used_value, unit, extraction_method),
    )


def upsert_province_geographies(
    cursor: psycopg.Cursor[Any], country_geography_id: int, rows: list[dict[str, Any]]
) -> dict[str, int]:
    for row in rows:
        cursor.execute(
            """
            INSERT INTO public.geography (
              code, name_ko, level, parent_id, valid_from, valid_to, data_version
            ) VALUES (%s,%s,'province',%s,DATE '2024-01-01',NULL,%s)
            ON CONFLICT (code,valid_from) DO UPDATE SET
              name_ko=excluded.name_ko,
              level='province',
              parent_id=excluded.parent_id,
              valid_to=NULL,
              data_version=excluded.data_version,
              updated_at=now()
            """,
            (row["code"], row["name_ko"], country_geography_id, VERSION),
        )
    cursor.execute(
        """
        SELECT code, geography_id
        FROM public.geography
        WHERE code = ANY(%s) AND valid_from = DATE '2024-01-01'
        """,
        ([row["code"] for row in rows],),
    )
    return {str(row["code"]): int(row["geography_id"]) for row in cursor.fetchall()}


def seed_official_observations(
    cursor: psycopg.Cursor[Any],
    official: dict[str, Any],
    country_geography_id: int,
    census_period_id: int,
    business_period_id: int,
) -> dict[str, str]:
    province_ids = upsert_province_geographies(cursor, country_geography_id, official["province_rows"])
    locators = official["source_locators"]

    for row in official["province_rows"]:
        for entity, universe_id, dimension_code, release_id, locator_key, unit in (
            ("person", "UNIV-KR-PERSON-2024", "region", "REL-KOSTAT-CENSUS-2024", "province_person_household", "person"),
            ("household", "UNIV-KR-HOUSEHOLD-2024", "region", "REL-KOSTAT-CENSUS-2024", "province_person_household", "household"),
            ("establishment", "UNIV-KR-ESTABLISHMENT-2024", "region", "REL-KOSTAT-EST-2024-P", "province_establishment", "establishment"),
        ):
            value = float(row[entity])
            observation_id = f"OBS-KR-{entity.upper()}-REGION-{row['code']}-2024"
            citation_id = f"CIT-{observation_id}"
            upsert_citation(
                cursor, citation_id, release_id, locators[locator_key],
                f"{row['name_ko']} {entity} official count", value, unit,
            )
            upsert_observation(
                cursor,
                ObservationSeed(
                    observation_id, universe_id, dimension_code,
                    {"province_code": row["code"], "province_name_ko": row["name_ko"]},
                    value, value, value, unit, province_ids[row["code"]],
                    census_period_id if entity != "establishment" else business_period_id,
                    2024, release_id, citation_id, "direct", "A", "official_direct",
                    f"published {entity} count for province {row['code']}", 98 if entity != "establishment" else 96, True,
                ),
            )

    for index, row in enumerate(official["person_observations"], start=1):
        value = float(row["count"])
        low = float(row.get("count_low", value))
        high = float(row.get("count_high", value))
        observation_id = f"OBS-KR-PERSON-{row['dimension_code'].upper()}-{index:02d}-2024"
        citation_id = f"CIT-{observation_id}"
        upsert_citation(cursor, citation_id, "REL-KOSTAT-CENSUS-2024", row["locator"], f"Person {row['dimension_code']} official count", value, "person")
        upsert_observation(
            cursor,
            ObservationSeed(
                observation_id, "UNIV-KR-PERSON-2024", row["dimension_code"], row["values"],
                low, value, high, "person", country_geography_id, census_period_id, 2024,
                "REL-KOSTAT-CENSUS-2024", citation_id, "direct", "A",
                "official_direct" if low == high else "official_rounded_thousand",
                "published official census marginal", 98 if low == high else 94, True,
            ),
        )

    household_special: dict[str, str] = {}
    for index, row in enumerate(official["household_observations"], start=1):
        value = float(row["count"])
        low = float(row.get("count_low", value))
        high = float(row.get("count_high", value))
        observation_id = f"OBS-KR-HOUSEHOLD-{row['dimension_code'].upper()}-{index:02d}-2024"
        citation_id = f"CIT-{observation_id}"
        upsert_citation(cursor, citation_id, "REL-KOSTAT-CENSUS-2024", row["locator"], f"Household {row['dimension_code']} official count", value, "household")
        upsert_observation(
            cursor,
            ObservationSeed(
                observation_id, "UNIV-KR-HOUSEHOLD-2024", row["dimension_code"], row["values"],
                low, value, high, "household", country_geography_id, census_period_id, 2024,
                "REL-KOSTAT-CENSUS-2024", citation_id, "direct", "A",
                "official_direct" if low == high else "official_rounded_thousand",
                "published official census household marginal", 98 if low == high else 94, True,
            ),
        )
        if row["dimension_code"] == "children_presence":
            household_special["children_presence"] = observation_id

    establishment_groups = official["establishment_observations"]
    for dimension_code, locator_key in (
        ("industry", "establishment_industry"),
        ("employee_band", "establishment_employee_band"),
        ("legal_form", "establishment_legal_form"),
        ("owner_age", "establishment_owner_age"),
    ):
        for code, count in establishment_groups[dimension_code]:
            safe_code = str(code).replace("+", "plus")
            observation_id = f"OBS-KR-ESTABLISHMENT-{dimension_code.upper()}-{safe_code.upper()}-2024"
            citation_id = f"CIT-{observation_id}"
            upsert_citation(cursor, citation_id, "REL-KOSTAT-EST-2024-P", locators[locator_key], f"Establishment {dimension_code}={code} official count", count, "establishment")
            upsert_observation(
                cursor,
                ObservationSeed(
                    observation_id, "UNIV-KR-ESTABLISHMENT-2024", dimension_code,
                    {dimension_code: code}, float(count), float(count), float(count), "establishment",
                    country_geography_id, business_period_id, 2024, "REL-KOSTAT-EST-2024-P",
                    citation_id, "direct", "A", "official_direct", "published official establishment marginal", 96, True,
                ),
            )

    enterprise_groups = official["enterprise_observations"]
    for dimension_code, locator_key in (
        ("employee_band", "enterprise_employee_band"),
        ("owner_age", "enterprise_owner_sex_age"),
        ("legal_form", "enterprise_legal_form"),
        ("sales_band", "enterprise_sales_band"),
        ("business_age", "enterprise_business_age"),
    ):
        for code, count in enterprise_groups[dimension_code]:
            safe_code = str(code).replace("+", "plus")
            observation_id = f"OBS-KR-ENTERPRISE-{dimension_code.upper()}-{safe_code.upper()}-2024"
            citation_id = f"CIT-{observation_id}"
            upsert_citation(cursor, citation_id, "REL-KOSTAT-BD-2024-P", locators[locator_key], f"Enterprise {dimension_code}={code} official count", count, "enterprise")
            upsert_observation(
                cursor,
                ObservationSeed(
                    observation_id, "UNIV-KR-ENTERPRISE-2024", dimension_code,
                    {dimension_code: code}, float(count), float(count), float(count), "enterprise",
                    country_geography_id, business_period_id, 2024, "REL-KOSTAT-BD-2024-P",
                    citation_id, "direct", "A", "official_direct", "published official active-enterprise marginal", 97, True,
                ),
            )
    for code, count in enterprise_groups["owner_sex"]:
        observation_id = f"OBS-KR-ENTERPRISE-OWNER-SEX-{str(code).upper()}-2024"
        citation_id = f"CIT-{observation_id}"
        upsert_citation(cursor, citation_id, "REL-KOSTAT-BD-2024-P", locators["enterprise_owner_sex_age"], f"Enterprise owner sex={code} official count", count, "enterprise")
        upsert_observation(
            cursor,
            ObservationSeed(
                observation_id, "UNIV-KR-ENTERPRISE-2024", "owner_sex", {"owner_sex": code},
                float(count), float(count), float(count), "enterprise", country_geography_id,
                business_period_id, 2024, "REL-KOSTAT-BD-2024-P", citation_id, "direct", "A",
                "official_direct", "published official active-enterprise representative sex marginal", 97, True,
            ),
        )

    cursor.execute(
        """
        UPDATE production.universe_dimension dimension
        SET coverage_status='observed', updated_at=now()
        WHERE EXISTS (
          SELECT 1 FROM production.universe_observation observation
          WHERE observation.universe_dimension_id = dimension.universe_dimension_id
        )
        """
    )
    return household_special


def seed_sources(cursor: psycopg.Cursor[Any], controls: list[dict[str, Any]]) -> None:
    releases = {item["release_id"] for item in controls}
    cursor.execute(
        """
        SELECT release.*, source.publisher, source.dataset_title, source.official_url,
               source.population_universe, source.geographic_coverage, source.license
        FROM public.source_release release
        JOIN public.data_source source USING (source_id)
        WHERE release.release_id = ANY(%s)
        """,
        (list(releases),),
    )
    for release in cursor.fetchall():
        item = dict(release)
        reference_year = (item["reference_period_end"] or item["reference_period_start"] or item["publication_date"]).year
        cursor.execute(
            """
            INSERT INTO production.source_document (
              source_document_id, release_id, publisher, title, original_url, download_url,
              publication_date, reference_year, accessed_at, population_universe,
              sample_size, geography_scope, local_uri, local_checksum, license_text,
              material_kind, version
            ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NULL,%s,%s,%s,%s,'raw',%s)
            ON CONFLICT (source_document_id) DO UPDATE SET
              publisher=excluded.publisher, title=excluded.title,
              original_url=excluded.original_url, download_url=excluded.download_url,
              publication_date=excluded.publication_date, reference_year=excluded.reference_year,
              accessed_at=excluded.accessed_at, population_universe=excluded.population_universe,
              geography_scope=excluded.geography_scope, local_uri=excluded.local_uri,
              local_checksum=excluded.local_checksum, license_text=excluded.license_text,
              version=excluded.version, updated_at=now()
            """,
            (
                f"DOC-{item['release_id']}", item["release_id"], item["publisher"], item["dataset_title"],
                item["official_url"], item["official_url"], item["publication_date"], reference_year,
                item["retrieved_at"], item["population_universe"], item["geographic_coverage"] or "KR",
                item["local_uri"], item["checksum"], item["license"], VERSION,
            ),
        )
    for control in controls:
        override = PHASE2R_CONTROL_OVERRIDES.get(control["control_id"])
        value = override[0] if override else control.get("count", control.get("count_base"))
        locator = override[1] if override else control["evidence_locator"]
        extraction_method = override[2] if override else control["method_code"]
        cursor.execute(
            """
            INSERT INTO production.citation (
              citation_id, source_document_id, locator, claim, used_value, unit,
              extraction_method, reviewer_status
            ) VALUES (%s,%s,%s,%s,%s,%s,%s,'machine_checked')
            ON CONFLICT (citation_id) DO UPDATE SET
              locator=excluded.locator, claim=excluded.claim, used_value=excluded.used_value,
              unit=excluded.unit, extraction_method=excluded.extraction_method,
              reviewer_status=excluded.reviewer_status, updated_at=now()
            """,
            (
                f"CIT-{control['control_id']}", f"DOC-{control['release_id']}",
                locator, f"{control['control_id']} production control total",
                value, control["entity_unit"], extraction_method,
            ),
        )


def seed_labels(cursor: psycopg.Cursor[Any]) -> None:
    cursor.execute("SELECT domain_id, domain_code, name_ko, description FROM public.domain_registry")
    for row in cursor.fetchall():
        item = dict(row)
        cursor.execute(
            """
            INSERT INTO production.display_label VALUES
              ('domain',%s,%s,%s,%s,%s,NULL,%s,now(),now())
            ON CONFLICT (object_type,object_id) DO UPDATE SET
              code=excluded.code, display_name_ko=excluded.display_name_ko,
              display_name_en=excluded.display_name_en, description_ko=excluded.description_ko,
              version=excluded.version, updated_at=now()
            """,
            (item["domain_id"], item["domain_code"], item["name_ko"], item["domain_code"], item["description"], VERSION),
        )
    cursor.execute("SELECT dimension_id, axis_code, applicability_reason FROM public.domain_dimension")
    for row in cursor.fetchall():
        item = dict(row)
        ko, en = AXIS_LABELS.get(item["axis_code"], (item["axis_code"], item["axis_code"]))
        cursor.execute(
            """
            INSERT INTO production.display_label VALUES
              ('axis',%s,%s,%s,%s,%s,NULL,%s,now(),now())
            ON CONFLICT (object_type,object_id) DO UPDATE SET
              code=excluded.code, display_name_ko=excluded.display_name_ko,
              display_name_en=excluded.display_name_en, description_ko=excluded.description_ko,
              version=excluded.version, updated_at=now()
            """,
            (item["dimension_id"], item["axis_code"], ko, en, item["applicability_reason"], VERSION),
        )
    cursor.execute("SELECT subtype_id, subtype_code, name_ko, definition FROM public.subtype_definition")
    for row in cursor.fetchall():
        item = dict(row)
        cursor.execute(
            """
            INSERT INTO production.display_label VALUES
              ('subtype',%s,%s,%s,%s,%s,NULL,%s,now(),now())
            ON CONFLICT (object_type,object_id) DO UPDATE SET
              code=excluded.code, display_name_ko=excluded.display_name_ko,
              display_name_en=excluded.display_name_en, description_ko=excluded.description_ko,
              version=excluded.version, updated_at=now()
            """,
            (item["subtype_id"], item["subtype_code"], item["name_ko"], item["subtype_code"], item["definition"], VERSION),
        )
    cursor.execute("SELECT archetype_id, name_ko, coalesce(name_en, archetype_id) AS name_en, one_line_definition FROM public.archetype")
    for row in cursor.fetchall():
        item = dict(row)
        cursor.execute(
            """
            INSERT INTO production.display_label VALUES
              ('archetype',%s,%s,%s,%s,%s,NULL,%s,now(),now())
            ON CONFLICT (object_type,object_id) DO UPDATE SET
              code=excluded.code, display_name_ko=excluded.display_name_ko,
              display_name_en=excluded.display_name_en, description_ko=excluded.description_ko,
              version=excluded.version, updated_at=now()
            """,
            (item["archetype_id"], item["archetype_id"], item["name_ko"], item["name_en"], item["one_line_definition"], VERSION),
        )
    cursor.execute(
        """
        SELECT dimension_id, domain_code, axis_code, value_order, value_text
        FROM public.v_domain_dimension_value
        ORDER BY dimension_id, value_order
        """
    )
    for row in cursor.fetchall():
        item = dict(row)
        object_id = f"{item['dimension_id']}:{item['value_order']}"
        code = f"{item['domain_code']}.{item['axis_code']}.{item['value_order']}"
        cursor.execute(
            """
            INSERT INTO production.display_label VALUES
              ('axis_value',%s,%s,%s,%s,%s,NULL,%s,now(),now())
            ON CONFLICT (object_type,object_id) DO UPDATE SET
              code=excluded.code, display_name_ko=excluded.display_name_ko,
              display_name_en=excluded.display_name_en, description_ko=excluded.description_ko,
              version=excluded.version, updated_at=now()
            """,
            (object_id, code, item["value_text"], item["value_text"], f"{item['axis_code']} 축의 허용 값", VERSION),
        )
    cursor.execute(
        """
        SELECT model.segmentation_model_id, model.algorithm, model.status,
               domain.domain_code, domain.name_ko
        FROM public.segmentation_model model
        JOIN public.domain_registry domain USING (domain_id)
        ORDER BY model.segmentation_model_id
        """
    )
    for row in cursor.fetchall():
        item = dict(row)
        cursor.execute(
            """
            INSERT INTO production.display_label VALUES
              ('segmentation_model',%s,%s,%s,%s,%s,NULL,%s,now(),now())
            ON CONFLICT (object_type,object_id) DO UPDATE SET
              code=excluded.code, display_name_ko=excluded.display_name_ko,
              display_name_en=excluded.display_name_en, description_ko=excluded.description_ko,
              version=excluded.version, updated_at=now()
            """,
            (
                item["segmentation_model_id"], item["domain_code"],
                f"{item['name_ko']} 세분화 모델", f"{item['domain_code']} segmentation model",
                f"{item['algorithm']} 알고리즘 기반 세분화 모델; 상태 {item['status']}", VERSION,
            ),
        )
    cursor.execute("SELECT source_id, publisher, dataset_title, source_type FROM public.data_source ORDER BY source_id")
    for row in cursor.fetchall():
        item = dict(row)
        cursor.execute(
            """
            INSERT INTO production.display_label VALUES
              ('source',%s,%s,%s,%s,%s,NULL,%s,now(),now())
            ON CONFLICT (object_type,object_id) DO UPDATE SET
              code=excluded.code, display_name_ko=excluded.display_name_ko,
              display_name_en=excluded.display_name_en, description_ko=excluded.description_ko,
              version=excluded.version, updated_at=now()
            """,
            (
                item["source_id"], item["source_id"], item["dataset_title"], item["dataset_title"],
                f"{item['publisher']} 발행 {item['source_type']} 자료", VERSION,
            ),
        )
    cursor.execute(
        """
        DELETE FROM production.display_label label
        WHERE label.object_type='factor'
          AND EXISTS (
            SELECT 1 FROM public.approved_research_factor factor
            WHERE factor.approved_factor_id::text=label.object_id
              AND (
                lower(factor.target_segment) LIKE '%fixture%'
                OR factor.target_segment LIKE '통합 테스트%'
                OR lower(factor.target_variable) LIKE '%fixture%'
                OR lower(factor.inference_method) LIKE '%fixture%'
              )
          )
        """
    )
    cursor.execute(
        """
        SELECT approved_factor_id::text AS factor_id, target_segment, target_variable,
               inference_method, confidence_grade
        FROM public.approved_research_factor
        WHERE lower(target_segment) NOT LIKE '%fixture%'
          AND target_segment NOT LIKE '통합 테스트%'
          AND lower(target_variable) NOT LIKE '%fixture%'
          AND lower(inference_method) NOT LIKE '%fixture%'
        ORDER BY approved_factor_id
        """
    )
    for row in cursor.fetchall():
        item = dict(row)
        cursor.execute(
            """
            INSERT INTO production.display_label VALUES
              ('factor',%s,%s,%s,%s,%s,NULL,%s,now(),now())
            ON CONFLICT (object_type,object_id) DO UPDATE SET
              code=excluded.code, display_name_ko=excluded.display_name_ko,
              display_name_en=excluded.display_name_en, description_ko=excluded.description_ko,
              version=excluded.version, updated_at=now()
            """,
            (
                item["factor_id"], item["target_variable"],
                f"{item['target_segment']} · {item['target_variable']} 요인",
                f"{item['target_segment']} · {item['target_variable']} factor",
                f"{item['inference_method']} 방식, 신뢰등급 {item['confidence_grade']}", VERSION,
            ),
        )
    for code, ko in STATUS_LABELS.items():
        cursor.execute(
            """
            INSERT INTO production.display_label VALUES
              ('status',%s,%s,%s,%s,%s,%s,%s,now(),now())
            ON CONFLICT (object_type,object_id) DO UPDATE SET
              code=excluded.code, display_name_ko=excluded.display_name_ko,
              display_name_en=excluded.display_name_en, description_ko=excluded.description_ko,
              status_label_ko=excluded.status_label_ko, version=excluded.version, updated_at=now()
            """,
            (code, code, ko, code, f"내부 상태 `{code}`의 사용자 표시 문구", ko, VERSION),
        )


def build(connection: psycopg.Connection[Any]) -> None:
    controls = json.loads((ROOT / "config/control_totals.yml").read_text())["controls"]
    official = json.loads((ROOT / "config/phase2r_a_official_observations.json").read_text())
    by_id = {item["control_id"]: item for item in controls}
    with connection.cursor(row_factory=dict_row) as cursor:
        seed_sources(cursor, controls)

        kr = fetch_one(cursor, "SELECT geography_id FROM public.geography WHERE code='KR' ORDER BY valid_from DESC LIMIT 1")
        geography_id = kr["geography_id"]
        population = fetch_one(cursor, "SELECT * FROM public.population_cell WHERE person_count_base=51806000 ORDER BY population_cell_id LIMIT 1")
        adult = fetch_one(cursor, "SELECT * FROM public.population_cell WHERE age_band='19+' AND person_count_base=43892348 ORDER BY population_cell_id LIMIT 1")
        minor = fetch_one(cursor, "SELECT * FROM public.minor_population_cell WHERE exact_age=0 ORDER BY minor_cell_id LIMIT 1")
        household = fetch_one(cursor, "SELECT * FROM public.household_cell WHERE household_type='total' ORDER BY household_cell_id LIMIT 1")
        establishment = fetch_one(cursor, "SELECT * FROM public.business_cell WHERE establishment_or_enterprise='establishment' AND industry_code='ALL'")
        enterprise = fetch_one(cursor, "SELECT * FROM public.business_cell WHERE establishment_or_enterprise='enterprise' AND industry_code='ALL'")
        period_2023 = fetch_one(cursor, "SELECT period_id FROM public.time_period WHERE period_type='year' AND start_date=DATE '2023-01-01'")

        universe_seeds = [
            dict(universe_id="UNIV-KR-PERSON-2024", universe_code="kr_person_total_2024", display_name_ko="대한민국 전체 인구", display_name_en="South Korea total population", description_ko="2024 인구주택총조사 기준 대한민국 상주 인구", entity_unit="person", geography_id=geography_id, period_id=population["period_id"], denominator_definition="대한민국 영토 내 3개월 이상 상주하는 내·외국인", source_release_id="REL-KOSTAT-CENSUS-2024", version=VERSION),
            dict(universe_id="UNIV-KR-ADULT-19P-2024", universe_code="kr_adult_19_plus_2024", display_name_ko="대한민국 19세 이상 주민등록 인구", display_name_en="South Korea resident population age 19+", description_ko="2024년 12월 주민등록 인구에서 0–18세를 차감한 19세 이상 인구", entity_unit="person", geography_id=geography_id, period_id=adult["period_id"], denominator_definition="외국인을 제외한 주민등록 인구 중 19세 이상", source_release_id="REL-MOIS-AGE-2024-12", version=VERSION),
            dict(universe_id="UNIV-KR-CHILD-0-18-2024", universe_code="kr_child_0_18_2024", display_name_ko="대한민국 0–18세 주민등록 인구", display_name_en="South Korea resident population age 0–18", description_ko="2024년 12월 주민등록 인구의 0–18세 정확 연령 모집단", entity_unit="child_person", geography_id=geography_id, period_id=minor["period_id"], denominator_definition="외국인을 제외한 주민등록 인구 중 0–18세", source_release_id="REL-MOIS-AGE-2024-12", version=VERSION),
            dict(universe_id="UNIV-KR-HOUSEHOLD-2024", universe_code="kr_household_total_2024", display_name_ko="대한민국 전체 가구", display_name_en="South Korea total households", description_ko="2024 인구주택총조사 기준 총가구", entity_unit="household", geography_id=geography_id, period_id=household["period_id"], denominator_definition="2024 인구주택총조사의 대한민국 총가구", source_release_id="REL-KOSTAT-CENSUS-2024", version=VERSION),
            dict(universe_id="UNIV-KR-ESTABLISHMENT-2024", universe_code="kr_establishment_total_2024", display_name_ko="대한민국 전체 사업체", display_name_en="South Korea total establishments", description_ko="2024 전국사업체조사 잠정 기준 전체 사업체", entity_unit="establishment", geography_id=geography_id, period_id=establishment["period_id"], denominator_definition="국내에서 산업활동을 수행하는 조사대상 사업체", source_release_id="REL-KOSTAT-EST-2024-P", version=VERSION),
            dict(universe_id="UNIV-KR-ENTERPRISE-2024", universe_code="kr_active_enterprise_2024", display_name_ko="대한민국 활동기업", display_name_en="South Korea active enterprises", description_ko="2024 기업생멸행정통계 잠정 기준 활동기업", entity_unit="enterprise", geography_id=geography_id, period_id=enterprise["period_id"], denominator_definition="영리기업 중 매출액 또는 상용근로자가 있는 활동기업", source_release_id="REL-KOSTAT-BD-2024-P", version=VERSION),
            dict(universe_id="UNIV-KR-SMALL-BUSINESS-2023", universe_code="kr_small_business_11_industries_2023", display_name_ko="대한민국 11개 주요 산업 소상공인", display_name_en="South Korea small businesses in 11 surveyed industries", description_ko="2023 소상공인실태조사의 11개 주요 산업 소상공인 기업체", entity_unit="enterprise", geography_id=geography_id, period_id=period_2023["period_id"], denominator_definition="중소벤처기업부 소상공인실태조사 11개 주요 산업의 소상공인 기업체", source_release_id="REL-MSS-SB-2023", version=VERSION),
        ]
        for seed in universe_seeds:
            upsert_universe(cursor, seed)
        upsert_dimensions(cursor, "UNIV-KR-PERSON-2024", PERSON_DIMENSIONS, "REL-KOSTAT-CENSUS-2024")
        upsert_dimensions(cursor, "UNIV-KR-ADULT-19P-2024", PERSON_DIMENSIONS, "REL-MOIS-AGE-2024-12")
        upsert_dimensions(cursor, "UNIV-KR-CHILD-0-18-2024", PERSON_DIMENSIONS, "REL-MOIS-AGE-2024-12")
        upsert_dimensions(cursor, "UNIV-KR-HOUSEHOLD-2024", HOUSEHOLD_DIMENSIONS, "REL-KOSTAT-CENSUS-2024")
        upsert_dimensions(cursor, "UNIV-KR-ESTABLISHMENT-2024", BUSINESS_DIMENSIONS, "REL-KOSTAT-EST-2024-P")
        upsert_dimensions(cursor, "UNIV-KR-ENTERPRISE-2024", BUSINESS_DIMENSIONS, "REL-KOSTAT-BD-2024-P")
        upsert_dimensions(cursor, "UNIV-KR-SMALL-BUSINESS-2023", BUSINESS_DIMENSIONS, "REL-MSS-SB-2023")

        observations = [
            ObservationSeed("OBS-KR-PERSON-TOTAL-2024", "UNIV-KR-PERSON-2024", "total_population", {}, 51805547, 51805547, 51805547, "person", geography_id, population["period_id"], 2024, "REL-KOSTAT-CENSUS-2024", "CIT-CTL-POP-2024", "direct", "A", "official_direct", "published exact total population", 99, True),
            ObservationSeed("OBS-KR-ADULT-19P-2024", "UNIV-KR-ADULT-19P-2024", "age", {"age_min": 19}, 43892348, 43892348, 43892348, "person", geography_id, adult["period_id"], 2024, "REL-MOIS-AGE-2024-12", "CIT-CTL-ADULT-19P-RESIDENT-2024-12", "derived", "B", "official_derived_difference", "resident total - exact ages 0 through 18", 90, False),
            ObservationSeed("OBS-KR-CHILD-0-18-2024", "UNIV-KR-CHILD-0-18-2024", "age", {"age_min": 0, "age_max": 18}, 7324873, 7324873, 7324873, "child_person", geography_id, minor["period_id"], 2024, "REL-MOIS-AGE-2024-12", "CIT-CTL-MINOR-0-18-2024-12", "direct", "A", "official_direct", "sum of exact ages 0 through 18", 98, True),
            ObservationSeed("OBS-KR-HOUSEHOLD-TOTAL-2024", "UNIV-KR-HOUSEHOLD-2024", "total_households", {}, 22997120, 22997120, 22997120, "household", geography_id, household["period_id"], 2024, "REL-KOSTAT-CENSUS-2024", "CIT-CTL-HH-TOTAL-2024", "direct", "A", "official_direct", "published exact total households", 99, True),
            ObservationSeed("OBS-KR-ESTABLISHMENT-TOTAL-2024", "UNIV-KR-ESTABLISHMENT-2024", "total_entities", {}, 6353673, 6353673, 6353673, "establishment", geography_id, establishment["period_id"], 2024, "REL-KOSTAT-EST-2024-P", "CIT-CTL-EST-ALL-2024", "direct", "A", "official_direct", "published all establishments", 96, True),
            ObservationSeed("OBS-KR-ENTERPRISE-TOTAL-2024", "UNIV-KR-ENTERPRISE-2024", "total_entities", {}, 7641749, 7641749, 7641749, "enterprise", geography_id, enterprise["period_id"], 2024, "REL-KOSTAT-BD-2024-P", "CIT-CTL-ENT-ALL-2024", "direct", "A", "official_direct", "published exact active-enterprise total", 98, True),
            ObservationSeed("OBS-KR-SMALL-BUSINESS-TOTAL-2023", "UNIV-KR-SMALL-BUSINESS-2023", "total_entities", {"industry_scope":"11_major_industries"}, 5960500, 5961000, 5961499, "enterprise", geography_id, period_2023["period_id"], 2023, "REL-MSS-SB-2023", "CIT-OBS-KR-SMALL-BUSINESS-TOTAL-2023", "direct", "A", "official_rounded_thousand", "published small-business total 5.961 million", 93, True),
        ]
        upsert_citation(
            cursor, "CIT-OBS-KR-SMALL-BUSINESS-TOTAL-2023", "REL-MSS-SB-2023",
            "2023 small-business survey press release: total 5.961 million enterprises in 11 industries",
            "Official small-business enterprise count", 5961000, "enterprise",
        )
        for seed in observations:
            upsert_observation(cursor, seed)

        cursor.execute("SELECT * FROM public.minor_population_cell ORDER BY exact_age")
        for cell in cursor.fetchall():
            item = dict(cell)
            upsert_observation(
                cursor,
                ObservationSeed(
                    f"OBS-KR-CHILD-AGE-{item['exact_age']}-2024",
                    "UNIV-KR-CHILD-0-18-2024",
                    "age",
                    {"exact_age": item["exact_age"]},
                    float(item["child_count_low"]),
                    float(item["child_count_base"]),
                    float(item["child_count_high"]),
                    "child_person",
                    geography_id,
                    item["period_id"],
                    2024,
                    item["source_release_ids"][0],
                    "CIT-CTL-MINOR-0-18-2024-12",
                    "direct",
                    "A",
                    item["method_code"],
                    f"published exact age {item['exact_age']} count",
                    97,
                    True,
                ),
            )

        special_household_observations = seed_official_observations(
            cursor, official, geography_id, population["period_id"], enterprise["period_id"]
        )
        seed_labels(cursor)
        cursor.execute("SELECT domain_id, domain_code, name_ko, description, primary_entity_unit FROM public.domain_registry ORDER BY domain_code")
        domains = [dict(row) for row in cursor.fetchall()]
        mapping_by_unit = {
            "person": ("UNIV-KR-PERSON-2024", "OBS-KR-PERSON-TOTAL-2024"),
            "child_person": ("UNIV-KR-CHILD-0-18-2024", "OBS-KR-CHILD-0-18-2024"),
            "household": ("UNIV-KR-HOUSEHOLD-2024", "OBS-KR-HOUSEHOLD-TOTAL-2024"),
            "establishment": ("UNIV-KR-ESTABLISHMENT-2024", "OBS-KR-ESTABLISHMENT-TOTAL-2024"),
            "enterprise": ("UNIV-KR-ENTERPRISE-2024", "OBS-KR-ENTERPRISE-TOTAL-2024"),
        }
        special_baselines = {
            "career_professional": ("UNIV-KR-PERSON-2024", "OBS-KR-PERSON-AGE-04-2024"),
            "education_learning": ("UNIV-KR-HOUSEHOLD-2024", special_household_observations["children_presence"]),
            "parenting_childcare": ("UNIV-KR-HOUSEHOLD-2024", special_household_observations["children_presence"]),
            "senior_retirement_care": ("UNIV-KR-PERSON-2024", "OBS-KR-PERSON-AGE-05-2024"),
            "small_business_digital": ("UNIV-KR-SMALL-BUSINESS-2023", "OBS-KR-SMALL-BUSINESS-TOTAL-2023"),
        }
        secondary_by_domain = {
            "career_professional": "UNIV-KR-ADULT-19P-2024",
            "education_learning": "UNIV-KR-CHILD-0-18-2024",
            "parenting_childcare": "UNIV-KR-CHILD-0-18-2024",
            "senior_retirement_care": "UNIV-KR-ADULT-19P-2024",
        }
        for domain in domains:
            universe_id, observation_id = special_baselines.get(
                domain["domain_code"], mapping_by_unit[domain["primary_entity_unit"]]
            )
            observation = fetch_one(cursor, "SELECT * FROM production.universe_observation WHERE observation_id=%s", (observation_id,))
            cursor.execute(
                """
                INSERT INTO production.domain_universe_mapping (
                  domain_id, primary_universe_id, secondary_universe_id, baseline_observation_id,
                  display_name_ko, display_name_en, description_ko, primary_entity_unit,
                  inclusion_criteria, exclusion_criteria, overlap_note, geography_scope,
                  reference_year, count_low, count_base, count_high, estimate_grade,
                  confidence_score, source_release_id, method_code, formula,
                  additional_validation_variables, status, version
                ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'KR',%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'active',%s)
                ON CONFLICT (domain_id) DO UPDATE SET
                  primary_universe_id=excluded.primary_universe_id,
                  secondary_universe_id=excluded.secondary_universe_id,
                  baseline_observation_id=excluded.baseline_observation_id,
                  display_name_ko=excluded.display_name_ko,
                  display_name_en=excluded.display_name_en,
                  description_ko=excluded.description_ko,
                  primary_entity_unit=excluded.primary_entity_unit,
                  inclusion_criteria=excluded.inclusion_criteria,
                  exclusion_criteria=excluded.exclusion_criteria,
                  overlap_note=excluded.overlap_note,
                  geography_scope=excluded.geography_scope,
                  reference_year=excluded.reference_year,
                  count_low=excluded.count_low,
                  count_base=excluded.count_base,
                  count_high=excluded.count_high,
                  estimate_grade=excluded.estimate_grade,
                  confidence_score=excluded.confidence_score,
                  source_release_id=excluded.source_release_id,
                  method_code=excluded.method_code,
                  formula=excluded.formula,
                  additional_validation_variables=excluded.additional_validation_variables,
                  status='active', version=excluded.version, updated_at=now()
                """,
                (
                    domain["domain_id"], universe_id, secondary_by_domain.get(domain["domain_code"]), observation_id,
                    domain["name_ko"], domain["domain_code"], domain["description"], domain["primary_entity_unit"],
                    f"대한민국 내 {domain['primary_entity_unit']} 단위의 잠재 대상 전체; 세부 Domain 참여·구매 여부는 Phase 2R-B에서 보정",
                    "해당 단위의 공식 Universe 정의 밖에 있는 대상",
                    "Domain 간 중복을 허용하는 공통 잠재 모집단이며 24개 Domain 수치를 합산할 수 없음",
                    observation["reference_year"], observation["value_low"], observation["value_base"], observation["value_high"],
                    observation["estimate_grade"], observation["confidence_score"], observation["source_release_id"],
                    "official_universe_frame", "canonical official universe total; no domain prevalence multiplier applied",
                    Jsonb(["domain participation rate", "recent activity", "purchase incidence", "age-specific eligibility"]), VERSION,
                ),
            )
            cursor.execute(
                """
                INSERT INTO production.display_label VALUES
                  ('estimate',%s,%s,%s,%s,%s,NULL,%s,now(),now())
                ON CONFLICT (object_type,object_id) DO UPDATE SET
                  code=excluded.code, display_name_ko=excluded.display_name_ko,
                  display_name_en=excluded.display_name_en, description_ko=excluded.description_ko,
                  version=excluded.version, updated_at=now()
                """,
                (f"domain-universe:{domain['domain_id']}", f"domain-universe:{domain['domain_code']}", f"{domain['name_ko']} 기준 모집단", f"{domain['domain_code']} baseline universe", domain["description"], VERSION),
            )
            cursor.execute(
                """
                INSERT INTO production.display_label VALUES
                  ('formula',%s,%s,%s,%s,%s,NULL,%s,now(),now())
                ON CONFLICT (object_type,object_id) DO UPDATE SET
                  code=excluded.code, display_name_ko=excluded.display_name_ko,
                  display_name_en=excluded.display_name_en, description_ko=excluded.description_ko,
                  version=excluded.version, updated_at=now()
                """,
                (
                    f"domain-universe:{domain['domain_id']}", f"domain-universe:{domain['domain_code']}",
                    f"{domain['name_ko']} 기준 모집단 산식", f"{domain['domain_code']} baseline formula",
                    "공식 기준 모집단 관측값을 직접 사용하고 Domain 간 중복을 허용하는 산식", VERSION,
                ),
            )
            cursor.execute(
                """
                INSERT INTO production.data_quality_issue (
                  issue_id, object_type, object_id, issue_code, severity, status,
                  description, remediation, source_release_id
                ) VALUES (%s,'domain',%s,'domain_prevalence_not_directly_observed','medium','monitoring',%s,%s,%s)
                ON CONFLICT (issue_id) DO UPDATE SET
                  severity=excluded.severity, status=excluded.status,
                  description=excluded.description, remediation=excluded.remediation,
                  source_release_id=excluded.source_release_id, updated_at=now()
                """,
                (
                    f"DQ-{domain['domain_code']}-PREVALENCE", domain["domain_id"],
                    "현재 수치는 Domain 참여자 수가 아니라 공식 잠재 모집단 Universe이다.",
                    "Phase 2R-B에서 공식 산업조사·행동조사 비율로 Domain 참여율을 보정한다.",
                    observation["source_release_id"],
                ),
            )
        connection.commit()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--database-url", required=True)
    args = parser.parse_args()
    with psycopg.connect(args.database_url) as connection:
        build(connection)


if __name__ == "__main__":
    main()
