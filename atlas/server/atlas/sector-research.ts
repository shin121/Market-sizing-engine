import food from '../../config/research/food-observations.json';
import facts from '../../config/research/sector-observations.json';
import type { DemandFactor, DemandRate, DemandSource } from '../../lib/demand';
import { ageSexRates } from './leisure-research';

export const foodSource: DemandSource = {
  id: food.sourceId,
  title: '2024 식품소비행태조사 통계보고서',
  publisher: '한국농촌경제연구원',
  url: food.url,
  referencePeriod: food.surveyPeriod,
  retrievedAt: '2026-09-06',
  locator:
    '가구 표1-340~343·386·388·391·401; 개인 표2-93·94·97·105; PDF 페이지는 원표 +48',
  surveyUniverse: food.surveyUniverse,
  limitations: [
    '주 구입자가 18~79세인 조사 가구의 비율을 2024 일반가구에 전이합니다. 원 조사 추출틀 20,708,168가구와 최신 일반가구 22,294,419가구의 범위 차이가 있습니다.',
    '성인 외식은 개인적으로 음식점에 가서 하는 식사입니다. 가족 외식 지출과 합산하지 않습니다.',
    'Low/High는 모형 민감도이며 표본오차가 아닙니다. 1+2순위 응답 비중을 사람 비율로 사용하지 않습니다.',
  ],
};
const band = (p: number, width = 0.15) => ({
  low: Math.max(0, p * (1 - width)),
  base: p,
  high: Math.min(1, p * (1 + width)),
});
type FoodPage = keyof typeof food.tables;
export const foodRows = (page: FoodPage) =>
  food.tables[page].rows as Record<string, number[]>;
function household(
  id: string,
  label: string,
  p: number,
  parents: string[],
  sourceIds: string[],
  definition: string,
  observation: string,
  width = 0.15,
): DemandFactor {
  return {
    id,
    label,
    unit: 'household',
    prerequisites: parents,
    method: sourceIds.includes(foodSource.id)
      ? 'survey_transfer'
      : 'survey_rate',
    sourceIds,
    definition,
    observation,
    rates: [band(p, width)],
    assumptions: [
      `각 조건의 Low/High는 Base ±${width * 100}% 상대 민감도입니다. 실제 조사 신뢰구간이 아닙니다.`,
    ],
    validationQuestion:
      '이 가족·이용 상황 중 유료 서비스로 해결할 필요가 있는 가구는 얼마나 되는가?',
  };
}
const c = facts.census;
const familyFactors: DemandFactor[] = [
  household(
    'family_children',
    '18세 이하 자녀 동거',
    c.children18Households / c.generalHouseholds,
    [],
    [c.sourceId],
    '18세 이하 자녀가 있는 일반가구. 전체 부모 인구나 유료 돌봄 수요가 아님',
    `공식 4,517천 가구. ${c.locator}`,
    0.03,
  ),
  household(
    'family_preschool',
    '5세 이하 자녀 동거',
    c.children5Households / c.children18Households,
    ['family_children'],
    [c.sourceId],
    '5세 이하 자녀가 있는 일반가구. 자녀가 한 명 이상인 가구를 한 번씩 집계',
    `공식 1,284천 가구 / 18세 이하 자녀 동거 4,517천 가구. ${c.locator}`,
    0.03,
  ),
  household(
    'family_elder',
    '65세 이상 가족 동거',
    c.elder65Households / c.generalHouseholds,
    [],
    [c.sourceId],
    '65세 이상 가구원이 있는 일반가구. 건강 상태와 유료 돌봄 여부는 별도',
    `공식 7,137천 가구. ${c.locator}`,
    0.03,
  ),
  household(
    'family_elder_only',
    '65세 이상 구성원만 동거',
    c.elderOnlyHouseholds / c.elder65Households,
    ['family_elder'],
    [c.sourceId],
    '65세 이상 가구원만 있는 일반가구. 돌봄 필요 발생률을 뜻하지 않음',
    `공식 4,007천 가구. ${c.locator}`,
    0.03,
  ),
  household(
    'family_elder_alone',
    '65세 이상 1인 생활',
    c.elderAloneHouseholds / c.elderOnlyHouseholds,
    ['family_elder_only'],
    [c.sourceId],
    '혼자 사는 65세 이상 일반가구. 사회적 고립이나 질병 발생과 별개',
    `공식 2,289천 가구. ${c.locator}`,
    0.03,
  ),
];
const deliveryUse = 1 - foodRows('501')['전체'][3] / 100;
const deliveryOnly =
  (foodRows('501')['전체'][0] + foodRows('501')['전체'][1]) / 100;
