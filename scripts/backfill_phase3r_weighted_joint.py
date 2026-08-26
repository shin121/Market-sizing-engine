from __future__ import annotations

import argparse
import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

import duckdb
import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb


ROOT = Path(__file__).resolve().parents[1]
REFERENCE_YEAR = 2024
BACKFILL_VERSION = "phase3r-weighted-joint-2024-v1"


@dataclass(frozen=True)
class DimensionSpec:
    code: str
    label: str
    definition: str
    selected_as_control: bool
    directness: str
    mapping_confidence: float


@dataclass(frozen=True)
class UnitSpec:
    artifact: Path
    dimensions: tuple[DimensionSpec, ...]


REGION_NAMES = {
    "11": "서울특별시",
    "26": "부산광역시",
    "27": "대구광역시",
    "28": "인천광역시",
    "29": "광주광역시",
    "30": "대전광역시",
    "31": "울산광역시",
    "36": "세종특별자치시",
    "41": "경기도",
    "43": "충청북도",
    "44": "충청남도",
    "46": "전라남도",
    "47": "경상북도",
    "48": "경상남도",
    "50": "제주특별자치도",
    "51": "강원특별자치도",
    "52": "전북특별자치도",
}


INDUSTRY_NAMES = {
    "A": "농업·임업·어업",
    "B": "광업",
    "C": "제조업",
    "D": "전기·가스·증기·공기조절 공급업",
    "E": "수도·하수·폐기물 처리·원료 재생업",
    "F": "건설업",
    "G": "도매·소매업",
    "H": "운수·창고업",
    "I": "숙박·음식점업",
    "J": "정보통신업",
    "K": "금융·보험업",
    "L": "부동산업",
    "M": "전문·과학·기술 서비스업",
    "N": "사업시설 관리·사업지원·임대 서비스업",
    "O": "공공행정·국방·사회보장 행정",
    "P": "교육 서비스업",
    "Q": "보건업·사회복지 서비스업",
    "R": "예술·스포츠·여가 서비스업",
    "S": "협회·단체·수리·기타 개인 서비스업",
}


VALUE_LABELS: dict[str, dict[str, str]] = {
    "age_band": {
        "19": "19세", "20-29": "20대", "30-39": "30대", "40-49": "40대",
        "50-59": "50대", "60-69": "60대", "70-79": "70대", "80-89": "80대", "90+": "90세 이상",
    },
    "head_age_band": {
        "19": "가구주 19세", "20-29": "가구주 20대", "30-39": "가구주 30대", "40-49": "가구주 40대",
        "50-59": "가구주 50대", "60-69": "가구주 60대", "70-79": "가구주 70대",
        "80-89": "가구주 80대", "90+": "가구주 90세 이상",
    },
    "sex": {"female": "여성", "male": "남성"},
    "owner_sex": {"female": "여성 대표자", "male": "남성 대표자"},
    "region_group": {"capital_region": "수도권", "non_capital_region": "비수도권·지방"},
    "household_size_band": {"1": "1인 가구", "2": "2인 가구", "3": "3인 가구", "4": "4인 가구", "5_plus": "5인 이상 가구"},
    "children_presence": {"true": "자녀가 있는 가구", "false": "자녀가 없는 가구"},
    "dual_income_proxy": {"true": "맞벌이 가구 Proxy", "false": "비맞벌이 가구 Proxy"},
    "employee_band": {
        "1": "직원 1명", "1_4": "직원 1~4명", "2_4": "직원 2~4명", "5_9": "직원 5~9명",
        "5_99": "직원 5~99명", "10_49": "직원 10~49명", "50_99": "직원 50~99명",
        "100_149": "직원 100~149명", "100_299": "직원 100~299명", "150_199": "직원 150~199명",
        "200_249": "직원 200~249명", "250_299": "직원 250~299명", "300_plus": "직원 300명 이상",
    },
    "legal_form": {
        "individual": "개인사업체", "corporation": "법인기업", "company_corporation": "회사법인",
        "other_corporation": "회사 외 법인", "unincorporated_association": "비법인 단체",
    },
    "owner_age": {
        "under_30": "30세 미만 대표자", "30s": "30대 대표자", "40s": "40대 대표자",
        "50s": "50대 대표자", "60s": "60대 대표자", "60_plus": "60세 이상 대표자",
        "70_plus": "70세 이상 대표자", "unknown": "대표자 연령 미상",
    },
    "sales_band": {
        "under_50m_krw": "연매출 5천만원 미만", "50m_to_100m_krw": "연매출 5천만~1억원",
        "100m_to_500m_krw": "연매출 1억~5억원", "500m_to_1b_krw": "연매출 5억~10억원",
        "1b_to_5b_krw": "연매출 10억~50억원", "5b_to_10b_krw": "연매출 50억~100억원",
        "10b_to_20b_krw": "연매출 100억~200억원", "20b_to_40b_krw": "연매출 200억~400억원",
        "40b_to_60b_krw": "연매출 400억~600억원", "60b_to_80b_krw": "연매출 600억~800억원",
        "80b_to_100b_krw": "연매출 800억~1천억원", "100b_to_150b_krw": "연매출 1천억~1천5백억원",
        "150b_plus_krw": "연매출 1천5백억원 이상",
    },
    "business_age": {"0_3": "업력 0~3년", "4_6": "업력 4~6년", "7_9": "업력 7~9년", "10_19": "업력 10~19년", "20_plus": "업력 20년 이상"},
}


