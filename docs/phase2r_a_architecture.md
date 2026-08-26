# Phase 2R-A architecture

## Boundary

Phase 2R-A is an additive production-data foundation. It does not extend the GUI or replace Phase 1–2 taxonomy/model artifacts. The original populated database `market_engine` remains unchanged; `market_engine_phase2r_a` is the working clone.

## Data flow

1. Immutable official PDFs and registered releases remain in `data/raw` and the existing public source registry.
2. Exact transcriptions and source locators are versioned in `config/phase2r_a_official_observations.json`.
3. `scripts/backfill_phase2r_a.py` idempotently upserts production source documents, citations, universes, dimensions, observations, mappings, geographies, and display labels.
4. `production.v_domain_summary`, `v_axis_summary`, `v_subtype_summary`, `v_archetype_summary`, `v_estimate_summary`, `v_source_summary`, `v_saved_segment`, and `v_data_quality_status` are the production read boundary.
5. Next.js repositories join/read only these production views for domain populations, estimate lists, and production saved segments.

## Isolation model

- Prototype/test state remains in the preserved public schema/database for regression tests.
- The production schema accepts only rows explicitly loaded by the Phase 2R-A backfill.
- Production saved-segment titles reject known integration/E2E/fixture patterns with a validated check constraint.
- Retained `approved_research_factor` records are all fixture-derived and are not copied to production display labels.
- Runtime roles receive SELECT on the production schema; mutation remains an offline ETL responsibility.

## Reliability

- Migrations `019` and `020` are idempotent and clean-DB compatible.
- All upserts use stable identifiers.
- Observation and domain-mapping logical hashes prove repeatability.
- Low/Base/High ordering and grade/confidence ceilings are database-enforced.
- Indexes cover entity/period, dimension/coverage, observation lookup/JSON dimensions, mappings, and quality status.

The consolidated implementation and verification overview is in `docs/23_phase2r_a_production_foundation.md`.
