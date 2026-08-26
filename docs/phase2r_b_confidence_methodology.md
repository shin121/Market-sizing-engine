# Phase 2R-B Confidence Methodology

Confidence is calculated, not assigned by an LLM. Every result stores the following 0–100 components:

| Component | Weight |
|---|---:|
| Source quality | 0.14 |
| Recency | 0.07 |
| Definition match | 0.12 |
| Geography match | 0.07 |
| Direct observation | 0.13 |
| Calibration fit | 0.12 |
| Mapping coverage | 0.10 |
| Effective sample size | 0.08 |
| Dependency-risk retention | 0.07 |
| Proxy-retention score | 0.05 |
| Model stability | 0.05 |

The raw score is the weighted sum. The final score cannot exceed the Estimate Grade cap:

- A: 100
- B: 90
- C: 80
- D: 65
- E: 50

The cap is enforced both in Python and by PostgreSQL constraints. Lower dependency-risk and proxy-retention scores are penalties: an independence assumption, cross-unit transport, definition mismatch, or unvalidated platform-specific proxy reduces them.

## Interpretation

- Grade A/B: directly observed or strongly matched official evidence with minor derivation.
- Grade C: compatible survey proportion transported through a calibrated denominator.
- Grade D: bounded conditional estimate with material proxy or missing joint distribution.
- Grade E: exploratory result whose numeric interval is usable for research planning but requires direct validation before operational commitment.

Confidence is not the probability that a single person belongs to a segment. It rates the population estimate and its evidence chain. Archetype confidence is stored per Domain context using the key `archetype_id:domain_context_id`.

## Persistence

`production.confidence_breakdown` contains every component, the final score, grade, and formula version. Source arrays must be non-empty. `production.estimate_factor_lineage` records ordered cross-domain factors, directness, source locator, dependency assumption, confidence penalty, and validation status.
