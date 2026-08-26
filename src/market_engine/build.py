from __future__ import annotations

import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import duckdb

from .io import canonical_json, load_json_yaml, sha256_file, stable_hash
from .paths import CONFIG_DIR, DEFAULT_DB, EXPORT_DIR, PROCESSED_DIR, REPORT_DIR, ROOT
from .archetypes import export_archetypes, generate_archetypes
from .history import build_source_history

MODEL_VERSION = "kr-v0.1.0"
RANDOM_SEED = 20260824


def _configs() -> dict[str, dict[str, Any]]:
    return {
        name: load_json_yaml(CONFIG_DIR / f"{name}.yml")
        for name in ("categories", "confidence", "feature_registry", "sources", "control_totals", "probability_models", "adult_calibration", "minor_controls", "nemotron_manifest", "source_history")
    }


def _verify_local_sources(source_config: dict[str, Any]) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    for source in source_config["sources"]:
        release = source["release"]
        local_uri = release.get("local_uri")
        expected = release.get("checksum")
        if not local_uri:
            results.append({"release_id":release["release_id"],"status":"remote_only","checksum_ok":None})
            continue
        path = ROOT / local_uri
        actual = sha256_file(path) if path.exists() else None
        ok = actual == expected if expected else path.exists()
        results.append({"release_id":release["release_id"],"status":"verified" if ok else "failed","checksum_ok":ok,"expected":expected,"actual":actual,"bytes":path.stat().st_size if path.exists() else None})
        if not ok:
            raise RuntimeError(f"source checksum verification failed: {release['release_id']}")
    return results


