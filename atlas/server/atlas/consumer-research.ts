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

/**
 * KCA transaction-channel observations are useful lower-level cohorts in the
 * commerce market. Their use rate is on all respondents; monthly frequency and
 * problem rate are deliberately retained as descriptive observations rather
 * than multiplied into population. Channel cohorts overlap, so the market root
 * uses overlap bounds instead of adding them.
 */
const channelDefinitions = [
  { id: 'pc', label: 'PC 인터넷쇼핑', offset: 0 },
  { id: 'mobile', label: '모바일쇼핑', offset: 3 },
  { id: 'sns', label: 'SNS 플랫폼 쇼핑', offset: 6 },
  { id: 'c2c', label: '개인간 거래 플랫폼 쇼핑', offset: 9 },
] as const;
const channelRatesById = new Map<string, Record<string, number | null>>();
function makeChannelFactor(
  definition: (typeof channelDefinitions)[number],
): DemandFactor {
  const table = observations.tables.online_channels;
  const tableRows = table.rows as Record<string, Row>;
  const useMargins = Object.fromEntries(
    Object.entries(tableRows).map(([label, row]) => [
      label,
      row.values[definition.offset] === null ||
      row.values[definition.offset] === undefined
        ? null
        : row.values[definition.offset]! / 100,
    ]),
  );
  channelRatesById.set('kca_channel_' + definition.id, useMargins);
  const ageRate = (label: string) => useMargins[label];
  const rates = ageSexRates({
    ageRates: Object.fromEntries(
      [20, 30, 40, 50, 60, 70].map((age) => [
        age + '대',
        ageRate(age >= 60 ? '60대 이상' : age + '대'),
      ]),
    ),
    sexRates: { 남성: useMargins['남성'], 여성: useMargins['여성'] },
  });
  const row = tableRows['2025년'];
  const frequency = row.values[definition.offset + 1];
  const problem = row.values[definition.offset + 2];
  return {
    id: 'kca_channel_' + definition.id,
    label: definition.label,
    unit: 'person',
    populationScope: { ageMin: 20, ageMax: 120 },
    prerequisites: [],
    method: 'survey_transfer',
    sourceIds: [consumerSource.id],
    definition: `최근 1년 ${definition.label} 이용 성인. 이용률은 전체 응답자 기준이며 직접 구매 품목과 별개`,
    observation: `이용률 ${(useMargins['2025년']! * 100).toFixed(1)}% (전체 응답자 ${row.n.toLocaleString('ko-KR')}명) · 월평균 ${frequency ?? '미확보'}회 (이용자 분모) · 이용자 중 문제 경험 ${problem ?? '미확보'}%`,
    rates,
    assumptions: [
      '이용률은 전체 응답자, 월평균 이용횟수와 문제경험률은 해당 채널 이용자 분모입니다. 빈도를 인구에 곱해 거래액이나 시장규모로 만들지 않습니다.',
      '원 보고서에 모집단 추정 가중치가 없어 공식 20세 이상 인구에 연령별 이용률을 전이한 탐색 추정입니다. 연령×성별은 성별 주변분포를 이용한 모형입니다.',
      '채널 이용자는 서로 중복될 수 있습니다. 채널별 인구를 더해 전체 쇼핑 인구로 해석하지 않습니다.',
      'Low/High는 연령·성별 전이에서 이용률 ±25% 상대 민감도를 적용한 범위이며 조사 신뢰구간이 아닙니다. 월평균 빈도는 공표값을 그대로 표시합니다.',
    ],
    validationQuestion: `${definition.label} 이용자 중 품목별 구매·지출·반복구매와 실제 전환은?`,
  };
}
export const consumerChannelFactors = channelDefinitions.map(makeChannelFactor);

