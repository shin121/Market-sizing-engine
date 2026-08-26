# Phase 2R-B Weighting Specification

## Weight artifacts

- `data/processed/phase2r_b/person_weights.parquet`: 1,000,000 Nemotron Persona rows with person weights.
- `data/processed/phase2r_b/household_weights.parquet`: 250,000 separate synthetic household rows.
- `data/processed/phase2r_b/establishment_weights.parquet`: 200,000 separate establishment rows.
- `data/processed/phase2r_b/enterprise_weights.parquet`: 200,000 separate active-enterprise rows.

Every artifact carries `calibration_version`. Calibration-run metadata stores unit, universe, method, seed, convergence parameters, artifact checksum, controls, ESS, weight CV, and extreme-weight diagnostics.

## Field mapping contract

`calibration_field_mapping.parquet` and `production.calibration_field_mapping` store:

- Nemotron field and Universe dimension
- original and standard category
- mapping rule and confidence
- category coverage rate and unmapped reason
- target unit and version

Null or ambiguous values remain unmapped. They are never silently forced into a category. Business mappings refer to the separate business-frame category sets, not to Nemotron Persona fields.

## Allocation semantics

All Production estimates must have one of four explicit semantics:

1. `exclusive_partition`: Primary Subtypes within a Domain; Base shares sum to one and counts reconcile to the parent.
2. `overlapping_membership`: Domains, Archetypes, Features, and Behaviors; membership counts are not additive.
3. `hierarchical_conditional`: Gold and cross-domain queries; each factor is conditional on the preceding population.
4. `continuous_score_band`: banded frequency/intensity and spending/value Axis distributions; raw score means are retained.

The database disallows null or unregistered semantics. A deferred constraint trigger rejects non-reconciling exclusive Subtypes at transaction commit.

## Archetype weighting

Each Archetype rule is decomposed into geography, stage, and focus. The Base share is:

`macro-region share × stage share × P(focus | stage, context)`

`P(focus | stage, context)` uses a bounded log-linear dependency correction. `national` rows overlap the four macro-region rows; Archetype totals must not be summed across rows or Domain contexts. Reused categories are materialized separately for every Domain context. The result contains 1,440 distinct Archetypes and 2,400 context rows.

## Subtype weighting

Existing calibrated soft-cluster membership supplies the relative Base shares. For each Domain they are normalized once, then the final child count is adjusted for floating-point residue so:

- `Σ subtype share_base = 1`
- `Σ subtype count_base = domain count_base`

Low and High retain model-stability uncertainty and propagate the Domain-parent interval. They are not separately forced to sum to one because they represent simultaneous uncertainty bounds.

## Axis, Feature, and Behavior

The 64 synthetic axis scores per Domain sample map to 16 Axis × four allowed values. Exclusive and continuous bands are normalized within the Axis; overlapping axes are retained as independent membership prevalences. Linked Features inherit the Axis distribution. Four derived Features per Domain receive bounded E-grade numeric proxy distributions. Behaviors inherit the linked Feature value and add a documented monthly frequency interval.
