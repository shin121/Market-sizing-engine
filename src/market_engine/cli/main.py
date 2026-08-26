from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any

from market_engine.build import build_database
from market_engine.archetypes import build_archetypes
from market_engine.calibration import calibrate_adults, verify_nemotron
from market_engine.estimation import estimate_segment
from market_engine.io import load_json_yaml
from market_engine.market_sizing import estimate_market
from market_engine.repository import EngineRepository
from market_engine.synthesis import synthesize_minors_households
from market_engine.services import compare_segments, estimate_market as estimate_market_saved, estimate_segment_service, explain_estimate, refresh_source, validate_model
from market_engine.pipeline import full_build
from market_engine.reporting import generate_quality_reports
from market_engine.scenarios import run_example_scenarios
from market_engine.acceptance import run_acceptance_queries
from market_engine.phase2 import PHASE2_DB, build_phase2_database
from market_engine.phase2_reporting import generate_phase2_reports
from market_engine.postgres_backfill import (
    DEFAULT_MANIFEST_JSON,
    DEFAULT_MANIFEST_MD,
    backfill_postgres,
)
from market_engine.phase2_services import (
    compare_subtypes, decompose_required_parent_case, decompose_segment, estimate_cross_domain_segment,
    estimate_domain_segment, estimate_subtype, explain_cross_domain_association,
    explain_subtype, generate_creative_brief, get_domain_behaviors,
    get_domain_coverage, get_domain_taxonomy, get_subtype_profile,
    get_targetability, list_domains, list_subtypes, record_observation,
    update_posterior, update_subtype_posterior, validate_segmentation_model,
)


