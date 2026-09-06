# Atlas revision — interpretable metrics, population validity, external spend, dense profiles

## Required outcomes

- Replace unexplained primary multiples with people, selected-population shares and spend. Keep relative indices only where explicitly chosen or explained.
- Extend annual spend across the supported market taxonomy using verified external statistics, with source, year, unit, channel coverage and component overlap recorded. Never substitute platform revenue for consumer transactions.
- Audit all 52 archetypes and 20 markets, including review/planned purchase, the nested ecommerce combination, and digital delivery. Narrative non-mention is not evidence of non-participation. Fix extraction/model problems with evidence and expose remaining calibration limits.
- Make overview, entity dashboards, nested segments and relationship inspection as informative as the four reference images: compact metric strips, demographic distributions, regional composition, consumption breakdowns, related groups, comparative evidence and source tables. Use the existing light palette.
- Verify full drill-through, matrix, search and opportunity; test units, monotonic subsets, national spend closure and double-count prevention. Publish the verified result through GitHub/Vercel.

## Evidence and checkpoints

- Starting deployed commit: `2711dd9`. Current spend is only music streaming/download. Global delivery-archetype money was therefore music spend, not delivery-market value.
- Current population membership uses binary conjunctions of narrative expressions. Review/planned-purchase global population is 22,798 with 501 matching synthetic records. This is a lexical-support estimate, not validated consumer-behavior prevalence.
- 2025 annual online shopping statistics: official National Data Office release 2026-02-02, annual category table; use exact annual rows, not December values or rounded shares.
- Verified source extraction, central model corrections, full 52-type / 20-market sanity report and dense dashboards are implemented. 39 domain tests, lint, typecheck, production build and the final 29-step local browser journey passed. Publishing uses the existing GitHub main → Vercel production integration.
- Calibrated cubes: 1,396; original narrative membership and original support remain immutable. See `EXTERNAL_SPEND_AND_POPULATION.md` for provenance, definition changes, and limits.