UNIT_SPECS: dict[str, UnitSpec] = {
    "person": UnitSpec(
        ROOT / "data/processed/phase2r_b/person_weights.parquet",
        (
            DimensionSpec("age_band", "연령", "2024년 연령×성별 Calibration control", True, "calibrated_control", 1.0),
            DimensionSpec("sex", "성별", "2024년 연령×성별 Calibration control", True, "calibrated_control", 1.0),
            DimensionSpec("region_code", "시도", "2024년 17개 시도 Calibration control", True, "calibrated_control", 1.0),
            DimensionSpec("region_group", "권역", "시도 코드에서 결정론적으로 파생한 수도권·비수도권", True, "calibrated_derived", 1.0),
            DimensionSpec("family_type", "가구관계 형태", "합성 Persona 가구관계 텍스트 기반 Proxy; Calibration control 아님", False, "synthetic_proxy", 0.65),
            DimensionSpec("housing_type", "주거 형태", "합성 Persona 주거형태 기반 Proxy; Calibration control 아님", False, "synthetic_proxy", 0.70),
            DimensionSpec("education_level", "학력", "합성 Persona 학력 기반 Proxy; Calibration control 아님", False, "synthetic_proxy", 0.65),
        ),
    ),
    "household": UnitSpec(
        ROOT / "data/processed/phase2r_b/household_weights.parquet",
        (
            DimensionSpec("region_code", "시도", "2024년 17개 시도 가구 Calibration control", True, "calibrated_control", 1.0),
            DimensionSpec("region_group", "권역", "시도 코드에서 결정론적으로 파생한 수도권·비수도권", True, "calibrated_derived", 1.0),
            DimensionSpec("household_size_band", "가구원 수", "2024년 가구원 수 Calibration control", True, "calibrated_control", 1.0),
            DimensionSpec("children_presence", "자녀 유무", "2024년 자녀 유무 Calibration control", True, "calibrated_control", 1.0),
            DimensionSpec("head_age_band", "가구주 연령", "합성 가구주 연령 Proxy; 직접 joint control 아님", False, "synthetic_proxy", 0.65),
            DimensionSpec("dual_income_proxy", "맞벌이", "합성 가구의 맞벌이 Proxy; 직접 joint control 아님", False, "synthetic_proxy", 0.62),
            DimensionSpec("family_type", "가구 형태", "합성 가구관계 형태 Proxy; Calibration control 아님", False, "synthetic_proxy", 0.65),
            DimensionSpec("housing_type", "주거 형태", "합성 가구 주거형태 Proxy; Calibration control 아님", False, "synthetic_proxy", 0.70),
        ),
    ),
    "establishment": UnitSpec(
        ROOT / "data/processed/phase2r_b/establishment_weights.parquet",
        (
            DimensionSpec("region_code", "시도", "2024년 사업체 시도 Calibration control", True, "calibrated_control", 1.0),
            DimensionSpec("region_group", "권역", "시도 코드에서 결정론적으로 파생한 수도권·비수도권", True, "calibrated_derived", 1.0),
            DimensionSpec("industry_code", "업종", "2024년 사업체 산업대분류 Calibration control", True, "calibrated_control", 1.0),
            DimensionSpec("employee_band", "종사자 규모", "2024년 사업체 종사자 규모 Calibration control", True, "calibrated_control", 1.0),
            DimensionSpec("legal_form", "조직 형태", "2024년 사업체 조직형태 Calibration control", True, "calibrated_control", 1.0),
            DimensionSpec("owner_age", "대표자 연령", "2024년 사업체 대표자 연령 Calibration control", True, "calibrated_control", 0.95),
        ),
    ),
    "enterprise": UnitSpec(
        ROOT / "data/processed/phase2r_b/enterprise_weights.parquet",
        (
            DimensionSpec("employee_band", "종사자 규모", "2024년 활동기업 종사자 규모 Calibration control", True, "calibrated_control", 1.0),
            DimensionSpec("owner_age", "대표자 연령", "2024년 활동기업 대표자 연령 Calibration control", True, "calibrated_control", 0.95),
            DimensionSpec("owner_sex", "대표자 성별", "2024년 활동기업 대표자 성별 Calibration control", True, "calibrated_control", 1.0),
            DimensionSpec("legal_form", "조직 형태", "2024년 활동기업 조직형태 Calibration control", True, "calibrated_control", 1.0),
            DimensionSpec("sales_band", "매출 규모", "2024년 활동기업 매출구간 Calibration control", True, "calibrated_control", 0.95),
            DimensionSpec("business_age", "업력", "2024년 활동기업 업력 Calibration control", True, "calibrated_control", 1.0),
        ),
    ),
}


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _region_group_sql() -> str:
    return "CASE WHEN region_code IN ('11','28','41') THEN 'capital_region' ELSE 'non_capital_region' END"


