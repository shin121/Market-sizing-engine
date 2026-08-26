from __future__ import annotations

import math
from functools import lru_cache
from typing import Any

from .io import load_json_yaml
from .paths import CONFIG_DIR

ALLOWED_UNITS = {"person", "child_person", "household", "establishment", "enterprise"}
ALLOWED_OPS = {"eq", "ne", "in", "not_in", "between", "gt", "gte", "lt", "lte", "exists", "probability_gte"}
BOOL_NODES = {"and", "or", "not"}

MAX_QUERY_DEPTH = 12
MAX_QUERY_NODES = 1_024
MAX_ARRAY_ITEMS = 256
MAX_OBJECT_KEYS = 64
MAX_STRING_CHARACTERS = 16_000
MAX_TOTAL_STRING_CHARACTERS = 64_000
DEFAULT_USE_CONTEXT = "aggregate_market_research"


class QueryValidationError(ValueError):
    pass


@lru_cache(maxsize=1)
def _blocked_uses() -> frozenset[str]:
    registry = load_json_yaml(CONFIG_DIR / "feature_registry.yml")
    blocked = registry.get("blocked_uses")
    if not isinstance(blocked, list) or not all(isinstance(value, str) and value.strip() for value in blocked):
        raise QueryValidationError("feature registry blocked_uses must be a list of non-empty strings")
    return frozenset(value.strip().lower() for value in blocked)


def _validate_declared_use(query: dict[str, Any]) -> None:
    use_context = query.get("use_context", DEFAULT_USE_CONTEXT)
    if not isinstance(use_context, str) or not use_context.strip():
        raise QueryValidationError("use_context must be a non-empty string")
    normalized_use = use_context.strip().lower()
    # Policy boundary: a declaration gate cannot detect a caller that mislabels its real intended use.
    if normalized_use in _blocked_uses():
        raise QueryValidationError(f"blocked use_context: {normalized_use}")


def _validate_payload_limits(value: Any, *, initial_depth: int = 0) -> None:
    """Bound an untrusted JSON-like value iteratively before recursive DSL parsing."""
    nodes = 0
    total_string_characters = 0
    stack: list[tuple[Any, int]] = [(value, initial_depth)]

    while stack:
        current, depth = stack.pop()
        nodes += 1
        if nodes > MAX_QUERY_NODES:
            raise QueryValidationError("query node limit exceeded")
        if depth > MAX_QUERY_DEPTH:
            raise QueryValidationError("query depth limit exceeded")

        if isinstance(current, str):
            if len(current) > MAX_STRING_CHARACTERS:
                raise QueryValidationError("query string limit exceeded")
            total_string_characters += len(current)
            if total_string_characters > MAX_TOTAL_STRING_CHARACTERS:
                raise QueryValidationError("query total string limit exceeded")
            continue

        if isinstance(current, list):
            if len(current) > MAX_ARRAY_ITEMS:
                raise QueryValidationError("query array limit exceeded")
            stack.extend((child, depth + 1) for child in current)
            continue

        if isinstance(current, dict):
            if len(current) > MAX_OBJECT_KEYS:
                raise QueryValidationError("query object key limit exceeded")
            for key, child in current.items():
                if not isinstance(key, str):
                    raise QueryValidationError("query object keys must be strings")
                if len(key) > MAX_STRING_CHARACTERS:
                    raise QueryValidationError("query string limit exceeded")
                total_string_characters += len(key)
                if total_string_characters > MAX_TOTAL_STRING_CHARACTERS:
                    raise QueryValidationError("query total string limit exceeded")
                stack.append((child, depth + 1))


def _validate_feature_condition(node: dict[str, Any]) -> None:
    feature = node.get("feature")
    op = node.get("op")
    if not isinstance(feature, str) or not feature or not isinstance(op, str) or op not in ALLOWED_OPS:
        raise QueryValidationError(f"invalid feature condition: {node}")

    value = node.get("value")
    if op == "between" and (not isinstance(value, list) or len(value) != 2):
        raise QueryValidationError("between requires a two-value list")
    if op in {"in", "not_in"} and (not isinstance(value, list) or not value):
        raise QueryValidationError(f"{op} requires a non-empty list")
    if op == "exists" and not isinstance(value, bool):
        raise QueryValidationError("exists requires a boolean value")
    if op == "probability_gte":
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise QueryValidationError("probability_gte requires a numeric value")
        if not math.isfinite(float(value)) or not 0 <= float(value) <= 1:
            raise QueryValidationError("probability_gte requires a finite value between 0 and 1")


