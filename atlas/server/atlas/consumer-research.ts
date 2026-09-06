import observations from '../../config/research/consumer-observations.json';
import geography from '../../config/research/region-frame.json';
import { consumerJourneys } from '../../config/research/consumer-journeys';
import { ageSexRates } from './leisure-research';
import type {
  DemandEstimate,
  DemandFactor,
  DemandRate,
  DemandSource,
} from '../../lib/demand';

export const consumerSource: DemandSource = {
  id: observations.sourceId,
  title: '2025 한국의 소비생활지표 · 품목별 문제 경험과 거래 이용',
  publisher: '한국소비자원',
  url: observations.url,
  referencePeriod: observations.referencePeriod,
  retrievedAt: '2026-09-06',
  surveyUniverse: observations.surveyUniverse,
  locator:
    '조사 p.51~57, 설문 문2·3(PDF448~449), 부록3 표3-1-2·4~15, 표3-3-5·27',
  limitations: [
    observations.weighting,
    '가계 경제상황을 알고 소비결정에 참여하는 성인 응답을 20세 이상 공식 인구에 전이합니다. 전체 성인에 대한 확정 추계가 아닙니다.',
    '질문은 본인 또는 가족의 소비생활을 포함합니다. 직접 구매자·실제 서비스 사용자·가구 수와 구분합니다.',
    '문제 경험은 구매 전부터 처분까지의 불편·장애입니다. 금전 피해, 미해결 상태, 유료 해결 의향 또는 강도를 뜻하지 않습니다.',
    '전체 이용률을 조사하지 않은 품목의 문제 경험률로 전체 이용자 수를 역산하지 않습니다.',
    '연령·성별·지역은 각각의 주변분포입니다. 연령×성별은 모형, 연령×지역 교차표는 미확보입니다.',
  ],
};
type TableKey = keyof typeof observations.tables;
type Row = { n: number; values: (number | null)[] };
const rows = (table: TableKey) =>
  observations.tables[table].rows as Record<string, Row>;
const ratesById = new Map<string, Record<string, number | null>>();
const parentById = new Map<string, string>();
const band = (p: number) => ({
  low: Math.max(0, p * 0.7),
  base: p,
  high: Math.min(1, p * 1.3),
});

/** Return a rate on ALL respondents in the same demographic stratum.
 * The 6.9% beauty-advertising observation is conditional on 5,035 respondents
 * with any consumer problem, not all 10,000 and not beauty users. */
