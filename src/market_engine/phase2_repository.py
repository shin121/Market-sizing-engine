from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import duckdb

from .phase2 import PHASE2_DB, PHASE2_VERSION


def _decode(value: Any) -> Any:
    if isinstance(value, str):
        try:
            return json.loads(value)
        except (json.JSONDecodeError, TypeError):
            return value
    return value


class Phase2Repository:
    def __init__(self, path: str | Path = PHASE2_DB, *, read_only: bool = False) -> None:
        self.path = Path(path)
        if not self.path.exists():
            raise FileNotFoundError(f"Phase 2 database not built: {self.path}")
        self.connection = duckdb.connect(str(self.path), read_only=read_only)

    def close(self) -> None:
        self.connection.close()

    def domain(self, code_or_id: str) -> dict[str, Any] | None:
        row = self.connection.execute("""
            SELECT domain_id, domain_code, name_ko, description, primary_entity_unit,
                   category_code, coverage_status, active, minor_guardrail, version
            FROM domain_registry WHERE domain_code=? OR domain_id=?
        """, [code_or_id, code_or_id]).fetchone()
        if row is None:
            return None
        keys = ["domain_id","domain_code","name_ko","description","primary_entity_unit","category_code","coverage_status","active","minor_guardrail","version"]
        return dict(zip(keys,row,strict=True))

    def list_domains(self, *, active: bool | None = True, coverage_status: str | None = None, entity_unit: str | None = None) -> dict[str, Any]:
        rows = self.connection.execute("""
            SELECT d.domain_id,d.domain_code,d.name_ko,d.primary_entity_unit,d.category_code,d.coverage_status,d.active,d.minor_guardrail,
                   c.dimensions_count,c.queryable_features_count,c.behavior_templates_count,c.tags_count,
                   c.archetypes_count,c.allocated_parent_count,c.acceptance_count,c.coverage_score,c.confidence_grade,c.gaps_json,
                   m.selected_k,m.algorithm,m.sample_size,m.effective_sample_size
            FROM domain_registry d
            LEFT JOIN domain_coverage_audit c USING(domain_id)
            LEFT JOIN segmentation_model m USING(domain_id)
            WHERE (? IS NULL OR d.active = ?)
              AND (? IS NULL OR d.coverage_status = ?)
              AND (? IS NULL OR d.primary_entity_unit = ?)
            ORDER BY d.domain_id
        """, [active,active,coverage_status,coverage_status,entity_unit,entity_unit]).fetchall()
        keys = ["domain_id","domain_code","name_ko","primary_entity_unit","category_code","coverage_status","active","minor_guardrail","dimensions_count","queryable_features_count","behavior_templates_count","tags_count","archetypes_count","allocated_parent_count","acceptance_count","coverage_score","confidence_grade","gaps","selected_k","algorithm","sample_size","effective_sample_size"]
        items = [dict(zip(keys,row,strict=True)) for row in rows]
        for item in items:
            item["gaps"] = _decode(item["gaps"])
        return {"total":len(items),"model_version":PHASE2_VERSION,"items":items}

    def domain_taxonomy(self, code_or_id: str) -> dict[str, Any] | None:
        domain = self.domain(code_or_id)
        if domain is None:
            return None
        domain_id = domain["domain_id"]
        dimensions = self.connection.execute("SELECT axis_code,applicability,applicability_reason,allowed_values_json,sort_order FROM domain_dimension WHERE domain_id=? ORDER BY sort_order", [domain_id]).fetchall()
        features = self.connection.execute("SELECT feature_code,label_ko,data_type,allowed_values_json,observable_status,targetability_class,queryable FROM domain_feature WHERE domain_id=? ORDER BY domain_feature_id", [domain_id]).fetchall()
        tags = self.connection.execute("SELECT tag_code,tag_type,name_ko,overlap_allowed,additive,provenance FROM domain_tag WHERE domain_id=? ORDER BY tag_id", [domain_id]).fetchall()
        archetypes = self.connection.execute("SELECT hierarchy_id,name_ko,definition,rule_json FROM archetype_hierarchy WHERE domain_id=? AND hierarchy_level=2 ORDER BY hierarchy_id", [domain_id]).fetchall()
        source_rows = self.connection.execute("""
            SELECT DISTINCT r.release_id,s.publisher,s.dataset_title,s.official_url,s.source_tier,
                   fs.evidence_role,fs.locator,fs.claim_scope
            FROM domain_feature_source fs
            JOIN domain_feature f USING(domain_feature_id)
            LEFT JOIN source_release r USING(release_id)
            LEFT JOIN data_source s USING(source_id)
            WHERE f.domain_id=? ORDER BY r.release_id,fs.evidence_role
        """, [domain_id]).fetchall()
        return {
            "domain":domain,
            "dimensions":[{"axis_code":r[0],"applicability":r[1],"reason":r[2],"allowed_values":_decode(r[3]),"sort_order":r[4]} for r in dimensions],
            "features":[{"feature_code":r[0],"label_ko":r[1],"data_type":r[2],"allowed_values":_decode(r[3]),"observable_status":r[4],"targetability_class":r[5],"queryable":r[6]} for r in features],
            "tags":[{"tag_code":r[0],"tag_type":r[1],"name_ko":r[2],"overlap_allowed":r[3],"additive":r[4],"provenance":r[5]} for r in tags],
            "reusable_archetypes":[{"hierarchy_id":r[0],"name_ko":r[1],"definition":r[2],"rule":_decode(r[3])} for r in archetypes],
            "sources":[dict(zip(["release_id","publisher","dataset_title","official_url","source_tier","evidence_role","locator","claim_scope"],r,strict=True)) for r in source_rows],
        }

    def domain_behaviors(self, code_or_id: str) -> dict[str, Any] | None:
        domain = self.domain(code_or_id)
        if domain is None:
            return None
        rows = self.connection.execute("SELECT behavior_code,name_ko,definition,rule_json,targetability_class,evidence_status FROM domain_behavior_template WHERE domain_id=? ORDER BY behavior_template_id", [domain["domain_id"]]).fetchall()
        return {"domain":domain,"total":len(rows),"items":[{"behavior_code":r[0],"name_ko":r[1],"definition":r[2],"rule":_decode(r[3]),"targetability_class":r[4],"evidence_status":r[5]} for r in rows]}

    def domain_coverage(self, code_or_id: str) -> dict[str, Any] | None:
        domain = self.domain(code_or_id)
        if domain is None:
            return None
        row = self.connection.execute("SELECT * FROM domain_coverage_audit WHERE domain_id=?", [domain["domain_id"]]).fetchone()
        if row is None:
            return {"domain":domain,"status":"not_audited"}
        keys = [x[0] for x in self.connection.description]
        value = dict(zip(keys,row,strict=True))
        value["gaps_json"] = _decode(value["gaps_json"])
        return {"domain":domain,"audit":value}

    def list_subtypes(self, *, domain_code: str | None = None, parent_archetype_id: str | None = None) -> dict[str, Any]:
        if parent_archetype_id is None:
            rows = self.connection.execute("""
                SELECT s.subtype_id,d.domain_code,s.name_ko,s.definition,s.label_status,
                       m.weighted_prevalence_low,m.weighted_prevalence_base,m.weighted_prevalence_high,
                       m.effective_sample_size,m.stability_score,c.total_score,c.grade
                FROM subtype_definition s JOIN domain_registry d USING(domain_id)
                JOIN subtype_membership_summary m USING(subtype_id)
                JOIN subtype_confidence c USING(subtype_id)
                WHERE (? IS NULL OR d.domain_code=?) ORDER BY d.domain_code,s.subtype_id
            """,[domain_code,domain_code]).fetchall()
            keys = ["subtype_id","domain_code","name_ko","definition","label_status","domain_share_low","domain_share_base","domain_share_high","effective_sample_size","stability_score","confidence_score","confidence_grade"]
            return {"total":len(rows),"items":[dict(zip(keys,row,strict=True)) for row in rows]}
        where = ["(? IS NULL OR d.domain_code=?)", "(? IS NULL OR a.phase1_archetype_id=?)"]
        params: list[Any] = [domain_code,domain_code,parent_archetype_id,parent_archetype_id]
        rows = self.connection.execute(f"""
            SELECT DISTINCT s.subtype_id,d.domain_code,s.name_ko,s.definition,s.label_status,
                   m.weighted_prevalence_low,m.weighted_prevalence_base,m.weighted_prevalence_high,
                   m.effective_sample_size,m.stability_score,c.total_score,c.grade,
                   a.phase1_archetype_id,a.share_low,a.share_base,a.share_high,a.count_low,a.count_base,a.count_high
            FROM subtype_definition s JOIN domain_registry d USING(domain_id)
            JOIN subtype_membership_summary m USING(subtype_id)
            JOIN subtype_confidence c USING(subtype_id)
            LEFT JOIN subtype_allocation a USING(subtype_id)
            WHERE {' AND '.join(where)} ORDER BY d.domain_code,s.subtype_id,a.phase1_archetype_id
        """,params).fetchall()
        keys = ["subtype_id","domain_code","name_ko","definition","label_status","domain_share_low","domain_share_base","domain_share_high","effective_sample_size","stability_score","confidence_score","confidence_grade","parent_archetype_id","parent_share_low","parent_share_base","parent_share_high","count_low","count_base","count_high"]
        return {"total":len(rows),"items":[dict(zip(keys,row,strict=True)) for row in rows]}

    def subtype(self, subtype_id: str, parent_archetype_id: str | None = None) -> dict[str, Any] | None:
        row = self.connection.execute("""
            SELECT s.subtype_id,s.domain_id,d.domain_code,s.name_ko,s.definition,s.label_status,s.evidence_boundary,
                   m.weighted_prevalence_low,m.weighted_prevalence_base,m.weighted_prevalence_high,m.effective_sample_size,m.entropy,m.stability_score,m.hard_support,
                   c.population_confidence_score,c.population_confidence_grade,c.interpretation_confidence_score,c.interpretation_confidence_grade,c.targetability_confidence_score,c.targetability_confidence_grade,
                   c.source_quality_score,c.sample_support_score,c.stability_component_score,c.directness_score,c.validation_score,c.total_score,c.grade,c.interval_method,c.gaps_json,c.validation_plan_json,
                   p.observed_evidence_json,p.assumptions_json,p.inferred_profile_json,p.jobs_to_be_done_json,p.triggers_json,p.barriers_json,p.engagement_modes_json,p.creative_hypotheses_json,p.prohibited_inferences_json,
                   x.targetability_class,x.platform_claim_status,x.activation_payload_json,x.creative_brief_json,x.measurement_plan_json,x.exclusions_json
            FROM subtype_definition s JOIN domain_registry d USING(domain_id)
            JOIN subtype_membership_summary m USING(subtype_id)
            JOIN subtype_confidence c USING(subtype_id)
            JOIN subtype_profile p USING(subtype_id)
            JOIN activation_mapping x USING(subtype_id)
            WHERE s.subtype_id=?
        """, [subtype_id]).fetchone()
        if row is None:
            return None
        keys = ["subtype_id","domain_id","domain_code","name_ko","definition","label_status","evidence_boundary","domain_share_low","domain_share_base","domain_share_high","effective_sample_size","entropy","stability_score","hard_support","population_confidence_score","population_confidence_grade","interpretation_confidence_score","interpretation_confidence_grade","targetability_confidence_score","targetability_confidence_grade","source_quality_score","sample_support_score","stability_component_score","directness_score","validation_score","confidence_score","confidence_grade","interval_method","gaps","validation_plan","observed_evidence","assumptions","inferred_profile","jobs_to_be_done","triggers","barriers","engagement_modes","creative_hypotheses","prohibited_inferences","targetability_class","platform_claim_status","activation_payload","creative_brief","measurement_plan","exclusions"]
        value = dict(zip(keys,row,strict=True))
        for key in ("gaps","validation_plan","observed_evidence","assumptions","inferred_profile","jobs_to_be_done","triggers","barriers","engagement_modes","creative_hypotheses","prohibited_inferences","activation_payload","creative_brief","measurement_plan","exclusions"):
            value[key] = _decode(value[key])
        if parent_archetype_id:
            allocation = self.connection.execute("SELECT share_low,share_base,share_high,count_low,count_base,count_high,denominator_count_base,allocation_formula,conditional_method FROM subtype_allocation WHERE subtype_id=? AND phase1_archetype_id=?", [subtype_id,parent_archetype_id]).fetchone()
            if allocation is None:
                return None
            value["parent_allocation"] = dict(zip(["share_low","share_base","share_high","count_low","count_base","count_high","parent_count_base","formula","method"],allocation,strict=True))
        return value

    def decomposition(self, parent_archetype_id: str) -> dict[str, Any] | None:
        decision = self.connection.execute("SELECT domain_id,decision,rationale,required_evidence,reviewed_at FROM parent_decomposition_decision WHERE phase1_archetype_id=?", [parent_archetype_id]).fetchone()
        if decision is None:
            return None
        parent = self.connection.execute("""
            SELECT p.phase1_archetype_id,a.name_ko,p.entity_unit,p.status,p.count_low,p.count_base,p.count_high,
                   p.share_low,p.share_base,p.share_high,p.denominator_definition,p.formula,p.method_code,
                   p.source_release_ids_json,p.confidence_grade,p.validation_gaps_json
            FROM phase2_parent_estimate p JOIN archetype a ON p.phase1_archetype_id=a.archetype_id
            WHERE p.phase1_archetype_id=?
        """, [parent_archetype_id]).fetchone()
        result: dict[str, Any] = {"phase1_archetype_id":parent_archetype_id,"decision":{"domain_id":decision[0],"status":decision[1],"rationale":decision[2],"required_evidence":decision[3],"reviewed_at":decision[4]}}
        if parent is None:
            result["status"] = decision[1]
            result["subtypes"] = []
            return result
        parent_keys = ["phase1_archetype_id","name_ko","entity_unit","status","count_low","count_base","count_high","share_low","share_base","share_high","denominator","formula","method","source_release_ids","confidence_grade","validation_gaps"]
        result["parent"] = dict(zip(parent_keys,parent,strict=True))
        result["parent"]["source_release_ids"] = _decode(result["parent"]["source_release_ids"])
        result["parent"]["validation_gaps"] = _decode(result["parent"]["validation_gaps"])
        rows = self.connection.execute("""
            SELECT a.subtype_id,s.name_ko,a.share_low,a.share_base,a.share_high,a.count_low,a.count_base,a.count_high,
                   c.grade,c.total_score,x.targetability_class,x.platform_claim_status
            FROM subtype_allocation a JOIN subtype_definition s USING(subtype_id)
            JOIN subtype_confidence c USING(subtype_id) JOIN activation_mapping x USING(subtype_id)
            WHERE a.phase1_archetype_id=? ORDER BY a.subtype_id
        """, [parent_archetype_id]).fetchall()
        keys = ["subtype_id","name_ko","share_low","share_base","share_high","count_low","count_base","count_high","confidence_grade","confidence_score","targetability_class","platform_claim_status"]
        result["subtypes"] = [dict(zip(keys,row,strict=True)) for row in rows]
        result["reconciliation"] = {"share_base_sum":sum(row[3] for row in rows),"count_base_sum":sum(row[6] for row in rows),"parent_count_base":parent[5],"relative_error":abs(sum(row[6] for row in rows)-parent[5])/parent[5]}
        result["overlapping_tags_warning"] = "태그는 별도 비가산 저장이며 primary subtype 수치에 더할 수 없습니다."
        return result

    def association(self, code_a: str, code_b: str) -> dict[str, Any] | None:
        domains = [self.domain(code_a),self.domain(code_b)]
        if any(value is None for value in domains):
            return None
        a,b = sorted([domains[0]["domain_id"],domains[1]["domain_id"]])
        row = self.connection.execute("SELECT * FROM domain_association WHERE domain_id_a=? AND domain_id_b=?", [a,b]).fetchone()
        if row is None:
            return None
        keys = [x[0] for x in self.connection.description]
        return dict(zip(keys,row,strict=True))
