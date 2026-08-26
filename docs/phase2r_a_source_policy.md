# Phase 2R-A source policy

## Priority

Use sources in this order: official national/public data; official censuses and administrative statistics; public institutions/local government; transparent industry surveys; filings and official reports; academic studies; reputable survey organizations; secondary reporting; bounded model inference.

Search-result pages are discovery aids, never evidence. Core controls require a primary source document and a stable locator.

## Required metadata

Every production source document records publisher, title, original/download URL, publication date, reference year, access time, population universe, sample size when published, geography, local URI, checksum, license/terms, material kind, and version. Each used claim records a citation locator, claim, used value, unit, extraction method, and review status.

## Evidence grades

- A: directly matching official statistic.
- B: derived from compatible official statistics.
- C: reputable survey rate applied to an official denominator.
- D: explicit proxy model with widened range and reduced confidence.
- E: bounded inference with assumptions and validation plan.

Database constraints cap confidence at A≤100, B≤90, C≤80, D≤65, and E≤50. `not_estimable` is reserved for cases with no defensible denominator or bound.

## Storage and refresh

- Raw files are immutable and checksum-pinned.
- Processed transcription/config and database observations are versioned separately.
- Corrections create a new version/source lineage and rerun the idempotent backfill.
- The preserved Phase 1 rounded controls are not rewritten; more precise appendix values live only in the isolated Phase 2R-A production schema.
- Refreshes must rerun exact partition, source-linkage, fixture-exclusion, display-label, confidence, and idempotency tests.

The generated source inventory is `reports/phase2r_a_source_manifest.json`.
