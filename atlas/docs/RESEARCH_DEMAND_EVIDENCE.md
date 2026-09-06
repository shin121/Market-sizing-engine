# Research demand evidence — working revision, 2026-09-06

Release checkpoint: `b903e4f` was pushed to GitHub main and deployed to the public
Vercel alias `https://nemotron-market-atlas.vercel.app` (Ready, 34s build).
Deployment: `https://nemotron-market-atlas-asihetqi7-woochul-shins-projects.vercel.app`.
The earlier local-only status below records the development chronology. Current
production uses `research-demand-2026-09-06-v3`; broader coverage work is ongoing.
Chrome verified the old skin/beauty URL redirects to the care-experience profile;
online cosmetics is a separate profile. Production API populations reconcile with
local output: 16,601,061 care-experience adults; 12,993,648.35 online-cosmetics buyers;
280,357.09 adults in their thirties with beauty advertising problems. These exact
values are QA diagnostics; the UI rounds and labels modeled estimates. All three
return missing monetary anchors, preventing old fashion-spend inheritance. The
problem subtype → age filter → Matrix → Opportunity flow was verified on production.
No browser errors were logged, and the deployment error-log scan had no entries.
The follow-up market label is `뷰티·패션`, matching the newly connected clothing
problem branch without relabeling the narrower skin-care cohort as all cosmetics.

This is an in-progress replacement of the population model. It is served locally
at `/atlas/research/[market]` and now powers the local primary `/atlas`, Matrix,
Opportunity, comparison, source and search/API routes. Production still uses its
prior model. Neither this document nor the passing checks certifies
completion of the full Demand OS goal.

## Correcting the beauty interpretation

The old skin/beauty 1.90m was a lexical synthetic-profile intersection. It did not
measure cosmetics use. The independent model uses official adult population and
2024 leisure activity rates: **16.60m adults with skin/hair/nail/beauty activity
experience**, versus **12.99m annual online cosmetics shoppers** from NIA's chained
internet → annual shopping → cosmetics-item rates. These are different cohorts.
Neither is all people who use cosmetics. The OR of the two is non-additive and
modeled; total cosmetics penetration remains an explicit research gap.

## New primary evidence inspected in this phase

