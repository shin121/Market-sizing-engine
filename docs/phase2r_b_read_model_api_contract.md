# Phase 2R-B Read Model and Phase 3R–7R Contract

GUI and downstream services must read aggregated Production views, never the 1,000,000-row Persona source.

| View | Grain | Primary consumer |
|---|---|---|
| `production.v_domain_market_summary` | Domain | Domain explorer |
| `production.v_axis_distribution` | Domain × Axis × value | Segmentation lens |
| `production.v_subtype_market_summary` | Primary Subtype | Primary explorer |
| `production.v_archetype_market_summary` | Archetype × Domain context | Persona explorer |
| `production.v_feature_prevalence` | Feature | Feature filters |
| `production.v_behavior_prevalence` | Behavior | Behavior filters |
| `production.v_gold_query_result` | versioned query snapshot | Gold-query validation |
| `production.v_estimate_factor_lineage` | ordered estimate factor | Formula/lineage UI |
| `production.v_source_coverage` | source release | evidence coverage |
| `production.v_confidence_breakdown` | estimate subject/context | confidence UI |
| `production.v_geography_distribution` | subject × region | geography charts |
| `production.v_trend_spend_summary` | subject × metric × year | TAM/SAM/SOM inputs |
| `production.v_primary_explorer` | Domain or Subtype | numeric-only explorer |

Required response fields for a market estimate are `subject_id`, display name/status, entity unit, Low/Base/High share and count, geography, reference year, allocation semantics, grade, confidence score, sources, method/formula, uncertainty method, and version. Cross-domain responses additionally require structured conditions, ordered factors, dependency method, seed, and snapshot hash.

Compatibility rules for Phase 3R–7R:

- Add fields or new versioned views; do not change existing field meaning in place.
- Preserve explicit entity unit and Domain context in cache keys and URLs.
- Never sum overlapping membership rows.
- Only `exclusive_partition` children may be reconciled and summed to a parent.
- Treat Grade D/E as bounded research estimates and surface their validation items.
- Use snapshot hashes for caching and reproducibility; the same versioned input and seed must return the same result.
