# Phase 3 PostgreSQL baseline backfill manifest

- Status: **passed**
- Outcome: `loaded`
- Loader: `postgres-baseline-backfill-v1`
- Source semantic SHA-256: `1409d853640b32f40a8957a2c780911fc60eba1baeb02466f59a415028144246`
- Target semantic SHA-256: `d620fa2a0b31a2aad195187e5570ccfba1e4b38265612862fcae54d7c66a29d3`
- Generated at: `2026-08-26T04:26:21.131713+00:00`

## Required canonical counts

| Metric | Expected | Actual |
|---|---:|---:|
| domain | 24 | 24 |
| axis | 384 | 384 |
| feature | 480 | 480 |
| behavior | 240 | 240 |
| segmentation_model | 24 | 24 |
| primary_subtype | 90 | 90 |
| parent_allocation | 450 | 450 |
| archetype | 1440 | 1440 |
| activation_json | 90 | 90 |

## Reconciliation

| Check | Error |
|---|---:|
| Parent base share | 1.7e-16 |
| Parent base count (relative) | 1.5865301475102847e-16 |
| Required-parent base share | 2.5664811766793585e-16 |
| Required-parent base count (relative) | 6.9226521823865299e-17 |

## Guarantees and exclusions

- The import ran under one PostgreSQL transaction and a transaction-scoped advisory lock.
- Repeat runs compare the immutable source semantic hash and the loaded target hash before writing.
- UUID-backed imported records use deterministic UUIDv5 identifiers on a fresh database; natural-key adoption preserves established canonical IDs.
- Missing evidence remains `not_estimable`; it is never replaced by zero.
- Entity units are preserved without undocumented person/household/establishment/enterprise conversion.
- The 1,000,000-row Nemotron feature mart and synthetic link marts remain immutable Parquet inputs and are not duplicated in PostgreSQL.
