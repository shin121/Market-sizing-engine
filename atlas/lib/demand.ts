export type DemandUnit = 'person' | 'household' | 'business';
export type DemandMethod =
  | 'survey_rate'
  | 'survey_transfer'
  | 'research_scenario';
export interface DemandRange {
  low: number;
  base: number;
  high: number;
}
export interface DemandSource {
  id: string;
  title: string;
  publisher: string;
  url: string;
  referencePeriod: string;
  retrievedAt: string;
  locator: string;
  surveyUniverse: string;
  limitations: string[];
}
export interface DemandCell {
  id: string;
  sourceId: string;
  population: number;
  unit: DemandUnit;
  ageMin?: number;
  ageMax?: number;
  sex?: 'male' | 'female';
  region?: string;
}
export interface DemandRate extends DemandRange {
  ageMin?: number;
  ageMax?: number;
  sex?: 'male' | 'female';
}
export interface DemandFactor {
  id: string;
  label: string;
  unit: DemandUnit;
  populationScope?: { ageMin: number; ageMax: number };
  profileShape?: { factorId: string; ageMin: number; ageMax: number };
  /** This is a conditional rate within all prerequisites, not an extra root rate. */
  prerequisites: string[];
  method: DemandMethod;
  sourceIds: string[];
  definition: string;
  observation: string;
  rates: DemandRate[];
  assumptions: string[];
  validationQuestion: string;
}
export interface DemandEstimate extends DemandRange {
  status: 'estimated';
  unit: DemandUnit;
  populationScope?: { ageMin: number; ageMax: number };
  factorIds: string[];
  /** OR terms must remain visible to downstream engines; factorIds alone is not an AND. */
  unionGroups?: string[][];
  definitions: string[];
  sourceIds: string[];
  methods: DemandMethod[];
  assumptions: string[];
  /** Range is a sensitivity envelope, never a sampling confidence interval. */
  rangeMeaning: 'research_sensitivity';
  cells: (DemandCell & DemandRange)[];
  isAdditive: false;
}
export interface DemandUnavailable {
  status: 'not_estimable';
  reason:
    | 'unknown_factor'
    | 'unit_mismatch'
    | 'missing_rate'
    | 'invalid_model'
    | 'outside_scope';
  detail: string;
}
