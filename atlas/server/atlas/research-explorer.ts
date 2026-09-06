import { researchMarkets } from '../../config/research/market-journeys';
import {
  demandFactors,
  demandSources,
  researchEstimate,
  researchUnion,
} from './research-registry';
import { leisureObservations } from './leisure-research';
import geography from '../../config/research/region-frame.json';
import { researchMarketValue } from './research-market-value';
import { foodProfileMargins } from './sector-research';
import type {
  DemandEstimate,
  DemandUnavailable,
  DemandUnit,
} from '../../lib/demand';
import type {
  ResearchExplorerPayload,
  ResearchProfile,
} from '../../lib/research-explorer';

const profiles = new Map<string, ResearchProfile>();
const regionLabels = [
  '서울',
  '부산',
  '대구',
  '인천',
  '광주',
  '대전',
  '울산',
  '세종',
  '경기',
  '강원',
  '충북',
  '충남',
  '전북',
  '전남',
  '경북',
  '경남',
  '제주',
];
function profile(
  id: string,
  label: string,
  groups: string[][],
  unit: DemandUnit,
  unionModel: 'conditional_independence' | 'overlap_bounds' = 'conditional_independence',
): ResearchProfile {
  const cacheKey = [id, unit, unionModel, JSON.stringify(groups)].join(':');
  const previous = profiles.get(cacheKey);
  if (previous) return previous;
  const estimate =
    groups.length === 1
      ? researchEstimate(groups[0], unit)
      : researchUnion(groups, unit, unionModel);
  const factors =
    estimate.status === 'estimated' ? estimate.factorIds : groups.flat();
  const active = demandFactors.filter((f) => factors.includes(f.id));
  const activities = leisureObservations.filter((a) =>
    factors.includes('leisure_' + a.code),
  );
  let regionBasis =
    unit !== 'person'
      ? '가구 구성원의 지역·연령 분포는 아직 연결되지 않았습니다.'
      : groups.length > 1
        ? '여러 활동의 합집합에 대한 지역별 중복률이 없어 지역 분포를 아직 추정하지 않습니다.'
        : activities.length
          ? '2024 공식 지역 인구 비중에 여가조사 지역별 활동 비율을 적용한 지역 배분 모형입니다. 지역×연령 교차표와 추가 구매 조건의 지역차는 미확보입니다.'
          : '이 대상의 지역별 경험률을 확보하지 못했습니다.';
  let regions: ResearchProfile['regions'] = [];
  if (
    unit === 'person' &&
    groups.length === 1 &&
    activities.length &&
    activities.every((a) =>
      Object.values(a.regionRates).every((p) => p !== null),
    )
  ) {
    const weighted = geography.province_rows.map((r, i) => ({
      label: regionLabels[i],
      value:
        r.person *
        activities.reduce(
          (product, a) =>
            product *
            (a.regionRates[regionLabels[i] as keyof typeof a.regionRates] ?? 0),
          1,
        ),
    }));
    const total = weighted.reduce((n, r) => n + r.value, 0);
    regions = weighted.map((r) => ({ label: r.label, share: r.value / total }));
  }
  const foodMargins =
    estimate.status === 'estimated' ? foodProfileMargins(estimate) : null;
  if (foodMargins?.regions.length) {
    regions = foodMargins.regions;
    regionBasis = foodMargins.basis;
  }
  const out: ResearchProfile = {
    id,
    label,
    estimate,
    marketValue: researchMarketValue(estimate),
    factors,
    ages: [],
    sexes: [],
    householdProfile:
      foodMargins && unit === 'household'
        ? {
            ages: foodMargins.headAges,
            sexes: foodMargins.headSexes,
            sizes: foodMargins.householdSizes,
            basis: foodMargins.basis,
          }
        : undefined,
    observations: active.map((f) => ({ label: f.label, value: f.observation })),
    regions,
    regionBasis,
    sources: demandSources.filter(
      (s) =>
        estimate.status === 'estimated' && estimate.sourceIds.includes(s.id),
    ),
    evidenceGrade:
      estimate.status !== 'estimated' ||
      estimate.methods.includes('research_scenario') ||
      (estimate.status === 'estimated' && !!estimate.unionGroups)
        ? 'D'
        : estimate.methods.includes('survey_transfer')
          ? 'C'
          : 'B',
  };
  profiles.set(cacheKey, out);
  return out;
}
export function getResearchExplorer(
  marketId: string,
  age = '',
): ResearchExplorerPayload | null {
  const market = researchMarkets.find((m) => m.id === marketId);
  if (!market) return null;
  const roots = (m: typeof market) => [
    ...(m.rootGroups ?? []),
    ...m.branches.map((b) => b.factors),
  ];
  const filter = (p: ResearchProfile): ResearchProfile => {
    const estimate = researchAgeSlice(p.estimate, age);
    if (estimate.status !== 'estimated' || estimate.unit !== 'person')
      return {
        ...p,
        estimate,
        marketValue: researchMarketValue(estimate),
        householdProfile:
          estimate.status === 'estimated' ? p.householdProfile : undefined,
        ages: [],
        sexes: [],
        regions: estimate.status === 'estimated' ? p.regions : [],
        regionBasis:
          estimate.status === 'estimated' ? p.regionBasis : estimate.detail,
      };
    return {
      ...p,
      estimate,
      marketValue: researchMarketValue(estimate),
      ages: [20, 30, 40, 50, 60, 70].map((min) => ({
        label:
          estimate.populationScope &&
          min < estimate.populationScope.ageMin &&
          min + 9 >= estimate.populationScope.ageMin
            ? estimate.populationScope.ageMin + '–' + (min + 9)
            : min === 70
              ? estimate.populationScope?.ageMax === 79
                ? '70대'
                : '70+'
              : min + '대',
        covered:
          !estimate.populationScope ||
          (min <= (estimate.populationScope?.ageMax ?? 120) &&
            min + 9 >= (estimate.populationScope?.ageMin ?? 20)),
        share: estimate.base
          ? estimate.cells
              .filter(
                (c) => c.ageMin! >= min && (min === 70 || c.ageMin! < min + 10),
              )
              .reduce((n, c) => n + c.base, 0) / estimate.base
          : 0,
      })),
      sexes: ['male', 'female'].map((sex) => ({
        label: sex === 'male' ? '남성' : '여성',
        share: estimate.base
          ? estimate.cells
              .filter((c) => c.sex === sex)
              .reduce((n, c) => n + c.base, 0) / estimate.base
          : 0,
      })),
    };
  };
  const root = filter(
    profile('_root', market.label, roots(market), market.unit, market.unionModel),
  );
  return {
    version: 'research-demand-2026-09-06-v3',
    market,
    root,
    markets: researchMarkets.map((m) => {
      const p = profile(m.id, m.label, roots(m), m.unit, m.unionModel);
      return {
        id: m.id,
        label: m.label,
        unit: m.unit,
        population: p.estimate.status === 'estimated' ? p.estimate.base : null,
        scope: m.scope,
      };
    }),
    branches: market.branches.map((branch) => ({
      ...branch,
      profile: filter(
        profile(branch.id, branch.label, [branch.factors], market.unit),
      ),
      children: branch.children
        ? branch.children.map((c) =>
            filter(
              profile(
                branch.id + '~' + c.id,
                c.label,
                [[...branch.factors, ...c.factors]],
                market.unit,
              ),
            ),
          )
        : market.unit === 'person'
          ? [
              profile(
                branch.id + '~online',
                '온라인 구매 가능층',
                [[...branch.factors, 'commerce']],
                market.unit,
              ),
              profile(
                branch.id + '~presearch',
                '사전 정보 검토형',
                [[...branch.factors, 'research_presearch']],
                market.unit,
              ),
              profile(
                branch.id + '~review',
                '후기 참고 가능층',
                [[...branch.factors, 'research_review']],
                market.unit,
              ),
            ].map(filter)
          : [],
    })),
  };
}
/** Apply demographic filters to external cells, never to narrative membership. */
export function researchAgeSlice(
  estimate: DemandEstimate | DemandUnavailable,
  age: string,
): DemandEstimate | DemandUnavailable {
  if (estimate.status !== 'estimated' || !age) return estimate;
  if (estimate.unit !== 'person')
    return {
      status: 'not_estimable',
      reason: 'unit_mismatch',
      detail: '가구를 가구원 연령으로 나누려면 가구 기준 교차표가 필요합니다.',
    };
  const min = Number(age),
    max = min === 70 ? 120 : min + 9;
  if (
    estimate.populationScope &&
    (max < estimate.populationScope.ageMin ||
      min > estimate.populationScope.ageMax)
  )
    return {
      status: 'not_estimable',
      reason: 'outside_scope',
      detail: `이 추정의 대상은 ${estimate.populationScope.ageMin}~${estimate.populationScope.ageMax}세입니다. 대상 밖 인구를 비이용자로 간주하지 않습니다.`,
    };
  if (![20, 30, 40, 50, 60, 70].includes(min))
    return {
      status: 'not_estimable',
      reason: 'invalid_model',
      detail: '지원하지 않는 연령 조건',
    };
  const cells = estimate.cells.filter(
    (c) => c.ageMin !== undefined && c.ageMin >= min && c.ageMin <= max,
  );
  return {
    ...estimate,
    cells,
    low: cells.reduce((n, c) => n + c.low, 0),
    base: cells.reduce((n, c) => n + c.base, 0),
    high: cells.reduce((n, c) => n + c.high, 0),
    definitions: [...estimate.definitions, `${min}~${max}세`],
  };
}
