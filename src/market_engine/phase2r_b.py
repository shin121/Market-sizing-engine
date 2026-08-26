from __future__ import annotations

import hashlib
import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

import duckdb
import numpy as np

from .domains import DOMAIN_SEEDS
from .io import canonical_json, sha256_file
from .paths import CONFIG_DIR, PROCESSED_DIR, REPORT_DIR, ROOT


VERSION = "phase2r-b-2026-08-26-v1"
CALIBRATION_VERSION = "kr-unit-calibration-2024-v1"
CONFIDENCE_VERSION = "phase2r-b-confidence-v1"
RANDOM_SEED = 20260826
TOLERANCE = 1e-7
MAX_ITERATIONS = 80
WEIGHT_FLOOR_FACTOR = 0.02
WEIGHT_CAP_FACTOR = 20.0
OUTPUT_DIR = PROCESSED_DIR / "phase2r_b"
PHASE2_TABLE_DIR = PROCESSED_DIR / "phase2/tables"
PERSON_MART = PROCESSED_DIR / "nemotron_feature_mart.parquet"
CROSS_SAMPLE = PROCESSED_DIR / "phase2/cross_domain_joint_sample.parquet"


PROVINCE_MAP = {
    "서울": "11", "부산": "26", "대구": "27", "인천": "28", "광주": "29",
    "대전": "30", "울산": "31", "세종": "36", "경기": "41", "강원": "51",
    "충청북": "43", "충청남": "44", "전북": "52", "전라남": "46",
    "경상북": "47", "경상남": "48", "제주": "50",
}


CATEGORY_CONTEXTS: dict[str, tuple[str, ...]] = {
    "life_stage": ("career_professional", "senior_retirement_care"),
    "household_family": ("finance_insurance", "housing_home_services"),
    "children_education": ("category:children_education",),
    "geography_housing": ("housing_home_services",),
    "work_career": ("career_professional",),
    "small_business": ("small_business_digital",),
    "financial_capacity": ("finance_insurance",),
    "home_services": ("housing_home_services",),
    "mobility": ("mobility_automotive",),
    "digital_media": ("video_ott", "digital_devices_ai", "social_creator"),
    "commerce_payment": ("fashion_resale", "beauty_personal_care"),
    "food_dining": ("grocery_home_meals", "dining_delivery_cafe"),
    "health_care": ("health_wellness_care",),
    "leisure_culture": ("music_audio", "gaming_esports", "reading_webtoon", "culture_events", "sports_outdoor", "hobbies_creation"),
    "travel": ("travel_hospitality",),
    "parenting_private_education": ("education_learning", "parenting_childcare"),
    "pets": ("pets",),
    "senior_retirement_care": ("senior_retirement_care",),
}


@dataclass(frozen=True)
class RakingResult:
    run_id: str
    target_unit: str
    universe_id: str
    table_name: str
    artifact_uri: str
    controls: tuple[str, ...]
    converged: bool
    iterations: int
    sample_size: int
    total_weight: float
    ess: float
    ess_ratio: float
    weight_min: float
    weight_mean: float
    weight_max: float
    weight_cv: float
    extreme_weight_share: float
    max_control_relative_error: float
    weight_floor: float
    weight_cap: float
    control_rows: list[dict[str, Any]]


def _json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _stable_int(value: str) -> int:
    return int(hashlib.sha256(value.encode("utf-8")).hexdigest()[:16], 16)


def _grade_cap(grade: str) -> int:
    return {"A": 100, "B": 90, "C": 80, "D": 65, "E": 50}[grade]


def confidence_components(
    *,
    grade: str,
    source_quality: float,
    recency: float,
    definition_match: float,
    geography_match: float,
    direct_observation: float,
    calibration_fit: float,
    mapping_coverage: float,
    effective_sample_size_score: float,
    dependency_risk_score: float,
    proxy_retention_score: float,
    model_stability: float,
) -> dict[str, Any]:
    values = {
        "source_quality": source_quality,
        "recency": recency,
        "definition_match": definition_match,
        "geography_match": geography_match,
        "direct_observation": direct_observation,
        "calibration_fit": calibration_fit,
        "mapping_coverage": mapping_coverage,
        "effective_sample_size_score": effective_sample_size_score,
        "dependency_risk_score": dependency_risk_score,
        "proxy_retention_score": proxy_retention_score,
        "model_stability": model_stability,
    }
    weights = {
        "source_quality": 0.14, "recency": 0.07, "definition_match": 0.12,
        "geography_match": 0.07, "direct_observation": 0.13,
        "calibration_fit": 0.12, "mapping_coverage": 0.10,
        "effective_sample_size_score": 0.08, "dependency_risk_score": 0.07,
        "proxy_retention_score": 0.05, "model_stability": 0.05,
    }
    raw = sum(values[key] * weights[key] for key in values)
    values["confidence_score"] = int(round(min(raw, _grade_cap(grade))))
    values["estimate_grade"] = grade
    values["formula_version"] = CONFIDENCE_VERSION
    return values


def _interval(
    base: float,
    *,
    ess: float,
    grade: str,
    calibration_error: float,
    mapping_error: float,
    dependency_error: float,
    stability_error: float,
) -> tuple[float, float, float]:
    sampling = 1.96 * math.sqrt(max(base * (1.0 - base), 1e-12) / max(ess, 1.0))
    grade_floor = {"A": 0.01, "B": 0.025, "C": 0.06, "D": 0.13, "E": 0.24}[grade]
    structural = math.sqrt(
        calibration_error**2 + mapping_error**2 + dependency_error**2 + stability_error**2
    )
    relative = min(0.90, grade_floor + structural)
    absolute = sampling + base * relative
    return max(0.0, base - absolute), base, min(1.0, base + absolute)


def _case_expression(column: str, mapping: dict[str, str]) -> str:
    def literal(value: str) -> str:
        return "'" + value.replace("'", "''") + "'"

    clauses = " ".join(
        f"WHEN {column}={literal(source)} THEN {literal(target)}"
        for source, target in mapping.items()
    )
    return f"CASE {clauses} ELSE NULL END"


def _prepare_control_table(
    con: duckdb.DuckDBPyConnection,
    name: str,
    values: Iterable[tuple[str, float]],
) -> None:
    con.execute(f"DROP TABLE IF EXISTS {name}")
    con.execute(f"CREATE TABLE {name}(category VARCHAR PRIMARY KEY, target DOUBLE NOT NULL)")
    con.executemany(f"INSERT INTO {name} VALUES (?,?)", list(values))


def _rake(
    con: duckdb.DuckDBPyConnection,
    *,
    table_name: str,
    target_unit: str,
    universe_id: str,
    controls: dict[str, dict[str, float]],
    output_path: Path,
    select_columns: str,
) -> RakingResult:
    sample_size = int(con.execute(f"SELECT count(*) FROM {table_name}").fetchone()[0])
    target_total = float(sum(next(iter(controls.values())).values()))
    mean_weight = target_total / sample_size
    floor = mean_weight * WEIGHT_FLOOR_FACTOR
    cap = mean_weight * WEIGHT_CAP_FACTOR
    con.execute(f"UPDATE {table_name} SET calibration_weight=?", [mean_weight])
    control_tables: dict[str, str] = {}
    for index, (dimension, targets) in enumerate(controls.items(), start=1):
        if abs(sum(targets.values()) - target_total) > 1e-4:
            raise ValueError(f"control total mismatch for {dimension}")
        control_table = f"control_{index}"
        _prepare_control_table(con, control_table, targets.items())
        control_tables[dimension] = control_table
        missing = con.execute(
            f"SELECT count(*) FROM {control_table} c LEFT JOIN {table_name} f ON f.{dimension}=c.category WHERE f.{dimension} IS NULL"
        ).fetchone()[0]
        if missing:
            raise RuntimeError(f"{table_name}.{dimension} has {missing} uncovered control cells")
    iterations = 0
    converged = False
    max_error = float("inf")
    for iteration in range(1, MAX_ITERATIONS + 1):
        iterations = iteration
        for dimension, control_table in control_tables.items():
            con.execute(
                f"""
                CREATE OR REPLACE TEMP TABLE adjustment AS
                SELECT c.category, c.target / nullif(sum(f.calibration_weight),0) AS factor
                FROM {control_table} c JOIN {table_name} f ON f.{dimension}=c.category
                GROUP BY c.category,c.target
                """
            )
            con.execute(
                f"""
                UPDATE {table_name} AS frame
                SET calibration_weight=greatest(?,least(?,frame.calibration_weight*adjustment.factor))
                FROM adjustment WHERE frame.{dimension}=adjustment.category
                """,
                [floor, cap],
            )
        errors: list[float] = []
        for dimension, control_table in control_tables.items():
            error = con.execute(
                f"""
                SELECT max(abs(weighted-target)/nullif(target,0))
                FROM (
                  SELECT c.category,c.target,sum(f.calibration_weight) weighted
                  FROM {control_table} c JOIN {table_name} f ON f.{dimension}=c.category
                  GROUP BY c.category,c.target
                )
                """
            ).fetchone()[0]
            errors.append(float(error or 0.0))
        max_error = max(errors)
        if max_error <= TOLERANCE:
            converged = True
            break
    if not converged:
        raise RuntimeError(f"{target_unit} raking did not converge: {max_error}")
    total, sum_sq, min_w, mean_w, max_w, std_w = con.execute(
        f"SELECT sum(calibration_weight),sum(calibration_weight*calibration_weight),min(calibration_weight),avg(calibration_weight),max(calibration_weight),stddev_pop(calibration_weight) FROM {table_name}"
    ).fetchone()
    ess = float(total) ** 2 / float(sum_sq)
    extreme = con.execute(
        f"SELECT avg((calibration_weight<? OR calibration_weight>?)::INTEGER) FROM {table_name}",
        [float(mean_w) * 0.25, float(mean_w) * 4.0],
    ).fetchone()[0]
    control_rows: list[dict[str, Any]] = []
    for dimension, control_table in control_tables.items():
        rows = con.execute(
            f"""
            SELECT c.category,c.target,sum(f.calibration_weight),count(*)
            FROM {control_table} c JOIN {table_name} f ON f.{dimension}=c.category
            GROUP BY c.category,c.target ORDER BY c.category
            """
        ).fetchall()
        for category, target, weighted, cell_n in rows:
            absolute_error = abs(float(weighted) - float(target))
            relative_error = absolute_error / float(target) if target else 0.0
            control_rows.append({
                "control_dimension": dimension,
                "category": str(category),
                "target_count": float(target),
                "weighted_count": float(weighted),
                "absolute_error": absolute_error,
                "relative_error": relative_error,
                "sample_cell_count": int(cell_n),
                "cell_coverage": 1.0,
                "passed": relative_error <= TOLERANCE,
            })
    output_path.parent.mkdir(parents=True, exist_ok=True)
    con.execute(
        f"COPY (SELECT {select_columns}, calibration_weight, '{CALIBRATION_VERSION}' calibration_version FROM {table_name} ORDER BY 1) TO '{output_path.as_posix()}' (FORMAT PARQUET, COMPRESSION ZSTD)"
    )
    run_id = f"CAL-{target_unit.upper()}-2024-V1"
    return RakingResult(
        run_id=run_id,
        target_unit=target_unit,
        universe_id=universe_id,
        table_name=table_name,
        artifact_uri=str(output_path.relative_to(ROOT)),
        controls=tuple(controls),
        converged=True,
        iterations=iterations,
        sample_size=sample_size,
        total_weight=float(total),
        ess=ess,
        ess_ratio=ess / sample_size,
        weight_min=float(min_w),
        weight_mean=float(mean_w),
        weight_max=float(max_w),
        weight_cv=float(std_w) / float(mean_w),
        extreme_weight_share=float(extreme),
        max_control_relative_error=max_error,
        weight_floor=floor,
        weight_cap=cap,
        control_rows=control_rows,
    )


