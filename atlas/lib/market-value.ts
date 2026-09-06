export type PopulationUnit = 'person' | 'household' | 'business';
export type SpendMethod =
  | 'direct_spend'
  | 'weighted_spend'
  | 'frequency_ticket'
  | 'calibrated_baseline'
  | 'consumption_proxy'
  | 'heuristic_range';
export type MoneyMetric =
  | 'population'
  | 'index'
  | 'marketValue'
  | 'spendPerUnit';
export type MoneyAxis =
  | 'population'
  | 'annualValue'
  | 'spendPerUnit'
  | 'opportunity'
  | 'distinctiveness';
export interface MoneyRange {
  low: number;
  base: number;
  high: number;
}
export interface MarketValueEstimate {
  denominatorBasis?: 'modeled_participant' | 'adult_profile_allocation';
  denominatorLabel?: string;
  componentBreakdown?: {
    id: string;
    label: string;
    annualValue: number;
    nationalValue: number;
    previousNationalValue?: number;
    sourceId: string;
  }[];
  nationalTrend?: { year: number; value: number }[];
  annualValue: number | null;
  low: number | null;
  base: number | null;
  high: number | null;
  currency: 'KRW';
  period: 'annual';
  populationUnit: PopulationUnit;
  scopeId: string;
  scopeLabel: string;
  categoryPopulation: number;
  categoryPopulationUnit: PopulationUnit;
  relevantPopulation: number | null;
  annualSpendPerUnit: number | null;
  spendPerUnitRange: MoneyRange | null;
  participationRate: number | null;
  participationIndex: number | null;
  spendIntensityIndex: number | null;
  spendDensity: number | null;
  spendDensityIndex: number | null;
  shareOfSpendPool: number | null;
  method: SpendMethod | null;
  confidence: 'Low' | 'Medium' | 'High' | 'Unavailable';
  completeness: number;
  status:
    | 'estimated'
    | 'missing_calibration_anchor'
    | 'unit_mapping_required'
    | 'outside_anchor_scope';
  isAdditive: false;
  additiveForDisjointPopulations: boolean;
  componentIds: string[];
  coverage: {
    population: number;
    directSpend: number;
    anchor: number;
    isPartial: boolean;
    supportedMarkets: number;
    totalMarkets: number;
  };
  sourceBasis: {
    id: string;
    title: string;
    url?: string;
    locator?: string;
    referencePeriod?: string;
  }[];
  assumptions: string[];
}
export const SPEND_METHOD_LABELS: Record<SpendMethod, string> = {
  direct_spend: '직접 지출',
  weighted_spend: '가중 지출',
  frequency_ticket: '빈도 × 객단가',
  calibrated_baseline: '카테고리 기준 보정',
  consumption_proxy: 'Spend Proxy 기반',
  heuristic_range: '가정 범위 추정',
};
export const MONEY_AXIS_LABELS: Record<MoneyAxis, string> = {
  population: '인구 규모',
  annualValue: '연간 소비액',
  spendPerUnit: '관련 인구당 연간 금액',
  opportunity: 'Opportunity',
  distinctiveness: '차별성',
};
export function formatKRW(n: number | null | undefined, approximate = true) {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  if (n === 0) return '0원';
  const [divisor, unit] =
    n >= 1e12
      ? [1e12, '조원']
      : n >= 1e8
        ? [1e8, '억원']
        : n >= 1e4
          ? [1e4, '만원']
          : [1, '원'];
  const value = Number((n / Number(divisor)).toPrecision(2)).toLocaleString(
    'ko-KR',
  );
  return (approximate ? '약 ' : '') + value + unit;
}
export const unitLabel = (unit: PopulationUnit) =>
  unit === 'household' ? '가구' : unit === 'business' ? '사업체' : '명';
export function moneyStatus(v?: MarketValueEstimate) {
  if (!v) return '금액 기준 미확보';
  return v.status === 'unit_mapping_required'
    ? '가구 단위 연결 필요'
    : v.status === 'outside_anchor_scope'
      ? '조사 연령 범위 밖'
      : v.status === 'missing_calibration_anchor'
        ? '지출 기준 미확보'
        : `${SPEND_METHOD_LABELS[v.method!]} · ${v.confidence} confidence`;
}
