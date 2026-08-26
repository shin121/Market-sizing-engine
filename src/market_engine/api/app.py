from __future__ import annotations

from typing import Any

from fastapi import FastAPI, HTTPException
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

from market_engine.estimation import estimate_segment
from market_engine.repository import EngineRepository
from market_engine.services import compare_segments, estimate_market as estimate_market_service, estimate_segment_service, explain_estimate, refresh_source, validate_model
from market_engine.phase2_services import (
    compare_subtypes, decompose_required_parent_case, decompose_segment, estimate_cross_domain_segment,
    estimate_domain_segment, estimate_subtype, explain_cross_domain_association,
    explain_subtype, generate_creative_brief, get_domain_behaviors,
    get_domain_coverage, get_domain_taxonomy, get_subtype_profile,
    get_targetability, list_domains, list_subtypes, record_observation,
    update_posterior, update_subtype_posterior, validate_segmentation_model,
)

MAX_REQUEST_BODY_BYTES = 1_048_576


class RequestBodyLimitMiddleware:
    """Reject oversized bodies before FastAPI attempts JSON/model parsing."""

    def __init__(self, app: ASGIApp, max_bytes: int = MAX_REQUEST_BODY_BYTES) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def _reject(self, scope: Scope, receive: Receive, send: Send) -> None:
        response = JSONResponse(status_code=413, content={"detail": "request_body_too_large"})
        await response(scope, receive, send)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        for raw_name, raw_value in scope.get("headers", []):
            if raw_name.lower() != b"content-length":
                continue
            try:
                declared_length = int(raw_value)
            except ValueError:
                break
            if declared_length > self.max_bytes:
                await self._reject(scope, receive, send)
                return
            break

        chunks: list[bytes] = []
        byte_length = 0
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            if message["type"] != "http.request":
                continue
            chunk = message.get("body", b"")
            byte_length += len(chunk)
            if byte_length > self.max_bytes:
                await self._reject(scope, receive, send)
                return
            chunks.append(chunk)
            if not message.get("more_body", False):
                break

        body = b"".join(chunks)
        replayed = False

        async def replay_receive() -> dict[str, Any]:
            nonlocal replayed
            if not replayed:
                replayed = True
                return {"type": "http.request", "body": body, "more_body": False}
            return await receive()

        await self.app(scope, replay_receive, send)


app = FastAPI(title="Korea Market Sizing Engine", version="0.1.0")
app.add_middleware(RequestBodyLimitMiddleware)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status":"ok"}


@app.post("/v1/estimate-segment")
def estimate_endpoint(query: dict[str, Any]) -> dict[str, Any]:
    try:
        return estimate_segment_service(query)
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.get("/v1/validate")
def validate_endpoint() -> dict[str, Any]:
    return validate_model()


@app.get("/v1/archetypes")
def list_archetypes_endpoint(category: str | None = None, unit: str | None = None, status: str | None = None, confidence_min: int = 0, limit: int = 100, offset: int = 0) -> dict[str, Any]:
    repo = EngineRepository()
    try:
        return repo.list_archetypes(category=category, unit=unit, status=status, confidence_min=confidence_min, limit=limit, offset=offset)
    finally:
        repo.close()


