import test from 'node:test';
import assert from 'node:assert/strict';
import {
  measure,
  summarize,
  resolveContext,
  analyzeAtlas,
  opportunities,
} from '../server/atlas/engine';
import { estimateMarketValue } from '../server/atlas/market-value';
import { registry } from '../server/atlas/source';
import {
  orderedConditions,
  parseWorkspace,
  makeCandidate,
  candidateKey,
  safeSourceUrl,
  AGE_UNIONS,
} from '../lib/discovery';

void test('market-first hierarchy is presentation only; intersections remain invariant', () => {
  const ids = [
    'arc_gear_upgrade_review',
    'travel',
    'int_travel_nature',
    'age_40',
  ];
  assert.deepEqual(
    orderedConditions(ids.map((id) => registry.get(id)!)).map((e) => e.id),
    ['travel', 'int_travel_nature', 'age_40', 'arc_gear_upgrade_review'],
  );
  const s = summarize(ids);
  assert.match(s.entity.label, /^여행/);
  assert.equal(measure(ids).population, measure([...ids].reverse()).population);
  assert.equal(resolveContext([], {}).lens, 'markets');
  assert.equal(resolveContext(['matrix'], { q: 'travel' }).row, 'age');
});
void test('age OR groups count each adult once and preserve spend additivity', () => {
  for (const [id, ages] of Object.entries(AGE_UNIONS)) {
    for (const scope of ['travel', 'content']) {
      const value = measure([id, scope]);
      const parts = ages.map((age) => measure([age, scope]));
      assert.ok(
        Math.abs(
          value.population - parts.reduce((sum, p) => sum + p.population, 0),
        ) < 0.02,
      );
      assert.equal(
        value.support,
        parts.reduce((sum, p) => sum + p.support, 0),
      );
    }
    const pool = estimateMarketValue([id, 'travel'], 'travel').base!;
    const parts = ages.reduce(
      (sum, age) => sum + estimateMarketValue([age, 'travel'], 'travel').base!,
      0,
    );
    assert.ok(Math.abs(pool - parts) < 1);
  }
});
void test('matrix market columns use their own anchors; unavailable is not another category spend', () => {
  const data = analyzeAtlas(
    resolveContext(['matrix'], {
      q: 'arc_gear_upgrade_review',
      row: 'age',
      col: 'market',
      focus: 'content',
      spend: 'covered',
      metric: 'marketValue',
    }),
  );
  for (const cell of data.matrix!.cells) {
    assert.equal(cell.marketValue?.scopeId, cell.column.id);
    if (cell.column.id === 'content')
      assert.equal(cell.marketValue?.base, null);
  }
});
void test('opportunity progression suggests interests before mechanisms and omits redundant intersections', () => {
  const candidates = opportunities(['travel']);
  assert.ok(candidates.length > 1);
  assert.ok(
    candidates
      .slice(1)
      .every((s) => s.ids.some((id) => registry.get(id)?.kind === 'interest')),
  );
  const current = measure(['int_travel_nature', 'arc_gear_upgrade_review']);
  for (const s of opportunities([
    'int_travel_nature',
    'arc_gear_upgrade_review',
  ]).slice(1)) {
    assert.ok(
      s.estimate.support !== current.support ||
        Math.abs(s.estimate.population - current.population) > 0.01,
    );
  }
});
void test('workspace persistence keeps scope-specific candidates and rejects corrupt entries', () => {
  const a = makeCandidate(['travel', 'age_40'], 'travel', '자연·휴양'),
    b = makeCandidate(['age_40', 'travel'], 'fitness', '장비 소비');
  assert.notEqual(a.key, b.key);
  assert.equal(a.key, candidateKey(['age_40', 'travel'], 'travel'));
  const decoded = parseWorkspace(
    JSON.stringify({
      version: 1,
      candidates: [a, b],
      compare: [a.key, b.key, a.key, 'fake'],
    }),
  );
  assert.deepEqual(decoded.compare, [a.key, b.key]);
  assert.equal(decoded.candidates[1].scope, 'fitness');
  assert.equal(parseWorkspace('{').candidates.length, 0);
  assert.equal(
    parseWorkspace(
      JSON.stringify({
        version: 1,
        candidates: [{ ...a, ids: ['bad|query'] }],
        compare: [],
      }),
    ).candidates.length,
    0,
  );
  assert.equal(safeSourceUrl('javascript:alert(1)'), null);
  assert.equal(safeSourceUrl('https://example.com/'), 'https://example.com/');
});