const householdFoodFactors: DemandFactor[] = [
  household(
    'food_delivery_household',
    '배달·포장으로 가족 식사',
    deliveryUse,
    [],
    [foodSource.id],
    '가구 구성원과 배달 또는 테이크아웃으로 가정에서 식사하는 가구',
    `전체 가구 중 ${(deliveryUse * 100).toFixed(1)}%. 표1-386 p.501/PDF549.`,
  ),
  household(
    'food_delivery_weekly',
    '주 1회 이상 배달·포장',
    foodRows('506')
      ['전체'].slice(0, 4)
      .reduce((a, b) => a + b, 0) / 100,
    ['food_delivery_household'],
    [foodSource.id],
    '가족 배달·포장 이용 가구 중 주 1회 이상 함께 식사',
    `이용 가구의 주 1회 이상 44.9%. 표1-391 p.506/PDF554.`,
  ),
  household(
    'food_delivery_to_home',
    '배달을 이용하는 가구',
    deliveryOnly / deliveryUse,
    ['food_delivery_household'],
    [foodSource.id],
    '가족 식사에 배달을 이용. 포장만 하는 가구 제외',
    `전체 가구의 62.7% / 배달·포장 68.9%. 표1-386 p.501.`,
  ),
  ...[
    ['app', 3, '앱으로 가족 배달 주문'],
    ['phone', 1, '전화로 가족 배달 주문'],
  ].map(([id, index, label]) =>
    household(
      'food_delivery_' + id,
      String(label),
      foodRows('525')['전체'][Number(index)] / 100,
      ['food_delivery_to_home'],
      [foodSource.id],
      '가족 배달 이용 가구에서 주로 ' + label,
      `표1-401 p.525/PDF573. 배달 이용 가구 분모이며 포장-only 제외.`,
    ),
  ),
  ...(['442', '443', '444'] as const).flatMap((page, i) => {
    const id = ['hmr_heat', 'hmr_ready', 'hmr_kit'][i],
      label = ['데워 먹는 간편식', '바로 먹는 간편식', '직접 완성하는 밀키트'][
        i
      ],
      row = foodRows(page)['전체'],
      use = 1 - row[7] / 100;
    return [
      household(
        id,
        label,
        use,
        [],
        [foodSource.id],
        label +
          ' 구매 경험 가구. 최근 1년 고정 구매율이 아닌 조사 시 평소 구매 빈도 응답',
        `비이용 ${row[7]}%를 제외한 ${(use * 100).toFixed(1)}%. 인쇄 p.${page}/PDF${Number(page) + 48}.`,
      ),
      household(
        id + '_weekly',
        '주 1회 이상 ' + label,
        row.slice(0, 4).reduce((a, b) => a + b, 0) / 100 / use,
        [id],
        [foodSource.id],
        label + ' 구매 가구 중 주 1회 이상 구입',
        `전체 가구의 ${row
          .slice(0, 4)
          .reduce((a, b) => a + b, 0)
          .toFixed(1)}% / 해당 품목 구매 가구. 인쇄 p.${page}.`,
      ),
    ];
  }),
];
const ageLabels = [
  '19~29세',
  '30~39세',
  '40~49세',
  '50~59세',
  '60세 이상',
  '60세 이상',
];
function personalFood(
  id: string,
  label: string,
  page: FoodPage,
  columns: number[],
  parents: string[],
  definition: string,
): DemandFactor {
  const rows = foodRows(page),
    rate = (label: string) =>
      columns.reduce((n, i) => n + rows[label][i], 0) / 100;
  const rates = ageSexRates(
    {
      ageRates: Object.fromEntries(
        [20, 30, 40, 50, 60, 70].map((a, i) => [
          String(a) + '대',
          rate(ageLabels[i]),
        ]),
      ),
      sexRates: { 남성: rate('남성'), 여성: rate('여성') },
    },
    79,
  ).map((r) => ({ ...r, ageMax: r.ageMin === 70 ? 79 : r.ageMax }));
  return {
    id,
    label,
    unit: 'person',
    populationScope: { ageMin: 20, ageMax: 79 },
    prerequisites: parents,
    method: 'survey_transfer',
    sourceIds: [foodSource.id],
    definition,
    observation: `전체 공표 ${(rate('전체') * 100).toFixed(1)}%. ${food.tables[page].denominator}. ${food.tables[page].title} p.${page}/PDF${Number(page) + 48}.`,
    rates: [...rates, { ageMin: 80, ageMax: 120, low: 0, base: 0, high: 0 }],
    assumptions: [
      '19~29세 비율을 20대에 적용하며, 60세 이상 응답자는 60~79세입니다. 80세 이상은 조사 대상 밖입니다.',
      '연령별 관측율에 성별 주변분포의 오즈 차이를 반영한 교차표 모형입니다. 각 연령 전체 경험률은 유지합니다.',
      'Low/High는 각 공표율 ±25% 상대 민감도(최소 ±0.3%p)이며 신뢰구간이 아닙니다.',
    ],
    validationQuestion:
      '외식 목적과 지출의 실제 교차표, 이용 대안의 불만과 추가 지불 의향은?',
  };
}
const personFoodFactors: DemandFactor[] = [
  personalFood(
    'food_dining',
    '개인 외식 이용',
    '650',
    [0],
    [],
    '개인적으로 음식점에 가서 식사하는 20~79세. 음식점 전체 매출이나 가족 외식 인구와 별개',
  ),
  personalFood(
    'food_dining_weekly',
    '주 1회 이상 개인 외식',
    '651',
    [0, 1, 2, 3],
    ['food_dining'],
    '개인 외식 이용자 중 주 1회 이상 식사',
  ),
  personalFood(
    'food_dining_taste',
    '맛있는 음식을 즐기기',
    '668',
    [0],
    ['food_dining'],
    '개인 외식의 주된 이유가 맛있는 음식을 즐기기인 이용자',
  ),
  personalFood(
    'food_dining_work',
    '근무·학업 사이 한 끼',
    '668',
    [1],
    ['food_dining'],
    '근로·학업으로 가정 내 식사가 어려운 것이 주된 외식 이유인 이용자',
  ),
  personalFood(
    'food_dining_occasion',
    '특별한 날의 외식',
    '668',
    [3],
    ['food_dining'],
    '특별한 날이 주된 외식 이유인 이용자',
  ),
];
const bank = facts.banking;
const bankingRates = (mobile = false): DemandRate[] =>
  (['male', 'female'] as const).flatMap((sex) =>
    bank.ageMin.map((ageMin, i) => {
      const base = bank[sex][i],
        mobileRate = (sex === 'male' ? bank.mobileMale : bank.mobileFemale)[i];
      return {
        ageMin,
        ageMax: ageMin === 70 ? 120 : ageMin + 9,
        sex,
        ...band(mobile ? mobileRate / base : base, mobile ? 0.02 : 0.1),
      };
    }),
  );
