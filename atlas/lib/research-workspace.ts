import type { DemandUnit } from './demand';
import type { ResearchProfile } from './research-explorer';
export type ResearchView =
  | 'overview'
  | 'matrix'
  | 'opportunity'
  | 'compare'
  | 'ideas'
  | 'sources';
export type ResearchMetric =
  | 'population'
  | 'marketValue'
  | 'spendPerUnit'
  | 'index';
export interface ResearchContext {
  view: ResearchView;
  market: string;
  node: string;
  age: string;
  unit: DemandUnit;
  metric: ResearchMetric;
  compare: string[];
}
export interface ResearchCandidate {
  key: string;
  market: string;
  marketLabel: string;
  parentLabel: string;
  node: string;
  age: string;
  level: 'market' | 'branch' | 'archetype';
  label: string;
  scope: string;
  unit: DemandUnit;
  population: number | null;
  low: number | null;
  high: number | null;
  marketValue: ResearchProfile['marketValue'];
  grade: ResearchProfile['evidenceGrade'];
  job: string;
  hypothesis: string;
  alternatives: string;
  question: string;
  ages: ResearchProfile['ages'];
  regions: ResearchProfile['regions'];
  regionBasis: string;
  observations: ResearchProfile['observations'];
  sourceIds: string[];
  assumptions: string[];
  index: number | null;
  opportunity: {
    score: number | null;
    population: number | null;
    economicValue: number | null;
    completeness: number;
  };
}
export interface ResearchWorkspacePayload {
  context: ResearchContext;
  candidates: ResearchCandidate[];
  selected: ResearchCandidate | null;
  comparison: ResearchCandidate[];
  matrix: {
    columns: ResearchCandidate[];
    rows: string[];
    cells: ResearchCandidate[][];
  } | null;
  sources: ResearchProfile['sources'];
  unresolved: string[];
  version: string;
}
export function candidateKey(market: string, node = '_root', age = '') {
  return [market, node, age].join(':');
}
export function researchWorkspaceHref(
  view: ResearchView,
  context: Partial<ResearchContext> = {},
) {
  const q = new URLSearchParams();
  for (const key of ['market', 'node', 'age', 'unit', 'metric'] as const)
    if (context[key]) q.set(key, context[key]);
  if (context.compare?.length)
    q.set('compare', context.compare.slice(0, 3).join('|'));
  return (
    '/atlas' + (view === 'overview' ? '' : '/' + view) + (q.size ? '?' + q : '')
  );
}
export function researchPopulation(value: number | null, unit: DemandUnit) {
  if (value === null) return '근거 미확보';
  const n =
    value >= 10000
      ? Number((value / 10000).toPrecision(3)).toLocaleString('ko-KR') + '만'
      : (Math.round(value / 100) * 100).toLocaleString('ko-KR');
  return (
    '약 ' +
    n +
    (unit === 'household' ? '가구' : unit === 'business' ? '사업체' : '명')
  );
}
export function candidateMetric(c: ResearchCandidate, metric: ResearchMetric) {
  return metric === 'marketValue'
    ? c.marketValue.annualValue
    : metric === 'spendPerUnit'
      ? c.marketValue.annualSpendPerUnit
      : metric === 'index'
        ? c.index
        : c.population;
}