def _dimension_sql(code: str) -> str:
    expression = _region_group_sql() if code == "region_group" else f'CAST("{code}" AS VARCHAR)'
    return f"coalesce({expression}, '__unmapped__') AS \"{code}\""


def _aggregate_rows(con: duckdb.DuckDBPyConnection, spec: UnitSpec) -> tuple[list[tuple[Any, ...]], dict[str, set[str]]]:
    codes = [dimension.code for dimension in spec.dimensions]
    select_dimensions = ", ".join(_dimension_sql(code) for code in codes)
    group_dimensions = ", ".join(f'"{code}"' for code in codes)
    query = f"""
        SELECT {select_dimensions},
               count(*)::BIGINT AS sample_rows,
               sum(calibration_weight)::DOUBLE AS weighted_count,
               sum(calibration_weight * calibration_weight)::DOUBLE AS weight_square_sum
        FROM read_parquet(?)
        GROUP BY {group_dimensions}
        ORDER BY {group_dimensions}
    """
    raw_rows = con.execute(query, [str(spec.artifact)]).fetchall()
    values: dict[str, set[str]] = {code: set() for code in codes}
    cells: list[tuple[Any, ...]] = []
    for row in raw_rows:
        dimensions = {code: str(value) for code, value in zip(codes, row[: len(codes)], strict=True)}
        for code, value in dimensions.items():
            if value != "__unmapped__":
                values[code].add(value)
        canonical = json.dumps(dimensions, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        cells.append((
            hashlib.sha256(canonical.encode("utf-8")).hexdigest(),
            Jsonb(dimensions),
            int(row[len(codes)]),
            float(row[len(codes) + 1]),
            float(row[len(codes) + 2]),
        ))
    return cells, values


def _value_label(code: str, value: str) -> str:
    if code == "region_code":
        return REGION_NAMES.get(value, value)
    if code == "industry_code":
        return INDUSTRY_NAMES.get(value, f"산업대분류 {value}")
    return VALUE_LABELS.get(code, {}).get(value, value)


def _catalog_rows(
    unit: str,
    spec: UnitSpec,
    values: dict[str, set[str]],
    calibration_version: str,
    source_release_id: str,
) -> Iterable[tuple[Any, ...]]:
    for dimension in spec.dimensions:
        for value in sorted(values[dimension.code]):
            label = _value_label(dimension.code, value)
            yield (
                f"calibration_dimension:{unit}:{dimension.code}:{hashlib.sha256(value.encode('utf-8')).hexdigest()[:16]}",
                unit,
                dimension.code,
                value,
                label,
                f"{dimension.label} · {dimension.definition}",
                dimension.selected_as_control,
                dimension.directness,
                dimension.mapping_confidence,
                REFERENCE_YEAR,
                calibration_version,
                source_release_id,
                value != "unknown",
            )


def backfill(database_url: str) -> dict[str, Any]:
    con = duckdb.connect()
    con.execute("SET threads=1")
    result: dict[str, Any] = {"version": BACKFILL_VERSION, "units": {}}
    try:
        with psycopg.connect(database_url, row_factory=dict_row) as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", (BACKFILL_VERSION,))
                relation = cursor.execute(
                    "SELECT to_regclass('production.weighted_joint_cell') AS relation"
                ).fetchone()["relation"]
                if relation is None:
                    raise RuntimeError("migration 024_phase3r_weighted_joint_read_model.sql must be applied first")

                calibration_rows = cursor.execute(
                    """
                    SELECT run.target_unit, run.calibration_version, run.total_weight,
                           run.artifact_checksum, universe.source_release_id
                    FROM production.calibration_run run
                    JOIN production.universe universe USING (universe_id)
                    WHERE run.status='passed'
                    """
                ).fetchall()
                calibration_by_unit = {row["target_unit"]: row for row in calibration_rows}

                for unit, spec in UNIT_SPECS.items():
                    metadata = calibration_by_unit.get(unit)
                    if metadata is None:
                        raise RuntimeError(f"passed calibration metadata missing for {unit}")
                    if not spec.artifact.exists():
                        raise RuntimeError(f"weight artifact missing: {spec.artifact}")
                    checksum = _sha256(spec.artifact)
                    if checksum != metadata["artifact_checksum"]:
                        raise RuntimeError(f"weight artifact checksum mismatch for {unit}")

                    cells, values = _aggregate_rows(con, spec)
                    cursor.execute(
                        """
                        CREATE TEMP TABLE weighted_joint_stage
                        (LIKE production.weighted_joint_cell INCLUDING DEFAULTS)
                        ON COMMIT DROP
                        """
                    )
                    with cursor.copy(
                        """
                        COPY weighted_joint_stage (
                          target_unit,calibration_version,cell_hash,dimension_values,
                          sample_rows,weighted_count,weight_square_sum,
                          artifact_checksum,reference_year,geography_scope
                        ) FROM STDIN
                        """
                    ) as copy:
                        for cell_hash, dimensions, sample_rows, weighted_count, weight_square_sum in cells:
                            copy.write_row((
                                unit, metadata["calibration_version"], cell_hash, dimensions,
                                sample_rows, weighted_count, weight_square_sum,
                                checksum, REFERENCE_YEAR, "KR",
                            ))
                    cursor.execute(
                        "CREATE INDEX weighted_joint_stage_identity_idx "
                        "ON weighted_joint_stage(target_unit,calibration_version,cell_hash)"
                    )
                    cursor.execute(
                        """
                        INSERT INTO production.weighted_joint_cell (
                          target_unit,calibration_version,cell_hash,dimension_values,
                          sample_rows,weighted_count,weight_square_sum,
                          artifact_checksum,reference_year,geography_scope
                        )
                        SELECT target_unit,calibration_version,cell_hash,dimension_values,
                               sample_rows,weighted_count,weight_square_sum,
                               artifact_checksum,reference_year,geography_scope
                        FROM weighted_joint_stage
                        ON CONFLICT (target_unit,calibration_version,cell_hash) DO UPDATE SET
                          dimension_values=excluded.dimension_values,
                          sample_rows=excluded.sample_rows,
                          weighted_count=excluded.weighted_count,
                          weight_square_sum=excluded.weight_square_sum,
                          artifact_checksum=excluded.artifact_checksum,
                          reference_year=excluded.reference_year,
                          geography_scope=excluded.geography_scope,
                          updated_at=now()
                        """
                    )
                    cursor.execute(
                        """
                        DELETE FROM production.weighted_joint_cell target
                        WHERE target.target_unit=%s AND target.calibration_version=%s
                          AND NOT EXISTS (
                            SELECT 1 FROM weighted_joint_stage stage
                            WHERE stage.target_unit=target.target_unit
                              AND stage.calibration_version=target.calibration_version
                              AND stage.cell_hash=target.cell_hash
                          )
                        """,
                        (unit, metadata["calibration_version"]),
                    )
                    cursor.execute("DROP TABLE weighted_joint_stage")

                    catalog = list(_catalog_rows(
                        unit, spec, values, metadata["calibration_version"], metadata["source_release_id"]
                    ))
                    cursor.executemany(
                        """
                        INSERT INTO production.calibration_dimension_catalog (
                          catalog_id,target_unit,dimension_code,dimension_value,
                          display_value_ko,definition_ko,selected_as_control,
                          directness_class,mapping_confidence,reference_year,
                          calibration_version,source_release_id,queryable
                        ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                        ON CONFLICT (catalog_id) DO UPDATE SET
                          target_unit=excluded.target_unit,
                          dimension_code=excluded.dimension_code,
                          dimension_value=excluded.dimension_value,
                          display_value_ko=excluded.display_value_ko,
                          definition_ko=excluded.definition_ko,
                          selected_as_control=excluded.selected_as_control,
                          directness_class=excluded.directness_class,
                          mapping_confidence=excluded.mapping_confidence,
                          reference_year=excluded.reference_year,
                          calibration_version=excluded.calibration_version,
                          source_release_id=excluded.source_release_id,
                          queryable=excluded.queryable,
                          updated_at=now()
                        """,
                        catalog,
                    )
                    desired_ids = [row[0] for row in catalog]
                    cursor.execute(
                        """
                        DELETE FROM production.calibration_dimension_catalog
                        WHERE target_unit=%s AND calibration_version=%s
                          AND NOT (catalog_id=ANY(%s::text[]))
                        """,
                        (unit, metadata["calibration_version"], desired_ids),
                    )

                    audit = cursor.execute(
                        """
                        SELECT count(*)::bigint AS cell_count,
                               sum(sample_rows)::bigint AS sample_rows,
                               sum(weighted_count)::double precision AS weighted_total,
                               min(sample_rows)::bigint AS minimum_cell_rows,
                               max(sample_rows)::bigint AS maximum_cell_rows
                        FROM production.weighted_joint_cell
                        WHERE target_unit=%s AND calibration_version=%s
                        """,
                        (unit, metadata["calibration_version"]),
                    ).fetchone()
                    tolerance = max(1e-4, abs(float(metadata["total_weight"])) * 1e-9)
                    if abs(float(audit["weighted_total"]) - float(metadata["total_weight"])) > tolerance:
                        raise RuntimeError(f"weighted joint total does not reconcile for {unit}")
                    result["units"][unit] = {
                        "calibration_version": metadata["calibration_version"],
                        "artifact_checksum": checksum,
                        "catalog_rows": len(catalog),
                        **dict(audit),
                    }
    finally:
        con.close()
    result["status"] = "passed"
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill the Phase 3R weighted synthetic joint read model")
    parser.add_argument("--database-url", required=True)
    args = parser.parse_args()
    print(json.dumps(backfill(args.database_url), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
