import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const {
  source,
  types,
  markets,
} = require('../work/test-build/server/atlas/source.js');
const {
  summarize,
  getProfile,
  analyzeAtlas,
  resolveContext,
} = require('../work/test-build/server/atlas/engine.js');
const {
  estimateMarketValue,
  availableSpendMarkets,
} = require('../work/test-build/server/atlas/market-value.js');
const {
  addEconomicScore,
} = require('../work/test-build/server/atlas/market-value-service.js');
const fields = (v) => ({
  relevantPopulation: v.relevantPopulation,
  annualSpendPerUnit: v.annualSpendPerUnit,
  low: v.low,
  base: v.base,
  high: v.high,
  participationRate: v.participationRate,
  method: v.method,
  confidence: v.confidence,
  denominator: v.denominatorBasis,
  scope: v.scopeLabel,
  coverage: v.coverage,
});
const archetypes = types.map((t) => {
  const s = summarize([t.id]),
    p = getProfile([t.id], false),
    v = estimateMarketValue([t.id], 'covered');
  const industries = markets.map((m) => ({
    id: m.id,
    label: m.label,
    ...fields(estimateMarketValue([t.id], m.id)),
  }));
  return {
    id: t.id,
    label: t.label,
    population: s.estimate.population,
    observedPopulation: s.estimate.observedPopulation,
    observedSupport: s.estimate.support,
    populationMethod: s.estimate.populationMethod,
    calibrationSources: s.estimate.calibrationSources.map((v) => v.id),
    ...fields(v),
    quadrant: addEconomicScore(s, 'covered').moneyQuadrant,
    topIndustriesBySpend: industries
      .filter((v) => v.base !== null)
      .sort((a, b) => b.base - a.base)
      .slice(0, 4),
    topIndustriesByAffinity: p.signals
      .filter((v) => v.entity.kind === 'market')
      .sort((a, b) => b.index - a.index)
      .slice(0, 4)
      .map((v) => ({
        id: v.entity.id,
        index: v.index,
        population: v.population,
      })),
    limitations: [
      s.estimate.populationMethod === 'survey_calibrated_proxy'
        ? 'External survey rates transferred to synthetic profiles; joint memberships are modeled.'
        : 'Narrative projection only: population is not a measured behavioral prevalence.',
      'Spend is a partial-channel allocation, not verified purchases by these people.',
    ],
  };
});
const ranked = (rows, key) =>
  [...rows].sort((a, b) => (b[key] ?? -1) - (a[key] ?? -1)).map((x) => x.id);
const pop = ranked(archetypes, 'population'),
  money = ranked(archetypes, 'base');
archetypes.forEach((r) => {
  r.populationRank = pop.indexOf(r.id) + 1;
  r.spendRank = money.indexOf(r.id) + 1;
});
const marketAudit = markets.map((m) => {
  const p = getProfile([m.id], false),
    v = estimateMarketValue([], m.id);
  const rows = types.map((t) => {
    const s = p.archetypes.find((x) => x.entity.id === t.id);
    return {
      id: t.id,
      label: t.label,
      population: s.population,
      index: s.index,
      ...fields(estimateMarketValue([m.id, t.id], m.id)),
    };
  });
  return {
    id: m.id,
    label: m.label,
    narrativeOrCalibratedPopulation: summarize([m.id]).estimate.population,
    ...fields(v),
    topBySpend: rows
      .filter((v) => v.base !== null)
      .sort((a, b) => b.base - a.base)
      .slice(0, 5),
    topByPopulation: [...rows]
      .sort((a, b) => b.population - a.population)
      .slice(0, 5),
    topByAffinity: [...rows].sort((a, b) => b.index - a.index).slice(0, 5),
  };
});
const matrix = analyzeAtlas(
  resolveContext(['matrix'], {
    row: 'age',
    col: 'archetype',
    spend: 'covered',
    metric: 'marketValue',
  }),
).matrix;
const valid = matrix.cells.filter(
  (c) => !c.defining && c.support >= 30 && c.marketValue?.base !== null,
);
const populationCells = [...valid].sort((a, b) => b.population - a.population),
  moneyCells = [...valid].sort(
    (a, b) => b.marketValue.base - a.marketValue.base,
  );
const matrixRanks = valid.map((v) => ({
  label: v.row.label + ' × ' + v.column.label,
  ids: v.ids,
  population: v.population,
  annualValue: v.marketValue.base,
  annualSpendPerUnit: v.marketValue.annualSpendPerUnit,
  populationRank: populationCells.indexOf(v) + 1,
  spendRank: moneyCells.indexOf(v) + 1,
}));
const rankChanges = matrixRanks
  .filter((v) => v.populationRank !== v.spendRank)
  .sort(
    (a, b) => b.populationRank - b.spendRank - (a.populationRank - a.spendRank),
  );
assert.equal(archetypes.length, 52);
assert.equal(marketAudit.length, 20);
assert.ok(rankChanges.length > 0);
assert.notDeepEqual(pop, money);
const report = {
  version: source.version,
  checkedAt: new Date().toISOString(),
  scope:
    '21 disjoint 2025 online categories + modeled 2024 digital music; not all consumer spend',
  supportedMarkets: availableSpendMarkets,
  missingMarkets: markets.filter((m) => !availableSpendMarkets.includes(m.id)),
  archetypes,
  markets: marketAudit,
  quadrants: Object.fromEntries(
    ['scale', 'volume', 'premium_niche', 'small_low'].map((q) => [
      q,
      archetypes.filter((a) => a.quadrant === q).map((a) => a.id),
    ]),
  ),
  matrix: {
    rows: matrix.rows.map((v) => v.id),
    columns: matrix.columns.map((v) => v.id),
    rankChanges,
  },
  review:
    'Checked every estimate for units, ordered ranges, subsets, observed support preservation, national closure and ranking changes. External validity remains partial; no claim that all 52 populations have a survey anchor.',
};
fs.writeFileSync(
  'data/revision-sanity.json',
  JSON.stringify(report, null, 2) + '\n',
);
console.log(
  JSON.stringify(
    {
      archetypes: archetypes.length,
      markets: marketAudit.length,
      supported: availableSpendMarkets.length,
      rankChanges: rankChanges.length,
      largestInversion: rankChanges[0],
      quadrants: Object.fromEntries(
        Object.entries(report.quadrants).map(([k, v]) => [k, v.length]),
      ),
    },
    null,
    2,
  ),
);
