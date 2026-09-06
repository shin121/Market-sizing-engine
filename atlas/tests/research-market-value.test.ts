import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getResearchExplorer } from '../server/atlas/research-explorer';
import {
  researchEstimate,
  researchUnion,
} from '../server/atlas/research-registry';
import { researchMarketValue } from '../server/atlas/research-market-value';

void test('external spend respects participant scope, annualizes the observed monthly amount and excludes unrelated HMR households', () => {
  const e = researchEstimate(['food_delivery_household'], 'household');
  assert.equal(e.status, 'estimated');
  if (e.status !== 'estimated') return;
  const value = researchMarketValue(e);
  assert.equal(value.status, 'estimated');
  assert.equal(value.populationUnit, 'household');
  assert.equal(value.categoryPopulationUnit, 'household');
  assert.ok(Math.abs(value.annualValue! - e.base * 92759.76 * 12) < 0.01);
  assert.ok(value.low! < value.base! && value.base! < value.high!);
  const mixed = researchUnion(
    [['food_delivery_household'], ['hmr_kit']],
    'household',
  );
  assert.equal(
    researchMarketValue(mixed).annualValue,
    null,
    'A delivery spending anchor cannot price an OR including HMR-only households',
  );
  const pet = researchMarketValue(
    researchEstimate(['pet_household'], 'household'),
  );
  assert.equal(
    pet.annualValue,
    null,
    'Per-animal monthly cost cannot be multiplied by households',
  );
});
void test('age-specific dining spending changes economic density and reconciles filtered totals', () => {
  const all = getResearchExplorer('food')!.root.marketValue;
  const slices = [20, 30, 40, 50, 60, 70].map(
    (a) => getResearchExplorer('food', String(a))!.root.marketValue,
  );
  assert.equal(all.status, 'estimated');
  assert.ok(
    Math.abs(
      slices.reduce((n, s) => n + s.annualValue!, 0) - all.annualValue!,
    ) < 0.1,
  );
  assert.ok(
    slices[1].annualSpendPerUnit! > slices[4].annualSpendPerUnit! * 1.4,
  );
  assert.ok(Math.abs(slices[1].annualSpendPerUnit! - 166865.59 * 12) < 0.01);
  const outside = getResearchExplorer('gaming', '70')!.branches[0].profile;
  assert.equal(outside.estimate.status, 'not_estimable');
  if (outside.estimate.status === 'not_estimable')
    assert.equal(outside.estimate.reason, 'outside_scope');
  assert.deepEqual(outside.regions, []);
  assert.deepEqual(outside.sexes, []);
  assert.deepEqual(outside.ages, []);
  assert.equal(outside.marketValue.annualValue, null);
});
