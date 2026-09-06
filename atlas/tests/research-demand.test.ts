import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { estimateResearchDemand } from '../server/atlas/research-demand';
import {
  adultResearchFrame,
  demandFactors,
  demandSources,
  householdResearchFrame,
  researchEstimate,
  researchUnion,
} from '../server/atlas/research-registry';
import { leisureObservations } from '../server/atlas/leisure-research';
import type { DemandEstimate } from '../lib/demand';

function estimate(ids: string[]) {
  const result = researchEstimate(ids);
  assert.equal(result.status, 'estimated', JSON.stringify(result));
  return result as DemandEstimate;
}
void test('external cosmetics shoppers use survey denominators, not 45,697 narrative matches', () => {
  const result = estimate(['cosmetics_online_buyers']);
  assert.ok(result.base > 10_000_000 && result.base < 25_000_000);
  assert.deepEqual(result.factorIds, [
    'commerce',
    'cosmetics_online_buyers',
    'digital',
  ]);
  assert.ok(result.sourceIds.includes('CENSUS-2024'));
  assert.ok(
    result.definitions.some((d) => d.includes('전체 화장품 사용자는 아님')),
  );
});
void test('parent, repeated and reordered factors count the same condition once', () => {
  assert.deepEqual(
    estimate(['cosmetics_online_buyers']),
    estimate(['digital', 'cosmetics_online_buyers', 'commerce', 'commerce']),
  );
  const child = estimate(['need_fitness_weight', 'int_fitness_gym']);
  const parent = estimate(['fitness']);
  assert.ok(child.base < parent.base);
  assert.deepEqual(
    child,
    estimate(['fitness', 'int_fitness_gym', 'need_fitness_weight']),
  );
});
void test('registered survey models reconcile their cells and maintain nested ranges', () => {
  for (const f of demandFactors) {
    const result = researchEstimate([f.id], f.unit);
    const observation = leisureObservations.find(
      (o) => f.id === 'leisure_' + o.code,
    );
    if (
      observation &&
      Object.values(observation.ageRates).some((v) => v === null)
    ) {
      assert.equal(result.status, 'not_estimable', f.id);
      continue;
    }
    assert.equal(
      result.status,
      'estimated',
      f.id + ': ' + JSON.stringify(result),
    );
    if (result.status !== 'estimated') continue;
    assert.ok(result.low <= result.base && result.base <= result.high, f.id);
    assert.equal(
      result.base,
      result.cells.reduce((n, c) => n + c.base, 0),
    );
    for (const p of f.prerequisites) {
      const parent = researchEstimate([p], f.unit);
      if (parent.status === 'estimated')
        for (const level of ['low', 'base', 'high'] as const)
          assert.ok(result[level] <= parent[level], f.id + '/' + level);
    }
  }
});
void test('external activity cells preserve published age marginals; skin activity is distinct from cosmetics use', () => {
  for (const code of ['F67', 'F70', 'B14', 'F49', 'G77', 'E39']) {
    const result = estimate(['leisure_' + code]);
    const observation = leisureObservations.find((o) => o.code === code)!;
    for (const [label, rate] of Object.entries(observation.ageRates)) {
      const min = Number(label.slice(0, 2)),
        max = min === 70 ? 120 : min + 9;
      const cells = result.cells.filter(
        (c) => c.ageMin! >= min && c.ageMin! <= max,
      );
      assert.ok(
        Math.abs(
          cells.reduce((n, c) => n + c.base, 0) -
            cells.reduce((n, c) => n + c.population, 0) * rate!,
        ) < 0.001,
      );
    }
  }
  const skin = estimate(['leisure_F67']);
  assert.ok(skin.base > 15_000_000 && skin.base < 20_000_000);
  assert.ok(skin.definitions[0].includes('화장품 전체 사용자 수가 아님'));
});
void test('OR deduplicates parent/child cohorts and bounds overlapping market baskets', () => {
  assert.deepEqual(
    researchUnion([['commerce'], ['cosmetics_online_buyers']]),
    estimate(['commerce']),
  );
  const u = researchUnion([['leisure_F67'], ['cosmetics_online_buyers']]);
  assert.equal(u.status, 'estimated');
  if (u.status !== 'estimated') return;
  const a = estimate(['leisure_F67']),
    b = estimate(['cosmetics_online_buyers']),
    ab = estimate(['leisure_F67', 'cosmetics_online_buyers']);
  assert.ok(Math.abs(u.base - (a.base + b.base - ab.base)) < 0.001);
  assert.ok(u.low <= u.base && u.base <= u.high);
  assert.ok(u.base >= Math.max(a.base, b.base));
  assert.deepEqual(
    u,
    researchUnion([
      ['leisure_F67'],
      ['cosmetics_online_buyers'],
      ['leisure_F67'],
    ]),
  );
});
void test('population depends on official frame and rates, with no synthetic dependency', () => {
  const engine = readFileSync('server/atlas/research-demand.ts', 'utf8');
  const imports = engine.match(/^import[^;]+;/gm)?.join('\n') ?? '';
  assert.doesNotMatch(
    imports,
    /population|catalog|source|bitmap|calibrated-index/,
  );
  const base = estimate(['fitness']);
  const scaled = estimateResearchDemand(
    ['fitness'],
    adultResearchFrame.map((c) => ({ ...c, population: c.population * 2 })),
    demandFactors,
    demandSources,
  );
  assert.equal(scaled.status, 'estimated');
  if (scaled.status === 'estimated') assert.equal(scaled.base, base.base * 2);
});
void test('household ownership is not multiplied into a person frame', () => {
  const households = researchEstimate(['pet_household'], 'household');
  assert.equal(households.status, 'estimated');
  if (households.status === 'estimated')
    assert.equal(households.base, householdResearchFrame[0].population * 0.292);
  const wrong = researchEstimate(['pet_household']);
  assert.equal(wrong.status, 'not_estimable');
  if (wrong.status === 'not_estimable')
    assert.equal(wrong.reason, 'unit_mismatch');
  assert.equal(
    estimateResearchDemand(
      ['fitness'],
      householdResearchFrame,
      demandFactors,
      demandSources,
    ).status,
    'not_estimable',
  );
});
void test('unsupported conditions and unobserved rates never fall back to narrative counts', () => {
  assert.equal(researchEstimate(['int_beauty_skin']).status, 'not_estimable');
  const incomplete = demandFactors.map((f) =>
    f.id === 'fitness' ? { ...f, rates: f.rates.slice(1) } : f,
  );
  const out = estimateResearchDemand(
    ['fitness'],
    adultResearchFrame,
    incomplete,
    demandSources,
  );
  assert.equal(out.status, 'not_estimable');
  if (out.status === 'not_estimable') assert.equal(out.reason, 'missing_rate');
});
void test('education age boundary is applied to population, not to synthetic age frequencies', () => {
  const result = estimate(['education']);
  const population25to79 = adultResearchFrame.reduce(
    (n, c) =>
      n +
      (c.ageMin === 20
        ? c.population * 0.5
        : c.ageMin! < 80
          ? c.population
          : 0),
    0,
  );
  assert.ok(Math.abs(result.base - population25to79 * 0.337) < 0.001);
  assert.ok(result.assumptions.some((s) => s.includes('균등')));
});
void test('cycles, invalid probabilities and ambiguous rate cells reject invalid models', () => {
  for (const change of [
    { prerequisites: ['fitness'] },
    { rates: [{ low: 0.8, base: 0.2, high: 1 }] },
    {
      rates: [
        { low: 0.2, base: 0.3, high: 0.4 },
        { low: 0.2, base: 0.3, high: 0.4 },
      ],
    },
    { sourceIds: ['missing-source'] },
  ]) {
    const out = estimateResearchDemand(
      ['fitness'],
      adultResearchFrame,
      demandFactors.map((f) => (f.id === 'fitness' ? { ...f, ...change } : f)),
      demandSources,
    );
    assert.equal(out.status, 'not_estimable');
  }
});