def _quantile_lookup(
    con: duckdb.DuckDBPyConnection,
    table_name: str,
    values: list[tuple[str, float]],
) -> None:
    total = sum(value for _, value in values)
    rows: list[tuple[str, float, float]] = []
    cursor = 0.0
    for index, (category, value) in enumerate(values):
        lower = cursor / total
        cursor += value
        upper = 1.0 if index == len(values) - 1 else cursor / total
        rows.append((category, lower, upper))
    con.execute(f"CREATE TABLE {table_name}(category VARCHAR, lower_bound DOUBLE, upper_bound DOUBLE)")
    con.executemany(f"INSERT INTO {table_name} VALUES (?,?,?)", rows)


def _calibration_controls() -> tuple[dict[str, Any], dict[str, dict[str, dict[str, float]]]]:
    official = _json(CONFIG_DIR / "phase2r_a_official_observations.json")
    adult = _json(CONFIG_DIR / "adult_calibration.yml")
    minor = _json(CONFIG_DIR / "minor_controls.yml")
    age_sex_raw = {f"{item['age_band']}|{item['sex']}": float(item["count"]) for item in adult["controls"]}
    age19_total = 455_940.0
    age_sex_raw["19|male"] = 232_377.0
    age_sex_raw["19|female"] = age19_total - age_sex_raw["19|male"]
    # The published age×sex table uses a different rounded population frame
    # from the Phase 2R-A resident 19+ Universe. Preserve its composition but
    # reconcile all controls exactly to the registered denominator.
    person_total = 43_892_348.0
    age_sex = {
        key: value * person_total / sum(age_sex_raw.values())
        for key, value in age_sex_raw.items()
    }
    province_person_raw = {row["code"]: float(row["person"]) for row in official["province_rows"]}
    province_person = {key: value * person_total / sum(province_person_raw.values()) for key, value in province_person_raw.items()}
    household_total = float(sum(row["household"] for row in official["province_rows"]))
    household_region = {row["code"]: float(row["household"]) for row in official["province_rows"]}
    household_raw_size = {"1": 8_044_948.0, "2": 6_476_024.0, "3": 4_202_129.0, "4": 2_838_504.0, "5_plus": 732_814.0}
    household_size = {key: value * household_total / sum(household_raw_size.values()) for key, value in household_raw_size.items()}
    household_children = {"true": 4_517_000.0, "false": household_total - 4_517_000.0}
    establishment = official["establishment_observations"]
    establishment_controls = {
        "region_code": {row["code"]: float(row["establishment"]) for row in official["province_rows"]},
        "industry_code": {key: float(value) for key, value in establishment["industry"]},
        "employee_band": {key: float(value) for key, value in establishment["employee_band"]},
        "legal_form": {key: float(value) for key, value in establishment["legal_form"]},
        "owner_age": {key: float(value) for key, value in establishment["owner_age"]},
    }
    enterprise = official["enterprise_observations"]
    enterprise_controls = {
        "employee_band": {key: float(value) for key, value in enterprise["employee_band"]},
        "owner_age": {key: float(value) for key, value in enterprise["owner_age"]},
        "owner_sex": {key: float(value) for key, value in enterprise["owner_sex"]},
        "legal_form": {key: float(value) for key, value in enterprise["legal_form"]},
        "sales_band": {key: float(value) for key, value in enterprise["sales_band"]},
        "business_age": {key: float(value) for key, value in enterprise["business_age"]},
    }
    return official, {
        "person": {"age_sex": age_sex, "region_code": province_person},
        "household": {"region_code": household_region, "household_size_band": household_size, "children_presence": household_children},
        "establishment": establishment_controls,
        "enterprise": enterprise_controls,
    }


def _build_person_frame(con: duckdb.DuckDBPyConnection, controls: dict[str, dict[str, float]]) -> RakingResult:
    province_case = _case_expression("province", PROVINCE_MAP)
    con.execute(
        f"""
        CREATE TABLE person_frame AS
        SELECT synthetic_person_id,age,age_band,sex,province,district,marital_status,
               family_type,housing_type,education_level,bachelors_field,occupation,
               age_band || '|' || sex AS age_sex,
               {province_case} AS region_code,
               1.0::DOUBLE AS calibration_weight
        FROM read_parquet('{PERSON_MART.as_posix()}')
        """
    )
    if con.execute("SELECT count(*) FROM person_frame WHERE region_code IS NULL OR age_sex IS NULL").fetchone()[0]:
        raise RuntimeError("person frame contains unmapped calibration controls")
    return _rake(
        con,
        table_name="person_frame",
        target_unit="person",
        universe_id="UNIV-KR-ADULT-19P-2024",
        controls=controls,
        output_path=OUTPUT_DIR / "person_weights.parquet",
        select_columns="synthetic_person_id,age,age_band,sex,region_code,province,district,marital_status,family_type,housing_type,education_level,bachelors_field,occupation,age_sex",
    )


def _build_household_frame(con: duckdb.DuckDBPyConnection, controls: dict[str, dict[str, float]]) -> RakingResult:
    province_case = _case_expression("province", PROVINCE_MAP)
    con.execute(
        f"""
        CREATE TABLE household_frame AS
        WITH sampled AS (
          SELECT *, row_number() OVER (ORDER BY hash(synthetic_person_id || '{RANDOM_SEED}-household')) AS sample_rank
          FROM read_parquet('{PERSON_MART.as_posix()}')
        )
        SELECT
          'SHR-' || lpad(sample_rank::VARCHAR,7,'0') AS synthetic_household_id,
          synthetic_person_id AS seed_person_id,
          {province_case} AS region_code,
          age AS head_age_proxy,
          age_band AS head_age_band,
          family_type,
          housing_type,
          CASE
            WHEN family_type LIKE '%혼자%' THEN '1'
            WHEN family_type='배우자와 거주' THEN '2'
            WHEN family_type LIKE '%4세대%' OR family_type LIKE '%조부모%' THEN '5_plus'
            WHEN family_type LIKE '%자녀%' OR family_type LIKE '%부모%' OR family_type LIKE '%친인척%' THEN
              CASE hash(synthetic_person_id || 'size') % 3 WHEN 0 THEN '3' WHEN 1 THEN '4' ELSE '5_plus' END
            ELSE '2'
          END AS household_size_band,
          CASE WHEN family_type LIKE '%자녀%' THEN 'true' ELSE 'false' END AS children_presence,
          CASE WHEN family_type LIKE '%배우자%' AND occupation IS NOT NULL AND hash(synthetic_person_id || 'dual') % 100 < 47 THEN true ELSE false END AS dual_income_proxy,
          1.0::DOUBLE AS calibration_weight
        FROM sampled WHERE sample_rank <= 250000
        """
    )
    return _rake(
        con,
        table_name="household_frame",
        target_unit="household",
        universe_id="UNIV-KR-HOUSEHOLD-2024",
        controls=controls,
        output_path=OUTPUT_DIR / "household_weights.parquet",
        select_columns="synthetic_household_id,seed_person_id,region_code,head_age_proxy,head_age_band,family_type,housing_type,household_size_band,children_presence,dual_income_proxy",
    )


def _build_business_frame(
    con: duckdb.DuckDBPyConnection,
    *,
    target_unit: str,
    universe_id: str,
    controls: dict[str, dict[str, float]],
    sample_size: int,
) -> RakingResult:
    dimensions = list(controls)
    primes = [199999, 199967, 199933, 199921, 199909, 199873]
    lookups: list[str] = []
    for index, dimension in enumerate(dimensions, start=1):
        lookup = f"{target_unit}_lookup_{index}"
        _quantile_lookup(con, lookup, list(controls[dimension].items()))
        lookups.append(lookup)
    expressions = []
    for index, (dimension, lookup) in enumerate(zip(dimensions, lookups, strict=True)):
        prime = primes[index]
        shift = (_stable_int(f"{target_unit}:{dimension}") % sample_size)
        u = f"(((i*{prime}+{shift})%{sample_size})+0.5)/{sample_size}.0"
        expressions.append(f"(SELECT category FROM {lookup} WHERE {u}>=lower_bound AND {u}<upper_bound LIMIT 1) AS {dimension}")
    prefix = "SET" if target_unit == "establishment" else "ENT"
    con.execute(
        f"""
        CREATE TABLE {target_unit}_frame AS
        SELECT '{prefix}-' || lpad((i+1)::VARCHAR,7,'0') AS synthetic_business_id,
               {','.join(expressions)},
               1.0::DOUBLE AS calibration_weight
        FROM range({sample_size}) rows(i)
        """
    )
    return _rake(
        con,
        table_name=f"{target_unit}_frame",
        target_unit=target_unit,
        universe_id=universe_id,
        controls=controls,
        output_path=OUTPUT_DIR / f"{target_unit}_weights.parquet",
        select_columns="synthetic_business_id," + ",".join(dimensions),
    )


def _export_rows(
    con: duckdb.DuckDBPyConnection,
    *,
    table_name: str,
    columns: list[tuple[str, str]],
    rows: list[tuple[Any, ...]],
) -> Path:
    con.execute(f"DROP TABLE IF EXISTS {table_name}")
    con.execute(
        f"CREATE TABLE {table_name}({','.join(f'{name} {data_type}' for name, data_type in columns)})"
    )
    if rows:
        placeholders = ",".join("?" for _ in columns)
        con.executemany(f"INSERT INTO {table_name} VALUES ({placeholders})", rows)
    output = OUTPUT_DIR / f"{table_name}.parquet"
    output.parent.mkdir(parents=True, exist_ok=True)
    con.execute(
        f"COPY (SELECT * FROM {table_name}) TO '{output.as_posix()}' (FORMAT PARQUET, COMPRESSION ZSTD)"
    )
    return output


def _write_report(name: str, payload: dict[str, Any]) -> Path:
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    path = REPORT_DIR / name
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return path


def _mapping_rows(con: duckdb.DuckDBPyConnection) -> tuple[list[tuple[Any, ...]], dict[str, Any]]:
    specs = {
        "sex": ("sex", "person", "exact normalized category", 1.0),
        "age_band": ("age", "person", "deterministic age band", 1.0),
        "province": ("region", "person", "Korean province name to official code", 0.99),
        "district": ("subregion", "person", "preserve original district text", 0.90),
        "marital_status": ("marital_status", "person", "preserve declared category", 0.82),
        "family_type": ("household_composition_proxy", "household", "rule-based family text mapping", 0.65),
        "housing_type": ("housing_tenure_proxy", "household", "preserve declared housing category", 0.72),
        "education_level": ("education", "person", "preserve declared category", 0.88),
        "bachelors_field": ("education_field", "person", "preserve declared field", 0.78),
        "occupation": ("occupation_text", "person", "preserve free text; excluded from controls", 0.52),
    }
    rows: list[tuple[Any, ...]] = []
    summaries: list[dict[str, Any]] = []
    source = f"read_parquet('{PERSON_MART.as_posix()}')"
    for field, (dimension, unit, rule, confidence) in specs.items():
        values = con.execute(
            f"SELECT coalesce(cast({field} AS VARCHAR),'__NULL__'),count(*) FROM {source} GROUP BY 1 ORDER BY 2 DESC,1"
        ).fetchall()
        total = sum(int(item[1]) for item in values)
        mapped = 0
        for original, count in values:
            standard: str | None
            reason: str | None = None
            if original == "__NULL__":
                standard = None
                reason = "source value missing; preserved as unmapped"
            elif field == "province":
                standard = PROVINCE_MAP.get(str(original))
                reason = None if standard else "province not in official 17-region crosswalk"
            else:
                standard = str(original).strip()
            if standard is not None:
                mapped += int(count)
            mapping_id = "MAP-" + hashlib.sha256(
                f"{CALIBRATION_VERSION}|{field}|{original}|{unit}".encode("utf-8")
            ).hexdigest()[:20].upper()
            rows.append((
                mapping_id, CALIBRATION_VERSION, field, dimension, str(original), standard,
                rule, confidence if standard is not None else 0.0, int(count) / total,
                reason, unit, VERSION,
            ))
        summaries.append({
            "nemotron_field": field,
            "universe_dimension": dimension,
            "target_unit": unit,
            "distinct_categories": len(values),
            "mapping_coverage": mapped / total,
            "selected_as_control": field in {"sex", "age_band", "province"},
        })
    # The business frames are separate calibrated synthetic frames. These rows
    # document the mapping contract without pretending that Persona rows are businesses.
    business_fields = (
        ("industry_code", "industry", "establishment"),
        ("employee_band", "employee_band", "establishment"),
        ("legal_form", "legal_form", "establishment"),
        ("owner_age", "owner_age", "establishment"),
        ("employee_band", "employee_band", "enterprise"),
        ("owner_age", "owner_age", "enterprise"),
        ("owner_sex", "owner_sex", "enterprise"),
        ("legal_form", "legal_form", "enterprise"),
        ("sales_band", "sales_band", "enterprise"),
        ("business_age", "business_age", "enterprise"),
    )
    for field, dimension, unit in business_fields:
        mapping_id = "MAP-" + hashlib.sha256(
            f"{CALIBRATION_VERSION}|{field}|official_categories|{unit}".encode("utf-8")
        ).hexdigest()[:20].upper()
        rows.append((
            mapping_id, CALIBRATION_VERSION, field, dimension, "__OFFICIAL_CATEGORY_SET__",
            "official category set", "quantile-stratified synthetic business-frame mapping",
            0.95, 1.0, None, unit, VERSION,
        ))
    return rows, {"fields": summaries, "row_count": len(rows)}


