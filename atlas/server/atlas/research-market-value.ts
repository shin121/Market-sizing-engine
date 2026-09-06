import type {
  DemandEstimate,
  DemandUnavailable,
  DemandUnit,
} from '../../lib/demand';
import type { MarketValueEstimate } from '../../lib/market-value';
import { foodRows, foodSource } from './sector-research';
import { researchEstimate, demandSources } from './research-registry';

/** Monetary estimates consume the same externally estimated cells as population.
 * A source's buying unit, participation denominator and category must all match. */
export function researchMarketValue(
  estimate: DemandEstimate | DemandUnavailable,
): MarketValueEstimate {
  const unit: DemandUnit =
    estimate.status === 'estimated' ? estimate.unit : 'person';
  const population = estimate.status === 'estimated' ? estimate.base : 0;
  const empty: MarketValueEstimate = {
    annualValue: null,
    low: null,
    base: null,
    high: null,
    currency: 'KRW',
    period: 'annual',
    populationUnit: unit,
    scopeId: 'unresolved',
    scopeLabel: '선택 집단의 관련 소비',
    categoryPopulation: population,
    categoryPopulationUnit: unit,
    relevantPopulation: null,
    annualSpendPerUnit: null,
    spendPerUnitRange: null,
    participationRate: null,
    participationIndex: null,
    spendIntensityIndex: null,
    spendDensity: null,
    spendDensityIndex: null,
    shareOfSpendPool: null,
    method: null,
    confidence: 'Unavailable',
    completeness: 0,
    status:
      estimate.status === 'estimated'
        ? 'missing_calibration_anchor'
        : 'outside_anchor_scope',
    isAdditive: false,
    additiveForDisjointPopulations: false,
    componentIds: [],
    coverage: {
      population: estimate.status === 'estimated' ? 1 : 0,
      directSpend: 0,
      anchor: 0,
      isPartial: true,
      supportedMarkets: 0,
      totalMarkets: 1,
    },
    sourceBasis: [],
    assumptions: [
      '참여 집단과 같은 품목·채널·구매 주체의 지출 기준이 필요합니다.',
    ],
  };
  if (estimate.status !== 'estimated') return empty;
  let anchorId: string, scopeLabel: string, monthly: (age?: number) => number;
  if (unit === 'person' && estimate.factorIds.includes('food_dining')) {
    anchorId = 'food_dining';
    scopeLabel = '개인 외식 · 음식점에서의 식사';
    const labels = ['19~29세', '30~39세', '40~49세', '50~59세', '60세 이상'];
    monthly = (age = 20) =>
      foodRows('654')[
        labels[Math.min(4, Math.max(0, Math.floor((age - 20) / 10)))]
      ].at(-1)!;
  } else if (
    unit === 'household' &&
    estimate.factorIds.includes('food_delivery_household')
  ) {
    anchorId = 'food_delivery_household';
    scopeLabel = '가족 배달·포장 식사';
    monthly = () => foodRows('503')['전체'].at(-1)!;
  } else return empty;
  if (estimate.unionGroups?.some((g) => !g.includes(anchorId)))
    return {
      ...empty,
      assumptions: [
        '합집합의 일부만 지출 근거와 일치합니다. 해당 지출을 다른 활동 인구에 적용하거나 중복 지출을 합산하지 않습니다.',
      ],
    };
  const anchor = researchEstimate([anchorId], unit);
  if (anchor.status !== 'estimated') return empty;
  const annual = (e: DemandEstimate, level: 'low' | 'base' | 'high') =>
    e.cells.reduce(
      (sum, c) =>
        sum +
        c[level] *
          monthly(c.ageMin) *
          12 *
          (level === 'low' ? 0.75 : level === 'high' ? 1.25 : 1),
      0,
    );
  const low = annual(estimate, 'low'),
    base = annual(estimate, 'base'),
    high = annual(estimate, 'high');
  const anchorValue = annual(anchor, 'base');
  const spend = population > 0 ? base / population : 0;
  const conditional = estimate.factorIds.length > anchor.factorIds.length;
  return {
    ...empty,
    scopeId: anchorId,
    scopeLabel,
    denominatorBasis: 'modeled_participant',
    denominatorLabel:
      unit === 'household' ? '가족 배달·포장 이용 가구' : '개인 외식 이용 성인',
    annualValue: base,
    low,
    base,
    high,
    relevantPopulation: population,
    annualSpendPerUnit: spend,
    spendPerUnitRange: { low: spend * 0.75, base: spend, high: spend * 1.25 },
    participationRate: 1,
    categoryPopulation: population,
    spendDensity: spend,
    spendDensityIndex:
      anchor.base > 0 ? spend / (anchorValue / anchor.base) : null,
    spendIntensityIndex:
      anchor.base > 0 ? spend / (anchorValue / anchor.base) : null,
    shareOfSpendPool: anchorValue > 0 ? base / anchorValue : null,
    method: 'calibrated_baseline',
    confidence: conditional ? 'Low' : 'Medium',
    completeness: conditional ? 0.55 : 0.8,
    status: 'estimated',
    additiveForDisjointPopulations: true,
    componentIds: [anchorId],
    coverage: {
      population: 1,
      directSpend: 0,
      anchor: 1,
      isPartial: false,
      supportedMarkets: 1,
      totalMarkets: 1,
    },
    sourceBasis: demandSources
      .filter(
        (s) => estimate.sourceIds.includes(s.id) || s.id === foodSource.id,
      )
      .map((s) => ({
        id: s.id,
        title: s.title,
        url: s.url,
        locator: s.locator,
        referencePeriod: s.referencePeriod,
      })),
    assumptions: [
      ...estimate.assumptions,
      '월 지출 조사값을 12배 해 연간화합니다. 지출율의 Low/High ±25%와 참여인구 범위를 함께 적용한 민감도 모형입니다.',
      unit === 'person'
        ? '개인 외식의 연령별 월 지출 평균을 사용합니다. 목적·후기·성별 조건별 실제 지출 교차표는 미확보라 같은 연령 평균을 전이합니다.'
        : '배달·포장 이용 가구의 월 평균 92,759.76원을 적용합니다. 주문 빈도·채널별 지출 차이는 아직 관측하지 않았습니다.',
      '가구와 개인의 외식비를 합산하지 않으며, 간편식·식재료·회사 매출·SOM을 포함하지 않습니다.',
    ],
  };
}