const channelProblemDefinitions = [
  {
    channel: 'pc',
    table: 'priority_pc' as const,
    items: [
      ['quality', '품질 불량을 가장 심각하게 꼽은 경험', 0],
      ['delivery', '오배송·배송 지연을 가장 심각하게 꼽은 경험', 11],
      ['price', '가격을 가장 심각하게 꼽은 경험', 1],
    ],
  },
  {
    channel: 'mobile',
    table: 'priority_mobile' as const,
    items: [
      ['quality', '품질 불량을 가장 심각하게 꼽은 경험', 0],
      ['delivery', '오배송·배송 지연을 가장 심각하게 꼽은 경험', 11],
      ['price', '가격을 가장 심각하게 꼽은 경험', 1],
    ],
  },
  {
    channel: 'sns',
    table: 'priority_social' as const,
    items: [
      ['quality', '품질 불량을 가장 심각하게 꼽은 경험', 0],
      ['price', '가격을 가장 심각하게 꼽은 경험', 1],
      ['redress', '교환·취소·환불 해결 어려움을 가장 심각하게 꼽은 경험', 5],
    ],
  },
  {
    channel: 'c2c',
    table: 'priority_c2c' as const,
    items: [
      ['redress', '교환·취소·환불 해결 어려움을 가장 심각하게 꼽은 경험', 5],
      ['quality', '품질 불량을 가장 심각하게 꼽은 경험', 0],
      ['price', '가격을 가장 심각하게 꼽은 경험', 1],
    ],
  },
] as const;
function makeChannelProblemFactor(
  channel: (typeof channelDefinitions)[number],
  problem: (typeof channelProblemDefinitions)[number]['items'][number],
  tableKey: (typeof channelProblemDefinitions)[number]['table'],
): DemandFactor {
  const channelId = 'kca_channel_' + channel.id;
  const channelRows = observations.tables.online_channels.rows as Record<string, Row>;
  const problemRows = observations.tables[tableKey].rows as Record<string, Row>;
  const priorityNational = problemRows['2025년']?.values[problem[2]] ?? null;
  const imputedPriority = new Set<string>();
  const absolute = Object.fromEntries(
    Object.entries(channelRows).map(([label, row]) => {
      const use = row.values[channel.offset];
      const issue = row.values[channel.offset + 2];
      const publishedPriority = problemRows[label]?.values[problem[2]];
      const priority =
        publishedPriority == null
          ? priorityNational
          : publishedPriority;
      if (publishedPriority == null && priority != null)
        imputedPriority.add(label);
      return [
        label,
        use == null || issue == null || priority == null
          ? null
          : (use / 100) * (issue / 100) * (priority / 100),
      ];
    }),
  );
  const conditional = Object.fromEntries(
    Object.entries(absolute).map(([label, value]) => {
      const use = channelRows[label].values[channel.offset];
      return [label, value == null || use == null || use === 0 ? null : value / (use / 100)];
    }),
  );
  const rates = ageSexRates(
    {
      ageRates: Object.fromEntries(
        [20, 30, 40, 50, 60, 70].map((age) => [
          age + '대',
          conditional[age >= 60 ? '60대 이상' : age + '대'],
        ]),
      ),
      sexRates: { 남성: conditional['남성'], 여성: conditional['여성'] },
    },
  );
  const parent = channelRows['2025년'];
  const issue = parent.values[channel.offset + 2];
  const priorityRow = problemRows['2025년'];
  const priority = priorityRow.values[problem[2]];
  const id = channelId + '_' + problem[0];
  parentById.set(id, channelId);
  ratesById.set(id, absolute);
  return {
    id,
    label: problem[1],
    unit: 'person',
    populationScope: { ageMin: 20, ageMax: 120 },
    prerequisites: [channelId],
    method: 'survey_transfer',
    sourceIds: [consumerSource.id],
    definition: `최근 1년 ${channel.label} 이용자 중 해당 채널에서 소비자문제를 경험했고 ${problem[1]}. 채널 이용자 전체가 아님`,
    observation: `채널 이용자 중 문제 경험 ${issue ?? '미확보'}% · 그중 해당 문제를 가장 심각하게 꼽은 비율 ${priority ?? '미확보'}% · 전체 응답자 기준 결합률 ${(absolute['2025년']! * 100).toFixed(2)}% (문제 유형 우선순위 조사 ${priorityRow.n.toLocaleString('ko-KR')}명)`,
    rates,
    assumptions: [
      '문제 경험률은 채널 이용자 분모, 가장 심각한 문제의 유형 비율은 해당 채널 문제 경험자 분모입니다. 두 조건을 곱한 값은 그 문제를 1순위로 꼽은 이용자의 탐색 추정치이며 모든 불만 경험자를 뜻하지 않습니다.',
      '채널 부모 이용률을 한 번만 적용합니다. 채널별·문제별 이용자는 서로 겹칠 수 있습니다.',
      '원 보고서에 모집단 추정 가중치가 없어 공식 20세 이상 인구로 전이하며, 연령×성별은 주변분포 모형입니다. Low/High는 전이 민감도입니다.',
      ...(imputedPriority.size
        ? [
            `${[...imputedPriority].join('·')}의 채널별 1순위 문제 비율이 결측이어서 전국 문제 경험자의 공표 비율을 전이했습니다. 결측을 0으로 처리하지 않았습니다.`,
          ]
        : []),
    ],
    validationQuestion: `${channel.label}에서 이 문제의 빈도·금전 손실·해결 여부와 유료 해결 의향은?`,
  };
}
export const consumerChannelProblemFactors = channelProblemDefinitions.flatMap(
  (definition) => {
    const channel = channelDefinitions.find((c) => c.id === definition.channel)!;
    return definition.items.map((item) =>
      makeChannelProblemFactor(channel, item, definition.table),
    );
  },
);
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
  const channelFactors = estimate.factorIds.filter((id) => channelRatesById.has(id));
  if (!factors.length && channelFactors.length === 1) {
    const margins = channelRatesById.get(channelFactors[0])!;
    const weighted = geography.province_rows.map((r, i) => ({
      label: regionLabels[i],
      value: r.person * (margins[regionLabels[i]] ?? margins['2025년']!),
    }));
    const total = weighted.reduce((n, r) => n + r.value, 0);
    if (!total) return null;
    return {
      regions: weighted.map((r) => ({ label: r.label, share: r.value / total })),
      basis:
        '해당 거래 채널의 지역별 이용률에 2024 공식 지역 인구를 적용한 배분 모형입니다. 월평균 이용횟수·문제경험의 지역차와 품목별 구매 교차표는 미확보입니다. 비가중 소비결정 참여자 조사와 공식 인구 간 범위 차이가 있습니다.',
    };
  }
  const deepest = factors.filter(
    (id) => !factors.some((other) => parentById.get(other) === id),
  );
  if (deepest.length !== 1) return null;
  const id = deepest[0];
  let margins = ratesById.get(id)!;
  const missing = regionLabels.some((label) => margins[label] === null);
  if (missing) {
    const parent = parentById.get(id);
    if (parent) {
      margins =
        ratesById.get(parent) ?? channelRatesById.get(parent) ?? margins;
    }
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
