import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_phase2_acceptance_report_has_required_case_counts_and_honest_guards() -> None:
    report = json.loads((ROOT / "reports/phase2_acceptance_results.json").read_text(encoding="utf-8"))
    summary = report["summary"]
    assert summary["status"] == "passed"
    assert summary["domain"] == {"total":24,"passed":24,"failed":0}
    assert summary["parent"]["total"] >= 10
    assert summary["parent"]["passed"] >= 10
    assert summary["parent"]["semantic_query_definitions"] == 10
    assert summary["cross_domain"]["total"] >= 10
    assert summary["cross_domain"]["failed"] == 0
    assert summary["cross_domain"]["estimated_passed"] == 10
    assert summary["activation"]["failures"] == []
    assert summary["feedback"]["diagnostics"]["published_model_unchanged"] is True
    assert all(case["status"] == "passed" for case in report["cross_domain_cases"])
    assert all(case["result"].get("independence_assumed") is False for case in report["cross_domain_cases"])
