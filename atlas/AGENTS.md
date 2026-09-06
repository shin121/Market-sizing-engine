# Product principles

1. 이 제품은 Market Sizing Dashboard가 아니라 Opportunity Discovery Workbench다.
2. Nemotron raw schema를 UI IA로 사용하지 않는다.
3. Market, Commercial Archetype, Signal, Segment를 분리한다. Archetype은 중복 소속 가능한 소비 메커니즘이다.
4. 특정 산업 중심으로 제품을 설계하지 않는다.
5. 전체 시장에서 산업과 유형을 자유롭게 탐색할 수 있어야 한다.
6. 추정·Synthetic·Proxy·Heuristic을 정상적인 분석 수단으로 활용한다.
7. 추정이라는 이유로 유용한 Signal을 숨기지 않는다.
8. False precision은 만들지 않는다.
9. View마다 별도 계산 로직이나 filter state를 만들지 않는다.
10. Card collection / Admin Dashboard 형태로 회귀하지 않는다.
11. 데이터를 보여주는 것보다 발견을 유도하는 것이 중요하다.
12. Mock data로 완성된 척하지 않는다.
13. Nemotron raw data를 browser로 보내지 않는다.
14. 새로운 기능을 임의로 Scope에 추가하지 않는다.

## Implementation

- Pipeline order: audit → normalization → extraction → sizing → taxonomy → signals → segments → UI → QA.
- New implementation. Do not copy old Market Sizing UI, README, IA, types or components.
- Central engines live in `server/`; all views share `AnalysisContext`.
- Raw Parquet stays outside the project. Only aggregate summaries leave the server.
- Reanalyze the corpus and validate 30–80 overlapping commercial archetypes before changing the frontend. Exclude market and demographic labels from archetype definitions/names.
- The light analytical references (images 2 and 3, 2026-09-06 request) govern layout. At 1440×900 the overview and each full dashboard expose multiple linked analysis modules.
- Core drill-through uses canonical URL-addressable full dashboards, never a detail drawer. Preserve browser history, breadcrumbs, and URL analysis context.
- Every entity exposes aggregated underlying datasets and evidence. Never serialize raw narratives or individual identifiers to the browser.
- Population and economic spend are separate lenses. Use the central MarketValueEstimate; never calculate money in views or equate spend pools with company revenue/SOM.
- Missing direct spend, income, trend, and competition remain explicitly unavailable. Spend estimates may use verified external and existing anchors with explicit population unit, period, scope, assumptions and coverage. Never invent KRW baselines or convert affinity directly into spend.
- Household expenditure requires a deduplicated household population mapping. Overlapping archetypes and industry components are non-additive; aggregate the population once instead of summing their spend.
- Missing opportunity metrics are null, never zero. Ranges are heuristic sensitivity bands, not statistical confidence intervals.
- Run lint, typecheck, tests, build and browser QA before marking complete.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