@app.post("/v1/compare-segments")
def compare_segments_endpoint(payload: dict[str, Any]) -> dict[str, Any]:
    try:
        return compare_segments(payload["query_ids"])
    except (KeyError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.get("/v1/estimates/{estimate_id}/explain")
def explain_estimate_endpoint(estimate_id: str) -> dict[str, Any]:
    try:
        return explain_estimate(estimate_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/v1/sources/{source_id}/refresh")
def refresh_source_endpoint(source_id: str) -> dict[str, Any]:
    try:
        return refresh_source(source_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/v1/estimate-market/{query_id}")
def estimate_market_endpoint(query_id: str, scenario: dict[str, Any]) -> dict[str, Any]:
    try:
        return estimate_market_service(query_id, scenario)
    except (KeyError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.get("/v1/archetypes/{archetype_id}")
def get_archetype_endpoint(archetype_id: str) -> dict[str, Any]:
    repo = EngineRepository()
    try:
        value = repo.get_archetype(archetype_id)
        if value is None:
            raise HTTPException(status_code=404, detail="unknown archetype")
        return value
    finally:
        repo.close()


@app.get("/v2/domains")
def list_domains_endpoint(active: bool | None = True, coverage_status: str | None = None, entity_unit: str | None = None) -> dict[str, Any]:
    return list_domains(active=active,coverage_status=coverage_status,entity_unit=entity_unit)


@app.get("/v2/domains/{domain_code}/taxonomy")
def domain_taxonomy_endpoint(domain_code: str) -> dict[str, Any]:
    try:
        return get_domain_taxonomy(domain_code)
    except KeyError as exc:
        raise HTTPException(status_code=404,detail=str(exc)) from exc


@app.get("/v2/domains/{domain_code}/coverage")
def domain_coverage_endpoint(domain_code: str) -> dict[str, Any]:
    try:
        return get_domain_coverage(domain_code)
    except KeyError as exc:
        raise HTTPException(status_code=404,detail=str(exc)) from exc


@app.get("/v2/domains/{domain_code}/behaviors")
def domain_behaviors_endpoint(domain_code: str) -> dict[str, Any]:
    try:
        return get_domain_behaviors(domain_code)
    except KeyError as exc:
        raise HTTPException(status_code=404,detail=str(exc)) from exc


@app.post("/v2/domains/{domain_code}/estimate")
def domain_estimate_endpoint(domain_code: str, payload: dict[str, Any]) -> dict[str, Any]:
    try:
        return estimate_domain_segment(domain_code,payload.get("conditions",[]),parent_archetype_id=payload.get("parent_archetype_id"))
    except KeyError as exc:
        raise HTTPException(status_code=404,detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422,detail=str(exc)) from exc


@app.post("/v2/cross-domain/estimate")
def cross_domain_estimate_endpoint(payload: dict[str, Any]) -> dict[str, Any]:
    try:
        return estimate_cross_domain_segment(payload)
    except KeyError as exc:
        raise HTTPException(status_code=404,detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422,detail=str(exc)) from exc


@app.get("/v2/cross-domain/associations/{domain_code_a}/{domain_code_b}")
def association_endpoint(domain_code_a: str, domain_code_b: str) -> dict[str, Any]:
    try:
        return explain_cross_domain_association(domain_code_a,domain_code_b)
    except KeyError as exc:
        raise HTTPException(status_code=404,detail=str(exc)) from exc


@app.get("/v2/cross-domain/queries/{query_id}/explain")
def cross_query_explain_endpoint(query_id: str) -> dict[str, Any]:
    try:
        return explain_cross_domain_association(query_id)
    except KeyError as exc:
        raise HTTPException(status_code=404,detail=str(exc)) from exc


@app.get("/v2/parents/{parent_archetype_id}/decomposition")
def decomposition_endpoint(parent_archetype_id: str, product_context: str | None = None, mode: str = "primary") -> dict[str, Any]:
    try:
        return decompose_segment(parent_archetype_id,product_context=product_context,mode=mode)
    except KeyError as exc:
        raise HTTPException(status_code=404,detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422,detail=str(exc)) from exc


@app.get("/v2/required-parent-cases/{case_id}/decomposition")
def required_parent_case_decomposition_endpoint(case_id: str) -> dict[str, Any]:
    try:
        return decompose_required_parent_case(case_id)
    except KeyError as exc:
        raise HTTPException(status_code=404,detail=str(exc)) from exc


@app.get("/v2/subtypes")
def list_subtypes_endpoint(domain_code: str | None = None, parent_archetype_id: str | None = None) -> dict[str, Any]:
    return list_subtypes(domain_code=domain_code,parent_archetype_id=parent_archetype_id)


@app.get("/v2/subtypes/{subtype_id}")
def subtype_endpoint(subtype_id: str, parent_archetype_id: str | None = None, geography: str = "KR", as_of: str = "latest") -> dict[str, Any]:
    try:
        return estimate_subtype(subtype_id,parent_archetype_id=parent_archetype_id,geography=geography,as_of=as_of)
    except KeyError as exc:
        raise HTTPException(status_code=404,detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422,detail=str(exc)) from exc


@app.post("/v2/subtypes/compare")
def compare_subtypes_endpoint(payload: dict[str, Any]) -> dict[str, Any]:
    try:
        return compare_subtypes(payload.get("subtype_ids",[]),parent_archetype_id=payload.get("parent_archetype_id"))
    except (KeyError,ValueError) as exc:
        raise HTTPException(status_code=422,detail=str(exc)) from exc


@app.get("/v2/subtypes/{subtype_id}/profile")
def subtype_profile_endpoint(subtype_id: str) -> dict[str, Any]:
    try:
        return get_subtype_profile(subtype_id)
    except KeyError as exc:
        raise HTTPException(status_code=404,detail=str(exc)) from exc


@app.get("/v2/subtypes/{subtype_id}/creative-brief")
def creative_brief_endpoint(subtype_id: str, product_context: str | None = None) -> dict[str, Any]:
    try:
        return generate_creative_brief(subtype_id,product_context=product_context)
    except KeyError as exc:
        raise HTTPException(status_code=404,detail=str(exc)) from exc


@app.get("/v2/subtypes/{subtype_id}/explain")
def explain_subtype_endpoint(subtype_id: str, parent_archetype_id: str | None = None) -> dict[str, Any]:
    try:
        return explain_subtype(subtype_id,parent_archetype_id=parent_archetype_id)
    except KeyError as exc:
        raise HTTPException(status_code=404,detail=str(exc)) from exc


@app.get("/v2/subtypes/{subtype_id}/targetability")
def targetability_endpoint(subtype_id: str, channel: str | None = None) -> dict[str, Any]:
    try:
        return get_targetability(subtype_id,channel=channel)
    except KeyError as exc:
        raise HTTPException(status_code=404,detail=str(exc)) from exc


@app.post("/v2/observations")
def record_observation_endpoint(payload: dict[str, Any]) -> dict[str, Any]:
    try:
        return record_observation(payload)
    except KeyError as exc:
        raise HTTPException(status_code=404,detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422,detail=str(exc)) from exc


@app.post("/v2/observations/{observation_id}/posterior")
def posterior_endpoint(observation_id: str) -> dict[str, Any]:
    try:
        return update_posterior(observation_id)
    except KeyError as exc:
        raise HTTPException(status_code=404,detail=str(exc)) from exc


@app.post("/v2/subtypes/{subtype_id}/posterior")
def subtype_posterior_endpoint(subtype_id: str) -> dict[str, Any]:
    try:
        return update_subtype_posterior(subtype_id=subtype_id)
    except KeyError as exc:
        raise HTTPException(status_code=404,detail=str(exc)) from exc


@app.get("/v2/segmentation/validate")
def validate_segmentation_endpoint(domain_code: str | None = None) -> dict[str, Any]:
    try:
        return validate_segmentation_model(domain_code)
    except KeyError as exc:
        raise HTTPException(status_code=404,detail=str(exc)) from exc
