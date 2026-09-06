import data from '../../config/research/demand-registry.json';
import controls from '../../config/population-controls.json';
import type {
  DemandCell,
  DemandFactor,
  DemandSource,
  DemandUnit,
} from '../../lib/demand';
import { estimateResearchDemand } from './research-demand';
import {
  leisureSource,
  leisureFactors,
  withExternalProfileShape,
} from './leisure-research';
import type { DemandEstimate, DemandUnavailable } from '../../lib/demand';
import prior from '../../config/behavior-calibration.json';
import { foodSource, sectorFactors } from './sector-research';
import sectorFacts from '../../config/research/sector-observations.json';
import { consumerSource, consumerFactors } from './consumer-research';

const purchaseSource = prior.sources.find((s) => s.id === 'KCA-PURCHASE-2024')!;
export const demandSources: DemandSource[] = [
  ...(data.sources as DemandSource[]),
  leisureSource,
  foodSource,
  consumerSource,
  {
    ...purchaseSource,
    publisher: '한국소비자원',
    retrievedAt: '2026-09-06',
    surveyUniverse:
      '20~60대 구매 전 정보검색 조사; 후기 항목은 품질 비교정보 경험자로 선별한 응답자',
    limitations: [
      '후기 71.4%는 선별 응답자 비율. 모든 성인의 직접 경험률이 아님.',
      '특정 산업의 구매 성향으로 옮길 때 전이 가정과 넓은 민감도 범위가 필요.',
    ],
  },
];
const purchaseFactors: DemandFactor[] = [
  {
    id: 'research_presearch',
    label: '사전 정보 검토 가능층 · 20~69세',
    unit: 'person',
    populationScope: { ageMin: 20, ageMax: 69 },
    prerequisites: [],
    method: 'research_scenario',
    sourceIds: [purchaseSource.id],
    definition:
      '일반 구매 전 정보검색 성향을 해당 시장에 전이한 20~69세 시나리오. 해당 제품 구매 의향이 아님',
    observation:
      '한국소비자원 사전 정보검색 71.0%. 시장별 경험률은 별도 조사 필요.',
    rates: [
      { ageMin: 20, ageMax: 69, low: 0.45, base: 0.71, high: 0.86 },
      { ageMin: 70, ageMax: 120, low: 0, base: 0, high: 0 },
    ],
    assumptions: [
      'Low 45%, Base 71%, High 86%는 산업 간 전이 오차를 탐색하기 위한 설정이며 조사 신뢰구간이 아닙니다.',
      '70세 이상은 조사 범위 밖으로 이 세그먼트의 대상에서 제외하며, 정보검색을 하지 않는다는 뜻이 아닙니다.',
    ],
    validationQuestion:
      '이 시장 구매자가 일반 구매자와 같은 비율로 정보를 검토하는가?',
  },
  {
    id: 'research_review',
    label: '후기 참고 가능층 · 20~69세',
    unit: 'person',
    prerequisites: ['research_presearch'],
    method: 'research_scenario',
    sourceIds: [purchaseSource.id],
    definition:
      '정보검색 집단에 선별 조사 후기 비율을 전이한 시나리오. 해당 시장의 실제 후기 사용자 수가 아님',
    observation: '품질 비교정보 경험 선별 응답자의 쇼핑몰 후기 71.4%.',
    rates: [{ low: 0.4, base: 0.714, high: 0.88 }],
    assumptions: [
      '선별 표본의 후기 비율을 정보검색 집단에 이식합니다. Low 40%, Base 71.4%, High 88%는 선택 편향을 포함한 민감도 가정입니다.',
    ],
    validationQuestion: '후기 확인이 선택·결제·반품 감소로 이어지는가?',
  },
];
export const demandFactors: DemandFactor[] = [
  ...(data.factors as DemandFactor[]).map(withExternalProfileShape),
  ...leisureFactors,
  ...purchaseFactors,
  ...sectorFactors,
  ...consumerFactors,
];
export const adultResearchFrame: DemandCell[] = controls.controls.map((c) => ({
  id: c.age_band + '_' + c.sex,
  sourceId: 'CENSUS-2024',
  population: c.count,
  unit: 'person',
  ageMin: Number(c.age_band.slice(0, 2)),
  ageMax: c.age_band.includes('+') ? 120 : Number(c.age_band.slice(3)),
  sex: c.sex as 'male' | 'female',
}));
export const householdResearchFrame: DemandCell[] = [
  {
    id: 'general_households',
    sourceId: 'CENSUS-2024',
    population: sectorFacts.census.generalHouseholds,
    unit: 'household',
  },
];
export function researchEstimate(ids: string[], unit: DemandUnit = 'person') {
  return estimateResearchDemand(
    ids,
    unit === 'household'
      ? householdResearchFrame
      : unit === 'person'
        ? adultResearchFrame
        : [],
    demandFactors,
    demandSources,
  );
}