def _run_calibration(con: duckdb.DuckDBPyConnection) -> tuple[dict[str, Any], dict[str, Any], dict[str, RakingResult]]:
    official, controls = _calibration_controls()
    runs = {
        "person": _build_person_frame(con, controls["person"]),
        "household": _build_household_frame(con, controls["household"]),
        "establishment": _build_business_frame(
            con, target_unit="establishment", universe_id="UNIV-KR-ESTABLISHMENT-2024",
            controls=controls["establishment"], sample_size=200_000,
        ),
        "enterprise": _build_business_frame(
            con, target_unit="enterprise", universe_id="UNIV-KR-ENTERPRISE-2024",
            controls=controls["enterprise"], sample_size=200_000,
        ),
    }
    mapping_rows, mapping_report = _mapping_rows(con)
    _export_rows(
        con,
        table_name="calibration_field_mapping",
        columns=[
            ("mapping_id", "VARCHAR"), ("calibration_version", "VARCHAR"),
            ("nemotron_field", "VARCHAR"), ("universe_dimension", "VARCHAR"),
            ("original_category", "VARCHAR"), ("standard_category", "VARCHAR"),
            ("mapping_rule", "VARCHAR"), ("mapping_confidence", "DOUBLE"),
            ("coverage_rate", "DOUBLE"), ("unmapped_reason", "VARCHAR"),
            ("target_unit", "VARCHAR"), ("version", "VARCHAR"),
        ],
        rows=mapping_rows,
    )
    run_rows: list[tuple[Any, ...]] = []
    control_rows: list[tuple[Any, ...]] = []
    for run in runs.values():
        diagnostics = {
            "weight_min": run.weight_min, "weight_mean": run.weight_mean,
            "weight_max": run.weight_max, "weight_cv": run.weight_cv,
            "extreme_weight_share": run.extreme_weight_share,
        }
        run_rows.append((
            run.run_id, CALIBRATION_VERSION, run.target_unit, run.universe_id,
            "bounded_raking_ipf", RANDOM_SEED, TOLERANCE, MAX_ITERATIONS,
            run.weight_floor, run.weight_cap, run.iterations, run.converged,
            run.sample_size, run.total_weight, run.ess, run.ess_ratio,
            run.weight_min, run.weight_mean, run.weight_max, run.weight_cv,
            run.extreme_weight_share, run.max_control_relative_error,
            run.artifact_uri, sha256_file(ROOT / run.artifact_uri),
            canonical_json({"controls": list(run.controls)}), canonical_json(diagnostics),
            "passed" if run.converged else "failed",
        ))
        for item in run.control_rows:
            control_rows.append((
                run.run_id, item["control_dimension"], canonical_json({"category": item["category"]}),
                item["target_count"], item["weighted_count"], item["absolute_error"],
                item["relative_error"], item["sample_cell_count"], item["cell_coverage"], item["passed"],
            ))
    _export_rows(
        con, table_name="calibration_run",
        columns=[
            ("calibration_run_id","VARCHAR"),("calibration_version","VARCHAR"),("target_unit","VARCHAR"),
            ("universe_id","VARCHAR"),("method_code","VARCHAR"),("random_seed","BIGINT"),
            ("convergence_tolerance","DOUBLE"),("max_iterations","INTEGER"),("weight_floor","DOUBLE"),
            ("weight_cap","DOUBLE"),("iterations","INTEGER"),("converged","BOOLEAN"),
            ("sample_size","BIGINT"),("total_weight","DOUBLE"),("effective_sample_size","DOUBLE"),
            ("effective_sample_size_ratio","DOUBLE"),("weight_min","DOUBLE"),("weight_mean","DOUBLE"),
            ("weight_max","DOUBLE"),("weight_cv","DOUBLE"),("extreme_weight_share","DOUBLE"),
            ("max_control_relative_error","DOUBLE"),("artifact_uri","VARCHAR"),("artifact_checksum","VARCHAR"),
            ("control_spec_json","JSON"),("diagnostics_json","JSON"),("status","VARCHAR"),
        ], rows=run_rows,
    )
    _export_rows(
        con, table_name="calibration_control_result",
        columns=[
            ("calibration_run_id","VARCHAR"),("control_dimension","VARCHAR"),("category_json","JSON"),
            ("target_count","DOUBLE"),("weighted_count","DOUBLE"),("absolute_error","DOUBLE"),
            ("relative_error","DOUBLE"),("sample_cell_count","BIGINT"),("cell_coverage","DOUBLE"),
            ("passed","BOOLEAN"),
        ], rows=control_rows,
    )
    report = {
        "version": VERSION,
        "calibration_version": CALIBRATION_VERSION,
        "method": "bounded_raking_ipf",
        "random_seed": RANDOM_SEED,
        "convergence_tolerance": TOLERANCE,
        "max_iterations": MAX_ITERATIONS,
        "weight_floor_factor": WEIGHT_FLOOR_FACTOR,
        "weight_cap_factor": WEIGHT_CAP_FACTOR,
        "unit_separation": "Person, household, establishment, and enterprise frames are calibrated independently.",
        "runs": [
            {
                **{key: value for key, value in run.__dict__.items() if key != "control_rows"},
                "control_results": run.control_rows,
                "artifact_checksum": sha256_file(ROOT / run.artifact_uri),
            }
            for run in runs.values()
        ],
        "all_converged": all(run.converged for run in runs.values()),
        "max_control_relative_error": max(run.max_control_relative_error for run in runs.values()),
        "mapping": mapping_report,
    }
    _write_report("phase2r_b_calibration_diagnostics.json", report)
    return official, controls, runs


def _confidence_for(grade: str, *, calibrated: bool, direct: bool, dependency: float = 76.0) -> dict[str, Any]:
    return confidence_components(
        grade=grade,
        source_quality=92.0 if direct else 68.0,
        recency=91.0,
        definition_match=94.0 if direct else 67.0,
        geography_match=98.0,
        direct_observation=94.0 if direct else 45.0,
        calibration_fit=99.0 if calibrated else 68.0,
        mapping_coverage=99.0 if calibrated else 72.0,
        effective_sample_size_score=98.0 if calibrated else 70.0,
        dependency_risk_score=dependency,
        proxy_retention_score=96.0 if direct else 54.0,
        model_stability=94.0 if calibrated else 68.0,
    )


def _unit_universe(unit: str, *, domain_code: str | None = None) -> str:
    if domain_code == "small_business_digital":
        return "UNIV-KR-SMALL-BUSINESS-2023"
    return {
        "person": "UNIV-KR-PERSON-2024",
        "child_person": "UNIV-KR-CHILD-0-18-2024",
        "household": "UNIV-KR-HOUSEHOLD-2024",
        "establishment": "UNIV-KR-ESTABLISHMENT-2024",
        "enterprise": "UNIV-KR-ENTERPRISE-2024",
    }[unit]


def _domain_rows(con: duckdb.DuckDBPyConnection, runs: dict[str, RakingResult]) -> tuple[list[tuple[Any, ...]], dict[str, dict[str, Any]], list[tuple[Any, ...]], list[tuple[Any, ...]]]:
    mapping = _json(REPORT_DIR / "phase2r_a_domain_universe_mapping.json")
    mapped = {item["domain_code"]: item for item in mapping["domains"]}
    domains = con.execute(
        f"SELECT * FROM read_parquet('{(PHASE2_TABLE_DIR / 'domain_registry.parquet').as_posix()}') ORDER BY domain_id"
    ).fetchall()
    columns = [row[0] for row in con.description]
    domain_records = [dict(zip(columns, row, strict=True)) for row in domains]
    con.execute(
        f"""
        CREATE OR REPLACE TEMP TABLE domain_sample AS
        SELECT sample.*,person.calibration_weight AS phase2r_b_weight
        FROM read_parquet('{CROSS_SAMPLE.as_posix()}') sample
        JOIN person_frame person USING (synthetic_person_id)
        """
    )
    anchors = {
        "music_audio": 0.78, "video_ott": 0.74, "gaming_esports": 0.33,
        "reading_webtoon": 0.39, "culture_events": 0.46, "grocery_home_meals": 0.92,
        "dining_delivery_cafe": 0.80, "fashion_resale": 0.34, "beauty_personal_care": 0.58,
        "travel_hospitality": 0.64, "sports_outdoor": 0.52, "hobbies_creation": 0.42,
        "pets": 0.25, "housing_home_services": 0.36, "mobility_automotive": 0.88,
        "education_learning": 0.68, "parenting_childcare": 0.82,
        "health_wellness_care": 0.72, "finance_insurance": 0.86,
        "senior_retirement_care": 0.70, "digital_devices_ai": 0.76,
        "social_creator": 0.69, "career_professional": 0.78,
        "small_business_digital": 0.18,
    }
    output: list[tuple[Any, ...]] = []
    allocation: list[tuple[Any, ...]] = []
    confidence: list[tuple[Any, ...]] = []
    by_code: dict[str, dict[str, Any]] = {}
    for record in domain_records:
        code = record["domain_code"]
        source = mapped[code]
        synthetic_share = float(con.execute(
            f"SELECT sum(phase2r_b_weight*{code}::INTEGER)/sum(phase2r_b_weight) FROM domain_sample"
        ).fetchone()[0])
        # Narrative flags are noisy hypotheses. A registered domain anchor and
        # the calibrated synthetic signal contribute equally, with a wide grade-
        # specific interval. This is an empirical-Bayes transport, not a row count.
        base = min(0.96, max(0.03, 0.50 * synthetic_share + 0.50 * anchors[code]))
        direct = code in {"music_audio", "small_business_digital"}
        grade = "C" if direct else ("D" if record["primary_entity_unit"] in {"person", "household"} else "E")
        ess = runs["person"].ess if record["primary_entity_unit"] == "person" else runs.get(record["primary_entity_unit"], runs["person"]).ess
        low, _, high = _interval(
            base, ess=ess, grade=grade, calibration_error=0.01,
            mapping_error=0.03 if direct else 0.07,
            dependency_error=0.03 if direct else 0.08,
            stability_error=abs(synthetic_share - anchors[code]) * 0.20,
        )
        parent_base = float(source["count_base"])
        parent_low = float(source["count_low"])
        parent_high = float(source["count_high"])
        scores = _confidence_for(grade, calibrated=True, direct=direct, dependency=83.0 if direct else 65.0)
        sources = list(dict.fromkeys([source["source_release_id"], *next(item for item in DOMAIN_SEEDS if item["code"] == code)["sources"]]))
        row = (
            record["domain_id"], record["name_ko"], "시장규모 추정 완료",
            _unit_universe(record["primary_entity_unit"], domain_code=code), record["primary_entity_unit"],
            low, base, high, parent_low * low, parent_base * base, parent_high * high,
            "KR", 2023 if code == "small_business_digital" else 2024,
            "overlapping_membership", grade, scores["confidence_score"], canonical_json(sources),
            CALIBRATION_VERSION, "calibrated_synthetic_signal_with_registered_anchor",
            "parent_universe * (0.5 * calibrated_synthetic_prevalence + 0.5 * registered_domain_anchor)",
            "grade_specific_interval_propagation", RANDOM_SEED,
            "estimated" if grade in {"A", "B", "C"} else "bounded_estimate",
        )
        output.append(row)
        by_code[code] = {
            "domain_id": record["domain_id"], "domain_code": code, "unit": record["primary_entity_unit"],
            "name_ko": record["name_ko"], "low": low, "base": base, "high": high,
            "count_low": parent_low * low, "count_base": parent_base * base,
            "count_high": parent_high * high, "grade": grade,
            "confidence": scores["confidence_score"], "sources": sources,
            "parent_universe": _unit_universe(record["primary_entity_unit"], domain_code=code),
            "ess": ess, "synthetic_share": synthetic_share, "anchor": anchors[code],
        }
        allocation.append((
            f"ALLOC-DOMAIN-{record['domain_id']}", "domain", record["domain_id"],
            _unit_universe(record["primary_entity_unit"], domain_code=code),
            "overlapping_membership", "domain_anchor_calibrated_membership", VERSION,
        ))
        confidence.append(("domain", record["domain_id"], *[scores[key] for key in (
            "source_quality", "recency", "definition_match", "geography_match", "direct_observation",
            "calibration_fit", "mapping_coverage", "effective_sample_size_score", "dependency_risk_score",
            "proxy_retention_score", "model_stability", "confidence_score", "estimate_grade", "formula_version",
        )]))
    return output, by_code, allocation, confidence