export function consumerAbsoluteRate(
  table: TableKey,
  column: number,
  label: string,
) {
  const row = rows(table)[label],
    all = rows('problem')[label];
  const p = row?.values[column];
  if (p === null || p === undefined || !all?.n) return null;
  return ((p / 100) * row.n) / all.n;
}
function absoluteMargins(table: TableKey, column: number) {
  return Object.fromEntries(
    Object.keys(rows(table)).map((label) => [
      label,
      consumerAbsoluteRate(table, column, label),
    ]),
  );
}
function crossTab(margins: Record<string, number | null>) {
  return ageSexRates({
    ageRates: Object.fromEntries(
      [20, 30, 40, 50, 60, 70].map((age) => [
        age + '대',
        margins[age >= 60 ? '60대 이상' : age + '대'],
      ]),
    ),
    sexRates: { 남성: margins['남성'], 여성: margins['여성'] },
  });
}
function makeProblemFactor(
  j: (typeof consumerJourneys)[number],
  type?: (typeof j.types)[number],
) {
  const table: TableKey = type?.[0] ?? 'problem';
  const id = 'kca_' + j.id + (type ? '_' + type[0] : '');
  const parentId = 'kca_' + j.id;
  const margins = absoluteMargins(table, j.column);
  ratesById.set(id, margins);
  let rates: DemandRate[] = crossTab(margins).map((r) => ({
    ...r,
    ...band(r.base),
  }));
  if (type) {
    parentById.set(id, parentId);
    const parentRates = crossTab(ratesById.get(parentId)!);
    rates = rates.flatMap((r) => {
      const parent = parentRates.find(
        (p) => p.ageMin === r.ageMin && p.sex === r.sex,
      );
      if (!parent || parent.base <= 0) return [];
      const conditional = r.base / parent.base;
      if (conditional > 1 + 1e-8)
        throw Error('KCA child exceeds product-problem population: ' + id);
      return [{ ...r, ...band(conditional) }];
    });
  }
  const raw = rows(table)['2025년'];
  const absolute = margins['2025년']!;
  const label = type?.[1] ?? j.label;
  const factor: DemandFactor = {
    id,
    label,
    unit: 'person',
    populationScope: { ageMin: 20, ageMax: 120 },
    prerequisites: type ? [parentId] : [],
    method: 'survey_transfer',
    sourceIds: [consumerSource.id],
    definition: `최근 1년 본인 또는 가족의 ${j.scope}에서 문제를 경험한 성인 관련 인구${type ? ': ' + label : ''}. 전체 품목 이용자 수가 아님`,
    observation: `원표 ${raw.values[j.column]}% / ${raw.n.toLocaleString('ko-KR')}명${type ? ` → 전체 응답자 기준 ${(absolute * 100).toFixed(2)}%` : ''}. 부록3 p.${observations.tables[table].pdfPages[0] - 494}, PDF${observations.tables[table].pdfPages[0]}.`,
    rates,
    assumptions: [
      '원 응답에 모집단 가중치가 없으므로 공식 인구의 연령 구조로 다시 배분한 탐색 추정입니다. 19세 포함 조사 20대 값을 20~29세에, 60세 이상 값을 60대와 70세 이상에 적용합니다.',
      '성별 주변분포로 연령×성별을 추정하며 각 연령의 경험률을 유지합니다. 관측된 교차표가 아닙니다.',
      ...(type
        ? [
            '세부 유형은 전체 문제 경험자 분모를 먼저 전체 응답자로 환산한 뒤, 해당 품목 문제 경험률로 나눈 조건부 확률입니다. 부모의 참여율을 중복 곱하지 않습니다.',
          ]
        : []),
      '각 조건 Low/High는 Base ±30% 상대 민감도입니다. 하위 조건은 부모 불확실성도 포함하며 조사 신뢰구간이 아닙니다.',
    ],
    validationQuestion: j.question,
  };
  return factor;
}
export const consumerFactors: DemandFactor[] = consumerJourneys.flatMap((j) => [
  makeProblemFactor(j),
  ...j.types.map((type) => makeProblemFactor(j, type)),
]);
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
export function consumerProfileRegions(estimate: DemandEstimate) {
  if (estimate.unit !== 'person' || estimate.unionGroups) return null;
  const factors = estimate.factorIds.filter((id) => ratesById.has(id));
  const deepest = factors.filter(
    (id) => !factors.some((other) => parentById.get(other) === id),
  );
  if (deepest.length !== 1) return null;
  const id = deepest[0];
  let margins = ratesById.get(id)!;
  const missing = regionLabels.some((label) => margins[label] === null);
  if (missing) {
    const parent = parentById.get(id);
    if (parent) margins = ratesById.get(parent)!;
  }
  const imputed = regionLabels.filter((label) => margins[label] === null);
  const weighted = geography.province_rows.map((r, i) => ({
    label: regionLabels[i],
    value: r.person * (margins[regionLabels[i]] ?? margins['2025년']!),
  }));
  const total = weighted.reduce((n, r) => n + r.value, 0);
  if (!total) return null;
  return {
    regions: weighted.map((r) => ({ label: r.label, share: r.value / total })),
    basis:
      (missing && parentById.has(id)
        ? '하위 문제 유형의 일부 지역 공표값이 결측이어서 상위 품목 문제 경험자의 지역 패턴을 전이했습니다. '
        : '해당 문제 경험의 지역별 공표율에 공식 지역 인구를 적용한 배분 모형입니다. ') +
      (imputed.length
        ? `${imputed.join('·')} 공표율 결측은 해당 집단의 전국 경험률을 전이한 모형값입니다. `
        : '') +
      '연령×지역 및 추가 조건의 교차표는 없어 연령 필터에 따른 지역 차이를 뜻하지 않습니다. 비가중 소비결정 참여자 조사와 공식 인구 간 범위 차이가 있습니다.',
  };
}