/** OR of up to eight explicitly defined cohorts. Base uses inclusion/exclusion
 * with the same conditional-factor model as AND; Low/High use union bounds.
 * Never add overlapping archetype counts to obtain a market total. */
export function researchUnion(
  groups: string[][],
  unit: DemandUnit = 'person',
  model:
    | 'conditional_independence'
    | 'overlap_bounds' = 'conditional_independence',
): DemandEstimate | DemandUnavailable {
  const unique = [
    ...new Map(
      groups.map((g) => [[...new Set(g)].sort().join('|'), g]),
    ).values(),
  ];
  if (!unique.length || unique.length > 8 || unique.some((g) => !g.length))
    return {
      status: 'not_estimable',
      reason: 'invalid_model',
      detail: 'Union requires 1–8 nonempty groups.',
    };
  const terms = unique.map((ids) => researchEstimate(ids, unit));
  const unavailable = terms.find((t) => t.status !== 'estimated');
  if (unavailable?.status === 'not_estimable') return unavailable;
  const estimated = terms as DemandEstimate[];
  // A OR (A AND B) = A. Remove redundant descendants before intersections.
  const kept = estimated.filter(
    (t, i) =>
      !estimated.some(
        (other, j) =>
          j !== i &&
          other.factorIds.every((id) => t.factorIds.includes(id)) &&
          (other.factorIds.length < t.factorIds.length || j < i),
      ),
  );
  if (kept.length === 1) return kept[0];
  const cells = kept[0].cells.map((cell, i) => ({
    ...cell,
    low: Math.max(...kept.map((t) => t.cells[i].low)),
    base: 0,
    high: Math.min(
      cell.population,
      kept.reduce((n, t) => n + t.cells[i].high, 0),
    ),
  }));
  for (let mask = 1; mask < 1 << kept.length; mask++) {
    const subset = kept.filter((_, i) => mask & (1 << i));
    const joint = researchEstimate(
      subset.flatMap((t) => t.factorIds),
      unit,
    );
    if (joint.status !== 'estimated') return joint;
    const sign = subset.length % 2 ? 1 : -1;
    cells.forEach((c, i) => {
      c.base += sign * joint.cells[i].base;
    });
  }
  if (model === 'overlap_bounds')
    cells.forEach((c, i) => {
      const lower = Math.max(...kept.map((t) => t.cells[i].base));
      const upper = Math.min(
        c.population,
        kept.reduce((n, t) => n + t.cells[i].base, 0),
      );
      c.base = (lower + upper) / 2;
    });
  return {
    ...kept[0],
    unionGroups: kept.map((t) => t.factorIds),
    populationScope: kept.every((t) => t.populationScope)
      ? {
          ageMin: Math.min(...kept.map((t) => t.populationScope!.ageMin)),
          ageMax: Math.max(...kept.map((t) => t.populationScope!.ageMax)),
        }
      : undefined,
    cells,
    low: cells.reduce((n, c) => n + c.low, 0),
    base: cells.reduce((n, c) => n + c.base, 0),
    high: cells.reduce((n, c) => n + c.high, 0),
    factorIds: [...new Set(kept.flatMap((t) => t.factorIds))],
    definitions: unique
      .map(
        (g) =>
          '(' +
          g
            .map((id) => demandFactors.find((f) => f.id === id)?.label ?? id)
            .join(' AND ') +
          ')',
      )
      .map((s, i) => (i ? 'OR ' : '') + s),
    sourceIds: [...new Set(kept.flatMap((t) => t.sourceIds))],
    assumptions: [
      ...new Set(kept.flatMap((t) => t.assumptions)),
      model === 'overlap_bounds'
        ? '여러 활동의 상관·중복률이 미관측입니다. Base는 공표 참여율로 가능한 합집합 최소·최대 사이의 중간값이고 Low/High는 민감도를 포함한 경계입니다. 독립 가정으로 대부분의 가구가 참여한다고 단정하지 않습니다.'
        : '여러 활동 중 하나 이상인 합집합입니다. Base는 조건부 독립 모형의 포함·배제 계산이며 Low/High는 중복을 모를 때의 합집합 경계입니다.',
    ],
    methods: [...new Set(kept.flatMap((t) => t.methods)), 'research_scenario'],
  };
}
