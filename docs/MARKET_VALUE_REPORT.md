# Market Value Engine — current report

Updated 2026-09-07. This report describes the current research-demand model. The older music-only v0.3 report has been replaced by the central `researchMarketValue` path and the reviewed category baselines in [MARKET_VALUE_BASELINES.md](MARKET_VALUE_BASELINES.md).

## What the engine can claim

Nemotron contains no structured, representative spend, ticket-size, sampling weight or transaction fields. Its narratives remain qualitative signals. The population denominator comes from official population frames and published participation rates. Market Value is a separate annual spend-pool estimate with an explicit unit, scope, method, confidence, completeness, range and source basis. It is not revenue, SOM, TAM or a company forecast.

The six method contracts remain available: `direct_spend`, `weighted_spend`, `frequency_ticket`, `calibrated_baseline`, `consumption_proxy` and `heuristic_range`. Current serving data uses direct or weighted survey anchors for personal dining and household delivery, plus reviewed `calibrated_baseline` mappings for online category totals. Nemotron monetary audit results remain in [MARKET_VALUE_DATA_AUDIT.md](MARKET_VALUE_DATA_AUDIT.md).

## Current reviewed category coverage

At least one monetary profile is available in 11 of 20 market lenses: travel, fitness, beauty, education, community, commerce, mobility, food, pet, family and delivery. A mixed market root can still be intentionally unpriced when its branches overlap; lower profiles retain their own matching anchor where one exists. The latest sanity ledger records 195 factors, 20 roots, 66 branches, 197 lower profiles and 120 profiles with an annual monetary baseline.

The National Data Office 2025 annual online-shopping release supplies the category totals. The central mapping includes online cosmetics, broad online commerce, travel and transport, sports and leisure goods, books and stationery, pet supplies, children's goods, automobiles and culture/leisure services. The exact category components, period, URL, locator and hash are in `config/external-spend.json`; the rationale is in [MARKET_VALUE_BASELINES.md](MARKET_VALUE_BASELINES.md).

## Beauty interpretation

The old 190만 figure was a synthetic lexical projection and is not a valid cosmetics population. The current model separates:

- about 1,660만 adults with skin, hair, nail or other beauty-care activity in the last year;
- about 1,299만 adults who bought cosmetics online in the last year;
- about 595만 in the modeled intersection of those cohorts.

The 1,299만 online-buyer cohort is connected to the 2025 online cosmetics pool of KRW 13.8153tn, or about KRW 1.06m per online buyer per year. The 1,660만 activity cohort remains unpriced because all-channel cosmetics penetration, offline purchase and item-level spend are not observed. The cohorts must not be added or described as all cosmetics users.

## Calculation and safeguards

The engine allocates a published national category total by the selected profile's externally estimated population share. Full category anchors preserve the published total; narrower profiles receive Low/Base/High sensitivity ranges. The buying unit is carried through as person or household. A household market is never priced by multiplying a person count by an arbitrary household spend.

Every view uses the same central object: flow, profile inspector, Matrix, Opportunity, comparison, search and source inspection. Mixed unions and overlapping archetypes are marked non-additive. Category totals are not summed across overlapping types or industries. Missing evidence is represented as `missing_calibration_anchor`, not zero.

The UI keeps the selected profile's population and spend in the same header strip, shows method/confidence/completeness beside the spend, and exposes a small national category trend only when an observed two-year baseline exists. The trend is explicitly labeled as a national category change, not segment growth.

## Verification and remaining work

The current Atlas suite has 74 passing tests; lint, typecheck and the Webpack production build pass. Browser verification on the production alias confirms the beauty population split, cosmetics spend, lower contextual paths, Matrix money mode, Opportunity routing and zero console errors.

Still required for the broader Demand OS goal are all-channel cosmetics use, offline and item-level spend, service-specific frequency and ticket size, willingness to pay, competition/alternatives, growth, reachability and further legacy-interest mappings. Those are listed as missing evidence rather than filled with synthetic prevalence.

Production: [nemotron-market-atlas.vercel.app](https://nemotron-market-atlas.vercel.app/atlas?metric=marketValue)