const bankingFactors: DemandFactor[] = [
  {
    id: 'finance_banking',
    label: '디지털 은행 거래',
    unit: 'person',
    prerequisites: ['digital'],
    method: 'survey_rate',
    sourceIds: [bank.sourceId],
    definition:
      '최근 1년 인터넷뱅킹을 이용한 성인. 주식·펀드 투자자나 유료 자문 이용자 수가 아님',
    observation: `인터넷 이용자 중 80.7%. ${bank.locator}`,
    rates: bankingRates(),
    assumptions: [
      '인터넷 이용자라는 분모를 먼저 적용한 후 관측된 연령×성별 은행 이용률을 적용합니다.',
      '각 공표율 ±10% 상대 민감도. 70세 이상 공표율을 70대 이상에 적용.',
    ],
    validationQuestion:
      '계좌 관리·이체·저축상품 선택 중 비용이나 시간을 쓰는 어려움은?',
  },
  {
    id: 'finance_mobile',
    label: '모바일로 은행 거래',
    unit: 'person',
    prerequisites: ['finance_banking'],
    method: 'survey_rate',
    sourceIds: [bank.sourceId],
    definition:
      '인터넷뱅킹 이용자 중 모바일로 이용. 같은 활동을 두 번 곱하지 않도록 모바일/전체 비율로 계산',
    observation: `인터넷 이용자 중 80.6%. ${bank.locator}`,
    rates: bankingRates(true),
    assumptions: [
      '모바일 뱅킹은 전체 인터넷뱅킹의 부분집합. 두 공표율의 비로 조건부율을 계산합니다.',
      '비율의 ±2% 상대 민감도. 금융 거래액은 연간 소비액이 아닙니다.',
    ],
    validationQuestion:
      '모바일 은행의 인증·탐색·이체 과정에서 반복되는 실패는?',
  },
];
export const sectorFactors: DemandFactor[] = [
  ...familyFactors,
  ...householdFoodFactors,
  ...personFoodFactors,
  ...bankingFactors,
];