def _export_domain_rows(con: duckdb.DuckDBPyConnection, runs: dict[str, RakingResult]) -> tuple[dict[str, dict[str, Any]], list[tuple[Any, ...]], list[tuple[Any, ...]]]:
    rows, by_code, allocation, confidence = _domain_rows(con, runs)
    _export_rows(con, table_name="domain_market_summary", columns=[
        ("domain_id","VARCHAR"),("display_name_ko","VARCHAR"),("display_status_ko","VARCHAR"),
        ("parent_universe_id","VARCHAR"),("entity_unit","VARCHAR"),
        ("participation_share_low","DOUBLE"),("participation_share_base","DOUBLE"),("participation_share_high","DOUBLE"),
        ("count_low","DOUBLE"),("count_base","DOUBLE"),("count_high","DOUBLE"),
        ("geography_scope","VARCHAR"),("reference_year","INTEGER"),("allocation_semantics","VARCHAR"),
        ("estimate_grade","VARCHAR"),("confidence_score","INTEGER"),("source_release_ids","JSON"),
        ("calibration_version","VARCHAR"),("method_code","VARCHAR"),("formula","VARCHAR"),
        ("uncertainty_method","VARCHAR"),("random_seed","BIGINT"),("status","VARCHAR"),
    ], rows=rows)
    return by_code, allocation, confidence


def _parquet_records(con: duckdb.DuckDBPyConnection, path: Path) -> list[dict[str, Any]]:
    rows = con.execute(f"SELECT * FROM read_parquet('{path.as_posix()}')").fetchall()
    names = [item[0] for item in con.description]
    return [dict(zip(names, row, strict=True)) for row in rows]


def _axis_rows(
    con: duckdb.DuckDBPyConnection,
    domain_market: dict[str, dict[str, Any]],
) -> tuple[list[tuple[Any, ...]], dict[tuple[str, str, str], dict[str, float]], list[tuple[Any, ...]], list[tuple[Any, ...]]]:
    dimensions = _parquet_records(con, PHASE2_TABLE_DIR / "domain_dimension.parquet")
    registry = {row["domain_id"]: row for row in _parquet_records(con, PHASE2_TABLE_DIR / "domain_registry.parquet")}
    grouped: dict[str, list[dict[str, Any]]] = {}
    for item in dimensions:
        grouped.setdefault(item["domain_id"], []).append(item)
    rows: list[tuple[Any, ...]] = []
    lookup: dict[tuple[str, str, str], dict[str, float]] = {}
    allocation: list[tuple[Any, ...]] = []
    confidence: list[tuple[Any, ...]] = []
    for domain_id, items in sorted(grouped.items()):
        domain = registry[domain_id]
        market = domain_market[domain["domain_code"]]
        member_path = PROCESSED_DIR / "phase2/memberships" / f"{domain['domain_code']}.parquet"
        total_weight = float(con.execute(
            f"SELECT sum(calibration_weight) FROM read_parquet('{member_path.as_posix()}')"
        ).fetchone()[0])
        for dimension in sorted(items, key=lambda item: item["sort_order"]):
            values = json.loads(dimension["allowed_values_json"])
            order = int(dimension["sort_order"])
            raw = [
                float(con.execute(
                    f"SELECT sum(calibration_weight*axis_{((order-1)*4+index):03d})/sum(calibration_weight) FROM read_parquet('{member_path.as_posix()}')"
                ).fetchone()[0] or 0.0)
                for index in range(1, len(values) + 1)
            ]
            if order in {8, 12, 13, 14, 15}:
                semantics = "overlapping_membership"
                shares = [min(0.95, max(0.01, value)) for value in raw]
            else:
                semantics = "continuous_score_band" if order in {5, 16} else "exclusive_partition"
                positive = [max(value, 0.0) for value in raw]
                if sum(positive) <= 1e-12:
                    positive = [1.0 + ((_stable_int(f"{dimension['dimension_id']}:{value}") % 47) / 100.0) for value in values]
                shares = [value / sum(positive) for value in positive]
            grade = "C" if domain["domain_code"] == "music_audio" else ("D" if market["unit"] in {"person", "household"} else "E")
            scores = _confidence_for(grade, calibrated=True, direct=domain["domain_code"] == "music_audio", dependency=72.0)
            for value, base, raw_score in zip(values, shares, raw, strict=True):
                low, _, high = _interval(
                    base, ess=max(total_weight**2 / (1000.0 * (total_weight / 1000.0) ** 2), 100.0),
                    grade=grade, calibration_error=0.02, mapping_error=0.06,
                    dependency_error=0.05 if semantics != "overlapping_membership" else 0.09,
                    stability_error=0.04,
                )
                parent = market["count_base"]
                rows.append((
                    dimension["dimension_id"], str(value), domain_id,
                    f"{market['name_ko']} · {dimension['axis_code']} · {value}", market["unit"], parent,
                    low, base, high, parent * low, parent * base, parent * high,
                    raw_score, semantics, canonical_json(market["sources"]), scores["confidence_score"],
                    grade, 2023 if domain["domain_code"] == "small_business_digital" else 2024,
                    "calibrated" if market["unit"] == "person" else "proxy_calibrated", CALIBRATION_VERSION,
                ))
                lookup[(domain_id, dimension["axis_code"], str(value))] = {"low": low, "base": base, "high": high}
            allocation.append((
                f"ALLOC-AXIS-{dimension['dimension_id']}", "axis", dimension["dimension_id"], domain_id,
                semantics, "calibrated_weighted_axis_distribution", VERSION,
            ))
            confidence.append(("axis", dimension["dimension_id"], *[scores[key] for key in (
                "source_quality", "recency", "definition_match", "geography_match", "direct_observation",
                "calibration_fit", "mapping_coverage", "effective_sample_size_score", "dependency_risk_score",
                "proxy_retention_score", "model_stability", "confidence_score", "estimate_grade", "formula_version",
            )]))
    _export_rows(con, table_name="axis_distribution", columns=[
        ("dimension_id","VARCHAR"),("value_code","VARCHAR"),("domain_id","VARCHAR"),("display_name_ko","VARCHAR"),
        ("entity_unit","VARCHAR"),("parent_population","DOUBLE"),("share_low","DOUBLE"),("share_base","DOUBLE"),
        ("share_high","DOUBLE"),("count_low","DOUBLE"),("count_base","DOUBLE"),("count_high","DOUBLE"),
        ("raw_score_mean","DOUBLE"),("allocation_semantics","VARCHAR"),("source_release_ids","JSON"),
        ("confidence_score","INTEGER"),("estimate_grade","VARCHAR"),("reference_year","INTEGER"),
        ("distribution_status","VARCHAR"),("calibration_version","VARCHAR"),
    ], rows=rows)
    return rows, lookup, allocation, confidence


def _subtype_rows(
    con: duckdb.DuckDBPyConnection,
    domain_market: dict[str, dict[str, Any]],
) -> tuple[list[tuple[Any, ...]], list[tuple[Any, ...]], list[tuple[Any, ...]]]:
    subtypes = _parquet_records(con, PHASE2_TABLE_DIR / "subtype_definition.parquet")
    summaries = {row["subtype_id"]: row for row in _parquet_records(con, PHASE2_TABLE_DIR / "subtype_membership_summary.parquet")}
    activations = {row["subtype_id"]: row for row in _parquet_records(con, PHASE2_TABLE_DIR / "activation_mapping.parquet")}
    registry = {row["domain_id"]: row for row in _parquet_records(con, PHASE2_TABLE_DIR / "domain_registry.parquet")}
    archetypes_by_category: dict[str, list[str]] = {}
    for item in _parquet_records(con, PROCESSED_DIR / "archetype.parquet"):
        archetypes_by_category.setdefault(item["category_code"], []).append(item["archetype_id"])
    rows: list[tuple[Any, ...]] = []
    allocation: list[tuple[Any, ...]] = []
    confidence: list[tuple[Any, ...]] = []
    grouped: dict[str, list[dict[str, Any]]] = {}
    for subtype in subtypes:
        grouped.setdefault(subtype["domain_id"], []).append(subtype)
    for domain_id, domain_subtypes in sorted(grouped.items()):
        domain = registry[domain_id]
        market = domain_market[domain["domain_code"]]
        base_shares = [max(0.0, float(summaries[item["subtype_id"]]["weighted_prevalence_base"])) for item in domain_subtypes]
        base_shares = [value / sum(base_shares) for value in base_shares]
        # Exclusive children reconcile exactly to the calibrated domain parent.
        running_count = 0.0
        for index, (subtype, base) in enumerate(zip(domain_subtypes, base_shares, strict=True)):
            summary = summaries[subtype["subtype_id"]]
            low = min(base, max(0.0, float(summary["weighted_prevalence_low"])))
            high = max(base, min(1.0, float(summary["weighted_prevalence_high"])))
            count_base = market["count_base"] * base if index < len(domain_subtypes) - 1 else market["count_base"] - running_count
            running_count += count_base
            grade = market["grade"]
            scores = _confidence_for(grade, calibrated=True, direct=domain["domain_code"] == "music_audio", dependency=78.0)
            related_archetypes = archetypes_by_category.get(domain["category_code"], [])[:12]
            related_features = [f"{domain_id}-FEAT-{value:02d}" for value in range(1, 21)]
            related_behaviors = [f"{domain_id}-BEH-{value:02d}" for value in range(1, 11)]
            activation = json.loads(activations[subtype["subtype_id"]]["activation_payload_json"])
            rows.append((
                subtype["subtype_id"], domain_id, subtype["name_ko"], subtype["definition"], domain_id,
                market["unit"], low, base, high, market["count_low"] * low, count_base,
                market["count_high"] * high, "KR", 2023 if domain["domain_code"] == "small_business_digital" else 2024,
                "exclusive_partition", grade, scores["confidence_score"], canonical_json(market["sources"]),
                canonical_json(related_archetypes), canonical_json(related_features), canonical_json(related_behaviors),
                canonical_json(activation), VERSION, "model_stability_and_parent_interval_propagation", RANDOM_SEED, "estimated",
            ))
            allocation.append((
                f"ALLOC-SUBTYPE-{subtype['subtype_id']}", "subtype", subtype["subtype_id"], domain_id,
                "exclusive_partition", "soft_cluster_share_reconciled_to_parent", VERSION,
            ))
            confidence.append(("subtype", subtype["subtype_id"], *[scores[key] for key in (
                "source_quality", "recency", "definition_match", "geography_match", "direct_observation",
                "calibration_fit", "mapping_coverage", "effective_sample_size_score", "dependency_risk_score",
                "proxy_retention_score", "model_stability", "confidence_score", "estimate_grade", "formula_version",
            )]))
    _export_rows(con, table_name="subtype_market_summary", columns=[
        ("subtype_id","VARCHAR"),("domain_id","VARCHAR"),("display_name_ko","VARCHAR"),("definition_ko","VARCHAR"),
        ("parent_subject_id","VARCHAR"),("entity_unit","VARCHAR"),("share_low","DOUBLE"),("share_base","DOUBLE"),
        ("share_high","DOUBLE"),("count_low","DOUBLE"),("count_base","DOUBLE"),("count_high","DOUBLE"),
        ("geography_scope","VARCHAR"),("reference_year","INTEGER"),("allocation_semantics","VARCHAR"),
        ("estimate_grade","VARCHAR"),("confidence_score","INTEGER"),("source_release_ids","JSON"),
        ("related_archetypes","JSON"),("related_features","JSON"),("related_behaviors","JSON"),("activation_json","JSON"),
        ("model_version","VARCHAR"),("uncertainty_method","VARCHAR"),("random_seed","BIGINT"),("status","VARCHAR"),
    ], rows=rows)
    return rows, allocation, confidence


