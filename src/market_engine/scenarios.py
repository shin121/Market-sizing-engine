from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .services import estimate_market, estimate_segment_service
from .paths import REPORT_DIR, ROOT


def run_example_scenarios() -> dict[str, Any]:
    query_path = ROOT / "examples/queries/website_less_restaurant_owner_60s.json"
    query = json.loads(query_path.read_text(encoding="utf-8"))
    saved = estimate_segment_service(query)
    paths = sorted((ROOT / "examples/scenarios").glob("website_service*.json"))
    results = []
    for path in paths:
        scenario = json.loads(path.read_text(encoding="utf-8"))
        results.append(estimate_market(saved["query_id"], scenario))
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    json_path = REPORT_DIR / "market_scenarios.json"
    json_path.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    lines = ["# TAM / SAM / SOM example scenarios", "", "Generated: 2026-08-24", "", "| Scenario | TAM entities Base | SAM entities Base | SOM entities Base | TAM revenue Base | SOM revenue Base |", "|---|---:|---:|---:|---:|---:|"]
    for result in results:
        lines.append(f"| {result['name']} | {result['tam_entities']['base']:,.0f} | {result['sam_entities']['base']:,.0f} | {result['som_entities']['base']:,.0f} | ₩{result['tam_revenue']['base']:,.0f} | ₩{result['som_revenue']['base']:,.0f} |")
    lines.extend(["", "All spend, serviceability, attainable-share, capacity, and ARPU values are explicit scenario inputs. Entity counts and revenue are not interchangeable.", ""])
    md_path = REPORT_DIR / "market_scenarios.md"
    md_path.write_text("\n".join(lines), encoding="utf-8")
    return {"scenario_count":len(results),"results":results,"reports":[str(json_path.relative_to(ROOT)),str(md_path.relative_to(ROOT))]}
