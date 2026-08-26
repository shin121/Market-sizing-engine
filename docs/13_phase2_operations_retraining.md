# Phase 2 operations and retraining

## Version and preservation rules

- Never edit or replace `001_core.sql`, Phase 1 identifiers, existing controls, or source releases.
- Register a new immutable source release with URL, universe, period, license, local URI, and checksum.
- Bump the taxonomy version for meaning/allowed-value changes, the segmentation version for feature/model changes, and the model version for promoted estimate changes.
- Preserve feedback and acceptance rows across Phase 2 rebuilds. The builder copies those rows into the new additive database after deterministic subtype IDs are recreated.
- Do not overwrite raw files under an existing release ID.

## Routine refresh

1. Verify free space and all raw checksums.
2. Refresh official controls and rebuild the calibrated adult mart when its release changes.
3. Review source-universe compatibility; do not mix resident-registration, Census, household, establishment, and enterprise units silently.
4. Run `build`, then `build-phase2 --force-models` when model inputs changed.
5. Confirm the pinned multilingual MiniLM snapshot is available under `data/raw/huggingface_cache/`; a first build downloads it automatically. Compare embedding content hashes, selected k, seed and bootstrap stability, cluster support, ESS, label evidence, and representative medoids with the prior model.
6. Run the Phase 2 acceptance suite and regenerate reports/exports.
7. Apply `001+002` to a clean PostgreSQL database and reapply `002` to prove idempotence.
8. Run all tests and `market-engine validate` before promotion.

## Promotion gates

A model is not promoted when a cluster falls below 2.5% weighted support without a domain-specific justification, has insufficient hard support, lacks three representative medoids, breaks artifact checksums, loses parent reconciliation, or contradicts its label evidence. Low stability may remain exploratory only with a reduced interpretation score and an explicit validation experiment.

Every active domain must retain 16 axis decisions, 20 queryable features, 10 behavior templates, eight tags, eight reusable archetypes, five parent allocations, and an end-to-end acceptance result. Machine-readable audits are under `data/processed/phase2/tables/`; human review starts with `reports/domain_coverage_matrix.md`, `reports/phase2_model_cards.md`, and `reports/cross_domain_association_report.md`.

## Feedback review

Observations are aggregate-only and never overwrite the cluster model automatically. Review consent basis, sampling design, exposure selection, soft-classification quality, small-sample flags, transport bias, outcome definition, and channel changes. A posterior marked `held_for_review` is evidence for the next validation cycle, not a production prevalence update.

## Rollback

Phase 1 remains in `market_engine.duckdb`. Phase 2 resides in a separate additive database, so rollback consists of stopping v2 traffic and restoring a prior checksum-pinned `market_engine_phase2.duckdb` plus its model/membership artifacts. Never delete feedback; export it before any manual replacement.