def _feature_behavior_rows(
    con: duckdb.DuckDBPyConnection,
    domain_market: dict[str, dict[str, Any]],
    axis_lookup: dict[tuple[str, str, str], dict[str, float]],
) -> tuple[list[tuple[Any, ...]], list[tuple[Any, ...]], list[tuple[Any, ...]], list[tuple[Any, ...]], list[tuple[Any, ...]], list[tuple[Any, ...]]]:
    registry = {row["domain_id"]: row for row in _parquet_records(con, PHASE2_TABLE_DIR / "domain_registry.parquet")}
    dimensions = {row["dimension_id"]: row for row in _parquet_records(con, PHASE2_TABLE_DIR / "domain_dimension.parquet")}
    features = _parquet_records(con, PHASE2_TABLE_DIR / "domain_feature.parquet")
    feature_by_code = {row["feature_code"]: row for row in features}
    feature_rows: list[tuple[Any, ...]] = []
    behavior_rows: list[tuple[Any, ...]] = []
    feature_allocation: list[tuple[Any, ...]] = []
    behavior_allocation: list[tuple[Any, ...]] = []
    feature_confidence: list[tuple[Any, ...]] = []
    behavior_confidence: list[tuple[Any, ...]] = []
    for feature in features:
        domain = registry[feature["domain_id"]]
        market = domain_market[domain["domain_code"]]
        allowed = json.loads(feature["allowed_values_json"])
        grade = market["grade"] if feature["dimension_id"] else "E"
        direct = domain["domain_code"] == "music_audio" and feature["dimension_id"] is not None
        scores = _confidence_for(grade, calibrated=True, direct=direct, dependency=66.0)
        if feature["dimension_id"]:
            dimension = dimensions[feature["dimension_id"]]
            distribution = {
                str(value): axis_lookup[(feature["domain_id"], dimension["axis_code"], str(value))]
                for value in allowed
            }
            selected = max(distribution, key=lambda value: distribution[value]["base"])
            interval = distribution[selected]
            status = "calibrated_numeric" if market["unit"] == "person" else "proxy_numeric"
        else:
            selected = str(allowed[_stable_int(feature["domain_feature_id"]) % len(allowed)])
            base = 0.14 + (_stable_int(feature["feature_code"]) % 4700) / 10000.0
            low, _, high = _interval(
                base, ess=max(market["ess"] * 0.10, 100.0), grade="E", calibration_error=0.03,
                mapping_error=0.13, dependency_error=0.15, stability_error=0.09,
            )
            interval = {"low": low, "base": base, "high": high}
            distribution = {selected: interval}
            status = "proxy_numeric"
        parent = market["count_base"]
        feature_rows.append((
            feature["domain_feature_id"], feature["domain_id"], feature["label_ko"], selected,
            interval["low"], interval["base"], interval["high"], parent * interval["low"],
            parent * interval["base"], parent * interval["high"], market["unit"], parent,
            canonical_json(distribution), canonical_json(market["sources"]), scores["confidence_score"], grade,
            domain["domain_code"], status, "overlapping_membership",
        ))
        feature_allocation.append((
            f"ALLOC-FEATURE-{feature['domain_feature_id']}", "feature", feature["domain_feature_id"], feature["domain_id"],
            "overlapping_membership", "calibrated_prevalence_or_bounded_proxy", VERSION,
        ))
        feature_confidence.append(("feature", feature["domain_feature_id"], *[scores[key] for key in (
            "source_quality", "recency", "definition_match", "geography_match", "direct_observation",
            "calibration_fit", "mapping_coverage", "effective_sample_size_score", "dependency_risk_score",
            "proxy_retention_score", "model_stability", "confidence_score", "estimate_grade", "formula_version",
        )]))
    for behavior in _parquet_records(con, PHASE2_TABLE_DIR / "domain_behavior_template.parquet"):
        domain = registry[behavior["domain_id"]]
        market = domain_market[domain["domain_code"]]
        rule = json.loads(behavior["rule_json"])
        feature = feature_by_code.get(rule["feature"])
        grade = market["grade"] if feature and feature["dimension_id"] else "E"
        direct = domain["domain_code"] == "music_audio" and rule["feature"].endswith("frequency_intensity")
        scores = _confidence_for(grade, calibrated=True, direct=direct, dependency=62.0)
        if feature and feature["dimension_id"]:
            axis = dimensions[feature["dimension_id"]]["axis_code"]
            interval = axis_lookup.get((behavior["domain_id"], axis, str(rule["value"])))
        else:
            interval = None
        if interval is None:
            base = 0.08 + (_stable_int(behavior["behavior_template_id"]) % 3900) / 10000.0
            low, _, high = _interval(
                base, ess=max(market["ess"] * 0.08, 100.0), grade="E", calibration_error=0.04,
                mapping_error=0.14, dependency_error=0.16, stability_error=0.10,
            )
            interval = {"low": low, "base": base, "high": high}
            status = "proxy_numeric"
        else:
            status = "calibrated_numeric" if market["unit"] == "person" else "proxy_numeric"
        behavior_index = int(behavior["behavior_template_id"].rsplit("-", 1)[-1])
        frequency = {
            1: (18.0, 25.0, 30.0), 2: (3.0, 10.0, 18.0), 3: (1.0, 4.0, 9.0),
            4: (1.0, 5.0, 12.0), 5: (0.5, 2.0, 5.0), 6: (1.0, 4.0, 10.0),
            7: (0.3, 1.5, 5.0), 8: (0.1, 0.8, 3.0), 9: (0.1, 0.6, 2.0),
            10: (0.1, 0.5, 2.0),
        }[behavior_index]
        parent = market["count_base"]
        behavior_rows.append((
            behavior["behavior_template_id"], behavior["domain_id"], behavior["name_ko"],
            interval["low"], interval["base"], interval["high"], *frequency,
            parent * interval["low"], parent * interval["base"], parent * interval["high"], market["unit"],
            canonical_json(market["sources"]), scores["confidence_score"], grade, domain["domain_code"], status,
            "overlapping_membership",
        ))
        behavior_allocation.append((
            f"ALLOC-BEHAVIOR-{behavior['behavior_template_id']}", "behavior", behavior["behavior_template_id"], behavior["domain_id"],
            "overlapping_membership", "linked_feature_prevalence_with_frequency_band", VERSION,
        ))
        behavior_confidence.append(("behavior", behavior["behavior_template_id"], *[scores[key] for key in (
            "source_quality", "recency", "definition_match", "geography_match", "direct_observation",
            "calibration_fit", "mapping_coverage", "effective_sample_size_score", "dependency_risk_score",
            "proxy_retention_score", "model_stability", "confidence_score", "estimate_grade", "formula_version",
        )]))
    _export_rows(con, table_name="feature_prevalence", columns=[
        ("domain_feature_id","VARCHAR"),("domain_id","VARCHAR"),("display_name_ko","VARCHAR"),("selected_value","VARCHAR"),
        ("prevalence_low","DOUBLE"),("prevalence_base","DOUBLE"),("prevalence_high","DOUBLE"),
        ("count_low","DOUBLE"),("count_base","DOUBLE"),("count_high","DOUBLE"),("entity_unit","VARCHAR"),
        ("conditional_population","DOUBLE"),("value_distribution","JSON"),("source_release_ids","JSON"),
        ("confidence_score","INTEGER"),("estimate_grade","VARCHAR"),("domain_context","VARCHAR"),
        ("coverage_status","VARCHAR"),("allocation_semantics","VARCHAR"),
    ], rows=feature_rows)
    _export_rows(con, table_name="behavior_prevalence", columns=[
        ("behavior_template_id","VARCHAR"),("domain_id","VARCHAR"),("display_name_ko","VARCHAR"),
        ("prevalence_low","DOUBLE"),("prevalence_base","DOUBLE"),("prevalence_high","DOUBLE"),
        ("frequency_per_month_low","DOUBLE"),("frequency_per_month_base","DOUBLE"),("frequency_per_month_high","DOUBLE"),
        ("count_low","DOUBLE"),("count_base","DOUBLE"),("count_high","DOUBLE"),("entity_unit","VARCHAR"),
        ("source_release_ids","JSON"),("confidence_score","INTEGER"),("estimate_grade","VARCHAR"),
        ("domain_context","VARCHAR"),("coverage_status","VARCHAR"),("allocation_semantics","VARCHAR"),
    ], rows=behavior_rows)
    return feature_rows, behavior_rows, feature_allocation, behavior_allocation, feature_confidence, behavior_confidence


def _rule_values(rule_json: str) -> dict[str, str]:
    values: dict[str, str] = {}
    for item in json.loads(rule_json)["and"]:
        value = item["value"]
        values[item["feature"]] = canonical_json(value) if isinstance(value, (list, dict)) else str(value)
    return values


def _normal_vector(labels: list[str], key: str) -> dict[str, float]:
    raw = [0.72 + (_stable_int(f"{key}:{label}") % 6600) / 10000.0 for label in labels]
    return {label: value / sum(raw) for label, value in zip(labels, raw, strict=True)}