/** Published weighted survey margins, never respondent counts. These provide
 * composition only; the national population still comes from the official frame. */
export function foodProfileMargins(
  estimate: import('../../lib/demand').DemandEstimate,
) {
  if (estimate.unionGroups) return null;
  const sum = (page: FoodPage, label: string, cols: number[]) =>
    cols.reduce((n, i) => n + (foodRows(page)[label]?.[i] ?? NaN), 0) / 100;
  const use = (page: FoodPage, label: string) => 1 - sum(page, label, [7]);
  const ratio = (a: number, b: number) => (b > 0 ? a / b : 0);
  const rates: Record<string, (label: string) => number> = {
    food_dining: (l) => sum('650', l, [0]),
    food_dining_weekly: (l) => sum('651', l, [0, 1, 2, 3]),
    food_dining_taste: (l) => sum('668', l, [0]),
    food_dining_work: (l) => sum('668', l, [1]),
    food_dining_occasion: (l) => sum('668', l, [3]),
    food_delivery_household: (l) => sum('501', l, [0, 1, 2]),
    food_delivery_weekly: (l) => sum('506', l, [0, 1, 2, 3]),
    food_delivery_to_home: (l) =>
      ratio(sum('501', l, [0, 1]), sum('501', l, [0, 1, 2])),
    food_delivery_app: (l) => sum('525', l, [3]),
    food_delivery_phone: (l) => sum('525', l, [1]),
  };
  for (const [i, page] of (['442', '443', '444'] as const).entries()) {
    const id = ['hmr_heat', 'hmr_ready', 'hmr_kit'][i];
    rates[id] = (l) => use(page, l);
    rates[id + '_weekly'] = (l) =>
      ratio(sum(page, l, [0, 1, 2, 3]), use(page, l));
  }
  const active = estimate.factorIds.filter((id) => rates[id]);
  if (!active.length) return null;
  const baseline = foodRows(estimate.unit === 'household' ? '2' : '540');
  const normalize = (labels: string[]) => {
    const rows = labels.map((label) => ({
      label,
      share:
        ((baseline[label]?.[0] ?? NaN) / 100) *
        active.reduce((n, id) => n * rates[id](label), 1),
    }));
    if (rows.some((r) => !Number.isFinite(r.share))) return [];
    const total = rows.reduce((n, r) => n + r.share, 0);
    return total ? rows.map((r) => ({ ...r, share: r.share / total })) : [];
  };
  return {
    regions: normalize([
      '수도권',
      '충청권',
      '호남권',
      '대경권',
      '동남권',
      '강원권',
    ]),
    headAges:
      estimate.unit === 'household'
        ? normalize(['39세 이하', '40~49세', '50~59세', '60세 이상'])
        : [],
    headSexes: estimate.unit === 'household' ? normalize(['남성', '여성']) : [],
    householdSizes:
      estimate.unit === 'household'
        ? normalize([
            '1인 가구',
            '2인 가구',
            '3인 가구',
            '4인 가구',
            '5인 이상 가구',
          ])
        : [],
    basis:
      'KREI 2024 가중 모집단 구성비 × 해당 지역·가구 특성별 경험률을 정규화한 배분 모형입니다. 조건의 미관측 교집합은 층 안 독립 가정이며 추가 구매 성향의 지역차·연령 필터의 지역차는 미확보입니다.',
  };
}
