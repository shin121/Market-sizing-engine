import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import {
  summarize,
  measure,
  getProfile,
  radar,
  resolveContext,
  analyzeAtlas,
  getMatrix,
  searchAtlas,
  getSanitySummary,
} from '../server/atlas/engine';
import {
  source,
  observedSource,
  populationCalibration,
  cubes,
  types,
  features,
} from '../server/atlas/source';
import { statistics, measureObserved } from '../server/atlas/population';
import { deriveMetrics } from '../server/atlas/metrics';
import oracle from '../data/atlas-oracle.json';
const close = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) < 0.02, `${a} ≠ ${b}`);
void test('independent SQL oracle: weighted joints, all memberships, calibration and zeros', () => {
  for (const row of oracle.cases) {
    const actual = measureObserved(row.ids);
    assert.equal(actual.support, row.support);
    close(actual.population, row.population);
    close(actual.weightSquareSum, row.weightSquareSum);
    const st = statistics(row.ids);
    if (!row.ids.some((id) => populationCalibration.changedIds.includes(id)))
      close(st.population, row.population);
    assert.equal(st.support, row.support);
  }
});
void test('commercial bundles pass discovery, holdout, unique naming and overlap gates', () => {
  const sanity = getSanitySummary();
  assert.ok(sanity.types >= 30 && sanity.types <= 80);
  assert.equal(new Set(types.map((t) => t.label)).size, types.length);
  close(sanity.population, 44105000);
  assert.ok(sanity.overlap.multipleMembershipShare > 0.1);
  assert.ok(sanity.overlap.coverageShare < 1);
  assert.ok(sanity.minimumNonDefiningIndexes >= 5);
  for (const a of sanity.archetypes) {
    assert.ok(a.associationLift >= 1.08);
    assert.ok(a.holdoutLift >= 1.04);
    assert.ok(
      a.definition.every((id) =>
        ['behavior', 'need', 'channel'].includes(
          features.find((f) => f.id === id)!.kind,
        ),
      ),
    );
  }
});
void test('artifact fingerprint prevents stale cube reuse', () => {
  const digest = createHash('sha256')
    .update(fs.readFileSync('server/data/atlas-index.json'))
    .digest('hex');
  assert.equal(observedSource.dataFingerprint, digest);
  assert.notEqual(source.dataFingerprint, digest);
  assert.equal(
    source.dataFingerprint,
    createHash('sha256')
      .update(fs.readFileSync('server/data/atlas-calibrated-index.json'))
      .digest('hex'),
  );
  assert.equal(cubes.indexDigest, source.dataFingerprint);
  assert.deepEqual(
    cubes.featureKeys,
    features.map((f) => f.id),
  );
});
void test('central metric parity with calibrated offline rates and independent defining-signal exclusion', () => {
  for (const a of source.archetypes) {
    const m = summarize([a.id]).metrics;
    const modeled = deriveMetrics(
      [a.id],
      a.populationEstimate,
      a.support,
      a.signalRates,
    );
    close(m.distinctiveness, modeled.distinctiveness);
    assert.equal(m.consumptionIntensity, modeled.consumptionIntensity);
    assert.equal(m.crossIndustryBreadth, modeled.crossIndustryBreadth);
    assert.equal(m.smallStrongScore, modeled.smallStrongScore);
    const rates = features.map((f) => f.share);
    for (const id of a.definition)
      rates[features.findIndex((f) => f.id === id)] = 1;
    const artificial = deriveMetrics(
      [a.id],
      a.populationEstimate,
      a.support,
      rates,
    );
    assert.ok(artificial.distinctiveness < 1e-10);
  }
});
void test('signal indexes use universe and parent deltas use exact parent', () => {
  const arc = source.archetypes.find((a) =>
    a.definition.includes('collecting'),
  )!;
  const p = getProfile([arc.id, 'pet', 'age_30_49']);
  assert.equal(p.differences.length, 2);
  for (const s of p.signals) {
    if (s.baseShare) close(s.index!, s.share / s.baseShare);
  }
  assert.ok(
    p.signals.filter(
      (s) => !s.defining && s.index !== null && Math.abs(s.index - 1) > 0.15,
    ).length >= 5,
  );
  for (const d of p.differences)
    for (const s of d.signals) close(s.delta, s.share - s.parentShare);
});
void test('missing metrics excluded; empty population cannot become an opportunity', () => {
  const m = summarize(['pet']).metrics;
  assert.equal(m.components.momentum, null);
  assert.equal(m.components.competition, null);
  assert.equal(m.completeness, 90);
  const zero = summarize(['age_20', 'age_70']);
  assert.equal(zero.metrics.opportunity, null);
  assert.equal(zero.metrics.completeness, 0);
});
void test('URL context, canonical routes, history and invalid public inputs', () => {
  const arc = types[0].id;
  for (const view of ['relationship', 'matrix', 'opportunity']) {
    const c = resolveContext([view], {
      q: `${arc}~pet~pet`,
      trail: `${arc}|travel`,
    });
    assert.deepEqual(c.ids, [arc, 'pet'].sort());
    assert.deepEqual(c.trail, [arc, 'travel']);
  }
  assert.throws(() => resolveContext(['archetypes', 'pet'], {}));
  assert.throws(() => resolveContext([], { q: 'fake_income' }));
  assert.throws(() =>
    resolveContext([], {
      q: features
        .slice(0, 9)
        .map((f) => f.id)
        .join('~'),
    }),
  );
});
void test('five radar groups have real distinct rankings and three candidates', () => {
  const r = radar([]);
  assert.equal(r.length, 5);
  for (const group of r) assert.equal(group.items.length, 3);
  assert.notDeepEqual(
    r[0].items.map((s) => s.ids),
    r[1].items.map((s) => s.ids),
  );
});
for (const market of [
  'pet',
  'travel',
  'education',
  'beauty',
  'wellness',
  'food',
  'content',
  'finance',
  'home',
  'collect',
])
  void test(`discovery engine: ${market}`, () => {
    const p = getProfile([market]);
    assert.ok(p.archetypes.filter((s) => s.support >= 100).length >= 3);
    assert.ok(p.painPatterns.length >= 1);
    assert.ok(p.relatedOpportunities.length >= 3);
    const m = getMatrix(
      resolveContext(['matrix'], { q: market, row: 'archetype', col: 'need' }),
    );
    assert.ok(
      m.cells.some(
        (c) => c.index !== null && c.index > 1.15 && c.support >= 30,
      ),
    );
    const selected = m.highlights[0].cell;
    assert.ok(selected.ids.includes(market));
    close(measure(selected.ids).population, selected.population);
  });