def _create_schema(con: duckdb.DuckDBPyConnection) -> None:
    con.execute("""
        CREATE TABLE data_source(
            source_id VARCHAR PRIMARY KEY, publisher VARCHAR NOT NULL, dataset_title VARCHAR NOT NULL,
            official_url VARCHAR NOT NULL, license VARCHAR, source_tier INTEGER NOT NULL,
            source_type VARCHAR NOT NULL, population_universe VARCHAR NOT NULL,
            entity_unit VARCHAR NOT NULL, geographic_coverage VARCHAR, notes VARCHAR
        );
        CREATE TABLE source_release(
            release_id VARCHAR PRIMARY KEY, source_id VARCHAR NOT NULL REFERENCES data_source(source_id),
            version_label VARCHAR NOT NULL, reference_period_start VARCHAR,
            reference_period_end VARCHAR, publication_date VARCHAR, retrieved_at VARCHAR,
            local_uri VARCHAR, file_format VARCHAR, checksum VARCHAR, status VARCHAR NOT NULL
        );
        CREATE TABLE feature_definition(
            feature_code VARCHAR PRIMARY KEY, label_ko VARCHAR NOT NULL, entity_unit VARCHAR NOT NULL,
            data_type VARCHAR NOT NULL, queryable BOOLEAN NOT NULL, sensitive_class VARCHAR NOT NULL
        );
        CREATE TABLE category(
            category_id VARCHAR PRIMARY KEY, code VARCHAR UNIQUE NOT NULL, name_ko VARCHAR NOT NULL,
            entity_units_json JSON NOT NULL, version VARCHAR NOT NULL
        );
        CREATE TABLE baseline_cell(
            control_id VARCHAR PRIMARY KEY, entity_unit VARCHAR NOT NULL, geography_code VARCHAR NOT NULL,
            period VARCHAR NOT NULL, dimensions_json JSON NOT NULL, count_low DOUBLE NOT NULL,
            count_base DOUBLE NOT NULL, count_high DOUBLE NOT NULL, method_code VARCHAR NOT NULL,
            release_id VARCHAR NOT NULL REFERENCES source_release(release_id), evidence_locator VARCHAR NOT NULL,
            model_version VARCHAR NOT NULL
        );
        CREATE TABLE probability_model(
            model_code VARCHAR PRIMARY KEY, entity_unit VARCHAR NOT NULL, applies_when_json JSON NOT NULL,
            feature VARCHAR NOT NULL, operator VARCHAR NOT NULL, value_json JSON NOT NULL,
            probability_low DOUBLE NOT NULL, probability_base DOUBLE NOT NULL, probability_high DOUBLE NOT NULL,
            formula VARCHAR NOT NULL, components_json JSON NOT NULL, method_code VARCHAR NOT NULL,
            validation_gaps_json JSON NOT NULL, version VARCHAR NOT NULL,
            CHECK(probability_low <= probability_base AND probability_base <= probability_high),
            CHECK(probability_low >= 0 AND probability_high <= 1)
        );
        CREATE TABLE pipeline_run(
            run_id VARCHAR PRIMARY KEY, pipeline_name VARCHAR NOT NULL, started_at VARCHAR NOT NULL,
            finished_at VARCHAR, status VARCHAR NOT NULL, input_manifest JSON NOT NULL,
            output_manifest JSON, row_counts JSON, quality_metrics JSON, model_version VARCHAR NOT NULL,
            random_seed BIGINT NOT NULL
        );
        CREATE TABLE archetype(
            archetype_id VARCHAR PRIMARY KEY, category_code VARCHAR NOT NULL REFERENCES category(code),
            name_ko VARCHAR NOT NULL, one_line_definition VARCHAR NOT NULL,
            primary_entity_unit VARCHAR NOT NULL, rule_json JSON NOT NULL, rule_hash VARCHAR UNIQUE NOT NULL,
            observable_traits_json JSON NOT NULL, inferred_needs_json JSON NOT NULL, channels_json JSON NOT NULL,
            overlap_note VARCHAR NOT NULL, version VARCHAR NOT NULL
        );
        CREATE TABLE archetype_estimate(
            archetype_id VARCHAR PRIMARY KEY REFERENCES archetype(archetype_id), status VARCHAR NOT NULL,
            count_low DOUBLE, count_base DOUBLE, count_high DOUBLE,
            share_low DOUBLE, share_base DOUBLE, share_high DOUBLE,
            denominator VARCHAR NOT NULL, reference_period VARCHAR NOT NULL, method_code VARCHAR NOT NULL,
            formula VARCHAR NOT NULL, source_release_ids_json JSON NOT NULL,
            confidence_score INTEGER NOT NULL, confidence_grade VARCHAR NOT NULL,
            validation_gaps_json JSON NOT NULL,
            CHECK(status = 'not_estimable' OR (count_low <= count_base AND count_base <= count_high))
        );
        CREATE TABLE archetype_representative(
            archetype_id VARCHAR PRIMARY KEY REFERENCES archetype(archetype_id),
            source_kind VARCHAR NOT NULL, source_persona_key VARCHAR NOT NULL,
            provenance VARCHAR NOT NULL
        );
    """)


