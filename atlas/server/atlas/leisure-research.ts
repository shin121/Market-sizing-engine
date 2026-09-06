import observations from '../../config/research/leisure-observations.json';
import controls from '../../config/population-controls.json';
import type { DemandFactor, DemandSource } from '../../lib/demand';

export const leisureSource: DemandSource = {
  id: observations.sourceId,
  title: '2024 국민여가활동조사 · 활동별 경험률',
  publisher: '문화체육관광부 / 한국문화관광연구원',
  url: observations.url,
  referencePeriod: observations.referencePeriod,
  retrievedAt: '2026-09-06',
  locator: '통계표 1~8, 인쇄 pp.106~123 / PDF pp.128~145; 정의 pp.7~12',
  surveyUniverse: observations.surveyUniverse,
  limitations: [
    ...observations.limitations,
    '15~19세를 제외하고 공식 20세 이상 인구에 연령별 경험률을 적용합니다.',
  ],
};
export const leisureObservations = observations.activities;
const scope: Record<string, string> = {
  B14: '카메라를 이용한 취미 촬영. 휴대폰 촬영 제외',
  F67: '피부·헤어·네일·마사지 등 미용 활동 경험. 화장품 전체 사용자 수가 아님',
  F63: '여가 목적 쇼핑 또는 외식 경험. 일상 식사와 전체 식품 소비자를 대신하지 않음',
  F51: '여가로 요리·다도를 경험한 사람. 집에서 식사하는 전체 인구가 아님',
  F54: '실내 장식·디자인 변경 활동. 전체 가구 구매자가 아님',
  F70: '식물 키우기·가꾸기 경험. 식물 구매 여부와 별개',
  G77: '기기·모바일 등을 통한 음악 감상. 유료 스트리밍 구독 여부와 별개',
  E42: '여가 목적 해외여행. 출장·어학연수 제외',
  F52: '개인 여가활동으로 반려동물 돌보기. 반려동물 양육가구 수와 별개',
  H83: '가족 방문 경험. 가족 돌봄이나 양육 수요가 아님',
};

/** Sex marginals inform odds contrasts; each age total remains exactly anchored
 * to its published age rate. This is an imputed cross-tab, not observed joints. */
export function ageSexRates(
  activity: {
    ageRates: Record<string, number | null>;
    sexRates: Record<string, number | null>;
  },
  maxAge = 120,
) {
  if (activity.sexRates['남성'] === null || activity.sexRates['여성'] === null)
    return [];
  const logit = (p: number) =>
    Math.log(Math.max(0.0001, p) / Math.max(0.0001, 1 - p));
  const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
  const contrast =
    logit(activity.sexRates['남성']!) - logit(activity.sexRates['여성']!);
  return Object.entries(activity.ageRates).flatMap(([label, ageRate]) => {
    if (ageRate === null) return [];
    const ageMin = Number(label.slice(0, 2)),
      ageMax = Math.min(maxAge, ageMin === 70 ? 120 : ageMin + 9);
    const frame = controls.controls.filter(
      (c) =>
        Number(c.age_band.slice(0, 2)) >= ageMin &&
        Number(c.age_band.slice(0, 2)) <= ageMax,
    );
    const total = frame.reduce((n, c) => n + c.count, 0);
    const maleShare =
      frame.filter((c) => c.sex === 'male').reduce((n, c) => n + c.count, 0) /
      total;
    let lo = -30,
      hi = 30;
    for (let i = 0; i < 80; i++) {
      const mid = (lo + hi) / 2;
      if (
        maleShare * sigmoid(mid + contrast / 2) +
          (1 - maleShare) * sigmoid(mid - contrast / 2) >
        ageRate
      )
        hi = mid;
      else lo = mid;
    }
    return (['male', 'female'] as const).map((sex) => {
      const base = sigmoid(
        (lo + hi) / 2 + ((sex === 'male' ? 1 : -1) * contrast) / 2,
      );
      const margin = Math.max(0.003, base * 0.25);
      return {
        ageMin,
        ageMax,
        sex,
        low: Math.max(0, base - margin),
        base,
        high: Math.min(1, base + margin),
      };
    });
  });
}
export const leisureFactors: DemandFactor[] = leisureObservations.map((a) => ({
  id: 'leisure_' + a.code,
  label: a.label,
  unit: 'person',
  prerequisites: [],
  method: 'survey_transfer',
  sourceIds: [leisureSource.id],
  definition: `지난 1년 ${a.label} 경험 성인. ${scope[a.code] ?? '여가활동 경험이며 구매·유료 이용을 의미하지 않음'}`,
  observation: `15세 이상 전체 경험률 ${(a.overallRate! * 100).toFixed(1)}%. 연령·성별 원표: 인쇄 p.${a.printedPage}, 지역: p.${a.printedPage + 1}.`,
  rates: ageSexRates(a),
  assumptions: [
    '연령별 공표율로 인구를 추정하며 성별 효과는 별도 주변분포의 오즈 차이를 적용한 모형입니다. 관측된 연령×성별 교차표가 아닙니다.',
    'Low/High는 각 비율의 ±25%(최소 ±0.3%p) 민감도 범위이며 조사 오차 또는 신뢰구간이 아닙니다.',
    '70세 이상 공표율을 70대·80대·90세 이상에 같이 적용합니다.',
  ],
  validationQuestion: `${a.label} 경험자 중 최근 유료 구매자와 반복 이용자는 얼마나 되는가?`,
}));

