import json
from pathlib import Path

from market_engine.services import estimate_segment_service


ROOT = Path(__file__).resolve().parents[2]


def test_five_primary_units_have_direct_or_vertical_estimates() -> None:
    expected = {
        "national_population.json": ("person", 51217221),
        "minors_0_18.json": ("child_person", 7324873),
        "all_households.json": ("household", 22997000),
        "all_establishments.json": ("establishment", 6353673),
        "all_enterprises.json": ("enterprise", 7642000),
    }
    for filename, (unit, base) in expected.items():
        query = json.loads((ROOT / "examples/queries" / filename).read_text(encoding="utf-8"))
        result = estimate_segment_service(query, persist=False)
        assert result["status"] == "estimated"
        assert result["primary_unit"] == unit
        assert result["count_base"] == base
        assert result["sources"]
