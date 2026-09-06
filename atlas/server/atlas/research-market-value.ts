import type {
  DemandEstimate,
  DemandUnavailable,
  DemandUnit,
} from '../../lib/demand';
import type { MarketValueEstimate } from '../../lib/market-value';
import { foodRows, foodSource } from './sector-research';
import { researchEstimate, demandSources } from './research-registry';
import external from '../../config/external-spend.json';

type ExternalComponent = (typeof external.components)[number];

const externalComponents = new Map<string, ExternalComponent>(
  external.components.map((component) => [component.id, component]),
);
const onlineAllocation = external.allocation;
const onlineSource = {
  id: external.source.id,
  title: external.source.title,
  url: external.source.url,
  locator: external.source.locator,
  referencePeriod: external.source.referencePeriod,
};

/**
 * An external category total can be useful without pretending it is a direct
 * respondent spend field. Each mapping names the external transaction scope
 * and the independently estimated population denominator used to allocate it.
 * A mapping is intentionally narrow: for example, the beauty mapping only
 * applies to the sourced online-cosmetics cohort, never to the broader beauty
 * activity cohort or to a union root that also contains fashion problems.
 */
const externalAnchors: {
  marketId: string;
  factorId: string;
  /** Factors that identify this market's relevant cohort. */
  matchFactorIds?: string[];
  /** A broad market anchor must not price a narrower or offline branch. */
  excludeFactorIds?: string[];
  baselineFactorIds: string[];
  componentIds: string[];
  label: string;
  populationUnit: DemandUnit;
}[] = [
  {
    marketId: 'beauty',
    factorId: 'cosmetics_online_buyers',
    baselineFactorIds: ['cosmetics_online_buyers'],
    componentIds: ['cosmetics'],
    label: '온라인 화장품 거래액',
    populationUnit: 'person',
  },
  {
    marketId: 'commerce',
    factorId: 'cosmetics_online_buyers',
    baselineFactorIds: ['cosmetics_online_buyers'],
    componentIds: ['cosmetics'],
    label: '온라인 화장품 거래액',
    populationUnit: 'person',
  },
  {
    marketId: 'commerce',
    factorId: 'commerce',
    excludeFactorIds: ['cosmetics_online_buyers', 'leisure_F63'],
    baselineFactorIds: ['commerce'],
    componentIds: external.scopes.commerce.components,
    label: '온라인 상품·서비스 거래액',
    populationUnit: 'person',
  },
  {
    marketId: 'travel',
    factorId: 'travel_domestic',
    matchFactorIds: [
      'travel_domestic',
      'leisure_E39',
      'leisure_E38',
      'leisure_E41',
      'leisure_E42',
    ],
    baselineFactorIds: ['travel_domestic'],
    componentIds: ['travel-transport'],
    label: '온라인 여행·교통서비스 거래액',
    populationUnit: 'person',
  },
  {
    marketId: 'fitness',
    factorId: 'fitness',
    matchFactorIds: [
      'fitness',
      'int_fitness_hiking',
      'int_fitness_gym',
      'leisure_D29',
      'leisure_D30',
      'leisure_F55',
    ],
    baselineFactorIds: ['fitness'],
    componentIds: ['sports'],
    label: '온라인 스포츠·레저용품 거래액',
    populationUnit: 'person',
  },
  {
    marketId: 'education',
    factorId: 'education',
    baselineFactorIds: ['education'],
    componentIds: ['books', 'stationery'],
    label: '온라인 서적·문구 거래액',
    populationUnit: 'person',
  },
  {
    marketId: 'pet',
    factorId: 'pet_household',
    baselineFactorIds: ['pet_household'],
    componentIds: ['pet-supplies'],
    label: '온라인 반려용품 거래액',
    populationUnit: 'household',
  },
  {
    marketId: 'family',
    factorId: 'family_children',
    baselineFactorIds: ['family_children'],
    componentIds: ['children'],
    label: '온라인 아동·유아용품 거래액',
    populationUnit: 'household',
  },
  {
    marketId: 'mobility',
    factorId: 'leisure_E48',
    matchFactorIds: ['leisure_E48'],
    baselineFactorIds: ['leisure_E48'],
    componentIds: ['automotive'],
    label: '온라인 자동차·자동차용품 거래액',
    populationUnit: 'person',
  },
  {
    marketId: 'community',
    factorId: 'leisure_H86',
    matchFactorIds: [
      'leisure_H86',
      'leisure_H82',
      'leisure_H80',
      'leisure_H84',
      'leisure_H85',
    ],
    baselineFactorIds: [],
    componentIds: ['culture-leisure'],
    label: '온라인 문화·레저서비스 거래액',
    populationUnit: 'person',
  },
];

function boundedFraction(value: number) {
  return Math.max(0, Math.min(1, value));
}

/** Allocate a published online category total to an externally estimated
 * profile. This is a category baseline, not a direct spend observation. */