def _load(path: str) -> dict[str, Any]:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def _print(value: Any) -> None:
    print(json.dumps(value, ensure_ascii=False, indent=2, default=str))


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(prog="market-engine")
    sub = root.add_subparsers(dest="command", required=True)
    sub.add_parser("build", help="verify registered raw sources and build DuckDB/Parquet outputs")
    calibrate = sub.add_parser("calibrate-adults", help="verify and calibrate Nemotron adult records")
    calibrate.add_argument("--skip-checksums", action="store_true")
    sub.add_parser("verify-nemotron", help="verify all nine Nemotron shard checksums")
    sub.add_parser("build-archetypes", help="generate the overlapping archetype catalog and estimate-status records")
    sub.add_parser("synthesize-minors", help="build exact-age minor controls and privacy-safe synthetic household links")
    sub.add_parser("full-build", help="run all deterministic data, calibration, synthesis, reports, and validation steps")
    sub.add_parser("reports", help="regenerate reconciliation and quality reports")
    sub.add_parser("phase2-reports", help="regenerate Phase 2 exports, coverage, associations, and model cards")
    sub.add_parser("run-scenarios", help="execute all example TAM/SAM/SOM scenarios")
    sub.add_parser("run-acceptance", help="execute the 20 representative market queries")
    phase2_build = sub.add_parser("build-phase2", help="build the additive 24-domain subtype database")
    phase2_build.add_argument("--force-models", action="store_true")
    phase2_build.add_argument("--sample-size", type=int, default=1000)
    estimate = sub.add_parser("estimate", help="estimate a segment from a JSON DSL query")
    estimate.add_argument("--query", required=True)
    market = sub.add_parser("market-size", help="calculate TAM/SAM/SOM for a query and scenario")
    market.add_argument("--query")
    market.add_argument("--query-id")
    market.add_argument("--scenario", required=True)
    validate = sub.add_parser("validate", help="run model integrity checks")
    validate.add_argument("--model-version", default="latest")
    get_arc = sub.add_parser("get-archetype", help="get an archetype and its estimate status")
    get_arc.add_argument("archetype_id")
    list_arc = sub.add_parser("archetypes", aliases=["list-archetypes"], help="list/filter archetypes")
    list_arc.add_argument("--category")
    list_arc.add_argument("--unit")
    list_arc.add_argument("--status")
    list_arc.add_argument("--confidence-min", type=int, default=0)
    list_arc.add_argument("--limit", type=int, default=100)
    list_arc.add_argument("--offset", type=int, default=0)
    compare = sub.add_parser("compare", help="compare saved query IDs with overlap-safe bounds")
    compare.add_argument("query_ids", nargs="+")
    explain = sub.add_parser("explain", help="explain a saved estimate ID")
    explain.add_argument("estimate_id")
    refresh = sub.add_parser("refresh-source", help="verify one source or all registered sources")
    refresh.add_argument("source_id", nargs="?", default="all")
    domains = sub.add_parser("domains", help="list Phase 2 domain coverage and selected models")
    domains.add_argument("--all", action="store_true")
    domains.add_argument("--coverage-status")
    domains.add_argument("--entity-unit")
    taxonomy = sub.add_parser("domain-taxonomy", help="get one domain's 16 axes, features, tags, and sources")
    taxonomy.add_argument("domain_code")
    coverage = sub.add_parser("domain-coverage", help="get one domain's coverage audit")
    coverage.add_argument("domain_code")
    behaviors = sub.add_parser("domain-behaviors", help="list one domain's behavior templates")
    behaviors.add_argument("domain_code")
    domain_estimate = sub.add_parser("estimate-domain", help="estimate an exploratory domain-axis segment")
    domain_estimate.add_argument("domain_code")
    domain_estimate.add_argument("--conditions", required=True, help="JSON file containing a list of feature_code/value objects")
    domain_estimate.add_argument("--parent")
    cross = sub.add_parser("cross-domain", help="estimate a same-unit cross-domain joint from JSON")
    cross.add_argument("--query", required=True)
    association = sub.add_parser("explain-association", help="explain one pairwise cross-domain association")
    association.add_argument("domain_code_a")
    association.add_argument("domain_code_b")
    cross_explain = sub.add_parser("explain-cross-query", help="explain a stored CROSS-* acceptance query")
    cross_explain.add_argument("query_id")
    decompose = sub.add_parser("decompose", help="decompose one Phase 1 parent into primary subtypes")
    decompose.add_argument("parent_archetype_id")
    decompose.add_argument("--product-context")
    decompose.add_argument("--mode", choices=["primary","with_tags"], default="primary")
    required_decompose = sub.add_parser("decompose-required-case", help="decompose one of the ten semantic Phase 2 parent cases")
    required_decompose.add_argument("case_id")
    subtype_list = sub.add_parser("subtypes", help="list Phase 2 primary subtypes")
    subtype_list.add_argument("--domain")
    subtype_list.add_argument("--parent")
    subtype_estimate = sub.add_parser("estimate-subtype", help="get subtype prevalence or a parent allocation")
    subtype_estimate.add_argument("subtype_id")
    subtype_estimate.add_argument("--parent")
    subtype_estimate.add_argument("--geography", default="KR")
    subtype_estimate.add_argument("--as-of", default="latest")
    subtype_compare = sub.add_parser("compare-subtypes", help="compare two or more primary subtypes")
    subtype_compare.add_argument("subtype_ids", nargs="+")
    subtype_compare.add_argument("--parent")
    profile = sub.add_parser("subtype-profile", help="get observed/inferred subtype profile fields")
    profile.add_argument("subtype_id")
    brief = sub.add_parser("creative-brief", help="generate a guarded subtype creative brief")
    brief.add_argument("subtype_id")
    brief.add_argument("--product-context")
    subtype_explain = sub.add_parser("explain-subtype", help="explain subtype evidence, intervals, and gaps")
    subtype_explain.add_argument("subtype_id")
    subtype_explain.add_argument("--parent")
    targetability = sub.add_parser("targetability", help="get activation class and prohibited-use warnings")
    targetability.add_argument("subtype_id")
    targetability.add_argument("--channel")
    observation = sub.add_parser("record-observation", help="record an aggregate, non-personal subtype observation")
    observation.add_argument("--payload", required=True)
    posterior = sub.add_parser("update-posterior", help="run a conservative beta-binomial feedback update")
    posterior.add_argument("observation_id")
    subtype_posterior = sub.add_parser("update-subtype-posterior", help="update from the latest aggregate observation for a subtype or parent")
    subtype_posterior_group = subtype_posterior.add_mutually_exclusive_group(required=True)
    subtype_posterior_group.add_argument("--subtype")
    subtype_posterior_group.add_argument("--parent")
    model_validate = sub.add_parser("validate-segmentation", help="validate Phase 2 model artifacts and cluster integrity")
    model_validate.add_argument("--domain")
    postgres = sub.add_parser(
        "postgres-backfill",
        help="transactionally load or verify the immutable DuckDB baseline in canonical PostgreSQL tables",
    )
    postgres.add_argument(
        "--database-url",
        default=os.environ.get("MARKET_ENGINE_DATABASE_URL") or os.environ.get("DATABASE_URL"),
        help="PostgreSQL DSN (defaults to MARKET_ENGINE_DATABASE_URL or DATABASE_URL)",
    )
    postgres.add_argument("--duckdb", type=Path, default=PHASE2_DB)
    postgres.add_argument("--manifest-json", type=Path, default=DEFAULT_MANIFEST_JSON)
    postgres.add_argument("--manifest-markdown", type=Path, default=DEFAULT_MANIFEST_MD)
    postgres.add_argument("--verify-only", action="store_true")
    return root