def _load(con: duckdb.DuckDBPyConnection, configs: dict[str, dict[str, Any]], run_id: str, archetypes: list[dict[str, Any]]) -> dict[str, int]:
    retrieved = configs["sources"]["retrieved_at"]
    for source in configs["sources"]["sources"]:
        release = source["release"]
        con.execute(
            "INSERT INTO data_source VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [source["source_id"], source["publisher"], source["dataset_title"], source["official_url"],
             source.get("license"), source["source_tier"], source["source_type"], source["population_universe"],
             source["entity_unit"], source.get("geographic_coverage"), source.get("notes")],
        )
        if source["source_id"] == "SRC-MOIS-RESIDENT-AGE":
            for historic in configs["source_history"]["releases"]:
                if historic["year"] == 2024:
                    continue
                con.execute(
                    "INSERT INTO source_release VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    [f"REL-MOIS-AGE-{historic['year']}-12", source["source_id"], f"{historic['year']}-12 월간",
                     historic["period"], historic["period"], f"{historic['year']+1}-01-01", retrieved,
                     historic["file"], "html", historic["sha256"], "verified"],
                )
        con.execute(
            "INSERT INTO source_release VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [release["release_id"], source["source_id"], release["version_label"],
             release.get("reference_period_start"), release.get("reference_period_end"), release.get("publication_date"),
             retrieved, release.get("local_uri"), release.get("file_format"), release.get("checksum"), release["status"]],
        )
    for feature in configs["feature_registry"]["features"]:
        con.execute("INSERT INTO feature_definition VALUES (?, ?, ?, ?, ?, ?)", [feature[k] for k in ("feature_code","label_ko","entity_unit","data_type","queryable","sensitive_class")])
    for i, category in enumerate(configs["categories"]["categories"], start=1):
        con.execute("INSERT INTO category VALUES (?, ?, ?, ?, ?)", [f"CAT-{i:02d}", category["code"], category["name_ko"], canonical_json(category["entity_units"]), configs["categories"]["version"]])
    for control in configs["control_totals"]["controls"]:
        count = float(control["count"])
        count_low = float(control.get("count_low", count))
        count_high = float(control.get("count_high", count))
        con.execute(
            "INSERT INTO baseline_cell VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [control["control_id"], control["entity_unit"], control["geography_code"], control["period"],
             canonical_json(control["dimensions"]), count_low, count, count_high, control["method_code"], control["release_id"],
             control["evidence_locator"], MODEL_VERSION],
        )
    for model in configs["probability_models"]["models"]:
        p = model["probability"]
        con.execute(
            "INSERT INTO probability_model VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [model["model_code"], model["entity_unit"], canonical_json(model["applies_when"]), model["feature"],
             model["operator"], canonical_json(model["value"]), p["low"], p["base"], p["high"], model["formula"],
             canonical_json(model["components"]), model["method_code"], canonical_json(model["validation_gaps"]), configs["probability_models"]["version"]],
        )
    for row in archetypes:
        con.execute(
            "INSERT INTO archetype VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [row["archetype_id"], row["category_code"], row["name_ko"], row["one_line_definition"],
             row["primary_entity_unit"], canonical_json(row["rule"]), row["rule_hash"],
             canonical_json(row["observable_traits"]), canonical_json(row["inferred_needs"]), canonical_json(row["channels"]),
             row["overlap_note"], row["version"]],
        )
        c, s = row["count"], row["share"]
        con.execute(
            "INSERT INTO archetype_estimate VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [row["archetype_id"], row["estimate_status"], c["low"], c["base"], c["high"], s["low"], s["base"], s["high"],
             row["denominator"], row["reference_period"], row["method_code"], row["formula"], canonical_json(row["source_release_ids"]),
             row["confidence"]["score"], row["confidence"]["grade"], canonical_json(row["validation_gaps"])],
        )
        rep = row["representative"]
        con.execute("INSERT INTO archetype_representative VALUES (?, ?, ?, ?)", [row["archetype_id"], rep["source_kind"], rep["source_persona_key"], rep["provenance"]])
    return {
        "data_source": len(configs["sources"]["sources"]),
        "source_release": con.execute("SELECT count(*) FROM source_release").fetchone()[0],
        "feature_definition": len(configs["feature_registry"]["features"]),
        "category": len(configs["categories"]["categories"]),
        "baseline_cell": len(configs["control_totals"]["controls"]),
        "probability_model": len(configs["probability_models"]["models"]),
        "archetype": len(archetypes),
        "archetype_estimate": len(archetypes),
        "archetype_representative": len(archetypes),
    }


def _export(con: duckdb.DuckDBPyConnection) -> dict[str, str]:
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    EXPORT_DIR.mkdir(parents=True, exist_ok=True)
    outputs: dict[str, str] = {}
    for table in ("data_source", "source_release", "feature_definition", "category", "baseline_cell", "probability_model", "archetype", "archetype_estimate", "archetype_representative"):
        destination = PROCESSED_DIR / f"{table}.parquet"
        con.execute(f"COPY {table} TO '{destination.as_posix()}' (FORMAT PARQUET, COMPRESSION ZSTD)")
        outputs[table] = str(destination.relative_to(ROOT))
    source_csv = EXPORT_DIR / "source_catalog.csv"
    con.execute(f"COPY (SELECT * FROM data_source ORDER BY source_id) TO '{source_csv.as_posix()}' (HEADER, DELIMITER ',')")
    controls_csv = EXPORT_DIR / "control_totals.csv"
    con.execute(f"COPY (SELECT * FROM baseline_cell ORDER BY entity_unit, control_id) TO '{controls_csv.as_posix()}' (HEADER, DELIMITER ',')")
    outputs["source_catalog_csv"] = str(source_csv.relative_to(ROOT))
    outputs["control_totals_csv"] = str(controls_csv.relative_to(ROOT))
    evidence_csv = EXPORT_DIR / "evidence_ledger.csv"
    con.execute(f"COPY (SELECT control_id AS evidence_id, release_id, evidence_locator, entity_unit, geography_code, period, count_base AS value, method_code FROM baseline_cell ORDER BY control_id) TO '{evidence_csv.as_posix()}' (HEADER, DELIMITER ',')")
    outputs["evidence_ledger_csv"] = str(evidence_csv.relative_to(ROOT))
    return outputs


