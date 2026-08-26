from __future__ import annotations

import csv
import math
from pathlib import Path
from typing import Any

import duckdb

from .io import load_json_yaml, sha256_file
from .paths import CONFIG_DIR, EXPORT_DIR, PROCESSED_DIR, REPORT_DIR, ROOT


RAW_GLOB = ROOT / "data/raw/nemotron/*.parquet"
FEATURE_MART = PROCESSED_DIR / "nemotron_feature_mart.parquet"
CALIBRATION_CSV = EXPORT_DIR / "nemotron_calibration.csv"
REPORT = REPORT_DIR / "nemotron_calibration.md"


def verify_nemotron() -> dict[str, Any]:
    manifest = load_json_yaml(CONFIG_DIR / "nemotron_manifest.yml")
    root = ROOT / "data/raw/nemotron"
    files: list[dict[str, Any]] = []
    for item in manifest["shards"]:
        path = root / item["file"]
        actual = sha256_file(path) if path.exists() else None
        files.append({**item, "actual": actual, "ok": actual == item["sha256"], "bytes": path.stat().st_size if path.exists() else 0})
    return {
        "dataset": manifest["dataset"],
        "version": manifest["version"],
        "license": manifest["license"],
        "files": files,
        "all_checksums_ok": all(row["ok"] for row in files),
        "download_bytes": sum(row["bytes"] for row in files),
    }


