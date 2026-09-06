import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { formatKRW } from '../lib/market-value';
import { annualPool, selectSpendMethod } from '../server/atlas/spend-methods';
import {
  estimateMarketValue,
  assertAdditive,
} from '../server/atlas/market-value';
import { analyzeAtlas, resolveContext, measure } from '../server/atlas/engine';
import { source, types, markets } from '../server/atlas/source';
import { addEconomicScore } from '../server/atlas/market-value-service';
import { summarize } from '../server/atlas/engine';
import oracle from '../data/market-value-oracle.json';
const close = (a: number, b: number) =>
  assert.ok(
    Math.abs(a - b) < Math.max(0.02, Math.abs(b) * 1e-10),
    `${a} != ${b}`,
  );
const range = { low: 1, base: 2, high: 3 };
void test('KRW scale formatting and unknown versus zero', () => {
  assert.equal(formatKRW(45000000), '약 4,500만원');
  assert.equal(formatKRW(820000000), '약 8.2억원');
  assert.equal(formatKRW(79000000000), '약 790억원');
  assert.equal(formatKRW(1390000000000), '약 1.4조원');
  assert.equal(formatKRW(null), '—');
  assert.equal(formatKRW(0), '0원');
});
void test('six spend methods, annualization, ranges and unit guards', () => {
  const unit = {
    populationUnit: 'person' as const,
    spendUnit: 'person' as const,
  };
  const cases = [
    { ...unit, direct: { amount: 72000, period: 'monthly' as const } },
    {
      ...unit,
      observations: [
        { weight: 1, amount: 100, period: 'monthly' as const },
        { weight: 3, amount: 300, period: 'monthly' as const },
      ],
    },
    {
      ...unit,
      frequencyTicket: {
        frequency: range,
        ticket: { low: 10000, base: 28000, high: 40000 },
        frequencyPeriod: 'monthly' as const,
      },
    },
    { ...unit, baseline: range },
    { ...unit, baseline: range, intensity: 1.42 },
    { ...unit, heuristic: range },
  ];
  assert.deepEqual(
    cases.map((x) => selectSpendMethod(x)?.method),
    [
      'direct_spend',
      'weighted_spend',
      'frequency_ticket',
      'calibrated_baseline',
      'consumption_proxy',
      'heuristic_range',
    ],
  );
  close(selectSpendMethod(cases[0])!.spend.base, 864000);
  close(
    selectSpendMethod({ ...unit, direct: { amount: 10000, period: 'weekly' } })!
      .spend.base,
    520000,
  );
  close(
    selectSpendMethod({ ...unit, direct: { amount: 10000, period: 'annual' } })!
      .spend.base,
    10000,
  );
  close(selectSpendMethod(cases[1])!.spend.base, 3000);
  close(annualPool(1000, selectSpendMethod(cases[1])!.spend).base, 3000000);
  assert.throws(() =>
    selectSpendMethod({ ...unit, spendUnit: 'household', baseline: range }),
  );
  assert.throws(() =>
    selectSpendMethod({ ...unit, baseline: { low: 3, base: 2, high: 1 } }),
  );
  assert.equal(selectSpendMethod(unit), null);
});
void test('independent SQL monetary oracle across whole, age, archetype and multijoint scopes', () => {
  for (const row of oracle.cases) {
    const v = estimateMarketValue(row.ids, 'music');
    if (
      row.eligible === 0 &&
      measure(row.ids).population > 0 &&
      row.ids.includes('age_70') &&
      row.ids.length === 1
    ) {
      assert.equal(v.base, null);
      assert.equal(v.status, 'outside_anchor_scope');
      continue;
    }
    close(v.base!, row.base);
    close(v.low!, row.low);
    close(v.high!, row.high);
    close(v.relevantPopulation!, row.participants);
    assert.ok(v.relevantPopulation! <= measure(row.ids).population + 0.01);
    if (v.relevantPopulation)
      close(v.annualSpendPerUnit! * v.relevantPopulation, v.base!);
  }
});
void test('same music baseline reconciles disjoint ages and does not sum overlapping archetypes', () => {
  const total = estimateMarketValue([], 'music');
  const ages = [20, 30, 40, 50, 60].map((a) =>
    estimateMarketValue(['age_' + a], 'music'),
  );
  close(
    ages.reduce((n, a) => n + a.base!, 0),
    total.base!,
  );
  close(
    ages.reduce((n, a) => n + a.relevantPopulation!, 0),
    total.relevantPopulation!,
  );
  const a = estimateMarketValue([types[0].id], 'music'),
    b = estimateMarketValue([types[1].id], 'music');
  assert.equal(a.isAdditive, false);
  assert.throws(() => assertAdditive([a, b]));
  assert.equal(total.coverage.directSpend, 0);
  assert.ok(total.coverage.anchor < 1);
});
void test('missing monetary anchors, household mapping and multiple-market context stay explicit', () => {
  for (const m of markets.filter((m) => m.id !== 'music')) {
    const v = estimateMarketValue([m.id], m.id);
    assert.equal(v.base, null);
    assert.equal(v.relevantPopulation, null);
    assert.ok(
      ['missing_calibration_anchor', 'unit_mapping_required'].includes(
        v.status,
      ),
    );
  }
  assert.equal(estimateMarketValue(['pet'], 'pet').populationUnit, 'household');
  assert.equal(estimateMarketValue(['pet'], 'music').populationUnit, 'person');
  assert.throws(() => estimateMarketValue([], 'fake-market'));
});
void test('population and money rank differently for actual types; all size-density patterns are audited', () => {
  const rows = types.map((t) => ({
    id: t.id,
    label: t.label,
    population: measure([t.id]).population,
    estimate: estimateMarketValue([t.id], 'music'),
  }));
  const pop = [...rows]
      .sort((a, b) => b.population - a.population)
      .map((r) => r.id),
    money = [...rows]
      .sort((a, b) => b.estimate.base! - a.estimate.base!)
      .map((r) => r.id);
  assert.notDeepEqual(pop, money);
  assert.ok(
    rows.some((r) => Math.abs(pop.indexOf(r.id) - money.indexOf(r.id)) >= 3),
  );
  const quadrants = Object.fromEntries(
    ['scale', 'volume', 'premium_niche', 'small_low'].map((k) => [
      k,
      rows
        .filter((r) => {
          const large = r.population >= source.population * 0.03,
            high = (r.estimate.spendDensityIndex ?? 0) > 1;
          return (
            (large
              ? high
                ? 'scale'
                : 'volume'
              : high
                ? 'premium_niche'
                : 'small_low') === k
          );
        })
        .map((r) => r.label),
    ]),
  );
  fs.mkdirSync('work/market-value', { recursive: true });
  fs.writeFileSync(
    'work/market-value/type-sanity.json',
    JSON.stringify(
      { rows, populationRank: pop, spendRank: money, quadrants },
      null,
      2,
    ),
  );
  assert.ok(Object.values(quadrants).every((a) => a.length > 0));
});
void test('matrix money mode uses exact scope and contains an actual rank inversion', () => {
  const context = resolveContext(['matrix'], {
    spend: 'music',
    metric: 'marketValue',
    row: 'age',
    col: 'archetype',
  });
  const data = analyzeAtlas(context),
    cells = data.matrix!.cells.filter(
      (c) => c.marketValue?.base !== null && c.population > 0,
    );
  const pop = [...cells].sort((a, b) => b.population - a.population),
    money = [...cells].sort(
      (a, b) => b.marketValue!.base! - a.marketValue!.base!,
    );
  assert.notDeepEqual(
    pop.map((c) => c.ids),
    money.map((c) => c.ids),
  );
  assert.ok(
    data.matrix!.highlights.some((h) => h.label === 'Largest spend pool'),
  );
  fs.writeFileSync(
    'work/market-value/matrix-sanity.json',
    JSON.stringify(
      {
        context,
        cells: cells.map((c) => ({
          ids: c.ids,
          population: c.population,
          populationRank: pop.indexOf(c) + 1,
          spendRank: money.indexOf(c) + 1,
          value: c.marketValue!.base,
          spendPerUnit: c.marketValue!.annualSpendPerUnit,
        })),
      },
      null,
      2,
    ),
  );
});
void test('money URL and Opportunity preserve scope; economic signal stays separate and null when unsupported', () => {
  const c = resolveContext(['archetypes', types[0].id], {
    spend: 'music',
    metric: 'marketValue',
    x: 'population',
    y: 'spendPerUnit',
  });
  const d = analyzeAtlas(c);
  assert.equal(c.moneyScope, 'music');
  assert.equal(d.profile.summary.marketValue?.scopeId, 'music');
  assert.ok(d.profile.summary.metrics.components.economicValue !== null);
  assert.ok(d.profile.summary.metrics.components.size !== null);
  const missing = addEconomicScore(summarize(['pet']), 'pet');
  assert.equal(missing.metrics.components.economicValue, null);
  assert.equal(
    missing.metrics.opportunity,
    summarize(['pet']).metrics.opportunity,
  );
  const zero = addEconomicScore(summarize(['age_20', 'age_70']), 'music');
  assert.equal(zero.metrics.opportunity, null);
});
void test('ten-market sanity reports supported scope separately from missing categories', () => {
  const ten = [
    'pet',
    'travel',
    'education',
    'beauty',
    'wellness',
    'food',
    'content',
    'finance',
    'home',
    'music',
  ];
  const rows = ten.map((id) => ({
    id,
    population: measure([id]).population,
    estimate: estimateMarketValue([id], id),
    archetypes: types.map((t) => ({
      id: t.id,
      population: measure([id, t.id]).population,
      estimate: estimateMarketValue([id, t.id], id),
    })),
  }));
  assert.equal(rows.filter((r) => r.estimate.base !== null).length, 1);
  assert.ok(rows.every((r) => r.population > 0));
  fs.writeFileSync(
    'work/market-value/industry-sanity.json',
    JSON.stringify(rows, null, 2),
  );
});
