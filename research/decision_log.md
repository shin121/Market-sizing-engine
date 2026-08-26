# Decision log

- 2026-08-24 — Use local PostgreSQL 17 for clean migration verification and DuckDB/Parquet for runnable analytics.
- 2026-08-24 — Interpret “60대” as ages 60–69 and “음식점” as KSIC I56 small-business enterprises.
- 2026-08-24 — Treat own-website absence as a wide scenario because the official survey reports broader digital-system activity, not the requested joint.
- 2026-08-24 — Keep Census and resident-registration universes separate; use the latter for exact ages 0–18.
- 2026-08-24 — Calibrate Nemotron ages 20+ only; leave age 19 weight NULL rather than borrowing an incompatible control.
- 2026-08-24 — Generate 80 distinct rules per category and store honest `not_estimable` records where joints are missing.
- 2026-08-24 — Use weighted aggregate minor/household synthesis with opaque deterministic keys and no real identities.
- 2026-08-24 — Parse OR/NOT but refuse aggregate arithmetic without overlap evidence; use Fréchet bounds only when comparable saved estimates exist.
