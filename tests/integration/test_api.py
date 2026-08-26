import json
from pathlib import Path

from fastapi.testclient import TestClient

from market_engine.api.app import app


ROOT = Path(__file__).resolve().parents[2]
client = TestClient(app)


def test_vertical_slice_through_rest_api_and_explanation() -> None:
    query = json.loads((ROOT / "examples/queries/website_less_restaurant_owner_60s.json").read_text(encoding="utf-8"))
    response = client.post("/v1/estimate-segment", json=query)
    assert response.status_code == 200
    result = response.json()
    assert result["count_low"] == 130000
    assert result["count_base"] == 170000
    assert result["count_high"] == 210000
    assert result["primary_unit"] == "enterprise"
    assert result["confidence_grade"] == "D"
    explanation = client.get(f"/v1/estimates/{result['estimate_id']}/explain")
    assert explanation.status_code == 200
    assert explanation.json()["sources"]


def test_archetype_and_validation_api() -> None:
    listing = client.get("/v1/archetypes", params={"category":"small_business","limit":2})
    assert listing.status_code == 200
    assert listing.json()["total"] == 80
    detail = client.get("/v1/archetypes/ARC-06-001")
    assert detail.status_code == 200
    validation = client.get("/v1/validate")
    assert validation.json()["status"] == "passed"


def test_api_rejects_oversized_request_body_before_parsing() -> None:
    response = client.post(
        "/v1/estimate-segment",
        content=b"{" + (b" " * (1_048_576 + 1)) + b"}",
        headers={"content-type": "application/json"},
    )

    assert response.status_code == 413
    assert response.json()["detail"] == "request_body_too_large"


def test_api_rejects_blocked_declared_use_context() -> None:
    response = client.post("/v1/estimate-segment", json={
        "entity_unit": "enterprise",
        "use_context": "credit",
        "where": {"feature": "industry_code", "op": "eq", "value": "I56"},
    })

    assert response.status_code == 422
    assert response.json()["detail"] == "blocked use_context: credit"
