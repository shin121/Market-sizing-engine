import type {
  MarketValueEstimate,
  MoneyMetric,
  MoneyAxis,
} from './market-value';
export type EntityKind =
  | 'archetype'
  | 'market'
  | 'segment'
  | 'behavior'
  | 'need'
  | 'channel'
  | 'interest'
  | 'age'
  | 'age_range'
  | 'region'
  | 'sex'
  | 'household'
  | 'housing'
  | 'education'
  | 'marital';
export type AtlasView =
  | 'overview'
  | 'entity'
  | 'relationship'
  | 'matrix'
  | 'opportunity';
export type AtlasAxis =
  | 'archetype'
  | 'market'
  | 'behavior'
  | 'need'
  | 'channel'
  | 'interest'
  | 'age'
  | 'region';
export interface AtlasEntity {
  id: string;
  label: string;
  kind: EntityKind;
  family: string;
  definition?: string[];
  parent?: string | null;
  description?: string;
}
export interface Estimate {
  observedPopulation?: number;
  modelMembers?: number;
  populationMethod?: 'survey_calibrated_proxy' | 'narrative_projection';
  calibrationSources?: {
    id: string;
    title: string;
    url: string;
    locator: string;
    referencePeriod: string;
  }[];
  population: number;
  support: number;
  low: number;
  high: number;
  share: number;
  effectiveSampleSize: number;
}
export interface DiscoveryMetrics {
  distinctiveness: number;
  distinctivenessScore: number;
  consumptionIntensity: number | null;
  crossIndustryBreadth: number;
  crossIndustryStrength: number;
  smallStrongScore: number;
  opportunity: number | null;
  confidence: 'Modeled' | 'Limited';
  completeness: number;
  components: Record<string, number | null>;
}
export interface Summary {
  marketValue?: MarketValueEstimate;
  moneyQuadrant?: 'scale' | 'volume' | 'premium_niche' | 'small_low' | null;
  entity: AtlasEntity;
  ids: string[];
  estimate: Estimate;
  metrics: DiscoveryMetrics;
}
export interface Stat {
  entity: AtlasEntity;
  population: number;
  support: number;
  share: number;
  baseShare: number;
  index: number | null;
  defining: boolean;
  direction: 'over' | 'under' | 'typical';
  strength: 'Strong' | 'Medium' | 'Weak';
}
export interface ParentDifference {
  parent: AtlasEntity;
  population: number;
  signals: {
    entity: AtlasEntity;
    share: number;
    parentShare: number;
    index: number | null;
    delta: number;
  }[];
}
export interface Profile {
  summary: Summary;
  signals: Stat[];
  demographics: Stat[];
  archetypes: Stat[];
  submarkets: Stat[];
  differences: ParentDifference[];
  microPatterns: Summary[];
  painPatterns: Summary[];
  relatedOpportunities: Summary[];
}
export interface RadarGroup {
  id: 'largest' | 'distinctive' | 'intensity' | 'cross' | 'small';
  label: string;
  metricLabel: string;
  items: Summary[];
}
export interface AtlasContext {
  view: AtlasView;
  ids: string[];
  trail: string[];
  lens: 'people' | 'markets';
  row: AtlasAxis;
  column: AtlasAxis;
  focus: string | null;
  allSignals: boolean;
  compare: string[][];
  tab: 'profile' | 'data';
  metric: MoneyMetric;
  moneyScope: string;
  xAxis: MoneyAxis;
  yAxis: MoneyAxis;
}
export interface AtlasMatrixCell {
  marketValue?: MarketValueEstimate;
  defining: boolean;
  row: AtlasEntity;
  column: AtlasEntity;
  ids: string[];
  population: number;
  support: number;
  share: number;
  index: number | null;
}
export interface AtlasMatrix {
  rows: AtlasEntity[];
  columns: AtlasEntity[];
  cells: AtlasMatrixCell[];
  highlights: { label: string; cell: AtlasMatrixCell }[];
}
export interface AtlasPayload {
  money?: {
    summary: MarketValueEstimate;
    industries: {
      entity: AtlasEntity;
      affinity: number | null;
      population: number;
      estimate: MarketValueEstimate;
    }[];
    contributions: {
      entity: AtlasEntity;
      population: number;
      index: number | null;
      estimate: MarketValueEstimate;
    }[];
    radar: { id: string; label: string; metric: string; items: Summary[] }[];
    availableMarkets: string[];
  };
  context: AtlasContext;
  conditions: AtlasEntity[];
  profile: Profile;
  mapItems: Summary[];
  radar: RadarGroup[];
  opportunities: Summary[];
  comparison: Summary[];
  matrix: AtlasMatrix | null;
  relationship: {
    signals: Stat[];
    archetypes: Stat[];
    markets: Stat[];
    selected: Profile | null;
  };
  universe: {
    population: number;
    sourceRows: number;
    eligibleRows: number;
    coverageShare: number;
    multipleMembershipShare: number;
    archetypes: number;
    markets: number;
    signals: number;
    referenceDate: string;
    sourceDate: string;
  };
  navigation: AtlasEntity[];
  breadcrumbs: AtlasEntity[];
}
export const FAMILY_NAMES: Record<string, string> = {
  value: '가격·실속',
  premium: '품질·프리미엄',
  purchase: '구매 방식',
  trust: '발견·신뢰',
  engagement: '관여·참여',
  channel: '이용 채널',
  convenience: '편의·조율',
  recovery: '휴식·회복',
  growth: '배움·성취',
  connection: '관계·교류',
  expression: '취향·표현',
  pain: '불편·제약',
  affinity: '산업 관심',
  interest: '하위 시장',
  demographic: '인구 특성',
};
export const KIND_NAMES: Record<string, string> = {
  archetype: '소비 유형',
  market: '산업·시장',
  segment: '세그먼트',
  behavior: '소비 행동',
  need: '욕구·불편',
  channel: '채널',
  interest: '관심·하위 시장',
  age: '연령',
  age_range: '연령 범위',
  region: '지역',
  sex: '성별',
  household: '가구 맥락',
  housing: '주거',
  education: '학력',
  marital: '혼인',
};
export function canonicalIds(ids: string[]) {
  return [...new Set(ids)].sort();
}
export function conditionKey(ids: string[]) {
  return canonicalIds(ids).join('~');
}
export function entityPath(entity: AtlasEntity) {
  return entity.kind === 'segment'
    ? '/atlas/segments/' + entity.id
    : entity.kind === 'archetype'
      ? '/atlas/archetypes/' + entity.id
      : entity.kind === 'market'
        ? '/atlas/markets/' + entity.id
        : '/atlas/signals/' + entity.id;
}
export function contextHref(
  view: AtlasView,
  ids: string[],
  options: Partial<AtlasContext> = {},
) {
  const p = new URLSearchParams();
  if (ids.length) p.set('q', conditionKey(ids));
  if (options.metric && options.metric !== 'population')
    p.set('metric', options.metric);
  if (options.moneyScope) p.set('spend', options.moneyScope);
  if (options.xAxis) p.set('x', options.xAxis);
  if (options.yAxis) p.set('y', options.yAxis);
  if (options.row) p.set('row', options.row);
  if (options.column) p.set('col', options.column);
  if (options.focus) p.set('focus', options.focus);
  if (options.trail?.length) p.set('trail', options.trail.join('|'));
  if (options.lens) p.set('lens', options.lens);
  if (options.allSignals) p.set('all', '1');
  if (options.compare?.length)
    p.set('compare', options.compare.map(conditionKey).join('|'));
  return (
    '/atlas' +
    (view === 'overview' ? '' : '/' + view) +
    (p.size ? '?' + p.toString() : '')
  );
}
export function shortPopulation(n: number) {
  if (n === 0) return '0';
  if (n < 100) return '100명 미만';
  if (n < 10000) return Math.round(n / 100) * 100 + '';
  return Number((n / 10000).toPrecision(2)).toLocaleString('ko-KR') + '만';
}
export function population(n: number) {
  const value = shortPopulation(n);
  return n === 0
    ? '0명'
    : value.endsWith('미만')
      ? '약 ' + value
      : '약 ' + value + '명';
}
export function pct(n: number, digits = 1) {
  return n > 0 && n < 0.001 ? '<0.1%' : (n * 100).toFixed(digits) + '%';
}
export function indexLabel(n: number | null) {
  return n === null ? '—' : (n >= 10 ? n.toFixed(1) : n.toFixed(2)) + '×';
}
