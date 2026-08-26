# Taxonomy and archetypes

Taxonomy `taxonomy-2026-08-24-v1` has 18 categories: life stage, household/family, children/education, geography/housing, work/career, small business, financial capacity, home services, mobility, digital/media, commerce/payment, food/dining, health/care, leisure/culture, travel, parenting/private education, pets, and senior/retirement/care.

Each category contains 80 archetypes formed from one category-specific stage axis, one category-specific focus axis, and five geography clusters. Names, definitions, and rule hashes are unique. The focus axis is explicitly an inferred need (`inferred_need_not_observed`), whereas stage/geography fields are observable or derived descriptors. Channels are hypotheses pending validation.

The 1,440 records are overlapping segmentation lenses. `overlap_note` forbids simple addition. Every record has one representative key: an actual ID from the synthetic Nemotron frame for person archetypes or a deterministic synthetic household/business/minor key for other units. No key represents a real individual.

Evidence discipline matters more than estimate coverage: 1 archetype is D-grade estimated and 1,439 are explicit `not_estimable` records with acquisition gaps. See `data/exports/archetypes.csv`, `data/exports/archetypes.jsonl`, and `reports/archetype_coverage.md`.
