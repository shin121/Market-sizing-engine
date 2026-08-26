# Phase 2R-A production data foundation

## Outcome

Phase 2R-A separates the retained prototype/workbench records from a production-scoped real-world universe foundation. The original `market_engine` database is unchanged. The working database is `market_engine_phase2r_a`, and the web application's local default now points to that clone.

The production layer contains:

- 9 normalized tables and 8 read views under the `production` schema.
- 7 canonical universes, 77 universe dimensions, 164 observations, and 155 claim-level citations.
- 17 province geographies and exact province partitions for people, households, and establishments.
- 24 active domain-to-universe mappings with Low/Base/High, unit, year, formula, source release, grade, and confidence.
- 3,564 Korean/English display labels across domains, axes, axis values, models, subtypes, archetypes, estimates, formulas, and sources. The retained approved-factor rows are test/E2E fixtures and are excluded.
- 0 production saved-segment fixtures. Prototype test rows remain intact only in the preserved `public` schema/database.

## Interpretation boundary

The domain values are **potential eligible-universe frames**. For example, the music/audio domain currently starts from the national person universe; 51,805,547 is not a claim that every resident consumes music/audio. Participation, intent, product adoption, and multi-condition target prevalence require a supported cross-tab, calibrated microdata/model, or an explicitly lower-grade scenario estimate.

This distinction is enforced in the display copy and retained in `description_ko`, `inclusion_criteria`, `exclusion_criteria`, `overlap_note`, and `additional_validation_variables`. Unsupported joint prevalence must not be inferred by multiplying unrelated marginals.

## Official controls loaded

- 2024 Population and Housing Census: national and province person/household controls, sex, age, household size, children-present households, and selected marital-state totals.
- 2024 Census on Establishments: national/province establishments plus industry, employee band, legal form, and representative age.
- 2024 Business Demography: active enterprises plus employee band, owner sex/age, legal form, sales band, and business age.
- 2023 Small Business Survey: the national small-business enterprise universe used by `small_business_digital`.

Thirteen complete official partitions reconcile to their control totals with delta 0. The machine-readable source rows and exact PDF locators are in `config/phase2r_a_official_observations.json` and `production.citation`.

## Schema and read boundary

- `migrations/019_phase2r_a_production_foundation.sql` creates the production schema, normalized tables, read views, grants, and read-only application boundary.
- `migrations/020_phase2r_a_production_invariants.sql` enforces grade/confidence caps and rejects known integration/E2E/fixture titles from production saved segments.
- `scripts/backfill_phase2r_a.py` performs idempotent source, universe, observation, mapping, geography, and label upserts.
- `web/src/server/repositories/catalog.ts` joins explorer metadata to `production.v_domain_summary`.
- `web/src/server/repositories/workbench.ts` lists only `production.v_estimate_summary` and `production.v_saved_segment` for production-facing pages and APIs.

## Reproduce and verify

```bash
./scripts/test_postgres.sh

MARKET_ENGINE_PHASE2R_DATABASE_URL='dbname=market_engine_phase2r_a host=./data/local/socket port=55432' \
  .venv/bin/pytest tests/integration/test_phase2r_a_production.py -q

.venv/bin/python scripts/audit_phase2r_a_final.py \
  --database-url 'dbname=market_engine_phase2r_a host=./data/local/socket port=55432' \
  --original-database-url 'dbname=market_engine host=./data/local/socket port=55432'

cd web
npm run typecheck
npm run test:unit
RUN_DATABASE_INTEGRATION=1 PGHOST=../data/local/socket PGPORT=55432 \
  PGDATABASE=market_engine_phase2r_a npm run test:integration
npm run build
```

The final machine-readable and human-readable certificates are `reports/phase2r_a_final_audit.json` and `reports/phase2r_a_final_audit.md`.

## Refresh procedure

1. Preserve a new immutable copy of every official source file and checksum.
2. Add or revise source locators in `config/phase2r_a_official_observations.json` and exact controls in `config/control_totals.yml`.
3. Re-run `scripts/backfill_phase2r_a.py`; never update published source lineage manually.
4. Re-run the Phase 2R-A integration suite twice and confirm the logical fingerprints are unchanged on the second run.
5. Regenerate the final audit and run the web type, unit, integration, build, and browser checks.

## Known limits

- National and province official marginals are present, but supported city/county/district controls are not yet comprehensive.
- The production foundation does not claim product-category participation prevalence for all 24 domains.
- Household child-presence and small-business totals are published at rounded precision, so their intervals preserve the source publication unit.
- The workspace is not a Git repository, so pipeline audit artifacts record the commit as unavailable rather than inventing one.
