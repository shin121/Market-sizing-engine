from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import duckdb

from .paths import EXPORT_DIR, REPORT_DIR, ROOT
from .phase2 import PHASE2_DB, PHASE2_VERSION, PHASE2_TABLES


def _jsonl(con: duckdb.DuckDBPyConnection, query: str, path: Path) -> int:
    cursor = con.execute(query)
    keys = [value[0] for value in cursor.description]
    rows = cursor.fetchall()
    values = []
    for row in rows:
        value = dict(zip(keys,row,strict=True))
        for key,item in list(value.items()):
            if key.endswith("_json") and isinstance(item,str):
                value[key.removesuffix("_json")] = json.loads(item)
                del value[key]
        values.append(value)
    path.write_text("".join(json.dumps(value,ensure_ascii=False,default=str,separators=(",",":"))+"\n" for value in values),encoding="utf-8")
    return len(rows)


def generate_phase2_reports() -> dict[str, Any]:
    REPORT_DIR.mkdir(parents=True,exist_ok=True)
    EXPORT_DIR.mkdir(parents=True,exist_ok=True)
    con = duckdb.connect(str(PHASE2_DB),read_only=True)
    outputs: dict[str,str] = {}
    try:
        csv_exports = {
            "phase2_domains.csv":"SELECT * FROM domain_registry ORDER BY domain_id",
            "phase2_dimensions.csv":"SELECT * FROM domain_dimension ORDER BY domain_id,sort_order",
            "phase2_features.csv":"SELECT * FROM domain_feature ORDER BY domain_id,domain_feature_id",
            "phase2_behaviors.csv":"SELECT * FROM domain_behavior_template ORDER BY domain_id,behavior_template_id",
            "phase2_model_registry.csv":"SELECT * EXCLUDE(feature_pipeline_json,sample_definition_json,stability_metrics_json) FROM segmentation_model ORDER BY domain_id",
            "phase2_subtypes.csv":"SELECT s.*,m.weighted_prevalence_low,m.weighted_prevalence_base,m.weighted_prevalence_high,m.effective_sample_size,m.entropy,m.stability_score,m.hard_support,c.total_score confidence_score,c.grade confidence_grade FROM subtype_definition s JOIN subtype_membership_summary m USING(subtype_id) JOIN subtype_confidence c USING(subtype_id) ORDER BY s.subtype_id",
            "phase2_parent_allocations.csv":"SELECT * FROM subtype_allocation ORDER BY phase1_archetype_id,subtype_id",
            "phase2_required_parent_cases.csv":"SELECT * FROM required_parent_case ORDER BY case_id",
            "phase2_required_parent_case_allocations.csv":"SELECT * FROM required_parent_case_allocation ORDER BY case_id,subtype_id",
            "phase2_subtype_confidence.csv":"SELECT * FROM subtype_confidence ORDER BY subtype_id",
            "phase2_domain_associations.csv":"SELECT * FROM domain_association ORDER BY domain_id_a,domain_id_b",
            "phase2_acceptance_results.csv":"SELECT case_id,case_type,domain_id,phase1_archetype_id,description,status,executed_at,model_version FROM phase2_acceptance_result ORDER BY case_type,case_id",
        }
        for filename,query in csv_exports.items():
            path = EXPORT_DIR / filename
            con.execute(f"COPY ({query}) TO '{path.as_posix()}' (HEADER, DELIMITER ',')")
            outputs[filename] = str(path.relative_to(ROOT))
        jsonl_exports = {
            "phase2_subtype_profiles.jsonl":"SELECT s.subtype_id,d.domain_code,s.name_ko,p.* EXCLUDE(subtype_id) FROM subtype_definition s JOIN domain_registry d USING(domain_id) JOIN subtype_profile p USING(subtype_id) ORDER BY s.subtype_id",
            "phase2_activation_profiles.jsonl":"SELECT s.subtype_id,d.domain_code,s.name_ko,a.* EXCLUDE(subtype_id) FROM subtype_definition s JOIN domain_registry d USING(domain_id) JOIN activation_mapping a USING(subtype_id) ORDER BY s.subtype_id",
            "phase2_models.jsonl":"SELECT d.domain_code,m.* EXCLUDE(domain_id) FROM segmentation_model m JOIN domain_registry d USING(domain_id) ORDER BY d.domain_code",
        }
        for filename,query in jsonl_exports.items():
            path = EXPORT_DIR / filename
            _jsonl(con,query,path)
            outputs[filename] = str(path.relative_to(ROOT))

        coverage_rows = con.execute("""
            SELECT d.domain_code,d.name_ko,d.primary_entity_unit,c.dimensions_count,c.queryable_features_count,
                   c.behavior_templates_count,c.tags_count,c.archetypes_count,c.allocated_parent_count,
                   c.acceptance_count,c.coverage_score,c.confidence_grade,c.gaps_json,m.algorithm,m.selected_k,m.sample_size,m.effective_sample_size
            FROM domain_registry d JOIN domain_coverage_audit c USING(domain_id)
            JOIN segmentation_model m USING(domain_id) ORDER BY d.domain_id
        """).fetchall()
        coverage_md = REPORT_DIR / "domain_coverage_matrix.md"
        lines = ["# Phase 2 domain coverage matrix","",f"Generated: {datetime.now(timezone.utc).isoformat()}","",
                 "| Domain | Unit | Axes | Features | Behaviors | Tags | Archetypes | Parents | Acceptance | Coverage | Model (k) | ESS | Gaps |",
                 "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---|"]
        for row in coverage_rows:
            gaps = ", ".join(json.loads(row[12])) or "none"
            lines.append(f"| {row[0]} | {row[2]} | {row[3]} | {row[4]} | {row[5]} | {row[6]} | {row[7]} | {row[8]} | {row[9]} | {row[10]:.3f} | {row[13]} ({row[14]}) | {row[16]:.1f} | {gaps} |")
        coverage_md.write_text("\n".join(lines)+"\n",encoding="utf-8")
        outputs[coverage_md.name] = str(coverage_md.relative_to(ROOT))

        association_rows = con.execute("""
            SELECT da.domain_code,db.domain_code,a.entity_unit,a.joint_prevalence_base,a.lift,
                   a.effective_sample_size,a.method_code,a.caveat
            FROM domain_association a JOIN domain_registry da ON a.domain_id_a=da.domain_id
            JOIN domain_registry db ON a.domain_id_b=db.domain_id ORDER BY a.lift DESC NULLS LAST
        """).fetchall()
        estimated = [row for row in association_rows if row[3] is not None]
        guarded = [row for row in association_rows if row[3] is None]
        association_md = REPORT_DIR / "cross_domain_association_report.md"
        lines = ["# Cross-domain association report","",f"Model version: `{PHASE2_VERSION}`","",
                 f"- Pair records: {len(association_rows)}",f"- Same-unit exploratory joints: {len(estimated)}",f"- Cross-unit guarded pairs: {len(guarded)}","",
                 "No pair uses an unobserved independence product. Same-unit registry values use weighted joint support on the same synthetic entity. Mixed-unit acceptance queries require an explicit output unit, a documented adult decision-maker bridge, and an E-grade semantic sensitivity overlay; otherwise they remain guarded.","",
                 "## Highest exploratory lifts with measured joint support","",
                 "| Domain A | Domain B | Unit | Joint share | Lift | ESS | Method |","|---|---|---|---:|---:|---:|---|"]
        for row in estimated[:30]:
            lines.append(f"| {row[0]} | {row[1]} | {row[2]} | {row[3]:.4f} | {row[4]:.3f} | {row[5]:.1f} | {row[6]} |")
        lines.extend(["","## Unit-guard rule","","Person, household, establishment, and enterprise signals are never combined silently. A generic mixed-unit query returns `not_estimable`; the ten versioned acceptance cases may use an explicit adult decision-maker/owner-operator proxy, official output-unit denominator, and wide scenario overlay. They never assert one person equals one household or enterprise.",""])
        association_md.write_text("\n".join(lines),encoding="utf-8")
        outputs[association_md.name] = str(association_md.relative_to(ROOT))

        models = con.execute("""
            SELECT d.domain_code,d.name_ko,m.algorithm,m.selected_k,m.sample_size,m.weighted_support,m.effective_sample_size,
                   m.feature_pipeline_json,m.sample_definition_json,m.stability_metrics_json,m.artifact_uri,m.artifact_sha256,
                   m.membership_uri,m.membership_sha256,min(c.hard_support),max(c.hard_support)
            FROM segmentation_model m JOIN domain_registry d USING(domain_id)
            JOIN cluster_definition c USING(segmentation_model_id)
            GROUP BY ALL ORDER BY d.domain_code
        """).fetchall()
        model_cards = REPORT_DIR / "phase2_model_cards.md"
        lines = ["# Phase 2 segmentation model cards","",f"Generated: {datetime.now(timezone.utc).isoformat()}","",
                 "All labels were assigned after clustering. Nemotron records are synthetic hypotheses, not observations of real people. Cluster input combines a revision-pinned multilingual MiniLM sentence embedding with Korean character n-grams, explicit 16-axis scores, and structured fields.",""]
        for row in models:
            pipeline = json.loads(row[7]); sample = json.loads(row[8]); stability = json.loads(row[9])
            combined = stability.get("combined_stability")
            embedding = pipeline.get("semantic_embedding",{})
            lines.extend([f"## {row[0]} — {row[1]}","",f"- Algorithm / k: `{row[2]}` / {row[3]}",f"- Sample / ESS: {row[4]:,} / {row[6]:.1f}",f"- Cluster hard-support range: {row[14]}–{row[15]}",f"- Combined stability: {combined:.3f}" if combined is not None else "- Combined stability: unavailable",f"- Semantic model: `{embedding.get('model_id')}` @ `{embedding.get('revision')}` ({embedding.get('dimension')}d, normalized={embedding.get('normalized')})",f"- Embedding cache: `{embedding.get('cache_uri')}` (`{embedding.get('cache_sha256')}`)",f"- Axis features: {len(pipeline.get('domain_axis_features',[]))}; extractor: {pipeline.get('axis_extractor')}",f"- Sample strata: {', '.join(sample.get('strata',[]))}",f"- Model artifact: `{row[10]}` (`{row[11]}`)",f"- Membership artifact: `{row[12]}` (`{row[13]}`)","- Known limits: synthetic-narrative transport, lexical axis extraction, and external behavioral validation; interpretation and targetability confidence remain separate from population confidence.",""])
        model_cards.write_text("\n".join(lines),encoding="utf-8")
        outputs[model_cards.name] = str(model_cards.relative_to(ROOT))

        counts = {table:con.execute(f"SELECT count(*) FROM {table}").fetchone()[0] for table in PHASE2_TABLES}
        summary = REPORT_DIR / "phase2_summary.md"
        summary.write_text("\n".join([
            "# Phase 2 implementation summary","",f"Model version: `{PHASE2_VERSION}`","",
            f"- Active domains: {counts['domain_registry']}",f"- Common-axis decisions: {counts['domain_dimension']}",
            f"- Queryable features: {counts['domain_feature']}",f"- Behavior templates: {counts['domain_behavior_template']}",
            f"- Non-additive tags: {counts['domain_tag']}",f"- Selected models: {counts['segmentation_model']}",
            f"- Primary subtypes: {counts['subtype_definition']}",f"- All-parent eligibility decisions: {counts['parent_decomposition_decision']}",
            f"- Eligible parent estimates: {counts['phase2_parent_estimate']}",f"- Parent-subtype allocations: {counts['subtype_allocation']}",
            f"- Exact semantic required-parent cases: {counts['required_parent_case']}",f"- Required-case subtype allocations: {counts['required_parent_case_allocation']}",
            f"- Pairwise association records: {counts['domain_association']}",f"- Activation profiles: {counts['activation_mapping']}",
            f"- Acceptance result records: {counts['phase2_acceptance_result']}","",
            "Phase 1 remains available in `market_engine.duckdb`; Phase 2 is an additive full copy in `market_engine_phase2.duckdb`. Required parent cases 2–10 use exact query definitions with disclosed E-grade scenario prevalence until external joint evidence is available.","",
        ]),encoding="utf-8")
        outputs[summary.name] = str(summary.relative_to(ROOT))
    finally:
        con.close()
    for audit_path in [REPORT_DIR / "phase2_dod_audit.json", ROOT / "docs/15_phase2_dod_audit.md"]:
        if audit_path.exists():
            outputs[audit_path.name] = str(audit_path.relative_to(ROOT))
    manifest = REPORT_DIR / "phase2_output_manifest.json"
    outputs[manifest.name] = str(manifest.relative_to(ROOT))
    manifest.write_text(json.dumps({"generated_at":datetime.now(timezone.utc).isoformat(),"model_version":PHASE2_VERSION,"outputs":outputs},ensure_ascii=False,indent=2),encoding="utf-8")
    return {"model_version":PHASE2_VERSION,"output_count":len(outputs),"outputs":outputs}
