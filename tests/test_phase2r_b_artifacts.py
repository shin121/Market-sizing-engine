from __future__ import annotations

import json
from pathlib import Path

import duckdb

from market_engine.phase2r_b import OUTPUT_DIR, RANDOM_SEED, estimate_conditional_chain


ROOT = Path(__file__).resolve().parents[1]


def scalar(query: str) -> float:
    return duckdb.connect().execute(query).fetchone()[0]


def test_calibration_runs_converged_and_units_are_separate() -> None:
    path = OUTPUT_DIR / "calibration_run.parquet"
    con = duckdb.connect()
    assert con.execute(f"SELECT count(*) FROM read_parquet('{path}')").fetchone()[0] == 4
    assert con.execute(f"SELECT count(DISTINCT target_unit) FROM read_parquet('{path}')").fetchone()[0] == 4
    assert con.execute(f"SELECT bool_and(converged AND status='passed') FROM read_parquet('{path}')").fetchone()[0]
    assert con.execute(f"SELECT max(max_control_relative_error) < 1e-7 FROM read_parquet('{path}')").fetchone()[0]
    assert con.execute(f"SELECT min(effective_sample_size) > 100000 FROM read_parquet('{path}')").fetchone()[0]
    assert con.execute(f"SELECT count(*) FROM read_parquet('{OUTPUT_DIR / 'person_weights.parquet'}')").fetchone()[0] == 1_000_000


def test_all_required_market_outputs_are_numeric_and_complete() -> None:
    con = duckdb.connect()
    archetype = OUTPUT_DIR / "archetype_market_summary.parquet"
    subtype = OUTPUT_DIR / "subtype_market_summary.parquet"
    axis = OUTPUT_DIR / "axis_distribution.parquet"
    feature = OUTPUT_DIR / "feature_prevalence.parquet"
    behavior = OUTPUT_DIR / "behavior_prevalence.parquet"
    gold = OUTPUT_DIR / "gold_query_result.parquet"
    assert con.execute(f"SELECT count(DISTINCT archetype_id) FROM read_parquet('{archetype}')").fetchone()[0] == 1440
    assert con.execute(f"SELECT count(*) FROM read_parquet('{subtype}')").fetchone()[0] == 90
    assert con.execute(f"SELECT count(DISTINCT dimension_id) FROM read_parquet('{axis}')").fetchone()[0] == 384
    assert con.execute(f"SELECT count(*) FROM read_parquet('{feature}')").fetchone()[0] == 480
    assert con.execute(f"SELECT count(*) FROM read_parquet('{behavior}')").fetchone()[0] == 240
    assert con.execute(f"SELECT count(*) FROM read_parquet('{gold}')").fetchone()[0] == 10
    for path, low, base, high in (
        (archetype, "estimated_count_low", "estimated_count_base", "estimated_count_high"),
        (subtype, "count_low", "count_base", "count_high"),
        (axis, "count_low", "count_base", "count_high"),
        (feature, "count_low", "count_base", "count_high"),
        (behavior, "count_low", "count_base", "count_high"),
        (gold, "count_low", "count_base", "count_high"),
    ):
        assert con.execute(
            f"SELECT count(*)=count(*) FILTER (WHERE {low}<={base} AND {base}<={high}) FROM read_parquet('{path}')"
        ).fetchone()[0]


def test_exclusive_subtypes_reconcile_and_overlap_is_not_normalized() -> None:
    con = duckdb.connect()
    domain = OUTPUT_DIR / "domain_market_summary.parquet"
    subtype = OUTPUT_DIR / "subtype_market_summary.parquet"
    invalid = con.execute(
        f"""
        SELECT count(*) FROM (
          SELECT s.domain_id,abs(sum(s.share_base)-1) share_error,
                 abs(sum(s.count_base)-max(d.count_base)) count_error
          FROM read_parquet('{subtype}') s JOIN read_parquet('{domain}') d USING(domain_id)
          GROUP BY s.domain_id
        ) WHERE share_error>1e-9 OR count_error>1e-4
        """
    ).fetchone()[0]
    assert invalid == 0
    feature = OUTPUT_DIR / "feature_prevalence.parquet"
    # Feature membership is explicitly overlapping; a domain sum must not be
    # mechanically normalized to one.
    assert con.execute(
        f"SELECT count(*) FROM (SELECT domain_id,sum(prevalence_base) s FROM read_parquet('{feature}') GROUP BY 1) WHERE abs(s-1)>0.1"
    ).fetchone()[0] > 0


def test_gold_query_randomness_is_reproducible() -> None:
    factors = [("a", 0.2, 0.3, 0.5, None, None, None), ("b", 0.4, 0.6, 0.8, None, None, None)]
    first = estimate_conditional_chain(parent_count=1_000_000, factors=factors, seed=RANDOM_SEED)
    second = estimate_conditional_chain(parent_count=1_000_000, factors=factors, seed=RANDOM_SEED)
    assert first == second


def test_reports_disclose_coverage_without_not_estimable() -> None:
    report = json.loads((ROOT / "reports/phase2r_b_axis_feature_behavior_coverage.json").read_text(encoding="utf-8"))
    assert report["feature"]["not_estimable"] == 0
    assert report["behavior"]["not_estimable"] == 0
    gold = json.loads((ROOT / "reports/phase2r_b_gold_queries.json").read_text(encoding="utf-8"))
    assert gold["query_count"] == 10
    assert all(item["count_low"] <= item["count_base"] <= item["count_high"] for item in gold["queries"])
