import external from '../../config/external-spend.json';
import config from '../../config/market-value.json';
import { canonicalIds } from '../../lib/atlas';
import { linearMoments, measure, measureUnion, bounded } from './population';

export const externalScopes = external.scopes as Record<
  string,
  { label: string; components: string[] }
>;
const cache = new Map<string, ReturnType<typeof calculate>>();
const components = new Map(external.components.map((v) => [v.id, v]));
function calculate(ids: string[], scope: string) {
  const definition =
    scope === 'covered'
      ? {
          label: '온라인 상품·서비스 21개 항목',
          components: external.components.map((v) => v.id),
        }
      : externalScopes[scope];
  if (!definition) return null;
  const conditions = ids.filter((id) => id !== scope);
  const breakdown = definition.components.map((id) => {
    const component = components.get(id)!;
    const market = component.allocationMarket;
    const sum = (selection: string[]) =>
      linearMoments(selection, config.proxyCoefficients).reduce(
        (s, r) => s + r.weightedSignalSum,
        0,
      );
    const fraction = sum(canonicalIds([...conditions, market])) / sum([market]);
    return {
      id: 'online-2025-' + id,
      label: component.label,
      annualValue: component.annual2025 * fraction,
      nationalValue: component.annual2025,
      previousNationalValue: component.annual2024,
      sourceId: external.source.id,
    };
  });
  const allocationMarkets = [
    ...new Set(
      definition.components.map((id) => components.get(id)!.allocationMarket),
    ),
  ];
  const relevantPopulation = measureUnion(
    conditions,
    allocationMarkets,
  ).population;
  const baselinePopulation = measureUnion([], allocationMarkets).population;
  const base = breakdown.reduce((s, v) => s + v.annualValue, 0);
  const national = breakdown.reduce((s, v) => s + v.nationalValue, 0);
  const density = relevantPopulation ? base / relevantPopulation : null;
  return {
    base,
    national,
    density,
    relevantPopulation,
    baselinePopulation,
    allocationMarkets,
    inputPopulation: measure(conditions).population,
    scopeLabel: definition.label + ' · 2025',
    breakdown,
    nationalTrend: [
      {
        year: 2024,
        value: breakdown.reduce((s, v) => s + v.previousNationalValue, 0),
      },
      { year: 2025, value: national },
    ],
  };
}
export function externalPool(ids: string[], scope: string) {
  const key = canonicalIds(ids).join('~') + '|' + scope;
  if (cache.has(key)) return cache.get(key)!;
  return bounded(cache, key, calculate(ids, scope), 2048);
}
export const externalSource = external.source;
export const externalAllocation = external.allocation;
