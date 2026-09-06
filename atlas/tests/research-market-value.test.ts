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

void test('reviewed online category baselines connect only matching research cohorts', () => {
  const beauty = getResearchExplorer('beauty')!;
  const skin = beauty.branches.find((b) => b.id === 'skin')!.profile;
  const cosmetics = beauty.branches.find((b) => b.id === 'cosmetics')!.profile;
  assert.equal(skin.marketValue.annualValue, null);
  assert.equal(skin.marketValue.status, 'missing_calibration_anchor');
  assert.equal(cosmetics.marketValue.status, 'estimated');
  assert.ok(
    Math.abs(cosmetics.marketValue.annualValue! - 13_815_300_000_000) < 1,
    'the online cosmetics buyer cohort is the published category denominator',
  );
  assert.ok(cosmetics.marketValue.annualSpendPerUnit! > 900_000);
  assert.equal(
    cosmetics.marketValue.low,
    cosmetics.marketValue.base,
    'published national category total is fixed for the full buyer cohort',
  );
  assert.equal(cosmetics.marketValue.high, cosmetics.marketValue.base);
  assert.equal(cosmetics.marketValue.populationUnit, 'person');
  assert.ok(cosmetics.marketValue.sourceBasis.some((s) => s.id === 'NDO-ONLINE-2025'));

  const pet = getResearchExplorer('pet')!.root.marketValue;
  assert.equal(pet.status, 'estimated');
  assert.equal(pet.populationUnit, 'household');
  assert.ok(pet.annualValue! > 2_000_000_000_000);
  assert.equal(pet.scopeLabel, '온라인 반려용품 거래액 · 2025');
});