| Source | Scope and observed facts | Application / limits |
| --- | --- | --- |
| [KREI 2024 food-consumption tables](https://www.krei.re.kr/foodSurvey/page/285?cmd=view&pst=503545) | Fieldwork 2024-05-13–08-04. Household main buyers 18–79; adult members 19–79. Tables 1-386/388/391/401: family delivery/takeout 68.9% of households; participating households' monthly spend KRW 92,759.76; weekly participation 44.9%; mobile-app orders 68.4% **of delivery households, excluding takeout-only**. | Official household denominator 22,294,419 × weighted survey rates, with transfer uncertainty. Survey household frame was 20,708,168: this scope difference is explicit. Individual and family spending are never added. |
| Same KREI report, tables 2-93/94/97/105 | Adult personal restaurant dining 81.7%; its main purposes taste 39.2%, work/study constraints 31.3%, special occasions 20.2%. Age-specific dining rates and monthly spend; monthly mean KRW 143,785.58 across participating adults. | 20–79 only; 19–29 rate transferred to twenties. Published age rates, imputed sex interaction. Source's 60+ respondents are at most 79. Purpose-specific spending uses the same age's dining mean, explicitly a transfer. |
| Same report, tables 1-340–343 | HMR frequency includes a non-use option. Heat-and-eat non-use 25.1%, ready-to-eat 19.5%, meal-kit 27.2%. | Each product has its own buyers and weekly buyers. No response-count projection; no delivery-spend reuse for HMR. Related product unions use a midpoint of possible overlap bounds, because independence otherwise produces implausibly near-universal participation. |
| [2024 Population and Housing Census](https://www.mods.go.kr/boardDownload.es?bid=203&list_no=437767&seq=3) | Table 68 printed p.89/PDF98: households with 65+ member 7.137m, elderly-only 4.007m, elderly-alone 2.289m. Table 71 p.92/PDF101: households with child ≤18 4.517m, child ≤5 1.284m. | Household situations, not paid care demand, illness or unmet need. Nested subgroups reconcile to official counts. Person/household conversion prohibited. |
| [NIA 2024 tables](https://www.nia.or.kr/site/nia_kor/ex/bbs/View.do?bcIdx=27870&cbIdx=99870) | Tables 128/130, printed pp.273/277, PDF283/287. Internet banking 80.7%, mobile banking 80.6% **of 12+ monthly internet users**. Both provide observed age×sex rates. | The internet denominator is applied once. Mobile is a subset: mobile/total rate is conditional. Digital-bank users are not stock owners or paid advisory clients; transaction/assets are not consumption. |

Only numeric observations and short labels are extracted into product configuration;
full reports and rendered pages remain outside the repository. Hashes and exact
locators are in `config/research/*observations.json`. Food/leisure extraction is
reproducible with the respective Python scripts and the official PDFs.

## Current coverage

- 195 registered external factors. Four rare leisure activities lack an age rate
  and return `not_estimable`; missing table dashes are never converted to zero.
- All 20 markets now have a **defined, sourced partial demand scope**, covering
  56 industry/experience branches. This does not mean complete industry coverage.
- 19 profiles across personal dining and household delivery currently have
  externally anchored annual spend. The new flow does not inherit the old
  narrative-weighted online category allocation.
- Household delivery/HMR profiles include household-head age/sex, household size
  and regional distributions, using KREI weighted margins and conditional rates.
  They do not describe every household member. Other household profile dimensions
  remain missing where no household table has been connected.
- Game profile age/sex shape is from leisure gaming rates, shifted to the separately
  sourced KOCCA overall level. KOCCA's 10–69 rate is transferred to 20–69, explicitly
  an assumption. The new shape preserves the level and has higher twenties than
  sixties participation. It is not the actual KOCCA age cross-tab.

The local follow-up increment also registers KCA's online transaction-channel
tables: PC, mobile, SNS and C2C use cohorts plus three most-serious problem
subtypes per channel. The commerce journey exposes sixteen lower profiles (four
channel parents and twelve problem cohorts). The channel observations preserve
monthly frequency—PC 3.1, mobile 5.1, SNS 1.9, C2C 1.8 uses per month—and the
channel-user problem denominator. Frequency is visible in the selected profile but
does not become spend without item-level ticket size or category calibration. The
new channel profiles are person-based `survey_transfer` estimates, overlap-aware,
and currently have no market value anchor. This increment is local until the
release checkpoint below is updated after live deployment.

## Scope and aggregation controls

The pure estimator cannot import synthetic catalog or membership counts. Duplicate
prerequisites are applied once, source/unit/rate/scope errors are rejected, and
out-of-survey populations are marked outside scope rather than non-users. OR terms
remain in `unionGroups` metadata so monetary anchors cannot incorrectly price every
member of a mixed union. Union and monetary ranges are sensitivity envelopes, not
statistical confidence intervals. No spend pool is a revenue forecast or SOM.

## Verification, including limits

- Atlas: 68 domain/integration tests passed; lint/typecheck passed. `next build --webpack`
  passed, including TypeScript and route generation. Default Turbopack build was
  attempted twice and failed to bind its internal CSS-worker port with EPERM in
  this execution environment; the supported Webpack build validated production
  output without changing deployment configuration.
- Actual Chrome UI: all 20 market journeys opened across this and the preceding
  phase. New dining, delivery, household, finance and game profiles inspected.
  Delivery → app-order households → save idea → reopen original URL passed.
  Game 70+ shows outside scope with no stale demographic chart. No browser error
  logs were returned. 390px viewport has document width 390px; flow canvas scrolls
  internally, mobile title wraps by word, navigation hint present. Viewport reset.
- `data/research-demand-sanity.json` records every served root, branch and child,
  source IDs, units, monetary coverage and gaps. Regenerate after `npm test` with
  `node scripts/audit-research-demand.mjs`.
- Required root Python commands were attempted. System Python pytest had 14
  collection errors (missing duckdb/fastapi/psycopg); bundled Python lacks pytest
  and duckdb. CLI validate cannot import duckdb. Existing ignored raw/processed
  database inputs are also absent in this checkout. No Python implementation was
  changed and these checks are not claimed to have passed.

## Remaining work before goal completion

1. Complete legacy-condition coverage. Primary routes now use the new model;
   29 of 51 old interest URLs resolve to explicit research scopes. The remaining
   22 interests, old commercial archetype IDs and unsupported joint filters are
   retained as unresolved rather than silently dropped or numerically projected.
   Preserve the richer cross-industry/axis functionality as these mappings expand.
2. Complete industry coverage and meaningful lower archetypes for every old
   interest, including household pet/care, finance investment and paid behavior.
   Existing new job statements are hypotheses; pain prevalence is only measured
   for explicitly sourced experience/purpose questions.
3. Connect category-matched money anchors beyond dining/delivery. MAFF pet
   monthly spend is **per animal**, so cannot multiply household count without
   a documented pet-count mapping. Cosmetics spend must exclude clothing.
4. Connect further regional/demographic household cross-tabs and validate all
   detailed combinations, saved comparison, Matrix rank inversion and opportunity
   navigation under the same new model, then GitHub/Vercel release and live QA.


## Local primary-workspace migration

- Primary market map is now an area treemap of sourced demand scopes. Person and
  household lenses are separate; missing money is excluded from area sizing and
  listed explicitly. No national total is synthesized by adding overlapping markets.
- One URL context carries market, branch/subtype, age, metric and up to three
  comparison references through flow → Matrix → Opportunity → comparison.
- 226 addressable profiles: 20 roots, 56 purpose/experience branches, 150 lower
  buying/usage scenarios. `_root` is separate from branch IDs, fixing the collision
  between delivery's aggregate and its delivery/takeout branch.
- Matrix age cells consume the same external profiles and money engine as the
  inspector. Personal dining age cells reconcile to their parent; all cell ordering
  by population differs from ordering by annual spending. Actual Chrome check:
  taste-motivated dining, forties 2.44m / KRW4.5tn vs thirties 2.29m / KRW4.6tn.
  These are sensitivity-based model comparisons, not a statistically established rank.
- Opportunity separates population and economic percentile signals. Existing
  central weights 0.18 / 0.10 are reused; unmeasured need/WTP/competition/growth are
  absent and score completeness stays low. A single supported peer does not get a
  fabricated economic rank. All candidates can be revealed beyond the first 30.
- Comparison supports individual age selection per column and warns on unlike
  population units. Household member-age queries are rejected, not ignored.
- Saved research ideas can edit their hypothesis/question. Existing v1 workspace
  notes remain readable without overwriting or reusing prior projected amounts.
- Search, analysis and profile APIs now advertise the external model; unsupported
  conditions return 422. Verified legacy skin/beauty URL redirects with money metric
  preserved. Search/profile return 16.60m care-experience adults and no cosmetics-
  or clothing-derived money for that cohort.
- Browser: primary map → Matrix → food → population/money switch → forties taste
  profile → comparison; fresh three-column compare with thirties, forties and app-
  delivery households; Opportunity, global skin search and 390px viewport checked.
  Document/body width is 390px at 390px viewport; map scrolls internally. No error
  logs in the final fresh browser session. Earlier development fast refresh briefly
  saw an intermediate edit error; the final fresh session did not reproduce it.
- API smoke checks passed for search, profile, 6×4 food Matrix, unsupported premium
  intersection and invalid household-age query. Profile metadata are loaded only
  for detail/comparison; repeated demographic/source prose is trimmed from lists.
- Remaining data and taxonomy gaps above still apply. No GitHub push, deployment
  or completion of the active goal is claimed by this checkpoint.

## KCA 2025 product-problem journeys — local verified increment

- Audited the 1,108-page official KCA report, original question 2/3 and Appendix 3;
  recorded numeric observations, exact PDF hash, period and no-weighting statement.
  The original 5,035 any-problem denominator is explicitly converted to the 10,000
  all-respondent denominator within every age/sex/region stratum. Full details:
  `CONSUMER_PROBLEM_DATA_AUDIT.md`.
- Ten product-problem cohorts and thirty specific subtypes added across seven
  markets. Total 195 factors / 282 profiles (20 roots, 66 branches, 196 lower
  profiles). The same four unused rare leisure factors remain unavailable; money
  coverage remains 19 profiles. Generic branches and legacy mapping gaps remain.
- Parent/child factors preserve each age's observed all-respondent rate and apply
  parent participation once. Regional missingness is kept in the source data and
  any profile imputation explicitly names its parent/nationwide basis.
- Browser actually opened all ten new problem parents: beauty, clothing, home
  repair, appliances, sports facilities, travel, learning, insurance, financial
  products and health devices. Each exposed its three specific lower types and
  region module. Beauty → advertising problems → Matrix → thirties → comparison
  preserved 0.28m people and age. Added home contract problems (0.22m) and sports
  cancellation/redress (0.59m) to the three-column comparison. Opportunity lists
  the selected product-problem cohort without invented money. Browser errors: [].
- Reference flow screenshot checked: curved links, selected branch/leaf, aligned
  three-column flow and linked profile/range/age/sex/region modules. Measured
  problem experience and unmeasured need severity/payment intent have separate
  UI wording. Nested definitions no longer repeat the parent paragraph.
- Atlas 72/72 tests passed, lint passed, typecheck passed after build, production
  `npm run build -- --webpack` passed. A concurrent typecheck initially raced with
  Next regenerating `.next/types`; the sequential final typecheck passed. No new
  default-Turbopack success is claimed. Numeric sanity ledger regenerated.
- Required root commands rerun with `PYTHONPATH=src`: pytest stops at fourteen
  collection errors (missing duckdb/fastapi/psycopg), and CLI validate cannot import
  duckdb. Original Python implementation and ignored source/database inputs are
  unchanged. These do not certify a full repository pass.
- KCA channel use/frequency/problem numeric tables are integrated locally; the same
  PDF also contains repairability, service-use and other useful items. Continue the
  remaining all-industry data, taxonomy and discovery work before final deployment.
  No active-goal completion or production release is claimed for this follow-up.
