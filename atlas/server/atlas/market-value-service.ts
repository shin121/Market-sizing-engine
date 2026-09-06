import type { AtlasPayload, Summary, Profile } from '../../lib/atlas';
import { canonicalIds } from '../../lib/atlas';
import {
  estimateMarketValue,
  economicValueScore,
  availableSpendMarkets,
} from './market-value';
import { markets } from './source';
import config from '../../config/market-value.json';
import scoring from '../../config/scoring.json';
import type { MarketValueEstimate } from '../../lib/market-value';
function compactValue(v: MarketValueEstimate): MarketValueEstimate {
  // Cards use values only. Full evidence is serialized once for the selected profile.
  return {
    ...v,
    componentBreakdown: undefined,
    nationalTrend: undefined,
    sourceBasis: [],
    assumptions: [],
  };
}
export function addEconomicScore(s: Summary, scope: string): Summary {
  const marketValue = estimateMarketValue(s.ids, scope),
    economic =
      s.estimate.population > 0 ? economicValueScore(marketValue) : null;
  const components = { ...s.metrics.components, economicValue: economic };
  let sum = 0,
    weight = 0;
  for (const [k, w] of Object.entries(scoring.weights)) {
    const n = components[k as keyof typeof components];
    if (n !== null && n !== undefined) {
      sum += n * w;
      weight += w;
    }
  }
  if (economic !== null) {
    sum += economic * config.opportunityWeight;
    weight += config.opportunityWeight;
  }
  const large = s.estimate.share >= 0.03,
    high = (marketValue.spendDensityIndex ?? 0) > 1;
  const moneyQuadrant =
    marketValue.base === null
      ? null
      : large
        ? high
          ? 'scale'
          : 'volume'
        : high
          ? 'premium_niche'
          : 'small_low';
  return {
    ...s,
    estimate: { ...s.estimate, calibrationSources: [] },
    marketValue: compactValue(marketValue),
    moneyQuadrant,
    metrics: {
      ...s.metrics,
      components,
      opportunity: weight ? Math.round(sum / weight) : null,
    },
  };
}
export function enrichMarketValue(
  data: AtlasPayload,
  typeSummaries: Summary[],
): AtlasPayload {
  const c = data.context,
    scope = c.moneyScope;
  const withMoney = (s: Summary) => addEconomicScore(s, scope);
  const profile = (p: Profile): Profile => ({
    ...p,
    summary: {
      ...withMoney(p.summary),
      estimate: p.summary.estimate,
      marketValue: estimateMarketValue(p.summary.ids, scope),
    },
    relatedOpportunities: p.relatedOpportunities.map(withMoney),
    microPatterns: p.microPatterns.map(withMoney),
    painPatterns: p.painPatterns.map(withMoney),
  });
  const candidates = typeSummaries
    .map(withMoney)
    .filter(
      (s) =>
        s.marketValue?.base !== null &&
        s.marketValue?.relevantPopulation &&
        s.estimate.support >= 30,
    );
  const pick = (f: (s: Summary) => number, items = candidates) =>
    [...items].sort((a, b) => f(b) - f(a)).slice(0, 3);
  const niche = candidates.filter(
    (s) =>
      s.estimate.share < 0.03 && (s.marketValue?.spendDensityIndex ?? 0) > 1,
  );
  const industries = markets.map((entity) => {
    const stat = data.profile.signals.find((s) => s.entity.id === entity.id);
    return {
      entity,
      affinity: stat?.index ?? null,
      population: stat?.population ?? 0,
      estimate: compactValue(estimateMarketValue(c.ids, entity.id)),
    };
  });
  const contributions = data.profile.archetypes.map((s) => ({
    entity: s.entity,
    population: s.population,
    index: s.index,
    estimate: compactValue(
      estimateMarketValue(canonicalIds([...c.ids, s.entity.id]), scope),
    ),
  }));
  const money = {
    summary: estimateMarketValue(c.ids, scope),
    industries,
    contributions,
    availableMarkets: availableSpendMarkets,
    radar: [
      {
        id: 'largest-spend',
        label: '연간 소비액이 큰 유형',
        metric: '연간 소비액',
        items: pick((s) => s.marketValue!.base!),
      },
      {
        id: 'high-spend',
        label: '관련 인구당 지출이 높은 유형',
        metric: '연간 지출 / 명',
        items: pick((s) => s.marketValue!.annualSpendPerUnit!),
      },
      {
        id: 'money-niche',
        label: '작지만 지출이 높은 유형',
        metric: '연간 배분액 / 명',
        items: pick(
          (s) => s.marketValue!.base! * s.marketValue!.spendDensityIndex!,
          niche,
        ),
      },
    ],
  };
  let matrix = data.matrix;
  if (matrix) {
    const cells = matrix.cells.map((cell) => ({
      ...cell,
      marketValue: compactValue(
        estimateMarketValue(
          cell.ids,
          cell.column.kind === 'market'
            ? cell.column.id
            : cell.row.kind === 'market'
              ? cell.row.id
              : scope,
        ),
      ),
    }));
    const valid = cells.filter(
      (cell) =>
        cell.ids.length <= 8 &&
        !cell.defining &&
        cell.support >= 30 &&
        cell.marketValue.base !== null &&
        cell.marketValue.relevantPopulation,
    );
    const top = (score: (v: MarketValueEstimate) => number) =>
      [...valid].sort((a, b) => score(b.marketValue) - score(a.marketValue))[0];
    const monetary = [
      { label: 'Largest spend pool', cell: top((v) => v.base!) },
      {
        label: 'Highest spend / person',
        cell: top((v) => v.annualSpendPerUnit ?? 0),
      },
      {
        label: 'Money-dense niche',
        cell: [...valid]
          .filter(
            (v) =>
              v.population < data.profile.summary.estimate.population * 0.15 &&
              (v.marketValue.spendDensityIndex ?? 0) > 1,
          )
          .sort((a, b) => b.marketValue.base! - a.marketValue.base!)[0],
      },
    ].filter((p) => Boolean(p.cell));
    matrix = {
      ...matrix,
      cells,
      highlights: [
        ...matrix.highlights.map((h) => ({
          ...h,
          cell: cells.find(
            (x) =>
              x.row.id === h.cell.row.id && x.column.id === h.cell.column.id,
          )!,
        })),
        ...monetary,
      ],
    };
  }
  return {
    ...data,
    profile: profile(data.profile),
    mapItems: data.mapItems.map((s) =>
      addEconomicScore(
        s,
        c.lens === 'markets'
          ? (s.ids.find((id) => markets.some((m) => m.id === id)) ?? scope)
          : scope,
      ),
    ),
    radar: data.radar.map((r) => ({ ...r, items: r.items.map(withMoney) })),
    opportunities: data.opportunities
      .map((s) =>
        addEconomicScore(
          s,
          !c.ids.length && s.entity.kind === 'market' ? s.entity.id : scope,
        ),
      )
      .sort(
        (a, b) => (b.metrics.opportunity ?? 0) - (a.metrics.opportunity ?? 0),
      ),
    comparison: data.comparison.map(withMoney),
    relationship: {
      ...data.relationship,
      selected: data.relationship.selected
        ? profile(data.relationship.selected)
        : null,
    },
    matrix,
    money,
  };
}