def _flatten_conditions(node: dict[str, Any]) -> list[dict[str, Any]]:
    if not isinstance(node, dict):
        raise QueryValidationError("where nodes must be objects")
    if "feature" in node:
        _validate_feature_condition(node)
        return [node]
    if len(node) != 1:
        raise QueryValidationError("boolean where nodes must contain exactly one operator")
    key, value = next(iter(node.items()))
    if key in {"and", "or"}:
        if not isinstance(value, list) or not value:
            raise QueryValidationError(f"{key} requires a non-empty list")
        flattened: list[dict[str, Any]] = []
        for child in value:
            flattened.extend(_flatten_conditions(child))
        return flattened
    if key == "not":
        return [
            {**condition, "negated": not condition.get("negated", False)}
            for condition in _flatten_conditions(value)
        ]
    raise QueryValidationError(f"unknown boolean operator: {key}")


def flatten_conditions(node: dict[str, Any]) -> list[dict[str, Any]]:
    _validate_payload_limits(node)
    return _flatten_conditions(node)


def validate_query(query: dict[str, Any], queryable_features: set[str]) -> list[dict[str, Any]]:
    # Start the envelope at -1 so the where-AST root has the documented depth zero.
    _validate_payload_limits(query, initial_depth=-1)
    if not isinstance(query, dict):
        raise QueryValidationError("query must be an object")
    _validate_declared_use(query)
    unit = query.get("entity_unit")
    if unit not in ALLOWED_UNITS:
        raise QueryValidationError(f"unsupported entity_unit: {unit}")
    where = query.get("where")
    if not where:
        raise QueryValidationError("query requires where")
    conditions = _flatten_conditions(where)
    unknown = sorted({c["feature"] for c in conditions} - queryable_features)
    if unknown:
        raise QueryValidationError(f"unknown or non-queryable features: {unknown}")
    return conditions


def _evaluate_predicate(node: dict[str, Any], record: dict[str, Any]) -> bool:
    if not isinstance(node, dict):
        raise QueryValidationError("where nodes must be objects")
    if "feature" in node:
        _validate_feature_condition(node)
        feature, op, wanted = node["feature"], node["op"], node.get("value")
        exists = feature in record and record[feature] is not None
        actual = record.get(feature)
        if op == "exists":
            return exists is wanted
        if not exists:
            return False
        if op == "eq":
            return actual == wanted
        if op == "ne":
            return actual != wanted
        if op == "in":
            return actual in wanted
        if op == "not_in":
            return actual not in wanted
        if op == "between":
            return wanted[0] <= actual <= wanted[1]
        if op == "gt":
            return actual > wanted
        if op == "gte":
            return actual >= wanted
        if op == "lt":
            return actual < wanted
        if op == "lte":
            return actual <= wanted
        if op == "probability_gte":
            return float(actual) >= float(wanted)
        raise QueryValidationError(f"unknown operator: {op}")
    if len(node) != 1:
        raise QueryValidationError("boolean where nodes must contain exactly one operator")
    key, value = next(iter(node.items()))
    if key == "and":
        return all(_evaluate_predicate(child, record) for child in value)
    if key == "or":
        return any(_evaluate_predicate(child, record) for child in value)
    if key == "not":
        return not _evaluate_predicate(value, record)
    raise QueryValidationError(f"unknown boolean operator: {key}")


def evaluate_predicate(node: dict[str, Any], record: dict[str, Any]) -> bool:
    """Evaluate the complete boolean DSL against one already-authorized record."""
    _validate_payload_limits(node)
    _flatten_conditions(node)
    return _evaluate_predicate(node, record)