function externalBaselineValue(
  estimate: DemandEstimate,
  marketId: string,
): MarketValueEstimate | null {
  // A union root may contain unrelated activities or problem cohorts. Applying
  // one category total to it would hide overlap and double count the spend.
  if (estimate.unionGroups?.length) return null;
  const anchor = externalAnchors.find(
    (candidate) =>
      candidate.marketId === marketId &&
      !(candidate.excludeFactorIds ?? []).some((id) =>
        estimate.factorIds.includes(id),
      ) &&
      (candidate.matchFactorIds ?? [candidate.factorId]).some((id) =>
        estimate.factorIds.includes(id),
      ),
  );
  if (!anchor || estimate.unit !== anchor.populationUnit) return null;
  const denominator = researchEstimate(
    anchor.baselineFactorIds,
    anchor.populationUnit,
  );
  if (denominator.status !== 'estimated' || denominator.base <= 0) return null;
  const selectedBase = estimate.base;
  const baseShare = boundedFraction(selectedBase / denominator.base);
  const lowShare = boundedFraction(
    (estimate.low / Math.max(denominator.high, 1)) *
      Number(onlineAllocation.lowMultiplier),
  );
  const highShare = boundedFraction(
    (estimate.high / Math.max(denominator.low, 1)) *
      Number(onlineAllocation.highMultiplier),
  );
  const components = anchor.componentIds
    .map((id) => externalComponents.get(id))
    .filter((component): component is ExternalComponent => !!component);
  if (components.length !== anchor.componentIds.length) return null;
  const national = components.reduce((sum, c) => sum + c.annual2025, 0);
  const previousNational = components.reduce(
    (sum, c) => sum + c.annual2024,
    0,
  );
  const base = national * baseShare;
  const fullAnchor =
    Math.abs(selectedBase - denominator.base) < 0.0001 &&
    estimate.factorIds.includes(anchor.factorId);
  const low = fullAnchor ? national : national * lowShare;
  const high = fullAnchor ? national : Math.min(national, national * highShare);
  const spend = selectedBase > 0 ? base / selectedBase : null;
  const spendLow = fullAnchor
    ? spend
    : estimate.high > 0
      ? low / estimate.high
      : null;
  const spendHigh = fullAnchor
    ? spend
    : estimate.low > 0
      ? high / estimate.low
      : null;
  const categoryLabel =
    anchor.populationUnit === 'household' ? '관련 가구당' : '관련 성인당';
  return {
    annualValue: base,
    low,
    base,
    high,
    currency: 'KRW',
    period: 'annual',
    populationUnit: anchor.populationUnit,
    scopeId: 'online-' + marketId + '-' + anchor.factorId,
    scopeLabel: anchor.label + ' · 2025',
    categoryPopulation: denominator.base,
    categoryPopulationUnit: anchor.populationUnit,
    relevantPopulation: selectedBase,
    annualSpendPerUnit: spend,
    spendPerUnitRange:
      spend === null || spendLow === null || spendHigh === null
        ? null
        : { low: spendLow, base: spend, high: spendHigh },
    participationRate: null,
    participationIndex: null,
    spendIntensityIndex: null,
    spendDensity: spend,
    spendDensityIndex: null,
    shareOfSpendPool: national > 0 ? base / national : null,
    method: 'calibrated_baseline',
    confidence: 'Low',
    completeness: anchor.factorId === 'cosmetics_online_buyers' ? 0.72 : 0.58,
    status: 'estimated',
    isAdditive: false,
    additiveForDisjointPopulations: true,
    componentIds: anchor.componentIds,
    coverage: {
      population: baseShare,
      directSpend: 0,
      anchor: 1,
      isPartial: true,
      supportedMarkets: 1,
      totalMarkets: 1,
    },
    componentBreakdown: components.map((component) => ({
      id: component.id,
      label: component.label,
      annualValue: component.annual2025 * baseShare,
      nationalValue: component.annual2025,
      previousNationalValue: component.annual2024,
      sourceId: external.source.id,
    })),
    nationalTrend: [
      { year: 2024, value: previousNational },
      { year: 2025, value: national },
    ],
    denominatorBasis: 'adult_profile_allocation',
    denominatorLabel: categoryLabel + ' 연간 온라인 거래액 배분',
    sourceBasis: [
      onlineSource,
      ...demandSources
        .filter((source) => estimate.sourceIds.includes(source.id))
        .map((source) => ({
          id: source.id,
          title: source.title,
          url: source.url,
          locator: source.locator,
          referencePeriod: source.referencePeriod,
        })),
    ].filter((source, index, all) =>
      all.findIndex((candidate) => candidate.id === source.id) === index,
    ),
    assumptions: [
      ...estimate.assumptions,
      `전국 ${anchor.label} 거래액을 선택 집단의 외부 추정 인구 비중(${(baseShare * 100).toFixed(1)}%)으로 배분했습니다. 직접 응답자의 품목별 지출이 아닙니다.`,
      '온라인 거래액만 포함하며 오프라인·직접거래·서비스 이용료·회사 매출·SOM을 포함하지 않습니다.',
      '분모는 해당 기준 인구의 공식 조사 추정치입니다. 집단별 실제 구매 빈도·객단가 교차표가 없어 Low/Base/High는 배분 민감도입니다.',
      selectedBase > denominator.base
        ? '선택 활동 인구가 기준 인구보다 크게 추정되어 배분 비중을 100%로 제한했습니다. 활동률과 거래 구매자 분모가 완전히 일치하지 않는다는 신호입니다.'
        : '선택 집단과 기준 인구의 중복은 외부 조사에서 직접 관측되지 않아 인구 비중 배분을 사용했습니다.',
    ],
  };
}

/** Monetary estimates consume the same externally estimated cells as population.
 * A source's buying unit, participation denominator and category must all match. */
export function researchMarketValue(
  estimate: DemandEstimate | DemandUnavailable,
  marketId = '',
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
  } else {
    return externalBaselineValue(estimate, marketId) ?? empty;
  }
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
