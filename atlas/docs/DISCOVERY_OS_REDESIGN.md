# Market Atlas Discovery OS — 2026-09-06

## Product change

The primary path is **market → interest / submarket → life context or problem → buying mechanism**. The supplied profile and comparison images guide layout, not data or forecast semantics. Archetypes remain overlapping, audited commercial mechanisms; all 52 are available beneath an interest cohort through search, sorting and the expandable Discovery Radar.

- Market discovery starts with 20 markets grouped into six browsing domains. All markets remain visible when spend is unavailable.
- Profiles use a compact metric strip, age and region distributions, explicitly national category trends, spend sensitivity, household / behavior composition, pain co-occurrence, subordinate types, adjacency and sources.
- Selecting an interest keeps its parent market. Conditions are displayed in semantic order without changing canonical AND intersection keys or amounts.
- Age OR groups (20–39, 40–59, 50–69, 60+) union indexed person memberships once. Existing 30–49 remains supported. Age / sex / region / marital selection replaces the prior condition of the same kind. Household conditions can overlap and remain AND.
- Persistent workspace stores named candidates, exact conditions, spend scope, three comparison choices, decision weights and research notes in this browser / origin. It offers JSON export; account sync and import are not implemented.
- The comparison view aligns three profiles with green, blue and purple columns. Cross-scope or missing money is excluded from the user-weighted comparison. The existing Opportunity score is retained separately.
- The idea board records hypothesis, alternatives, next validation, evidence, source URL and user-reported status. Validation-complete requires evidence text; it is not an engine certification. Notes do not alter market estimates.

## Corrections from the product exploration

| Observed gap | Change |
| --- | --- |
| Buying mechanism dominates the entrance | Market-first map, domain entry, interest selector, subordinate mechanism table / search |
| Cross-industry comparison disappears | Versioned persistent browser workspace, same candidate + scope across navigation and reload |
| Money coverage hides missing markets | Unpriced markets remain explicitly linked; missing value is not zero |
| Matrix industry columns inherit unrelated spend scope | Each market row/column receives its own central estimate and scoped drill-through |
| Model-only cells presented as observed | Original n, sparse n<30 and n=0 model-only labels; highlights state n≥30 eligibility |
| Population and monetary denominator differ | Both are labeled in the metric strip, comparison and affected Matrix cells |
| Generic pain treated as category-caused pain | Explicit co-occurrence semantics and category-specific validation questions |
| Segment growth confused with national spending change | Same-category national period labels; absent trend remains missing |
| Population and money rank look redundant | Both lenses preserved; actual 30s/40s sports-spend reversal verified |
| Score differences lack context | Candidate population retention and score delta; exact redundant intersections suppressed |
| 90% input metric appears like accuracy | Labeled score-input coverage, not confidence / accuracy |
| No next action | Named hypothesis, alternative, validation and evidence records; compare and JSON export |
| Tiny population gets duplicate unit | Unit-free compact population formatter; full formatter handles <100 |

## What the current data can and cannot support

**Available from existing Nemotron aggregates:** age, sex, region, family / household composition, marital state, interest / behavior / channel co-occurrence, intersections, differences, indexed age OR, subordinate-type shares and cross-industry affinity. These are synthetic-profile estimates, not observed consumer counts. Survey-calibrated broad behavior populations and uncalibrated specific textual interests have different evidence bases; submarket coverage is not a measured participation rate.

**Requires additional Nemotron processing:** sentence / domain-local pain linkage, negation and intent handling, explicit frequency extraction, occupation / detailed life-stage predicates. These are marked as re-extraction requirements, not fabricated new metrics. Same-person co-occurrence does not establish category-specific pain or intensity.

**Requires external measurement:** service-specific expenditure anchors (spa, tuition, care, subscription management), actual frequency / ticket / WTP, competitor prices and dissatisfaction, switching friction, segment time series, reachable audience and acquisition cost. Existing online goods anchors are kept with exact scope, not relabeled as service TAM. No revenue capture, household deduplication, business populations or SAM/SOM were introduced.

The v0.4 external allocation engine is preserved. Category-interest population can differ from the monetary allocation denominator, including model allocations where original lexical support is zero. Range bands remain sensitivity ranges, and overlapping markets / archetypes remain nonadditive.

## Architecture and validation

`lib/discovery.ts` owns hierarchy, age-union definitions, workspace schema and validation requirements. `server/atlas/population.ts` calculates age unions at the bitmap layer. The analysis and profile API consume the central population and monetary engines. No raw narrative or persona IDs are serialized. The persistent browser store saves conditions / research notes, not raw data or authoritative frozen estimates; comparison requests current aggregate profiles.

Automated checks cover all 52 archetypes, 20 markets, 10 market journeys, numeric reconciliation and range bounds, independent SQL oracle consistency, unknown vs zero, scope-specific Matrix cells, OR additivity, hierarchy order, redundant conditions and workspace parsing. The former test requiring at least three market-related candidates was updated for the actual number of submarkets (some markets have two), without inventing a third candidate.

Browser acceptance performed in Chrome at 1440×900:

1. Global market map → Travel → Nature / holiday → search subordinate types → Review-led gear buyer (≈12,000 people, ≈KRW14bn annual online travel / transport allocation).
2. Add age 50–69 through the builder → ≈3,200 people / ≈KRW3.5bn, retaining market, interest and mechanism.
3. Health → Spa / sauna; Education → vocational study; Content → OTT; Commerce; Family / care. Each exposes interests before mechanisms and exact spend coverage.
4. Save travel, health and OTT candidates; move across markets; three choices remain. A fourth selection is rejected with a clear message.
5. Three-column compare loads different profiles, shows missing OTT monetary data, excludes incompatible economic score and responds to weight changes.
6. Create an OTT management hypothesis, record alternatives / interview plan, reject validation-complete without evidence, save as hypothesis, reload and verify the record remains.
7. Reopen saved travel conditions → Relationship → Matrix → money mode → Opportunity; context remains intact.
8. Matrix: content cells remain missing; 30s sports allocation ≈KRW640m vs 40s ≈KRW690m despite a smaller 40s population; zero-lexical-support cells explicitly marked model-only.

Desktop and narrow-layout overflow / console checks and final command results are recorded in the completion report. The local QA ideas are browser-origin-specific and are not automatically transferred to production.
