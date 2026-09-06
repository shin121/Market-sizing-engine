import catalogJson from '../data/atlas-catalog.json';
import cubeJson from '../data/atlas-calibrated-cubes.json';
import calibrationJson from '../data/atlas-calibration.json';
import type { AtlasEntity, EntityKind } from '../../lib/atlas';
import { AGE_UNIONS, orderedConditions } from '../../lib/discovery';
export interface SourceFeature {
  id: string;
  label: string;
  kind: EntityKind;
  family: string;
  parent: string | null;
  pattern: string;
  sourceFields: string[];
  support: number;
  populationEstimate: number;
  share: number;
  mechanism: boolean;
}
export interface SourceArchetype {
  id: string;
  name: string;
  family: string;
  definition: string[];
  description: string;
  populationEstimate: number;
  support: number;
  share: number;
  signalRates: number[];
  topSignals: string[];
  topMarkets: string[];
  associationLift: number;
  holdoutLift: number;
  independentIndexCount: number;
  metrics: {
    distinctiveness: number;
    distinctivenessScore: number;
    consumptionIntensity: number | null;
    crossIndustryBreadth: number;
    crossIndustryStrength: number;
    smallStrongScore: number;
  };
}
interface Source {
  version: string;
  dataFingerprint: string;
  sourceRows: number;
  eligibleRows: number;
  excludedAge19: number;
  population: number;
  referenceDate: string;
  sourceDate: string;
  sourceName: string;
  sourceUrl: string;
  license: string;
  features: SourceFeature[];
  archetypes: SourceArchetype[];
  dimensions: {
    id: string;
    label: string;
    kind: EntityKind;
    family: string;
    support: number;
    populationEstimate: number;
  }[];
  wordRanges: { start: number; end: number; weight: number }[];
  wordLength: number;
  overlap: {
    coverageShare: number;
    multipleMembershipShare: number;
    meanMemberships: number;
  };
  unavailable: string[];
}
export interface Cube {
  observedPopulation?: number;
  modelMembers?: number;
  population: number;
  support: number;
  weightSquareSum: number;
  counts: number[];
  supports: number[];
}
export const observedSource = catalogJson as unknown as Source;
if (calibrationJson.observedFingerprint !== observedSource.dataFingerprint)
  throw Error(
    'Behavior calibration is stale; rebuild it against the current source index.',
  );
export const populationCalibration = calibrationJson;
const calibratedPopulations: Record<string, number> =
  calibrationJson.populations;
const calibratedRates: Record<string, number[]> =
  calibrationJson.archetypeRates;
export const source: Source = {
  ...observedSource,
  version: observedSource.version + '+' + calibrationJson.version,
  dataFingerprint: calibrationJson.modelFingerprint,
  overlap: calibrationJson.overlap,
  features: observedSource.features.map((f) => ({
    ...f,
    populationEstimate: calibratedPopulations[f.id],
    share: calibratedPopulations[f.id] / observedSource.population,
    ...(f.id === 'planned_purchase'
      ? {
          label: '구매 전 정보 검토',
          sourceFields: ['KCA-PURCHASE-2024', ...f.sourceFields],
        }
      : {}),
    ...(f.id === 'commerce' ? { label: '온라인 쇼핑·소비' } : {}),
  })),
  archetypes: observedSource.archetypes.map((a) => ({
    ...a,
    populationEstimate: calibratedPopulations[a.id],
    share: calibratedPopulations[a.id] / observedSource.population,
    signalRates: calibratedRates[a.id],
  })),
};
export const cubes = cubeJson as unknown as {
  version: string;
  indexDigest: string;
  featureKeys: string[];
  data: Record<string, Cube>;
};
export const features = source.features;
export const archetypeById = new Map(source.archetypes.map((a) => [a.id, a]));
export const entities: AtlasEntity[] = [
  ...features.map((f) => ({
    id: f.id,
    label: f.label,
    kind: f.kind,
    family: f.family,
    parent: f.parent,
  })),
  ...source.archetypes.map((a) => ({
    id: a.id,
    label: a.name,
    kind: 'archetype' as const,
    family: a.family,
    definition: a.definition,
    description: a.description,
  })),
  ...source.dimensions.map((d) => ({
    id: d.id,
    label: d.label,
    kind: d.kind,
    family: d.family,
  })),
  ...Object.keys(AGE_UNIONS).map((id) => ({
    id,
    label:
      id === 'age_60_plus'
        ? '60세 이상'
        : id.replace('age_', '').replace('_', '–') + '세',
    kind: 'age_range' as const,
    family: 'identity',
  })),
];
export const registry = new Map(entities.map((e) => [e.id, e]));
export const markets = entities.filter((e) => e.kind === 'market');
export const types = entities.filter((e) => e.kind === 'archetype');
export function definitions(ids: string[]) {
  return new Set(
    ids.flatMap((id) => archetypeById.get(id)?.definition ?? [id]),
  );
}
export function entityForIds(ids: string[]): AtlasEntity {
  if (ids.length === 1) return registry.get(ids[0])!;
  return {
    id: ids.length ? ids.join('~') : 'universe',
    label: ids.length
      ? orderedConditions(ids.map((id) => registry.get(id)!))
          .map((e) => e.label)
          .join(' × ')
      : '대한민국 소비자 시장',
    kind: 'segment',
    family: 'affinity',
    definition: ids,
  };
}
export function assertIds(ids: string[], limit = 12) {
  if (ids.length > limit || ids.some((id) => !registry.has(id)))
    throw new Error(
      '지원하지 않는 조건입니다. 최대 8개 조건을 조합할 수 있습니다.',
    );
}
