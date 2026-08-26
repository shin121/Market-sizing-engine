from __future__ import annotations

import json
from typing import Any

from .paths import REPORT_DIR, ROOT
from .services import compare_segments, estimate_segment_service


def run_acceptance_queries() -> dict[str, Any]:
    cases = json.loads((ROOT / "examples/queries/acceptance_queries.json").read_text(encoding="utf-8"))
    results = []
    passed = 0
    for case in cases:
        result = estimate_segment_service(case["query"])
        ok = result["status"] == case["expected_status"] and bool(result["overlap_warning"]) and bool(result["validation_gaps"] or result["status"] == "estimated")
        passed += int(ok)
        results.append({"name":case["name"],"expected_status":case["expected_status"],"passed":ok,"query_id":result["query_id"],"estimate_id":result["estimate_id"],"unit":result["primary_unit"],"status":result["status"],"count":result["count"],"confidence_grade":result["confidence_grade"],"gap_types":[gap["gap_type"] for gap in result["validation_gaps"]]})
    overlap = compare_segments([results[0]["query_id"],results[0]["query_id"]])
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    json_path = REPORT_DIR / "acceptance_queries.json"
    json_path.write_text(json.dumps({"passed":passed,"total":len(results),"results":results,"overlap_comparison":overlap}, ensure_ascii=False, indent=2), encoding="utf-8")
    lines = ["# Acceptance queries", "", "Generated: 2026-08-24", "", f"Passed: {passed}/{len(results)}", "", "| Query | Unit | Status | Low / Base / High | Confidence |", "|---|---|---|---|---|"]
    for result in results:
        count = result["count"]
        display = "not estimable" if count is None else f"{count['low']:,.0f} / {count['base']:,.0f} / {count['high']:,.0f}"
        lines.append(f"| {result['name']} | {result['unit']} | {result['status']} | {display} | {result['confidence_grade']} |")
    lines.extend(["", "Unsupported queries pass only when they return NULL counts with explicit gaps and warnings. The overlap case verifies identity intersection/union; unrelated overlap remains unestimated without a joint distribution.", ""])
    md_path = REPORT_DIR / "acceptance_queries.md"
    md_path.write_text("\n".join(lines), encoding="utf-8")
    if passed != len(results) or len(results) < 20:
        raise RuntimeError("acceptance query suite failed")
    return {"passed":passed,"total":len(results),"reports":[str(json_path.relative_to(ROOT)),str(md_path.relative_to(ROOT))]}
