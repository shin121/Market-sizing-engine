from __future__ import annotations

import csv
from typing import Any

import duckdb

from .io import load_json_yaml
from .paths import CONFIG_DIR, EXPORT_DIR, PROCESSED_DIR, REPORT_DIR, ROOT


def _school_stage(age: int) -> str:
    if age <= 2:
        return "infant"
    if age <= 5:
        return "preschool"
    if age <= 11:
        return "elementary_age"
    if age <= 14:
        return "middle_school_age"
    if age <= 17:
        return "high_school_age"
    return "age_18_transition"


def synthesize_minors_households() -> dict[str, Any]:
    config = load_json_yaml(CONFIG_DIR / "minor_controls.yml")
    counts = config["exact_age_counts"]
    if len(counts) != 19:
        raise ValueError("minor controls must contain ages 0 through 18")
    sample_by_age = [round(value / 100) for value in counts]
    child_sample_n = sum(sample_by_age)
    household_sample_n = round(config["households_with_children_18_or_younger"] / 100)
    extra_children = child_sample_n - household_sample_n
    if extra_children < 0 or extra_children > household_sample_n:
        raise ValueError("current deterministic one/two-child sample cannot satisfy controls")
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    EXPORT_DIR.mkdir(parents=True, exist_ok=True)
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect()
    con.execute("CREATE TABLE minor_cells(exact_age INTEGER, school_stage VARCHAR, count_low DOUBLE, count_base DOUBLE, count_high DOUBLE, source_release_id VARCHAR, period VARCHAR, method_code VARCHAR)")
    con.executemany("INSERT INTO minor_cells VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [
        (age, _school_stage(age), value, value, value, config["source_release_id"], config["reference_period"], "official_direct")
        for age, value in enumerate(counts)
    ])
    con.execute(f"""
        CREATE TABLE child_households AS
        SELECT printf('SHH-%07d', i + 1) AS synthetic_household_key,
               CASE WHEN i < {extra_children} THEN 2 ELSE 1 END AS child_count,
               100.0::DOUBLE AS household_weight,
               CASE i % 3 WHEN 0 THEN 'two_guardian' WHEN 1 THEN 'single_guardian' ELSE 'multigenerational' END AS household_type,
               CASE i % 2 WHEN 0 THEN 'dual_income_synthetic' ELSE 'synthetic_unobserved' END AS dual_income_status,
               CASE i % 5 WHEN 0 THEN 'capital' WHEN 1 THEN 'central' WHEN 2 THEN 'honam' WHEN 3 THEN 'yeongnam' ELSE 'other' END AS geography_cluster,
               'synthetic_link_not_observed' AS provenance
        FROM range({household_sample_n}) t(i)
    """)
    con.execute("CREATE TABLE age_sample_control(exact_age INTEGER, target DOUBLE, sample_n INTEGER, school_stage VARCHAR)")
    con.executemany("INSERT INTO age_sample_control VALUES (?, ?, ?, ?)", [(age, target, n, _school_stage(age)) for age, (target, n) in enumerate(zip(counts, sample_by_age, strict=True))])
    con.execute(f"""
        CREATE TABLE minor_household_links AS
        WITH expanded AS (
          SELECT c.exact_age, c.school_stage, c.target / c.sample_n AS person_weight,
                 row_number() OVER (ORDER BY c.exact_age, r.i) AS child_index
          FROM age_sample_control c, LATERAL range(c.sample_n) r(i)
        ), assigned AS (
          SELECT *, CASE WHEN child_index <= {household_sample_n} THEN child_index ELSE child_index - {household_sample_n} END AS household_index
          FROM expanded
        )
        SELECT printf('SMN-%07d', child_index) AS synthetic_minor_key,
               printf('SHH-%07d', household_index) AS synthetic_household_key,
               printf('SGD-%07d', household_index) AS synthetic_guardian_key,
               exact_age, school_stage, person_weight,
               'synthetic_minor_no_real_identity' AS provenance
        FROM assigned
    """)
    paths = {
        "minor_cells": PROCESSED_DIR / "minor_population_cells.parquet",
        "child_households": PROCESSED_DIR / "synthetic_child_households.parquet",
        "links": PROCESSED_DIR / "synthetic_minor_household_links.parquet",
    }
    tables = {"minor_cells":"minor_cells", "child_households":"child_households", "links":"minor_household_links"}
    for key, path in paths.items():
        table = tables[key]
        con.execute(f"COPY {table} TO '{path.as_posix()}' (FORMAT PARQUET, COMPRESSION ZSTD)")
    weighted_children = con.execute("SELECT sum(person_weight) FROM minor_household_links").fetchone()[0]
    weighted_households = con.execute("SELECT sum(household_weight) FROM child_households").fetchone()[0]
    orphan_count = con.execute("SELECT count(*) FROM minor_household_links l LEFT JOIN child_households h USING(synthetic_household_key) WHERE h.synthetic_household_key IS NULL").fetchone()[0]
    rare_cells = con.execute("SELECT count(*) FROM minor_cells WHERE count_base < 10").fetchone()[0]
    con.close()
    age_csv = EXPORT_DIR / "minor_exact_age_controls.csv"
    with age_csv.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["exact_age","school_stage","count","source_release_id","reference_period"])
        for age, value in enumerate(counts):
            writer.writerow([age, _school_stage(age), value, config["source_release_id"], config["reference_period"]])
    target_children = sum(counts)
    target_households = config["households_with_children_18_or_younger"]
    metrics = {
        "exact_age_cells":19, "synthetic_minor_records":child_sample_n,
        "synthetic_child_households":household_sample_n, "synthetic_links":child_sample_n,
        "official_minor_total":target_children, "weighted_minor_total":weighted_children,
        "minor_relative_error":abs(weighted_children-target_children)/target_children,
        "official_child_households":target_households, "weighted_child_households":weighted_households,
        "household_relative_error":abs(weighted_households-target_households)/target_households,
        "orphan_links":orphan_count, "rare_official_cells_below_10":rare_cells,
        "runtime_rare_output_suppression_scope": {
            "policy_version": "rare-output-v1",
            "weighted_base_threshold": 10,
            "python_derived_units": ["person", "child_person", "household"],
            "web_query_snapshot_units": ["person", "child_person", "household"],
            "official_direct_control_ingestion_exempt": True,
            "business_units_exempt": True,
            "shared_baseline_read_model_redaction": False,
        },
    }
    report = REPORT_DIR / "minor_household_synthesis.md"
    report.write_text("\n".join([
        "# Minor population and household synthesis", "", "Generated: 2026-08-24", "",
        "## Reconciliation", "",
        f"- Official age 0–18 residents: {target_children:,}; weighted synthetic total: {weighted_children:,.0f}; error: {metrics['minor_relative_error']:.6%}.",
        f"- Official households with children age ≤18: {target_households:,}; weighted sample total: {weighted_households:,.0f}; error: {metrics['household_relative_error']:.6%}.",
        f"- Exact-age cells: 19; synthetic minor links: {child_sample_n:,}; child-household samples: {household_sample_n:,}; orphan links: {orphan_count}.",
        "", "## Method and safety", "",
        "The minor frame uses direct age-specific 2024-12 resident-registration controls. It is a 1:100 weighted synthetic sample linked to a separately controlled 2024 Census child-household frame. Cross-source universe/date differences are preserved.",
        "Household type, region cluster, dual-income marker, guardian keys, and within-household sibling assignment are synthetic constructs, not observed joints. They must not support claims about real families. There are no names, addresses, contact details, device identifiers, or real child identities.",
        "School stage is age-derived and therefore not enrollment status. Derived person, child_person, and household estimates with weighted Base below 10 are suppressed in the Python estimator and in workspace-owned web query snapshots. Official direct controls remain immutable; an exact web reuse is wrapped in a separate redacted query snapshot. Business units and the general shared-baseline read model are outside this targeted release wrapper, so this is not a claim of universal disclosure control. The published national age cells have no below-10 cell.",
        "", "## Known gaps", "",
        "- Official child-count × household-type × guardian-structure joint distribution is not ingested.",
        "- Dual-income and geography values in the synthetic link file are not calibrated and are non-queryable for factual estimates.",
        "- Resident-registration minors exclude foreigners, while Census household controls use a different universe.", "",
    ]), encoding="utf-8")
    return {"metrics":metrics,"outputs":{key:str(path.relative_to(ROOT)) for key,path in paths.items()},"report":str(report.relative_to(ROOT))}
