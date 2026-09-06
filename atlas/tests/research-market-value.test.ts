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
void test('music payment anchor separates listeners from paid spend participants', () => {
  const music = getResearchExplorer('music')!;
  const listen = music.branches.find((branch) => branch.id === 'listen')!;
  assert.equal(listen.profile.marketValue.status, 'estimated');
  assert.equal(listen.profile.estimate.status, 'estimated');
  if (listen.profile.estimate.status !== 'estimated') return;
  assert.ok(listen.profile.marketValue.annualValue! > 500_000_000_000);
  assert.ok(
    listen.profile.marketValue.relevantPopulation! <
      listen.profile.estimate.base,
    'listening population must not be presented as all paid participants',
  );
  assert.ok(
    listen.profile.marketValue.annualSpendPerUnit! > 70_000 &&
      listen.profile.marketValue.annualSpendPerUnit! < 130_000,
  );
  assert.ok(
    listen.profile.marketValue.spendDensityIndex! > 0.8 &&
      listen.profile.marketValue.spendDensityIndex! < 1.2,
    'the full listening cohort should normalize near the national paid-listening density',
  );
  const review = listen.children.find((child) => child.id === 'listen~review')!;
  assert.equal(review.marketValue.annualValue, null);
  const playing = music.branches.find((branch) => branch.id === 'play')!;
  assert.equal(playing.profile.marketValue.annualValue, null);
});

void test('KOCCA paid-content anchor prices only paid cohorts and keeps WTP out of spend', () => {
  const content = getResearchExplorer('content')!;
  const paid = content.branches.find((branch) => branch.id === 'paid')!;
  const price = content.branches.find((branch) => branch.id === 'price')!;
  const short = content.branches.find((branch) => branch.id === 'short')!;
  assert.equal(paid.profile.marketValue.status, 'estimated');
  assert.equal(paid.profile.marketValue.scopeId, 'paid-content-2025');
  assert.equal(paid.profile.marketValue.annualSpendPerUnit, 10909 * 12);
  assert.ok(
    paid.profile.marketValue.low! < paid.profile.marketValue.base! &&
      paid.profile.marketValue.base! < paid.profile.marketValue.high!,
  );
  assert.equal(
    paid.profile.marketValue.spendPerUnitRange?.high,
    13636 * 12,
    'the sensitivity high is ±25%, not the published maximum willingness to pay',
  );
  assert.ok(
    paid.profile.marketValue.sourceBasis.some(
      (source) => source.id === 'KOCCA-CONTENT-2025',
    ),
  );
  assert.equal(price.profile.marketValue.status, 'estimated');
  assert.equal(short.profile.marketValue.annualValue, null);
  const review = paid.children.find((child) => child.id === 'paid~review')!;
  const online = paid.children.find((child) => child.id === 'paid~online')!;
  assert.equal(review.marketValue.annualValue, null);
  assert.equal(online.marketValue.annualValue, null);
});

void test('generic lower discovery paths do not inherit a parent market spend pool', () => {
  const travel = getResearchExplorer('travel')!;
  const nature = travel.branches.find((b) => b.id === 'nature')!;
  const gear = nature.children.find((c) => c.id === 'nature~gear')!;
  assert.equal(nature.profile.marketValue.status, 'estimated');
  assert.equal(gear.marketValue.annualValue, null);
  assert.equal(gear.marketValue.status, 'missing_calibration_anchor');

  const mobility = getResearchExplorer('mobility')!;
  const drive = mobility.branches.find((b) => b.id === 'drive')!;
  const online = drive.children.find((c) => c.id === 'drive~online')!;
  assert.equal(drive.profile.marketValue.status, 'estimated');
  assert.equal(online.marketValue.annualValue, null);

  const education = getResearchExplorer('education')!;
  const career = education.branches.find((b) => b.id === 'career')!;
  const careerOnline = career.children.find((c) => c.id === 'career~online')!;
  assert.equal(careerOnline.marketValue.annualValue, null);
});
