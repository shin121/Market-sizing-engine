import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getResearchExplorer } from '../server/atlas/research-explorer';
import { researchHref } from '../lib/research-explorer';
import {
  legacyResearchTargets,
  researchCatalog,
  researchWorkspace,
  resolveResearchContext,
} from '../server/atlas/research-workspace';
import { candidateKey, researchWorkspaceHref } from '../lib/research-workspace';

void test('old beauty URL resolves to the corrected care definition and preserves age', () => {
  const result = resolveResearchContext(['signals', 'int_beauty_skin'], {
    q: 'beauty~age_30',
  });
  assert.deepEqual(result.unresolved, []);
  assert.equal(result.context.market, 'beauty');
  assert.equal(result.context.node, 'skin');
  assert.equal(result.context.age, '30');
  const selected = researchWorkspace(result.context).selected!;
  const profile = getResearchExplorer('beauty', '30')!.branches.find(
    (b) => b.id === 'skin',
  )!.profile;
  assert.equal(
    selected.population,
    profile.estimate.status === 'estimated' ? profile.estimate.base : null,
  );
  assert.equal(
    selected.marketValue.annualValue,
    null,
    'care never inherits online clothing spending',
  );
});

void test('unsupported old conditions and intersections are never silently dropped', () => {
  const r = resolveResearchContext(
    ['segments', 'beauty~int_beauty_skin~premium'],
    {},
  );
  assert.deepEqual(r.unresolved, ['품질·프리미엄 선택']);
  assert.ok(
    resolveResearchContext(['matrix'], { q: 'beauty~pet' }).unresolved.length,
  );
  assert.ok(resolveResearchContext([], { node: 'skin' }).unresolved.length);
  assert.ok(
    resolveResearchContext(['markets', 'beauty'], { node: 'missing' })
      .unresolved.length,
  );
  assert.ok(
    resolveResearchContext(['compare'], { compare: 'beauty~premium' })
      .unresolved.length,
  );
  assert.ok(
    resolveResearchContext(['matrix'], { age: '18' }).unresolved.length,
  );
});

void test('every legacy alias points to a real distinct profile and root keys cannot collide with branches', () => {
  for (const [legacy, [market, node]] of Object.entries(
    legacyResearchTargets,
  )) {
    const r = resolveResearchContext(['signals', legacy], {});
    assert.deepEqual(r.unresolved, [], legacy + ' → ' + market + ':' + node);
  }
  const rows = researchCatalog('');
  assert.equal(new Set(rows.map((c) => c.key)).size, rows.length);
  const delivery = rows.filter((c) => c.market === 'delivery');
  const root = delivery.find((c) => c.node === '_root')!;
  const meals = delivery.find((c) => c.node === 'delivery')!;
  assert.ok(root.population! > meals.population!);
  assert.equal(root.marketValue.annualValue, null);
  assert.ok(meals.marketValue.annualValue! > 0);
});

void test('matrix money cells use the same external profile, reconcile by age and differ from population ranking', () => {
  const ctx = resolveResearchContext(['matrix'], {
    market: 'food',
    metric: 'marketValue',
  }).context;
  const data = researchWorkspace(ctx),
    matrix = data.matrix!;
  for (let col = 0; col < matrix.columns.length; col++) {
    const parent = matrix.columns[col];
    const cells = matrix.cells.map((row) => row[col]);
    assert.ok(
      Math.abs(
        cells.reduce((n, p) => n + p.population!, 0) - parent.population!,
      ) < 0.01,
    );
    assert.ok(
      Math.abs(
        cells.reduce((n, p) => n + p.marketValue.annualValue!, 0) -
          parent.marketValue.annualValue!,
      ) < 0.1,
    );
    for (const cell of cells) {
      const p = getResearchExplorer('food', cell.age)!.branches.find(
        (b) => b.id === cell.node,
      )!.profile;
      assert.equal(cell.marketValue.annualValue, p.marketValue.annualValue);
    }
  }
  const known = matrix.cells.flat();
  const byPopulation = [...known]
    .sort((a, b) => b.population! - a.population!)
    .map((c) => c.key);
  const byMoney = [...known]
    .sort((a, b) => b.marketValue.annualValue! - a.marketValue.annualValue!)
    .map((c) => c.key);
  assert.notDeepEqual(
    byPopulation,
    byMoney,
    'age-specific spend must change at least one meaningful cell order',
  );
});

void test('household analysis does not expose person-age matrix or change keys with a person filter', () => {
  const ctx = resolveResearchContext(['matrix'], {
    market: 'delivery',
  }).context;
  assert.equal(researchWorkspace(ctx).matrix, null);
  assert.ok(
    resolveResearchContext(['matrix'], { market: 'delivery', age: '30' })
      .unresolved.length,
  );
  assert.ok(
    resolveResearchContext(['compare'], { compare: 'delivery:delivery:30' })
      .unresolved.length,
  );
  assert.deepEqual(
    researchCatalog('30')
      .filter((c) => c.unit === 'household')
      .map((c) => c.key),
    researchCatalog('')
      .filter((c) => c.unit === 'household')
      .map((c) => c.key),
  );
});

void test('comparison URL round-trips market, lower subtype and age and uses one model', () => {
  const keys = [
    candidateKey('food', 'taste~weekly', '30'),
    candidateKey('beauty', 'skin', '30'),
    candidateKey('delivery', 'delivery~app'),
  ];
  const url = new URL(
    researchWorkspaceHref('compare', { compare: keys }),
    'http://localhost',
  );
  const result = resolveResearchContext(
    ['compare'],
    Object.fromEntries(url.searchParams),
  );
  assert.deepEqual(result.context.compare, keys);
  const drill = new URL(
    researchHref('food', 'taste~weekly', '30', keys, 'marketValue'),
    'http://localhost',
  );
  assert.equal(drill.searchParams.get('metric'), 'marketValue');
  assert.equal(drill.searchParams.get('compare'), keys.join('|'));
  assert.equal(drill.searchParams.get('age'), '30');
  const p = researchWorkspace(result.context);
  assert.deepEqual(
    p.comparison.map((c) => c.key),
    keys,
  );
  assert.equal(p.comparison[0].marketValue.populationUnit, 'person');
  assert.equal(p.comparison[2].marketValue.populationUnit, 'household');
  assert.equal(p.comparison[1].opportunity.economicValue, null);
  assert.ok(p.comparison.every((c) => c.opportunity.completeness < 0.3));
});