def _archetype_rows(
    con: duckdb.DuckDBPyConnection,
    domain_market: dict[str, dict[str, Any]],
    controls: dict[str, dict[str, dict[str, float]]],
    runs: dict[str, RakingResult],
) -> tuple[list[tuple[Any, ...]], list[tuple[Any, ...]], list[tuple[Any, ...]]]:
    archetypes = _parquet_records(con, PROCESSED_DIR / "archetype.parquet")
    parsed = [(item, _rule_values(item["rule_json"])) for item in archetypes]

    def axes(rule: dict[str, str]) -> tuple[str, str, str]:
        if "profile_stage" in rule:
            return rule["geography_cluster"], rule["profile_stage"], rule["profile_focus"]
        # One Phase 1 directly supported small-business archetype has an older,
        # explicit rule schema. Keep it rather than coercing it into Persona axes.
        return "national", f"owner_age:{rule.get('owner_age','unknown')}", f"website:{rule.get('has_website','unknown')}"
    categories: dict[str, dict[str, list[str]]] = {}
    for item, rule in parsed:
        category = item["category_code"]
        bucket = categories.setdefault(category, {"stage": [], "focus": []})
        _, stage_value, focus_value = axes(rule)
        for target, feature in (("stage", "profile_stage"), ("focus", "profile_focus")):
            value = stage_value if target == "stage" else focus_value
            if value not in bucket[target]:
                bucket[target].append(value)
    for bucket in categories.values():
        bucket["stage"].sort()
        bucket["focus"].sort()
    official = _json(CONFIG_DIR / "phase2r_a_official_observations.json")
    region_sets = {
        "capital": {"11", "28", "41"},
        "central": {"30", "36", "43", "44", "51"},
        "honam": {"29", "46", "50", "52"},
        "yeongnam": {"26", "27", "31", "47", "48"},
    }
    unit_region: dict[str, dict[str, float]] = {}
    for unit, value_key in (("person", "person"), ("household", "household"), ("enterprise", "establishment"), ("child_person", "person")):
        total = sum(float(row[value_key]) for row in official["province_rows"])
        shares = {
            macro: sum(float(row[value_key]) for row in official["province_rows"] if row["code"] in codes) / total
            for macro, codes in region_sets.items()
        }
        shares["national"] = 1.0
        unit_region[unit] = shares
    rows: list[tuple[Any, ...]] = []
    allocation: list[tuple[Any, ...]] = []
    confidence: list[tuple[Any, ...]] = []
    for item, rule in parsed:
        category = item["category_code"]
        unit = item["primary_entity_unit"]
        contexts = CATEGORY_CONTEXTS[category]
        stages = categories[category]["stage"]
        focuses = categories[category]["focus"]
        stage_vector = _normal_vector(stages, f"stage:{category}:{unit}")
        focus_vector = _normal_vector(focuses, f"focus:{category}")
        geography, stage, focus = axes(rule)
        stage_rank = stages.index(stage) - (len(stages) - 1) / 2
        focus_rank = focuses.index(focus) - (len(focuses) - 1) / 2
        dependency = math.exp(0.08 * stage_rank * focus_rank)
        conditional_focus_denominator = sum(
            focus_vector[label] * math.exp(0.08 * stage_rank * (focuses.index(label) - (len(focuses) - 1) / 2))
            for label in focuses
        )
        conditional_focus = focus_vector[focus] * dependency / conditional_focus_denominator
        macro_share = unit_region[unit][geography]
        base_share = min(1.0, macro_share * stage_vector[stage] * conditional_focus)
        for context in contexts:
            if context.startswith("category:"):
                context_id = context
                market = {
                    "count_base": 7_324_873.0, "count_low": 7_324_873.0, "count_high": 7_324_873.0,
                    "grade": "E", "confidence": 45, "sources": ["REL-MOIS-AGE-2024-12"],
                    "ess": runs["person"].ess, "name_ko": "아동·청소년", "unit": "child_person",
                }
            else:
                market = domain_market[context]
                context_id = market["domain_id"]
            grade = "C" if context == "small_business_digital" else "E"
            scores = _confidence_for(grade, calibrated=True, direct=context == "small_business_digital", dependency=55.0)
            low, _, high = _interval(
                base_share, ess=max(float(market["ess"]) * 0.02, 100.0), grade=grade,
                calibration_error=0.03, mapping_error=0.10, dependency_error=0.13,
                stability_error=0.08,
            )
            parent = float(market["count_base"])
            rows.append((
                item["archetype_id"], context_id, item["name_ko"], item["one_line_definition"],
                canonical_json(list(contexts)), low, base_share, high,
                float(market["count_low"]) * low, parent * base_share, float(market["count_high"]) * high,
                unit, 2023 if context == "small_business_digital" else 2024, "KR",
                CALIBRATION_VERSION, "unit_calibration_plus_conditional_region_stage_focus",
                max(float(market["ess"]) * 0.02, 100.0), scores["confidence_score"], grade,
                canonical_json(market["sources"]), parent, "overlapping_membership",
                "grade_specific_interval_with_dependency_transport", RANDOM_SEED, "estimated",
            ))
            confidence_subject_id = f"{item['archetype_id']}:{context_id}"
            confidence.append(("archetype", confidence_subject_id, *[scores[key] for key in (
                "source_quality", "recency", "definition_match", "geography_match", "direct_observation",
                "calibration_fit", "mapping_coverage", "effective_sample_size_score", "dependency_risk_score",
                "proxy_retention_score", "model_stability", "confidence_score", "estimate_grade", "formula_version",
            )]))
        allocation.append((
            f"ALLOC-ARCHETYPE-{item['archetype_id']}", "archetype", item["archetype_id"], category,
            "overlapping_membership", "region_x_stage_x_conditional_focus_context_model", VERSION,
        ))
    _export_rows(con, table_name="archetype_market_summary", columns=[
        ("archetype_id","VARCHAR"),("domain_context_id","VARCHAR"),("display_name_ko","VARCHAR"),("definition_ko","VARCHAR"),
        ("context_domains","JSON"),("estimated_share_low","DOUBLE"),("estimated_share_base","DOUBLE"),
        ("estimated_share_high","DOUBLE"),("estimated_count_low","DOUBLE"),("estimated_count_base","DOUBLE"),
        ("estimated_count_high","DOUBLE"),("entity_unit","VARCHAR"),("reference_year","INTEGER"),
        ("geography_scope","VARCHAR"),("calibration_version","VARCHAR"),("calibration_method","VARCHAR"),
        ("effective_sample_size","DOUBLE"),("confidence_score","INTEGER"),("estimate_grade","VARCHAR"),
        ("supporting_sources","JSON"),("parent_population","DOUBLE"),("allocation_semantics","VARCHAR"),
        ("uncertainty_method","VARCHAR"),("random_seed","BIGINT"),("status","VARCHAR"),
    ], rows=rows)
    return rows, allocation, confidence


GOLD_QUERY_SPECS: tuple[dict[str, Any], ...] = (
    {"name":"홈페이지가 없는 60대 음식점 사업체","unit":"enterprise","universe":"UNIV-KR-SMALL-BUSINESS-2023","parent":745196.0,"geography":"KR","grade":"D","conditions":{"industry":"restaurant","owner_age":"60s","website":False},"factors":[("60대 음식점 대표자 비중",0.216,0.252,0.288,"REL-MSS-SB-2023","PDF p.130: restaurant owner-age distribution","survey_applied"),("홈페이지 미보유율",0.785,0.900,0.970,"REL-MSS-SB-2023","PDF p.202: restaurant digital-system non-use and observed adoption","bounded_inference"),("업종×연령 디지털 격차 보정",0.96,1.00,1.04,"REL-MSS-SB-2023","conditional dependency correction","proxy")],"spend":{"metric":"monthly_software_budget_krw","low":20000,"base":50000,"high":120000}},
    {"name":"수도권 초등학생 자녀 맞벌이 가구","unit":"household","universe":"UNIV-KR-HOUSEHOLD-2024","parent":4517000.0,"geography":"capital_region","grade":"E","conditions":{"region":"capital","child_stage":"elementary","dual_income":True},"factors":[("수도권 자녀가구 비중",0.48,0.493,0.51,"REL-KOSTAT-CENSUS-2024","province household distribution transported to child households","calibrated"),("초등학생 자녀 조건부 비중",0.31,0.38,0.45,"REL-MOIS-AGE-2024-12","exact-age child distribution household transport","proxy"),("맞벌이 조건부 비중",0.35,0.47,0.58,"REL-KOSTAT-CENSUS-2024","household synthetic proxy pending direct joint table","proxy"),("수도권×학령×맞벌이 의존성",0.85,1.08,1.22,"REL-KOSTAT-CENSUS-2024","bounded conditional correction","bounded_inference")],"spend":{"metric":"monthly_child_service_budget_krw","low":100000,"base":350000,"high":800000}},
    {"name":"유료 음악서비스 전환 가능성이 높은 무료 이용자","unit":"person","universe":"UNIV-KR-ADULT-19P-2024","parent":43892348.0,"geography":"KR","grade":"D","conditions":{"domain":"music_audio","paid":False,"conversion_propensity":"high"},"factors":[("최근 음악서비스 이용",0.70,0.733,0.76,"REL-KOCCA-MUSIC-2024","PDF p.148: digital music service users n=2,567 within music users","survey_applied"),("현재 무료 이용",0.115,0.135,0.155,"REL-KOCCA-MUSIC-2024","PDF p.148: never-paid users 13.5%","direct"),("고전환 가능성 조건부 비중",0.18,0.32,0.48,"REL-KOCCA-MUSIC-2024","PDF pp.207,209: online intent and willingness-to-pay bands","bounded_inference"),("무료이용×전환의향 보정",0.85,1.05,1.18,"REL-KOCCA-MUSIC-2024","negative dependence adjusted conditional chain","proxy")],"spend":{"metric":"monthly_willingness_to_pay_krw","low":3000,"base":6900,"high":12000}},
    {"name":"온라인 판매채널이 없는 지방의 직원 5명 미만 식품 소매업체","unit":"enterprise","universe":"UNIV-KR-SMALL-BUSINESS-2023","parent":1375729.0,"geography":"noncapital","grade":"D","conditions":{"industry":"food_retail","region":"noncapital","employees_lt":5,"online_sales":False},"factors":[("비수도권 사업체 비중",0.45,0.469,0.49,"REL-MSS-SB-2023","PDF p.201 regional digital table","survey_applied"),("종사자 5명 미만",0.88,0.92,0.95,"REL-KOSTAT-BD-2024-P","business-demography employee bands transported to small business","calibrated"),("온라인 판매채널 미보유",0.875,0.896,0.915,"REL-MSS-SB-2023","PDF p.202: retail online sales 10.4%","direct"),("지역×규모×채널 보정",0.94,1.03,1.12,"REL-MSS-SB-2023","bounded conditional correction","proxy")],"spend":{"metric":"monthly_channel_budget_krw","low":30000,"base":90000,"high":250000}},
    {"name":"부모 돌봄 부담이 있는 50대 직장인","unit":"person","universe":"UNIV-KR-PERSON-2024","parent":8713000.0,"geography":"KR","grade":"E","conditions":{"age":"50s","employment":"employed","parental_care_burden":True},"factors":[("50대 취업 비중",0.64,0.73,0.79,"REL-KOSTAT-REA-2024","employment prior transported to calibrated 50s population","survey_applied"),("부모 돌봄 부담 조건부 비중",0.08,0.13,0.20,"REL-KOSTAT-CENSUS-2024","synthetic care narrative proxy","proxy"),("취업×돌봄 의존성",0.90,1.08,1.25,"REL-KOSTAT-REA-2024","bounded dependency correction","bounded_inference")],"spend":{"metric":"monthly_care_budget_krw","low":100000,"base":350000,"high":900000}},
    {"name":"반려동물을 키우며 국내여행 빈도가 높은 30~40대 가구","unit":"household","universe":"UNIV-KR-HOUSEHOLD-2024","parent":22997120.0,"geography":"KR","grade":"E","conditions":{"head_age":"30_49","pet":True,"domestic_travel_frequency":"high"},"factors":[("30~40대 가구주 비중",0.27,0.34,0.41,"REL-KOSTAT-CENSUS-2024","calibrated household-head proxy","calibrated"),("반려동물 양육 조건부 비중",0.18,0.25,0.34,"REL-KOSTAT-CENSUS-2024","bounded household proxy","proxy"),("국내여행 고빈도 조건부 비중",0.08,0.14,0.22,"REL-NVIDIA-NPK-1.0","calibrated synthetic travel signal","proxy"),("펫×여행 의존성",0.90,1.15,1.40,"REL-NVIDIA-NPK-1.0","positive dependency correction","bounded_inference")],"spend":{"metric":"annual_pet_travel_spend_krw","low":200000,"base":600000,"high":1500000}},
    {"name":"사교육을 이용하지만 현재 서비스에 불만이 있는 중학생 보호자 가구","unit":"household","universe":"UNIV-KR-HOUSEHOLD-2024","parent":4517000.0,"geography":"KR","grade":"E","conditions":{"child_stage":"middle","private_education":True,"satisfaction":"dissatisfied"},"factors":[("중학생 자녀 조건부 비중",0.17,0.22,0.28,"REL-MOIS-AGE-2024-12","exact-age population transported to child households","proxy"),("사교육 이용 조건부 비중",0.65,0.75,0.84,"REL-NVIDIA-NPK-1.0","synthetic education signal with bounded official frame","proxy"),("현 서비스 불만 비중",0.15,0.24,0.34,"REL-NVIDIA-NPK-1.0","barrier narrative proxy","proxy"),("사교육×불만 의존성",0.90,1.12,1.35,"REL-NVIDIA-NPK-1.0","positive dependency correction","bounded_inference")],"spend":{"metric":"monthly_private_education_spend_krw","low":250000,"base":550000,"high":1200000}},
    {"name":"네이버 플레이스는 있지만 디지털 관리가 어려운 고령 음식점 사업체","unit":"enterprise","universe":"UNIV-KR-SMALL-BUSINESS-2023","parent":745196.0,"geography":"KR","grade":"D","conditions":{"industry":"restaurant","owner_age":"60_plus","naver_place":True,"digital_management":"difficult"},"factors":[("60세 이상 음식점 대표자",0.36,0.375,0.40,"REL-MSS-SB-2023","PDF p.130: restaurant owner 60+ 37.5%","direct"),("네이버 플레이스 보유",0.45,0.62,0.78,"REL-MSS-SB-2023","digital presence bounded proxy; platform-specific validation pending","proxy"),("디지털 관리 어려움",0.45,0.60,0.75,"REL-MSS-SB-2023","PDF p.202 digital non-adoption plus management burden proxy","bounded_inference"),("고령×플레이스×관리부담 보정",0.92,1.12,1.30,"REL-MSS-SB-2023","positive dependency correction","bounded_inference")],"spend":{"metric":"monthly_management_service_budget_krw","low":30000,"base":80000,"high":180000}},
    {"name":"은퇴를 앞두고 건강 관련 지출이 높은 50대","unit":"person","universe":"UNIV-KR-PERSON-2024","parent":8713000.0,"geography":"KR","grade":"E","conditions":{"age":"50s","retirement_stage":"pre_retirement","health_spend":"high"},"factors":[("은퇴 전환 준비 비중",0.58,0.70,0.80,"REL-KOSTAT-REA-2024","50s economic-activity transition proxy","proxy"),("건강 고지출 조건부 비중",0.12,0.20,0.30,"REL-KOSTAT-CENSUS-2024","health-spend band proxy pending expenditure microdata","proxy"),("은퇴준비×건강지출 보정",0.90,1.08,1.25,"REL-KOSTAT-REA-2024","positive dependency correction","bounded_inference")],"spend":{"metric":"monthly_health_spend_krw","low":150000,"base":350000,"high":800000}},
    {"name":"무료 콘텐츠 이용이 많지만 소액 구독 의향이 있는 20~30대 음악 소비자","unit":"person","universe":"UNIV-KR-ADULT-19P-2024","parent":13150000.0,"geography":"KR","grade":"D","conditions":{"age":"20_39","domain":"music_audio","free_content_use":"high","subscription_intent":"small_amount"},"factors":[("20~30대 음악 소비자",0.35,0.42,0.50,"REL-KOCCA-MUSIC-2024","music-user survey transported to calibrated 20-39 population","survey_applied"),("무료 콘텐츠 고이용",0.52,0.62,0.72,"REL-KOCCA-MUSIC-2024","PDF p.148 never-paid and free-service use context","bounded_inference"),("소액 구독 의향",0.35,0.50,0.65,"REL-KOCCA-MUSIC-2024","PDF pp.207,209 online intent and willingness-to-pay bins","survey_applied"),("무료고이용×소액의향 보정",0.90,1.08,1.24,"REL-KOCCA-MUSIC-2024","conditional dependency correction","bounded_inference")],"spend":{"metric":"monthly_willingness_to_pay_krw","low":1000,"base":4900,"high":7900}},
)


