# Phase 2R-A initial forensic audit

Generated: `2026-08-25T22:04:39.844102+00:00`  
Database: `market_engine`  
Git commit: **unavailable** — this workspace is not a Git repository.

## Preserved prototype baseline

- PostgreSQL: 90 public base tables / 12 public views.
- Full backup: `data/backups/phase2r_a/engine_prototype_full_20260826.dump` (`d8b29afe6ea7a39a408155dbf049b588445e7f45a1066a39cbafe787884c7952`).
- Schema dump: `data/backups/phase2r_a/engine_prototype_schema_20260826.sql` (`9be424ef250a922773d4d1c737616bfcb582a0e2e679c34d3ce28b9d8bc8ae02`).
- Historical Phase 2 DoD: 30/30 in the retained certificate; live provenance caveat remains documented separately.
- Nemotron manifest: 1,000,000 rows / 9 shards.

## Key exact row counts

- `archetype`: 1,440
- `domain_behavior_template`: 240
- `domain_dimension`: 384
- `domain_feature`: 480
- `domain_registry`: 24
- `estimate`: 1,787
- `opportunity`: 123
- `research_job`: 68
- `saved_segment`: 628
- `segmentation_model`: 24
- `subtype_definition`: 90

## Critical findings

- Domain population status `not_estimable`: 24 domains; 0 with Base population.
- Estimate lineage rows: 1,787; display-name contract present: `False`.
- Saved Segment fixture distribution:
  - `e2e_exact_snapshot`: 39
  - `integration`: 567
  - `restricted_role_fixture`: 20
  - `unclassified`: 2

## Audit conclusion

The prototype preserves substantial taxonomy, archetype, workflow, and validation assets, but it does not contain a production-ready real-world universe foundation. All 24 primary domains lack a canonical Base population, the Estimate read model has no display-name contract, and test fixtures share production-facing tables. Phase 2R-A must therefore add production-scoped universe/source/domain mapping data and read models without rewriting this baseline.
