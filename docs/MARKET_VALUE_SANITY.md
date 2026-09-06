# Market Value sanity ledger

Updated 2026-09-07. The machine-readable source of truth is
[`data/research-demand-sanity.json`](../data/research-demand-sanity.json),
regenerated with `node scripts/audit-research-demand.mjs` after each model change.

## Coverage

The research model currently evaluates 20 markets, 195 external factors, 66
experience/problem branches and 197 lower buying, usage or problem scenarios.
120 served profiles have a monetary baseline. Four rare leisure conditions remain
`not_estimable`; missing evidence is never converted into zero.

The monetary baselines are mixed by design: personal dining and household
delivery use observed survey spend anchors; the reviewed category mappings use
2025 National Data Office online transaction totals allocated to matching
externally estimated profiles. They are partial online/category pools, not total
industry spend. Person and household units remain separate, and mixed roots or
overlapping types are non-additive.

## Beauty check

| Profile | Population | Annual Market Value | Spend / unit | Interpretation |
| --- | ---: | ---: | ---: | --- |
| 피부·헤어·뷰티 관리 | 약 1,660만명 | 연결 중 | — | 2024 미용 활동 경험; 전체 화장품 사용자 아님 |
| 온라인 화장품 구매 | 약 1,299만명 | 약 13.8조원 | 약 106만원/명 | 2025 온라인 화장품 구매자 기준 |
| 관리 경험자 중 온라인 화장품 구매 | 약 595만명 | 약 6.3조원 | 약 106만원/명 | 외부 교차표가 없어 조건부 모델 |

The former 190만 value was a synthetic lexical projection and is not retained.
The care cohort and online-buyer cohort are not added because their overlap is
not observed. All-channel cosmetics penetration and offline spend remain open.

## Economic-pattern check

The model preserves the four patterns needed for discovery:

- large population with a large spend pool;
- large population with lower spend density;
- smaller population with high spend per unit;
- smaller population with lower economic priority.

A rank inversion is tested in the Matrix money mode: age cells are recomputed
from the same profile and can change order when spend per unit differs from
population. Opportunity keeps population score and economic-value score as
separate signals, so a high-population/low-spend segment is not treated as the
same opportunity as a smaller premium niche.

## Automated checks

The current Atlas suite has 74 passing tests. It covers denominator nesting,
unit guards, age reconciliation, non-additive unions, category anchor matching,
beauty scope, lower-path availability, Matrix money cells, Opportunity URL
context and the absence of synthetic case-count prevalence. Lint, typecheck and
`next build --webpack` also pass.

These checks prove internal consistency and scope controls. They do not replace
external evidence for willingness to pay, competitive alternatives, growth,
reachability, acquisition cost, offline transactions or service-specific ticket
sizes.