def _write_source_report(verification: list[dict[str, Any]], row_counts: dict[str, int]) -> None:
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    report = REPORT_DIR / "source_coverage.md"
    lines = [
        "# Source coverage checkpoint", "", "Generated: 2026-08-24", "",
        f"Registered sources/releases: {row_counts['source_release']}", "",
        "| Release | Status | Checksum | Bytes |", "|---|---:|---:|---:|",
    ]
    for row in verification:
        lines.append(f"| {row['release_id']} | {row['status']} | {row.get('checksum_ok')} | {row.get('bytes') or ''} |")
    lines.extend(["", "Known coverage gaps:", "", "- Exact own-website possession by industry and owner age is not observed in the registered official survey.", "- Five-year resident-population history is present; multi-year business and household harmonization remains a refresh backlog.", "- Nemotron age 19 lacks a compatible official Census calibration cell.", "- The enterprise-demography release is rounded to thousands; its interval preserves that publication precision.", ""])
    report.write_text("\n".join(lines), encoding="utf-8")


def build_database(path: Path = DEFAULT_DB) -> dict[str, Any]:
    configs = _configs()
    history = build_source_history()
    archetypes = generate_archetypes()
    verification = _verify_local_sources(configs["sources"])
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    run_id = f"RUN-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}"
    input_manifest = {name: stable_hash(config) for name, config in configs.items()}
    fd, tmp_name = tempfile.mkstemp(prefix="market-engine-", suffix=".duckdb", dir=PROCESSED_DIR)
    os.close(fd)
    Path(tmp_name).unlink()
    con = duckdb.connect(tmp_name)
    try:
        _create_schema(con)
        started = datetime.now(timezone.utc).isoformat()
        con.execute("INSERT INTO pipeline_run VALUES (?, ?, ?, NULL, ?, ?, NULL, NULL, NULL, ?, ?)", [run_id, "build_core", started, "running", canonical_json(input_manifest), MODEL_VERSION, RANDOM_SEED])
        row_counts = _load(con, configs, run_id, archetypes)
        outputs = _export(con)
        quality = {
            "source_checksum_failures": sum(1 for item in verification if item.get("checksum_ok") is False),
            "interval_order_violations": con.execute("SELECT count(*) FROM probability_model WHERE NOT(probability_low <= probability_base AND probability_base <= probability_high)").fetchone()[0],
            "baseline_missing_lineage": con.execute("SELECT count(*) FROM baseline_cell b LEFT JOIN source_release r USING(release_id) WHERE r.release_id IS NULL").fetchone()[0],
        }
        con.execute("UPDATE pipeline_run SET finished_at=?, status='success', output_manifest=?, row_counts=?, quality_metrics=? WHERE run_id=?", [datetime.now(timezone.utc).isoformat(), canonical_json(outputs), canonical_json(row_counts), canonical_json(quality), run_id])
        con.execute("CHECKPOINT")
    finally:
        con.close()
    os.replace(tmp_name, path)
    export_archetypes(archetypes)
    _write_source_report(verification, row_counts)
    return {"run_id":run_id,"database":str(path),"row_counts":row_counts,"quality_metrics":quality,"outputs":outputs,"source_history_years":history["years"],"source_verification":verification}
