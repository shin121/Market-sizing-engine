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

- Historical skin/beauty sizing used 45,697 lexical matches (~2.06m projected)
  intersected with calibrated broad beauty (~1.90m). That figure was not a
  cosmetics user population and is no longer used by the production research
  flow.
- Broad beauty calibration covers online fashion/sports OR cosmetics. Its
  descendants still use uncalibrated lexical interest membership.
- Skin/beauty money previously inherited all online clothing/accessories/cosmetics
  (~3.1tn allocated), so the default category scope did not match its label.
- Generic pain co-occurrence is not proof of a problem experienced in that market.
- Prior green technical tests did not certify real market prevalence.

## Current checkpoint

The external model covers 20 explicitly scoped markets, 67 branches, 200 lower
scenarios and 199 factors. Four unused rare leisure factors correctly remain
unavailable. Dining/delivery retain direct or weighted anchors; reviewed online
category baselines now also cover matching beauty, commerce, travel, fitness,
education, pet, family, mobility and community cohorts. Music listening
additionally uses the KOCCA age-specific paid-user/payment-bin transfer, and
paid content uses the KOCCA 2025 paid-service monthly average. All 20 market journeys were opened in Chrome in the
preceding phases.

Local primary Atlas, search/API, Matrix, Opportunity, comparison, source inspection
and saved ideas now use the external model. The 77-test suite, lint/typecheck and
Webpack production build passed. Matrix/flow/comparison navigation, separate units,
money-vs-population rank inversion and 390px overflow were checked in real UI.

29 of 51 previous interest links are mapped. 22 old interests, old commercial
archetype IDs and many joint filters still need sourced mappings. Richer axes,
industry-specific lower archetypes and monetary coverage need further work. Existing
saved notes are preserved. The verified migration was published to production at
the release checkpoint below. No goal completion is claimed.
See `RESEARCH_DEMAND_EVIDENCE.md` and `data/research-demand-sanity.json`.

The release checkpoint publishes the verified external-model migration,
consumer-problem increment and commerce channel increment before further coverage
expansion. This directly fixes
the production skin/beauty 1.90m misinterpretation. Remaining unsupported conditions
stay explicit rather than reverting to synthetic prevalence. GitHub and Vercel
publication were authorized earlier; verify the production alias and old beauty
link after the release. This release is not completion of the broader goal.

Release `59bc7e6` reached GitHub main and Vercel production on 2026-09-07 KST,
deployment `dpl_Fqswjoc2ovY9gFHv3ETQPibHSrJ4` (Ready, 23s remote rebuild).
The production alias and legacy beauty URL were verified in Chrome; skin care
16.60m and online cosmetics 12.99m are separate, explicitly scoped populations.
The skin-care figure is a 2024 국민여가활동조사 미용 활동 cohort (not cosmetics
use); the online-cosmetics figure is an NIA conditional model (internet user →
annual online shopper → cosmetics item buyer). An all-channel cosmetics-user
population is not yet identified from an official nationwide source.
Beauty advertising problems → age 30 → Matrix → Opportunity preserved the 0.28m
segment. Browser error logs were empty; the new deployment error-log query returned
no entries. The production commerce channel flow also shows mobile quality at
1.20m modeled adults with its 67.1% use and 5.1 monthly frequency observation. The
follow-up label aligns the market title with its clothing branch:
`뷰티·패션`, while the skin-care profile remains narrowly defined.

KCA 2025 consumer-life evidence adds ten product-problem parents and thirty
specific problem subtypes with corrected denominators, age/sex models and explicit
regional imputation. See `CONSUMER_PROBLEM_DATA_AUDIT.md`. This replaces generic
purchase scenarios on those new branches; earlier generic branches remain work
in progress. The commerce journey now also exposes four channel-use cohorts and
twelve channel-specific most-serious problem cohorts from the same report. KCA
repairability, service-use and household cost-perception tables remain available
for later integrations.

The follow-up UI increment (`3faab3e`) keeps the presentation hierarchy explicit:
market → experience/need or measured problem → lower behaviour/purchase type.
Lower types such as online search, review checking and equipment exploration are
now rendered as branch-local comparison cards below the relationship canvas. They
remain the same URL-addressable profiles and estimates, but are no longer shown
as peers of the market's top-level experiences.
