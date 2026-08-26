# Phase 2R-B Estimation Policy

## Evidence hierarchy

Direct official counts and compatible survey proportions are preferred. Calibrated synthetic evidence transports structure where no direct joint distribution exists. Proxy or bounded inference is allowed for Grade D/E estimates, but it must include a source, formula, dependency treatment, confidence penalty, and validation item. Missing direct data is not automatically converted to `not_estimable`.

## Domain sizing

Phase 2R-A eligible Universe totals are denominators, not observed participation. Phase 2R-B combines the calibrated synthetic participation signal with a registered Domain anchor using a 50/50 empirical-Bayes shrinkage. Direct music and small-business survey evidence receives a narrower Grade C interval; other transported Domain prevalence remains Grade D/E.

## Low / Base / High

Intervals combine:

- weighted-sample error from ESS;
- source/definition and mapping mismatch;
- calibration fit;
- proxy and dependency risk;
- stability between the registered anchor and synthetic signal;
- parent interval propagation.

Grade floors are A 1%, B 2.5%, C 6%, D 13%, and E 24%, before structural errors. This is not Base ±10%.

Gold Queries use 20,000 triangular Monte Carlo draws with a fixed per-query seed. The reported Low/High are the 5th/95th percentiles, while Base is the deterministic conditional-chain product.

## Cross-domain order

1. Search a versioned exact Existing Segment or Gold snapshot.
2. Select a unit-compatible Parent Universe.
3. Resolve relevant Domains, Archetypes, Subtypes, Features, and Behaviors.
4. Query the calibrated weighted synthetic joint where compatible.
5. Prefer registered direct joint distributions.
6. Otherwise apply sequential conditional probabilities or a named proxy.
7. Apply a bounded dependency correction; do not silently multiply independent marginals.
8. Propagate Low/Base/High.
9. Recompute confidence from stored components.
10. Save snapshot hash, factors, formula, sources, seed, and lineage.

The reference implementation is `estimate_conditional_chain` in `src/market_engine/phase2r_b.py`. The ten required Gold Queries are persisted in `production.gold_query_result` and their ordered factors in `production.estimate_factor_lineage`.

## Prohibited operations

- Treating Nemotron row counts or Archetype counts as population counts.
- Equal weighting across Archetypes or Subtypes without evidence.
- Adding overlapping Domain, Archetype, Feature, or Behavior counts.
- Forcing overlapping shares to total 100%.
- Using a Person weight for a household or business denominator.
- Publishing a Production estimate without allocation semantics, source lineage, reference year, unit, interval, and confidence.

## Production status language

`estimated` means the numeric result is supported by direct or calibrated evidence within its stated interval. `bounded_estimate` marks wider D/E-grade transport or proxy uncertainty. Neither label asserts individual-level truth or deterministic targetability.
