# Phase 2 API and CLI

Build Phase 1 first, then Phase 2:

```bash
.venv/bin/market-engine build
.venv/bin/market-engine build-phase2 --sample-size 1000
.venv/bin/market-engine phase2-reports
.venv/bin/market-engine validate
```

Use `--force-models` only when the segmentation revision, raw inputs, or feature construction changed. Without it, model JSON, joblib, membership Parquet, versions, and checksums must all agree before a cached model is reused.

## Discovery and taxonomy

```bash
market-engine domains --coverage-status complete_with_evidence_constraints --entity-unit household
market-engine domain-taxonomy music_audio
market-engine domain-coverage music_audio
market-engine domain-behaviors music_audio
```

REST equivalents are `GET /v2/domains`, `GET /v2/domains/{code}/taxonomy`, `GET /v2/domains/{code}/coverage`, and `GET /v2/domains/{code}/behaviors`.

## Domain-specific estimates

`estimate-domain` requires at least one feature/value pair from the domain taxonomy:

```json
[
  {"feature_code":"music_audio.location","value":"직장·학교"},
  {"feature_code":"music_audio.consumption_mode","value":"배경 청취"}
]
```

```bash
market-engine estimate-domain music_audio --conditions conditions.json --parent ARC-14-001
```

Without a parent, the response is a conditional share only because most domains lack an official consumption universe. With an eligible parent, it returns an exploratory parent-conditional Low/Base/High count and explicitly separated population, interpretation, and targetability confidence.

## Parent and subtype operations

```bash
market-engine decompose ARC-06-001 --product-context managed_website_service --mode with_tags
market-engine decompose-required-case PARENT-02
market-engine subtypes --domain small_business_digital
market-engine estimate-subtype DOM-24-SUB-01 --parent ARC-06-001 --geography KR --as-of latest
market-engine compare-subtypes DOM-24-SUB-01 DOM-24-SUB-02 --parent ARC-06-001
market-engine subtype-profile DOM-24-SUB-01
market-engine explain-subtype DOM-24-SUB-01 --parent ARC-06-001
market-engine creative-brief DOM-24-SUB-01 --product-context managed_website_service
market-engine targetability DOM-24-SUB-01 --channel search
```

REST uses `/v2/parents/{id}/decomposition`, `/v2/required-parent-cases/{case_id}/decomposition`, `/v2/subtypes`, `/v2/subtypes/{id}`, `/v2/subtypes/compare`, and the `/profile`, `/explain`, `/creative-brief`, and `/targetability` subtype suffixes. Required cases 2–10 are exact query definitions but their parent prevalence is an E-grade scenario, not an official joint estimate.

## Cross-domain operations

```json
{
  "domains":["pets","travel_hospitality","mobility_automotive"],
  "constraints":{"age_min":30,"age_max":49},
  "output_unit":"household",
  "semantic_conditions":["pet ownership proxy","frequent domestic travel","vehicle preference"],
  "scenario_overlay":{"low":0.05,"base":0.20,"high":0.50}
}
```

```bash
market-engine cross-domain --query cross.json
market-engine explain-association music_audio video_ott
market-engine explain-cross-query CROSS-01
```

Allowed constraints are age minimum/maximum, province, sex, and a family-type substring. The engine always measures domain presence jointly on the same weighted synthetic adult. A mixed-unit query without `output_unit` returns `not_estimable`. With an explicit household or enterprise output, the response documents the adult decision-maker/owner-operator bridge, scales only against that unit's official control, and requires a Low/Base/High semantic scenario for unobserved conjunctions. It never falls back to an independence product or asserts a one-person-to-one-entity conversion.

## Feedback

`record-observation --payload observation.json` accepts aggregate count, outcome count, optional soft-membership sum, non-identifying channel/sampling context, consent basis, and bias flags. Names, contacts, addresses, account/device IDs, and child IDs are rejected. `update-posterior OBSERVATION_ID` applies a capped beta-binomial update and leaves the published model unchanged when diagnostics require review.

`validate-segmentation [--domain CODE]` verifies support, k, prevalence reconciliation, model and membership checksums, and the revision-pinned semantic-embedding cache checksum. `validate` runs combined Phase 1+2 integrity checks.