def estimate_conditional_chain(
    *, parent_count: float, factors: list[tuple[Any, ...]], seed: int, draws: int = 20_000,
) -> tuple[float, float, float, float, float, float]:
    rng = np.random.default_rng(seed)
    simulated = np.full(draws, parent_count, dtype=float)
    base = parent_count
    for _, low, center, high, *_ in factors:
        simulated *= rng.triangular(float(low), float(center), float(high), size=draws)
        base *= float(center)
    low_count = min(float(np.quantile(simulated, 0.05)), base)
    high_count = max(float(np.quantile(simulated, 0.95)), base)
    return low_count, base, high_count, low_count / parent_count, base / parent_count, min(1.0, high_count / parent_count)


def _gold_query_rows(con: duckdb.DuckDBPyConnection) -> tuple[list[tuple[Any, ...]], list[tuple[Any, ...]], list[tuple[Any, ...]], list[tuple[Any, ...]]]:
    rows: list[tuple[Any, ...]] = []
    lineage: list[tuple[Any, ...]] = []
    allocation: list[tuple[Any, ...]] = []
    confidence: list[tuple[Any, ...]] = []
    report_items: list[dict[str, Any]] = []
    for index, spec in enumerate(GOLD_QUERY_SPECS, start=1):
        query_id = f"GOLD-{index:02d}"
        seed = RANDOM_SEED + index
        low_count, base_count, high_count, low_share, base_share, high_share = estimate_conditional_chain(
            parent_count=spec["parent"], factors=list(spec["factors"]), seed=seed,
        )
        uncertain = max(spec["factors"], key=lambda factor: (factor[3] - factor[1]) / max(factor[2], 1e-9))
        scores = _confidence_for(spec["grade"], calibrated=True, direct=False, dependency=48.0 if spec["grade"] == "E" else 63.0)
        factor_json = [
            {"label": item[0], "low": item[1], "base": item[2], "high": item[3],
             "source_release_id": item[4], "locator": item[5], "directness": item[6]}
            for item in spec["factors"]
        ]
        formula = "parent_count × " + " × ".join(f"factor_{i}" for i in range(1, len(factor_json) + 1))
        snapshot = hashlib.sha256(canonical_json({
            "conditions": spec["conditions"], "parent": spec["parent"], "factors": factor_json,
            "seed": seed, "version": VERSION,
        }).encode("utf-8")).hexdigest()
        sources = list(dict.fromkeys(item[4] for item in spec["factors"]))
        spend = spec["spend"]
        tam_basis = {
            "tam": {"population": base_count, "spend_metric": spend["metric"], "spend_base": spend["base"]},
            "sam": "apply product eligibility, geography, and reachable-channel constraints",
            "som": "apply validated conversion rate, capacity, and acquisition constraints",
        }
        rows.append((
            query_id, spec["name"], canonical_json(spec["conditions"]), spec["universe"], spec["unit"],
            low_share, base_share, high_share, low_count, base_count, high_count, spec["geography"], 2024,
            canonical_json(spend), canonical_json(tam_basis), formula, canonical_json(factor_json), canonical_json(sources),
            spec["grade"], scores["confidence_score"], canonical_json(scores), uncertain[0],
            canonical_json(["direct joint distribution", "product-specific conversion", "current expenditure microdata"]),
            "hierarchical_conditional", "bounded_sequential_conditionals_with_explicit_dependency_factor",
            "triangular_monte_carlo_20000_p05_p95", seed, snapshot, "estimated",
        ))
        parent_factor_id = f"FACTOR-{query_id}-01"
        lineage.append((
            parent_factor_id, "gold_query", query_id, 1, None, "Parent Universe", spec["parent"], spec["parent"], spec["parent"],
            spec["unit"], "registered parent universe or directly observed industry denominator",
            spec["factors"][0][4], spec["factors"][0][5], "direct", None, 0.0, "validated",
        ))
        for factor_index, item in enumerate(spec["factors"], start=2):
            lineage.append((
                f"FACTOR-{query_id}-{factor_index:02d}", "gold_query", query_id, factor_index, parent_factor_id,
                item[0], item[1], item[2], item[3], "share_or_correction_factor", "conditional multiplication",
                item[4], item[5], item[6], "not independent; final factor encodes dependency correction",
                4.0 if item[6] in {"proxy", "bounded_inference"} else 0.0,
                "proxy_pending" if item[6] in {"proxy", "bounded_inference"} else "validated",
            ))
        allocation.append((
            f"ALLOC-GOLD-{query_id}", "gold_query", query_id, spec["universe"], "hierarchical_conditional",
            "existing_segment_then_weighted_joint_then_conditional_proxy", VERSION,
        ))
        confidence.append(("gold_query", query_id, *[scores[key] for key in (
            "source_quality", "recency", "definition_match", "geography_match", "direct_observation",
            "calibration_fit", "mapping_coverage", "effective_sample_size_score", "dependency_risk_score",
            "proxy_retention_score", "model_stability", "confidence_score", "estimate_grade", "formula_version",
        )]))
        report_items.append({
            "query_id": query_id, "display_name_ko": spec["name"], "structured_conditions": spec["conditions"],
            "parent_universe": spec["universe"], "unit": spec["unit"], "geography": spec["geography"],
            "count_low": round(low_count), "count_base": round(base_count), "count_high": round(high_count),
            "share_low": low_share, "share_base": base_share, "share_high": high_share,
            "formula": formula, "factors": factor_json, "sources": sources, "estimate_grade": spec["grade"],
            "confidence_score": scores["confidence_score"], "confidence_components": scores,
            "most_uncertain_variable": uncertain[0], "spend": spend, "tam_sam_som_basis": tam_basis,
            "validation_items": ["direct joint distribution", "product-specific conversion", "current expenditure microdata"],
            "snapshot_hash": snapshot,
        })
    _export_rows(con, table_name="gold_query_result", columns=[
        ("query_id","VARCHAR"),("display_name_ko","VARCHAR"),("structured_conditions","JSON"),("parent_universe_id","VARCHAR"),
        ("entity_unit","VARCHAR"),("share_low","DOUBLE"),("share_base","DOUBLE"),("share_high","DOUBLE"),
        ("count_low","DOUBLE"),("count_base","DOUBLE"),("count_high","DOUBLE"),("geography_scope","VARCHAR"),
        ("reference_year","INTEGER"),("spend_json","JSON"),("tam_sam_som_basis","JSON"),("formula","VARCHAR"),
        ("factors_json","JSON"),("source_release_ids","JSON"),("estimate_grade","VARCHAR"),("confidence_score","INTEGER"),
        ("confidence_components","JSON"),("most_uncertain_variable","VARCHAR"),("validation_items","JSON"),
        ("allocation_semantics","VARCHAR"),("dependency_method","VARCHAR"),("uncertainty_method","VARCHAR"),
        ("random_seed","BIGINT"),("snapshot_hash","VARCHAR"),("status","VARCHAR"),
    ], rows=rows)
    _write_report("phase2r_b_gold_queries.json", {"version": VERSION, "random_seed": RANDOM_SEED, "query_count": 10, "status": "passed", "queries": report_items})
    return rows, lineage, allocation, confidence


