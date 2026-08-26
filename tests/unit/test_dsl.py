import pytest

from market_engine.dsl import QueryValidationError, evaluate_predicate, validate_query
from market_engine.io import load_json_yaml
from market_engine.paths import CONFIG_DIR


BLOCKED_USES = load_json_yaml(CONFIG_DIR / "feature_registry.yml")["blocked_uses"]


def test_query_rejects_unknown_feature() -> None:
    query = {"entity_unit":"person","where":{"feature":"secret_score","op":"eq","value":1}}
    with pytest.raises(QueryValidationError):
        validate_query(query, {"age"})


def test_query_accepts_nested_boolean_structure() -> None:
    query = {"entity_unit":"person","where":{"and":[{"feature":"age","op":"between","value":[30,39]},{"not":{"feature":"age","op":"eq","value":35}}]}}
    conditions = validate_query(query, {"age"})
    assert len(conditions) == 2


def test_boolean_range_set_exists_and_probability_predicate() -> None:
    record = {"age":35,"region":"KR","website":None,"p":0.81}
    node = {"and":[
        {"feature":"age","op":"between","value":[30,39]},
        {"feature":"region","op":"in","value":["KR","JP"]},
        {"feature":"website","op":"exists","value":False},
        {"not":{"feature":"p","op":"lt","value":0.8}},
        {"feature":"p","op":"probability_gte","value":0.8}
    ]}
    assert evaluate_predicate(node, record)


@pytest.mark.parametrize("condition", [
    {"feature": "age", "op": "between", "value": [20]},
    {"feature": "age", "op": "in", "value": "20"},
    {"feature": "age", "op": "not_in", "value": []},
    {"feature": "age", "op": "exists", "value": "yes"},
    {"feature": "age", "op": "probability_gte", "value": "high"},
])
def test_query_rejects_operator_specific_value_shapes(condition: dict[str, object]) -> None:
    with pytest.raises(QueryValidationError):
        validate_query({"entity_unit": "person", "where": condition}, {"age"})


def test_query_rejects_excessively_deep_boolean_ast_without_recursing() -> None:
    where: dict[str, object] = {"feature": "age", "op": "eq", "value": 20}
    for _ in range(1_200):
        where = {"not": where}

    with pytest.raises(QueryValidationError, match="depth"):
        validate_query({"entity_unit": "person", "where": where}, {"age"})


def test_query_rejects_excessive_array_and_string_payloads() -> None:
    with pytest.raises(QueryValidationError, match="array"):
        validate_query({
            "entity_unit": "person",
            "where": {"feature": "age", "op": "in", "value": list(range(257))},
        }, {"age"})

    with pytest.raises(QueryValidationError, match="string"):
        validate_query({
            "entity_unit": "person",
            "where": {"feature": "age", "op": "eq", "value": "x" * 16_001},
        }, {"age"})


def test_query_rejects_excessive_nodes_object_keys_and_total_strings() -> None:
    with pytest.raises(QueryValidationError, match="node"):
        validate_query({
            "entity_unit": "person",
            "where": {
                "and": [
                    {"feature": "age", "op": "eq", "value": index}
                    for index in range(256)
                ],
            },
        }, {"age"})

    with pytest.raises(QueryValidationError, match="object key"):
        validate_query({
            "entity_unit": "person",
            "where": {"feature": "age", "op": "eq", "value": {str(index): index for index in range(65)}},
        }, {"age"})

    with pytest.raises(QueryValidationError, match="total string"):
        validate_query({
            "entity_unit": "person",
            "where": {"feature": "age", "op": "in", "value": ["x" * 13_000 for _ in range(5)]},
        }, {"age"})


@pytest.mark.parametrize("use_context", BLOCKED_USES)
def test_query_rejects_every_use_blocked_by_feature_registry(use_context: str) -> None:
    with pytest.raises(QueryValidationError, match=f"blocked use_context: {use_context}"):
        validate_query({
            "entity_unit": "person",
            "use_context": use_context,
            "where": {"feature": "age", "op": "eq", "value": 30},
        }, {"age"})


def test_query_defaults_to_aggregate_market_research_use() -> None:
    conditions = validate_query({
        "entity_unit": "person",
        "where": {"feature": "age", "op": "eq", "value": 30},
    }, {"age"})

    assert conditions == [{"feature": "age", "op": "eq", "value": 30}]
