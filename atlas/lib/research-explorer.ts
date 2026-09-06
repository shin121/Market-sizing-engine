import type {
  DemandEstimate,
  DemandSource,
  DemandUnavailable,
  DemandUnit,
} from './demand';
import type { MarketValueEstimate, MoneyMetric } from './market-value';
export interface ResearchBranch {
  id: string;
  label: string;
  factors: string[];
  job: string;
  hypothesis: string;
  alternatives: string;
  nextQuestion: string;
  children?: { id: string; label: string; factors: string[] }[];
  /** These are propositions for testing, never measured pain prevalence. */
  painMeasured?: boolean;
  evidenceType?: 'consumer_problem';
}
export interface ResearchMarket {
  id: string;
  label: string;
  unit: DemandUnit;
  scope: string;
  rootGroups?: string[][];
  unionModel?: 'conditional_independence' | 'overlap_bounds';
  branches: ResearchBranch[];
  gap?: string;
}
export interface ResearchProfile {
  id: string;
  label: string;
  /** Concise most-specific scope when a published nested cohort is available. */
  definition?: string;
  estimate: DemandEstimate | DemandUnavailable;
  factors: string[];
  observations: { label: string; value: string }[];
  regions: { label: string; share: number }[];
  regionBasis: string;
  sources: DemandSource[];
  evidenceGrade: 'B' | 'C' | 'D';
  ages: { label: string; share: number; covered?: boolean }[];
  sexes: { label: string; share: number }[];
  marketValue: MarketValueEstimate;
  householdProfile?: {
    ages: { label: string; share: number }[];
    sexes: { label: string; share: number }[];
    sizes: { label: string; share: number }[];
    basis: string;
  };
}
export interface ResearchExplorerPayload {
  market: ResearchMarket;
  root: ResearchProfile;
  branches: (Omit<ResearchBranch, 'children'> & {
    profile: ResearchProfile;
    children: ResearchProfile[];
  })[];
  markets: {
    id: string;
    label: string;
    unit: DemandUnit;
    population: number | null;
    scope: string;
  }[];
  version: string;
}
export function researchHref(
  market: string,
  node?: string,
  age?: string,
  compare?: string[],
  metric?: MoneyMetric,
) {
  const query = new URLSearchParams();
  if (node) query.set('node', node);
  if (age) query.set('age', age);
  if (compare?.length) query.set('compare', compare.slice(0, 3).join('|'));
  if (metric) query.set('metric', metric);
  return (
    '/atlas/research/' +
    encodeURIComponent(market) +
    (query.size ? '?' + query : '')
  );
}