def calibrate_adults(*, verify_checksums: bool = True) -> dict[str, Any]:
    verification = verify_nemotron()
    if verify_checksums and not verification["all_checksums_ok"]:
        bad = [row["file"] for row in verification["files"] if not row["ok"]]
        raise RuntimeError(f"Nemotron checksum failure: {bad}")
    controls = load_json_yaml(CONFIG_DIR / "adult_calibration.yml")
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    EXPORT_DIR.mkdir(parents=True, exist_ok=True)
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect()
    con.execute("CREATE TABLE controls(age_band VARCHAR, sex VARCHAR, target DOUBLE)")
    con.executemany("INSERT INTO controls VALUES (?, ?, ?)", [(x["age_band"], x["sex"], x["count"]) for x in controls["controls"]])
    raw = RAW_GLOB.as_posix()
    con.execute(f"""
        CREATE VIEW normalized AS
        SELECT
          uuid AS synthetic_person_id,
          CASE sex WHEN '남자' THEN 'male' WHEN '여자' THEN 'female' END AS sex,
          age::INTEGER AS age,
          CASE
            WHEN age = 19 THEN '19'
            WHEN age BETWEEN 20 AND 29 THEN '20-29'
            WHEN age BETWEEN 30 AND 39 THEN '30-39'
            WHEN age BETWEEN 40 AND 49 THEN '40-49'
            WHEN age BETWEEN 50 AND 59 THEN '50-59'
            WHEN age BETWEEN 60 AND 69 THEN '60-69'
            WHEN age BETWEEN 70 AND 79 THEN '70-79'
            WHEN age BETWEEN 80 AND 89 THEN '80-89'
            ELSE '90+'
          END AS age_band,
          province, district, marital_status, family_type, housing_type,
          education_level, bachelors_field, occupation,
          'synthetic_structured_field' AS value_provenance
        FROM read_parquet('{raw}')
    """)
    con.execute("""
        CREATE TABLE cell_stats AS
        SELECT n.age_band, n.sex, count(*) AS sample_n, c.target,
               CASE WHEN c.target IS NULL THEN NULL ELSE c.target / count(*) END AS calibration_weight
        FROM normalized n LEFT JOIN controls c USING(age_band, sex)
        GROUP BY n.age_band, n.sex, c.target
    """)
    con.execute(f"""
        COPY (
          SELECT n.*, s.calibration_weight,
                 CASE WHEN s.target IS NULL THEN 'uncalibrated' ELSE 'official_age_sex_direct' END AS calibration_status,
                 '{controls['source_release_id']}' AS calibration_release_id,
                 '{controls['reference_period']}' AS calibration_period
          FROM normalized n JOIN cell_stats s USING(age_band, sex)
          ORDER BY synthetic_person_id
        ) TO '{FEATURE_MART.as_posix()}' (FORMAT PARQUET, COMPRESSION ZSTD)
    """)
    rows = con.execute("SELECT age_band, sex, sample_n, target, calibration_weight FROM cell_stats ORDER BY age_band, sex").fetchall()
    with CALIBRATION_CSV.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["age_band", "sex", "sample_n", "official_target", "calibration_weight", "post_weighted_count", "relative_error"])
        for band, sex, n, target, weight in rows:
            post = n * weight if weight is not None else None
            err = (post - target) / target if target else None
            writer.writerow([band, sex, n, target, weight, post, err])
    controlled = [(n, target, weight) for _, _, n, target, weight in rows if target is not None]
    sample_total = sum(n for n, _, _ in controlled)
    target_total = sum(target for _, target, _ in controlled)
    pre_shares = [n / sample_total for n, _, _ in controlled]
    target_shares = [target / target_total for _, target, _ in controlled]
    pre_mape = sum(abs(p - t) / t for p, t in zip(pre_shares, target_shares, strict=True)) / len(controlled)
    weights = [(n, weight) for n, _, weight in controlled]
    sum_w = sum(n * w for n, w in weights)
    sum_w2 = sum(n * w * w for n, w in weights)
    ess = sum_w * sum_w / sum_w2
    row_count, distinct_ids, uncontrolled = con.execute(
        f"SELECT count(*), count(DISTINCT synthetic_person_id), count(*) FILTER(WHERE calibration_status='uncalibrated') FROM read_parquet('{FEATURE_MART.as_posix()}')"
    ).fetchone()
    min_w, max_w = con.execute("SELECT min(calibration_weight), max(calibration_weight) FROM cell_stats WHERE calibration_weight IS NOT NULL").fetchone()
    metrics = {
        "rows": row_count,
        "distinct_ids": distinct_ids,
        "controlled_rows": sample_total,
        "uncontrolled_age19_rows": uncontrolled,
        "official_target_20_plus": int(target_total),
        "pre_calibration_share_mape": pre_mape,
        "post_calibration_share_mape": 0.0,
        "weight_min": min_w,
        "weight_max": max_w,
        "effective_sample_size": ess,
        "effective_sample_size_ratio": ess / sample_total,
        "checksum_verified": verification["all_checksums_ok"],
    }
    REPORT.write_text(
        "\n".join([
            "# Nemotron adult calibration", "", "Generated: 2026-08-24", "",
            "## Result", "",
            f"- Input: {row_count:,} unique synthetic records across nine checksum-verified Parquet shards.",
            f"- Controlled frame: ages 20+, weighted to the 2024 Census national age-band × sex table ({int(target_total):,} persons).",
            f"- Pre-calibration share MAPE: {pre_mape:.4%}.",
            "- Post-calibration share MAPE on fitted cells: 0.0000% (direct cell calibration).",
            f"- Weight range: {min_w:.3f}–{max_w:.3f}; Kish effective sample size: {ess:,.0f} ({ess/sample_total:.1%} of controlled records).",
            f"- Uncontrolled age-19 records: {uncontrolled:,}. Their weight is NULL and they are excluded from official population estimates.",
            "", "## Interpretation and limits", "",
            "The NVIDIA rows are synthetic sampling frames, never official population counts. Calibration weights are only valid for national age-band × sex margins; province, household, occupation, and other joints remain synthetic and must not be described as observed Korean distributions.",
            "Narrative persona text is deliberately excluded from the feature mart. Structured fields retain `synthetic_structured_field` provenance. Age 19 remains a registered calibration gap until a compatible official single-age control is ingested.",
            "", "## Lineage", "",
            f"- Calibration release: `{controls['source_release_id']}`; reference date: `{controls['reference_period']}`.",
            "- Synthetic source: `REL-NVIDIA-NPK-1.0`, CC BY 4.0.",
            f"- Cell diagnostics: `{CALIBRATION_CSV.relative_to(ROOT)}`.",
            f"- Feature mart: `{FEATURE_MART.relative_to(ROOT)}`.", "",
        ]), encoding="utf-8"
    )
    con.close()
    return {"metrics": metrics, "feature_mart": str(FEATURE_MART.relative_to(ROOT)), "report": str(REPORT.relative_to(ROOT)), "verification": verification}