void test('search reaches types, markets, signals and generated segments', () => {
  for (const q of [
    '가격',
    '수집',
    '전문가',
    '구독',
    '반려동물',
    '육아',
    '여행',
  ])
    assert.ok(searchAtlas(q).length > 0, q);
  assert.ok(searchAtlas('수집 반려동물').some((e) => e.kind === 'segment'));
});
void test('public payload excludes raw records, UUIDs, narratives and posting bytes', () => {
  const out = JSON.stringify(
    analyzeAtlas(resolveContext(['markets', 'pet'], {})),
  );
  assert.ok(out.length < 500000);
  for (const token of [
    'sports_persona',
    'uuid',
    'wordRanges',
    'base64',
    'signalRates',
    'pattern',
    'f_pet',
  ])
    assert.ok(!out.includes('"' + token + '"'));
});
void test('maximum public context remains analyzable and cannot promote an invalid ninth condition', () => {
  const ids = [
    'arc_delivery_order_digital',
    'food',
    'travel',
    'wellness',
    'content',
    'age_40',
    'sex_female',
    'recovery',
  ];
  const context = resolveContext(['segments', ids.join('~')], {});
  const data = analyzeAtlas(context);
  assert.equal(data.conditions.length, 8);
  assert.ok(data.profile.summary.estimate.population > 0);
  const matrix = getMatrix({
    ...context,
    view: 'matrix',
    row: 'need',
    column: 'channel',
  });
  assert.equal(matrix.highlights.length, 0);
  assert.equal(summarize([]).entity.id, 'universe');
});

void test('matrix does not promote a type defining signal as an independent discovery', () => {
  const matrix = getMatrix(
    resolveContext(['matrix'], { q: 'finance', row: 'archetype', col: 'need' }),
  );
  assert.ok(matrix.cells.some((c) => c.defining));
  assert.ok(matrix.highlights.every((h) => !h.cell.defining));
  assert.ok(matrix.highlights.some((h) => (h.cell.index ?? 0) > 1.1));
});