/** Calibrate a separately sourced demographic pattern to a published level.
 * The level and the shape remain separate evidence; no synthetic distribution. */
export function withExternalProfileShape(factor: DemandFactor): DemandFactor {
  const config = factor.profileShape;
  if (!config) return factor;
  const pattern = leisureFactors.find((f) => f.id === config.factorId);
  if (!pattern)
    throw Error('Unknown external profile shape: ' + config.factorId);
  const frame = controls.controls.filter(
    (c) =>
      Number(c.age_band.slice(0, 2)) >= config.ageMin &&
      Number(c.age_band.slice(0, 2)) <= config.ageMax,
  );
  const cells = frame.map((c) => {
    const age = Number(c.age_band.slice(0, 2));
    const rate = pattern.rates.find(
      (r) => r.sex === c.sex && age >= r.ageMin! && age <= r.ageMax!,
    );
    if (!rate)
      throw Error(
        'Missing external shape rate: ' + factor.id + '/' + c.age_band,
      );
    return { ...c, rate, age };
  });
  const targets = factor.rates.find(
    (r) => r.ageMin === config.ageMin && r.ageMax === config.ageMax,
  );
  if (!targets) throw Error('Missing level calibration targets: ' + factor.id);
  const total = cells.reduce((n, c) => n + c.count, 0);
  const shifted = (p: number, shift: number) =>
    1 / (1 + Math.exp(-(Math.log(p / (1 - p)) + shift)));
  const shifts = { low: 0, base: 0, high: 0 };
  for (const level of ['low', 'base', 'high'] as const) {
    let lo = -30,
      hi = 30;
    for (let i = 0; i < 80; i++) {
      const mid = (lo + hi) / 2;
      const mean =
        cells.reduce((n, c) => n + c.count * shifted(c.rate.base, mid), 0) /
        total;
      if (mean > targets[level]) hi = mid;
      else lo = mid;
    }
    shifts[level] = (lo + hi) / 2;
  }
  return {
    ...factor,
    sourceIds: [...new Set([...factor.sourceIds, ...pattern.sourceIds])],
    rates: [
      ...cells.map((c) => ({
        sex: c.sex as 'male' | 'female',
        ageMin: c.age,
        ageMax: c.age + 9,
        low: shifted(c.rate.base, shifts.low),
        base: shifted(c.rate.base, shifts.base),
        high: shifted(c.rate.base, shifts.high),
      })),
      ...factor.rates.filter((r) => r !== targets),
    ],
    observation:
      factor.observation +
      ' 연령·성별 모양은 ' +
      pattern.label +
      ' 여가활동 공표율을 전이하고 전체 수준에 다시 맞춘 모형.',
    assumptions: [
      ...factor.assumptions,
      '연령별 이용률을 같은 값으로 두지 않고 국민여가활동조사의 연령·성별 차이를 전이했습니다. 조사 문항·기준기간이 다르므로 실제 게임이용자 조사 교차표가 확보되면 대체해야 합니다.',
    ],
  };
}