void test('gaming external demographic calibration preserves the overall level and creates a younger participation profile', () => {
  const gaming = estimate(['gaming']);
  const frame = adultResearchFrame
    .filter((c) => c.ageMin! < 70)
    .reduce((n, c) => n + c.population, 0);
  assert.ok(Math.abs(gaming.base / frame - 0.502) < 1e-10);
  const share = (age: number) => {
    const cells = gaming.cells.filter((c) => c.ageMin === age);
    return (
      cells.reduce((n, c) => n + c.base, 0) /
      cells.reduce((n, c) => n + c.population, 0)
    );
  };
  assert.ok(
    share(20) > share(60),
    'Observed leisure pattern must affect composition, not just repeat population',
  );
  assert.ok(gaming.assumptions.some((a) => a.includes('문항')));
});
void test('public family counts and conditional mobile banking remain independent of synthetic cases', () => {
  for (const [id, target] of [
    ['family_children', 4517000],
    ['family_preschool', 1284000],
    ['family_elder', 7137000],
    ['family_elder_alone', 2289000],
  ] as const) {
    const e = researchEstimate([id], 'household');
    assert.equal(e.status, 'estimated');
    if (e.status === 'estimated') assert.ok(Math.abs(e.base - target) < 0.01);
  }
  const bank = estimate(['finance_banking']),
    mobile = estimate(['finance_mobile']);
  assert.ok(
    mobile.base < bank.base && mobile.base > bank.base * 0.99,
    'Mobile is nearly all digital banking, not an independent 80% reduction',
  );
});

void test('correlated category unions expose an overlap envelope rather than assuming nearly universal participation',()=>{
 const ids=[['food_delivery_household'],['hmr_heat'],['hmr_ready'],['hmr_kit']];
 const result=researchUnion(ids,'household','overlap_bounds');
 assert.equal(result.status,'estimated');if(result.status!=='estimated')return;
 const max=Math.max(...ids.map(g=>{const e=researchEstimate(g,'household');return e.status==='estimated'?e.base:0;}));
 assert.ok(Math.abs(result.base-(max+householdResearchFrame[0].population)/2)<0.01);
 assert.ok(result.base>max && result.base<householdResearchFrame[0].population);
 assert.ok(result.assumptions.some(a=>a.includes('중간값')));
 assert.equal(result.unionGroups?.length,4);
});
