# Atlas redesign — acceptance ledger

Authority: the 2026-09-06 second user specification, sections 0–42, and reference images 2–3. The initial shallow MVP is a baseline, not a completion certificate.

## Required order and evidence

1. Reinspect all Nemotron fields and both requested reference projects. Document semantic families, unavailable fields, lexical support and extraction errors.
2. Extract 30–80 overlapping commercial signal bundles; no market/demographic archetype definitions, no forced exclusive membership, no invented frequency or paid subscriptions.
3. Calibrated weighted membership size, population share, overlap/coverage, Low/Base/High and materialized reproducible dataset.
4. Exact segment/universe signal indexes; distinctiveness, intensity, industry breadth and small/strong scores centrally derived. Distinguish defining signals from independently associated signals.
5. Inspect and print Top 30: name, size, share, signals, industries, distinctiveness, intensity and breadth. Measure holdout stability, redundant memberships and qualifying criteria.
6. Dense light Global Atlas: both lenses, dominant map, five real ranked radar modules, universe snapshot, distribution, opportunities and industry adjacency visible together at 1440×900.
7. Generic EntityDashboard architecture for archetype/market/segment/behavior/need/channel/interest with configuration-driven module composition.
8. Archetype dashboard: size/range/score, demographic and region skew, meaningful indexes, needs/trust/purchase/channels, market affinity, related types, embedded relationships, opportunities, micro patterns and basis.
9. Market dashboard: commercial types, pain/need cohorts, market-specific submarkets/behaviors/purchase/discovery, high-index/largest/small-strong types, adjacency and candidates.
10. Segment/signal dashboard: exact joint, comparison against parent type and market, other signals, nearby segments, and inspectable aggregate dataset.
11. Canonical /atlas routes; cell/entity/search links open full dashboards; >4-level drill-through; browser back/forward, reload and breadcrumbs work.
12. Top-level Relationship, Matrix and Opportunity retain URL context; embedded modules deep-link; Matrix narrows by two conditions; Opportunity highlights current entity and supports comparison.
13. Global search spans all entity classes and generated segments. No AI chat, research workflow, simulator, experiments, admin, persona illustrations or report generator.
14. Browser acceptance 1–10 plus first-viewport visual acceptance for Atlas and Archetype; inspect a real 10–15 minute discovery session and record several evidence-backed candidate hypotheses.
15. Independent engine/oracle tests, route/context tests, lint/typecheck/test/build, aggregate-only browser boundary, production smoke and 21-item final report.

## Verified implementation state

- Data order: complete corpus reinspection, 52 overlapping bundles, 221 qualifying candidates, Top 30 reviewed before UI. See NEMOTRON_DATA_AUDIT.md, ARCHETYPE_TOP_30.md and DATA_AND_ESTIMATION.md.
- Exact calculations: 70 independent SQL oracle contexts, all type memberships, metric parity, overlapping types and structural zeros. Fingerprint-linked 1,396 exact cubes.
- Product: all required canonical entity pages, underlying aggregate dataset, people/market lenses, five Radar groups, market consumer/pain cohorts, parent differences and four-level drill-through implemented.
- Integration: Relationship selected-node analysis, two-axis Matrix, current-entity Opportunity highlight, URL comparison, global entity/segment search and history/reload proven in browser-discovery.json.
- Browser: ten industries completed, meaningful independent Matrix indexes, qualitative candidate hypotheses, 1440/1920/mobile checks. See BROWSER_QA.md.
- Quality: lint, TypeScript, 22 domain tests, two lexical tests (14 labeled cases), build, accessibility zero violations on checked pages. Built Worker API/page smoke and raw-browser boundary recorded.
- Publishing: final private deployment and published smoke are recorded separately in the delivery note after deployment succeeds.
