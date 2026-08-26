# Query DSL and interfaces

A query declares one primary `entity_unit`, geography, date, boolean `where` tree, and optional related units. Supported boolean nodes are `and`, `or`, and `not`. Conditions support `eq`, `ne`, `in`, `not_in`, `between`, comparisons, `exists`, and `probability_gte`.

```json
{"entity_unit":"enterprise","where":{"and":[
  {"feature":"industry_code","op":"in","value":["I56"]},
  {"feature":"owner_age","op":"between","value":[60,69]},
  {"feature":"has_website","op":"eq","value":false}
]}}
```

`evaluate_predicate` executes full boolean semantics against authorized records. Aggregate estimation only combines probabilities when an approved model exists. An OR/NOT expression without a joint overlap model parses successfully but returns `not_estimable`; this prevents false inclusion–exclusion. A feature from another entity unit produces an explicit unit-conversion warning.

Core framework-independent services are `estimate_segment_service`, `get_archetype`, `list_archetypes`, `compare_segments`, `estimate_market`, `explain_estimate`, `refresh_source`, and `validate_model`. CLI equivalents and FastAPI endpoints under `/v1/` call the same services. Saved estimates use deterministic query/model hashes.