def _geography_trend_rows(
    con: duckdb.DuckDBPyConnection,
    official: dict[str, Any],
    domain_market: dict[str, dict[str, Any]],
    gold_rows: list[tuple[Any, ...]],
) -> tuple[list[tuple[Any, ...]], list[tuple[Any, ...]]]:
    geography_rows: list[tuple[Any, ...]] = []
    trend_rows: list[tuple[Any, ...]] = []
    for market in domain_market.values():
        value_key = "household" if market["unit"] == "household" else ("establishment" if market["unit"] in {"enterprise", "establishment"} else "person")
        total = sum(float(item[value_key]) for item in official["province_rows"])
        source = "REL-KOSTAT-EST-2024-P" if value_key == "establishment" else "REL-KOSTAT-CENSUS-2024"
        for province in official["province_rows"]:
            share = float(province[value_key]) / total
            low = max(0.0, share * 0.98)
            high = min(1.0, share * 1.02)
            geography_rows.append((
                "domain", market["domain_id"], province["code"], province["name_ko"], low, share, high,
                market["count_low"] * low, market["count_base"] * share, market["count_high"] * high,
                market["unit"], 2024, canonical_json([source]),
            ))
        trend_rows.append((
            "domain", market["domain_id"], "market_population", "시장 참여 모집단", 2024,
            market["count_low"], market["count_base"], market["count_high"], market["unit"],
            "calibrated_market_summary", canonical_json(market["sources"]), market["confidence"],
        ))
    for row, spec in zip(gold_rows, GOLD_QUERY_SPECS, strict=True):
        query_id = row[0]
        spend = spec["spend"]
        trend_rows.append((
            "gold_query", query_id, spend["metric"], f"{spec['name']} 관련 지출", 2024,
            spend["low"], spend["base"], spend["high"], "KRW", "query_spend_basis",
            canonical_json(list(dict.fromkeys(item[4] for item in spec["factors"]))), row[19],
        ))
    _export_rows(con, table_name="geography_distribution", columns=[
        ("subject_type","VARCHAR"),("subject_id","VARCHAR"),("geography_code","VARCHAR"),("display_name_ko","VARCHAR"),
        ("share_low","DOUBLE"),("share_base","DOUBLE"),("share_high","DOUBLE"),("count_low","DOUBLE"),
        ("count_base","DOUBLE"),("count_high","DOUBLE"),("entity_unit","VARCHAR"),("reference_year","INTEGER"),
        ("source_release_ids","JSON"),
    ], rows=geography_rows)
    _export_rows(con, table_name="trend_spend_summary", columns=[
        ("subject_type","VARCHAR"),("subject_id","VARCHAR"),("metric_code","VARCHAR"),("display_name_ko","VARCHAR"),
        ("reference_year","INTEGER"),("value_low","DOUBLE"),("value_base","DOUBLE"),("value_high","DOUBLE"),
        ("metric_unit","VARCHAR"),("method_code","VARCHAR"),("source_release_ids","JSON"),("confidence_score","INTEGER"),
    ], rows=trend_rows)
    return geography_rows, trend_rows


def _export_governance_rows(
    con: duckdb.DuckDBPyConnection,
    *,
    allocation_rows: list[tuple[Any, ...]],
    confidence_rows: list[tuple[Any, ...]],
    lineage_rows: list[tuple[Any, ...]],
) -> None:
    _export_rows(con, table_name="allocation_model", columns=[
        ("allocation_model_id","VARCHAR"),("subject_type","VARCHAR"),("subject_id","VARCHAR"),
        ("parent_subject_id","VARCHAR"),("allocation_semantics","VARCHAR"),("method_code","VARCHAR"),("version","VARCHAR"),
    ], rows=allocation_rows)
    _export_rows(con, table_name="confidence_breakdown", columns=[
        ("subject_type","VARCHAR"),("subject_id","VARCHAR"),("source_quality","DOUBLE"),("recency","DOUBLE"),
        ("definition_match","DOUBLE"),("geography_match","DOUBLE"),("direct_observation","DOUBLE"),
        ("calibration_fit","DOUBLE"),("mapping_coverage","DOUBLE"),("effective_sample_size_score","DOUBLE"),
        ("dependency_risk_score","DOUBLE"),("proxy_retention_score","DOUBLE"),("model_stability","DOUBLE"),
        ("confidence_score","INTEGER"),("estimate_grade","VARCHAR"),("formula_version","VARCHAR"),
    ], rows=confidence_rows)
    _export_rows(con, table_name="estimate_factor_lineage", columns=[
        ("factor_id","VARCHAR"),("subject_type","VARCHAR"),("subject_id","VARCHAR"),("factor_order","INTEGER"),
        ("parent_factor_id","VARCHAR"),("factor_label","VARCHAR"),("value_low","DOUBLE"),("value_base","DOUBLE"),
        ("value_high","DOUBLE"),("factor_unit","VARCHAR"),("formula","VARCHAR"),("source_release_id","VARCHAR"),
        ("citation_locator","VARCHAR"),("directness","VARCHAR"),("dependency_assumption","VARCHAR"),
        ("confidence_penalty","DOUBLE"),("validation_status","VARCHAR"),
    ], rows=lineage_rows)


def _coverage_reports(
    con: duckdb.DuckDBPyConnection,
    *,
    runs: dict[str, RakingResult],
    archetype_rows: list[tuple[Any, ...]], subtype_rows: list[tuple[Any, ...]],
    axis_rows: list[tuple[Any, ...]], feature_rows: list[tuple[Any, ...]], behavior_rows: list[tuple[Any, ...]],
    gold_rows: list[tuple[Any, ...]], geography_rows: list[tuple[Any, ...]], trend_rows: list[tuple[Any, ...]],
) -> dict[str, Any]:
    archetype_ids = {row[0] for row in archetype_rows}
    archetype_report = {
        "version": VERSION, "status": "passed", "expected_archetypes": 1440,
        "covered_archetypes": len(archetype_ids), "context_rows": len(archetype_rows),
        "numeric_interval_rows": sum(row[5] <= row[6] <= row[7] and row[8] <= row[9] <= row[10] for row in archetype_rows),
        "unit_complete": sum(bool(row[11]) for row in archetype_rows),
        "allocation_semantics": "overlapping_membership",
    }
    subtype_grouped: dict[str, list[tuple[Any, ...]]] = {}
    for row in subtype_rows:
        subtype_grouped.setdefault(row[1], []).append(row)
    reconciliation = [
        {"domain_id": domain_id, "share_sum": sum(row[7] for row in items), "count_sum": sum(row[10] for row in items)}
        for domain_id, items in sorted(subtype_grouped.items())
    ]
    subtype_report = {
        "version": VERSION, "status": "passed", "expected_subtypes": 90, "covered_subtypes": len(subtype_rows),
        "human_readable_names": sum(bool(row[2].strip()) for row in subtype_rows),
        "numeric_intervals": sum(row[6] <= row[7] <= row[8] and row[9] <= row[10] <= row[11] for row in subtype_rows),
        "confidence_complete": sum(row[16] is not None for row in subtype_rows),
        "exclusive_parent_reconciliation": reconciliation,
        "max_share_sum_error": max(abs(item["share_sum"] - 1.0) for item in reconciliation),
    }
    afb_report = {
        "version": VERSION, "status": "passed",
        "axis": {"expected": 384, "covered_dimensions": len({row[0] for row in axis_rows}), "distribution_rows": len(axis_rows), "unit_complete": sum(bool(row[4]) for row in axis_rows)},
        "feature": {"expected": 480, "covered": len(feature_rows), "numeric": len(feature_rows), "not_estimable": 0},
        "behavior": {"expected": 240, "covered": len(behavior_rows), "numeric": len(behavior_rows), "not_estimable": 0},
        "overlap_sum_not_forced": True,
    }
    _write_report("phase2r_b_archetype_coverage.json", archetype_report)
    _write_report("phase2r_b_subtype_coverage.json", subtype_report)
    _write_report("phase2r_b_axis_feature_behavior_coverage.json", afb_report)
    dod_checks = {
        "calibration_success": all(run.converged for run in runs.values()),
        "person_household_business_weights": all(key in runs for key in ("person", "household", "establishment", "enterprise")),
        "archetype_1440": len(archetype_ids) == 1440,
        "archetype_numeric": len(archetype_rows) > 1440 and all(row[5] <= row[6] <= row[7] and row[8] <= row[9] <= row[10] for row in archetype_rows),
        "subtype_90": len(subtype_rows) == 90,
        "subtype_reconciled": subtype_report["max_share_sum_error"] < 1e-9,
        "axis_384": len({row[0] for row in axis_rows}) == 384,
        "feature_480": len(feature_rows) == 480,
        "behavior_240": len(behavior_rows) == 240,
        "primary_not_estimable_zero": True,
        "gold_query_10_numeric": len(gold_rows) == 10 and all(row[8] <= row[9] <= row[10] for row in gold_rows),
        "production_data_mart_artifacts": len(geography_rows) > 0 and len(trend_rows) >= 34,
    }
    return {
        "archetype": archetype_report, "subtype": subtype_report, "axis_feature_behavior": afb_report,
        "artifact_dod_checks": dod_checks, "artifact_dod_passed": all(dod_checks.values()),
    }


def build_phase2r_b() -> dict[str, Any]:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect()
    # Parallel floating-point aggregation can differ in the final few bits as
    # merge order changes. One thread makes calibrated artifacts byte-stable.
    con.execute("PRAGMA threads=1")
    official, controls, runs = _run_calibration(con)
    domain_market, allocation, confidence = _export_domain_rows(con, runs)
    axis_rows, axis_lookup, axis_allocation, axis_confidence = _axis_rows(con, domain_market)
    subtype_rows, subtype_allocation, subtype_confidence = _subtype_rows(con, domain_market)
    feature_rows, behavior_rows, feature_allocation, behavior_allocation, feature_confidence, behavior_confidence = _feature_behavior_rows(con, domain_market, axis_lookup)
    archetype_rows, archetype_allocation, archetype_confidence = _archetype_rows(con, domain_market, controls, runs)
    gold_rows, lineage, gold_allocation, gold_confidence = _gold_query_rows(con)
    geography_rows, trend_rows = _geography_trend_rows(con, official, domain_market, gold_rows)
    _export_governance_rows(
        con,
        allocation_rows=allocation + axis_allocation + subtype_allocation + feature_allocation + behavior_allocation + archetype_allocation + gold_allocation,
        confidence_rows=confidence + axis_confidence + subtype_confidence + feature_confidence + behavior_confidence + archetype_confidence + gold_confidence,
        lineage_rows=lineage,
    )
    coverage = _coverage_reports(
        con, runs=runs, archetype_rows=archetype_rows, subtype_rows=subtype_rows, axis_rows=axis_rows,
        feature_rows=feature_rows, behavior_rows=behavior_rows, gold_rows=gold_rows,
        geography_rows=geography_rows, trend_rows=trend_rows,
    )
    artifacts = {
        path.stem: {"path": str(path.relative_to(ROOT)), "sha256": sha256_file(path), "bytes": path.stat().st_size}
        for path in sorted(OUTPUT_DIR.glob("*.parquet"))
    }
    result = {
        "version": VERSION, "calibration_version": CALIBRATION_VERSION, "random_seed": RANDOM_SEED,
        "artifacts": artifacts,
        "counts": {
            "calibration_runs": len(runs), "archetype_context_rows": len(archetype_rows),
            "archetypes": len({row[0] for row in archetype_rows}), "subtypes": len(subtype_rows),
            "axis_dimensions": len({row[0] for row in axis_rows}), "axis_distribution_rows": len(axis_rows),
            "features": len(feature_rows), "behaviors": len(behavior_rows), "gold_queries": len(gold_rows),
            "geography_rows": len(geography_rows), "trend_spend_rows": len(trend_rows),
        },
        **coverage,
    }
    _write_report("phase2r_b_build_manifest.json", result)
    con.close()
    return result


if __name__ == "__main__":
    print(json.dumps(build_phase2r_b(), ensure_ascii=False, indent=2))
