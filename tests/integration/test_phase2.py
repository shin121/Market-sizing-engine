import duckdb
from fastapi.testclient import TestClient

from market_engine.api.app import app
from market_engine.phase2 import PHASE2_DB
from market_engine.phase2_services import estimate_cross_domain_segment, validate_segmentation_model


client = TestClient(app)


def test_phase2_catalog_model_and_parent_integrity() -> None:
    con = duckdb.connect(str(PHASE2_DB),read_only=True)
    try:
        assert con.execute("SELECT count(*) FROM domain_registry WHERE active").fetchone()[0] == 24
        assert con.execute("SELECT min(n) FROM (SELECT domain_id,count(*) n FROM domain_dimension GROUP BY 1)").fetchone()[0] == 16
        assert con.execute("SELECT min(n) FROM (SELECT domain_id,count(*) n FROM domain_feature WHERE queryable GROUP BY 1)").fetchone()[0] == 20
        assert con.execute("SELECT min(n) FROM (SELECT domain_id,count(*) n FROM domain_behavior_template GROUP BY 1)").fetchone()[0] == 10
        assert con.execute("SELECT min(n) FROM (SELECT domain_id,count(*) n FROM domain_tag GROUP BY 1)").fetchone()[0] == 8
        assert con.execute("SELECT min(n) FROM (SELECT domain_id,count(*) n FROM archetype_hierarchy WHERE hierarchy_level=2 GROUP BY 1)").fetchone()[0] == 8
        assert con.execute("SELECT count(*) FROM parent_decomposition_decision").fetchone()[0] == 1440
        assert con.execute("SELECT count(*) FROM parent_decomposition_decision WHERE decision='eligible'").fetchone()[0] == 120
        assert con.execute("SELECT count(*) FROM required_parent_case").fetchone()[0] == 10
        assert con.execute("SELECT min(n),max(n) FROM (SELECT case_id,count(*) n FROM required_parent_case_allocation GROUP BY 1)").fetchone() >= (3,3)
        assert con.execute("SELECT max(abs(s-1)) FROM (SELECT case_id,sum(share_base) s FROM required_parent_case_allocation GROUP BY 1)").fetchone()[0] < 0.001
        assert con.execute("SELECT min(n),max(n) FROM (SELECT phase1_archetype_id,count(*) n FROM subtype_allocation GROUP BY 1)").fetchone() == (3,6)
        assert con.execute("SELECT max(abs(s-1)) FROM (SELECT phase1_archetype_id,sum(share_base) s FROM subtype_allocation GROUP BY 1)").fetchone()[0] < 0.001
        assert con.execute("""
            SELECT max(abs(a.children-p.count_base)/p.count_base)
            FROM (SELECT phase1_archetype_id,sum(count_base) children FROM subtype_allocation GROUP BY 1) a
            JOIN phase2_parent_estimate p USING(phase1_archetype_id)
        """).fetchone()[0] < 0.005
        assert con.execute("SELECT count(*) FROM phase2_acceptance_result WHERE case_type='domain' AND status='passed'").fetchone()[0] == 24
        assert con.execute("""
            SELECT count(*) FROM subtype_confidence
            WHERE population_confidence_grade IS NULL
               OR interpretation_confidence_grade IS NULL
               OR targetability_confidence_grade IS NULL
        """).fetchone()[0] == 0
        assert con.execute("""
            SELECT count(*) FROM subtype_profile
            WHERE observed_evidence_json IS NULL
               OR assumptions_json IS NULL
               OR inferred_profile_json IS NULL
               OR prohibited_inferences_json IS NULL
        """).fetchone()[0] == 0
    finally:
        con.close()


def test_phase2_rest_vertical_slices_and_model_validation() -> None:
    domains = client.get("/v2/domains")
    assert domains.status_code == 200
    assert domains.json()["total"] == 24
    filtered = client.get("/v2/domains",params={"coverage_status":"complete_with_evidence_constraints","entity_unit":"household"})
    assert filtered.status_code == 200
    assert filtered.json()["total"] > 0
    assert all(item["coverage_status"] == "complete_with_evidence_constraints" and item["primary_entity_unit"] == "household" for item in filtered.json()["items"])
    taxonomy = client.get("/v2/domains/music_audio/taxonomy")
    assert taxonomy.status_code == 200
    assert len(taxonomy.json()["dimensions"]) == 16
    assert len(taxonomy.json()["features"]) == 20
    decomposition = client.get("/v2/parents/ARC-06-001/decomposition")
    assert decomposition.status_code == 200
    value = decomposition.json()
    assert 3 <= len(value["subtypes"]) <= 8
    assert value["reconciliation"]["relative_error"] < 0.005
    subtype_id = value["subtypes"][0]["subtype_id"]
    brief = client.get(f"/v2/subtypes/{subtype_id}/creative-brief",params={"product_context":"managed_website_service"})
    assert brief.status_code == 200
    assert brief.json()["targetability"]["platform_claim_status"] == "unverified_do_not_claim"
    assert len(brief.json()["message_angles"]) >= 3
    assert len(brief.json()["offer_hypotheses"]) >= 2
    assert brief.json()["market_size"]["count"] is None
    assert validate_segmentation_model()["status"] == "passed"
    semantic = client.get("/v2/required-parent-cases/PARENT-02/decomposition")
    assert semantic.status_code == 200
    assert semantic.json()["evidence_status"] == "query_defined_exploratory_parent_not_official_prevalence"
    assert semantic.json()["reconciliation"]["relative_error"] < 0.005


def test_cross_domain_joint_and_unit_guard() -> None:
    same_unit = estimate_cross_domain_segment({"domains":["music_audio","video_ott"],"constraints":{"age_min":20,"age_max":29}})
    assert same_unit["status"] == "exploratory_joint_estimate"
    assert same_unit["joint_support"]["hard"] > 0
    assert same_unit["independence_assumed"] is False
    mixed = estimate_cross_domain_segment({"domains":["pets","travel_hospitality","mobility_automotive"],"constraints":{"age_min":30,"age_max":49},"output_unit":"household","semantic_conditions":["pet","travel","vehicle"],"scenario_overlay":{"low":0.05,"base":0.2,"high":0.5}})
    assert mixed["status"] == "exploratory_household_decision_maker_proxy"
    assert mixed["joint_support"]["hard"] > 0
    assert mixed["independence_assumed"] is False
    guarded = estimate_cross_domain_segment({"domains":["pets","travel_hospitality","mobility_automotive"],"constraints":{"age_min":30,"age_max":49}})
    assert guarded["status"] == "not_estimable"
    assert guarded["count"] is None
    assert guarded["independence_assumed"] is False
