from market_engine.build import build_database
from market_engine.validation import validate_model


def test_build_and_validation() -> None:
    result = build_database()
    assert result["quality_metrics"]["source_checksum_failures"] == 0
    validation = validate_model()
    assert validation["status"] == "passed"

