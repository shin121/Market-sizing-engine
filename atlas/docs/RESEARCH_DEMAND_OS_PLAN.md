# Research-led Demand OS — active goal, 2026-09-06

## Required end state

Market and nested segment population must be estimated from external population,
participation and industry research, independently of the number of synthetic
Nemotron narratives. Nemotron supplies qualitative patterns and explicitly
labeled composition hypotheses, never the prevalence denominator. All 20
markets and their nested segments must support industry-specific needs, pains,
archetypes, demographics, region and consumption patterns. Relationship discovery
must implement the supplied flowing market → axis → subtype → archetype reference,
with interactive selection and a linked evidence/profile panel. Existing Matrix,
Opportunity, comparisons, saved ideas and drill-through must continue to work.

## Completion gates (none certified by this plan)

- [ ] External evidence register: exact population unit, survey population, period,
  reference URL/locator, numeric observation, transformation and freshness.
- [ ] All 20 market denominators researched; usable estimates and uncertainty
  explain real demand, rather than matching synthetic sample counts.
- [ ] Every existing interest and new industry-specific need/archetype has a
  documented conditional estimate; no silent generic-rate or narrative fallback.
- [ ] Estimator is invariant to duplicated/removed synthetic cases. Nested
  conditions, age unions and intersections are coherent and order-independent.
- [ ] Person and household scopes remain separate. Unsupported demographic joins
  are explicitly assumptions, not a household-to-person conversion.
- [ ] Monetary scope follows the actual category; cosmetics excludes clothing,
  education services are not equated with stationery, and no spend is SOM.
- [ ] Industry-specific jobs/pains have source evidence and differentiated
  alternatives, frequency, paid behavior and follow-up validation questions.
- [ ] Market → need/usage → archetype → demographics/region/use patterns works
  across every market; common generic pains do not substitute for market needs.
- [ ] Interactive relationship flow, selected-node side panel, uncertainty and
  source inspection match reference design and remain accessible/responsive.
- [ ] Matrix, Opportunity, search, comparison and ideas use the same new estimates.
- [ ] PM audit of every market/interest: credible order of magnitude, plausible
  buying unit/frequency/spend, category/parent containment, useful business hypothesis.
- [ ] Lint/typecheck/tests/build and actual browser journeys across all markets;
  final GitHub/Vercel deployment and live verification.

## Work sequence

1. Inspect current evidence and source-to-number failures; research independently.
2. Build a versioned external demand registry and a pure estimator without access
   to synthetic counts. Preserve original narrative evidence separately.
3. Extend research and industry-specific need taxonomy to every market and interest.
4. Integrate central population, monetary and opportunity engines and test invariants.
5. Implement reference relationship flow and contextual profile, then audit all paths.
6. Iterate on real PM use; deploy only after full checks and live verification.

## Verified starting defects

- Skin/beauty uses 45,697 lexical matches (~2.06m projected) intersected with
  calibrated broad beauty (~1.90m), not a cosmetics user population.
- Broad beauty calibration covers online fashion/sports OR cosmetics. Its
  descendants still use uncalibrated lexical interest membership.
- Skin/beauty money inherits all online clothing/accessories/cosmetics (~3.1tn
  allocated), so the default category scope does not match its label.
- Generic pain co-occurrence is not proof of a problem experienced in that market.
- Prior green technical tests did not certify real market prevalence.

## Current checkpoint

The external model covers 20 explicitly scoped markets, 56 branches, 150 lower
scenarios and 139 factors. Four unused rare leisure factors correctly remain
unavailable. Dining/delivery have 19 monetary profiles; other matching anchors
remain work in progress. All 20 market journeys were opened in Chrome in the
preceding phases.

Local primary Atlas, search/API, Matrix, Opportunity, comparison, source inspection
and saved ideas now use the external model. The 68-test suite, lint/typecheck and
Webpack production build passed. Matrix/flow/comparison navigation, separate units,
money-vs-population rank inversion and 390px overflow were checked in real UI.

29 of 51 previous interest links are mapped. 22 old interests, old commercial
archetype IDs and many joint filters still need sourced mappings. Richer axes,
industry-specific lower archetypes and monetary coverage need further work. Existing
saved notes are preserved. Production has not migrated. No goal completion is claimed.
See `RESEARCH_DEMAND_EVIDENCE.md` and `data/research-demand-sanity.json`.