def main(argv: list[str] | None = None) -> None:
    args = parser().parse_args(argv)
    if args.command == "build":
        _print(build_database())
    elif args.command == "calibrate-adults":
        _print(calibrate_adults(verify_checksums=not args.skip_checksums))
    elif args.command == "verify-nemotron":
        _print(verify_nemotron())
    elif args.command == "build-archetypes":
        _print(build_archetypes())
    elif args.command == "synthesize-minors":
        _print(synthesize_minors_households())
    elif args.command == "full-build":
        _print(full_build())
    elif args.command == "reports":
        _print(generate_quality_reports())
    elif args.command == "phase2-reports":
        _print(generate_phase2_reports())
    elif args.command == "run-scenarios":
        _print(run_example_scenarios())
    elif args.command == "run-acceptance":
        _print(run_acceptance_queries())
    elif args.command == "build-phase2":
        _print(build_phase2_database(force_models=args.force_models, sample_size=args.sample_size))
    elif args.command == "estimate":
        _print(estimate_segment_service(_load(args.query)))
    elif args.command == "market-size":
        scenario = _load(args.scenario)
        if args.query_id:
            _print(estimate_market_saved(args.query_id, scenario))
        else:
            query_path = args.query or scenario["query"]
            audience = estimate_segment(_load(query_path))
            _print(estimate_market(audience, scenario))
    elif args.command == "validate":
        result = validate_model()
        _print(result)
        if result["status"] != "passed":
            raise SystemExit(1)
    elif args.command == "get-archetype":
        repo = EngineRepository()
        try:
            value = repo.get_archetype(args.archetype_id)
            if value is None:
                raise SystemExit(f"unknown archetype: {args.archetype_id}")
            _print(value)
        finally:
            repo.close()
    elif args.command in {"archetypes", "list-archetypes"}:
        repo = EngineRepository()
        try:
            _print(repo.list_archetypes(category=args.category, unit=args.unit, status=args.status, confidence_min=args.confidence_min, limit=args.limit, offset=args.offset))
        finally:
            repo.close()
    elif args.command == "compare":
        _print(compare_segments(args.query_ids))
    elif args.command == "explain":
        _print(explain_estimate(args.estimate_id))
    elif args.command == "refresh-source":
        _print(refresh_source(args.source_id))
    elif args.command == "domains":
        _print(list_domains(active=None if args.all else True,coverage_status=args.coverage_status,entity_unit=args.entity_unit))
    elif args.command == "domain-taxonomy":
        _print(get_domain_taxonomy(args.domain_code))
    elif args.command == "domain-coverage":
        _print(get_domain_coverage(args.domain_code))
    elif args.command == "domain-behaviors":
        _print(get_domain_behaviors(args.domain_code))
    elif args.command == "estimate-domain":
        conditions = json.loads(Path(args.conditions).read_text(encoding="utf-8"))
        _print(estimate_domain_segment(args.domain_code,conditions,parent_archetype_id=args.parent))
    elif args.command == "cross-domain":
        _print(estimate_cross_domain_segment(_load(args.query)))
    elif args.command == "explain-association":
        _print(explain_cross_domain_association(args.domain_code_a,args.domain_code_b))
    elif args.command == "explain-cross-query":
        _print(explain_cross_domain_association(args.query_id))
    elif args.command == "decompose":
        _print(decompose_segment(args.parent_archetype_id,product_context=args.product_context,mode=args.mode))
    elif args.command == "decompose-required-case":
        _print(decompose_required_parent_case(args.case_id))
    elif args.command == "subtypes":
        _print(list_subtypes(domain_code=args.domain,parent_archetype_id=args.parent))
    elif args.command == "estimate-subtype":
        _print(estimate_subtype(args.subtype_id,parent_archetype_id=args.parent,geography=args.geography,as_of=args.as_of))
    elif args.command == "compare-subtypes":
        _print(compare_subtypes(args.subtype_ids,parent_archetype_id=args.parent))
    elif args.command == "subtype-profile":
        _print(get_subtype_profile(args.subtype_id))
    elif args.command == "creative-brief":
        _print(generate_creative_brief(args.subtype_id,product_context=args.product_context))
    elif args.command == "explain-subtype":
        _print(explain_subtype(args.subtype_id,parent_archetype_id=args.parent))
    elif args.command == "targetability":
        _print(get_targetability(args.subtype_id,channel=args.channel))
    elif args.command == "record-observation":
        _print(record_observation(_load(args.payload)))
    elif args.command == "update-posterior":
        _print(update_posterior(args.observation_id))
    elif args.command == "update-subtype-posterior":
        _print(update_subtype_posterior(subtype_id=args.subtype,parent_archetype_id=args.parent))
    elif args.command == "validate-segmentation":
        result = validate_segmentation_model(args.domain)
        _print(result)
        if result["status"] != "passed":
            raise SystemExit(1)
    elif args.command == "postgres-backfill":
        if not args.database_url:
            raise SystemExit(
                "PostgreSQL DSN required: pass --database-url or set MARKET_ENGINE_DATABASE_URL/DATABASE_URL"
            )
        _print(
            backfill_postgres(
                args.database_url,
                duckdb_path=args.duckdb,
                manifest_json=args.manifest_json,
                manifest_markdown=args.manifest_markdown,
                verify_only=args.verify_only,
            )
        )


if __name__ == "__main__":
    main()
