import test from 'node:test';
import assert from 'node:assert/strict';
import audit from '../data/population-calibration-audit.json';
import cfg from '../config/behavior-calibration.json';
import controls from '../config/population-controls.json';
import { measure, measureObserved } from '../server/atlas/population';
import { source } from '../server/atlas/source';
import { summarize, getProfile } from '../server/atlas/engine';
const close = (a: number, b: number, tolerance = 0.02) =>
  assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
void test('model and lexical population are independently audited for all 52 types and 20 markets', () => {
  for (const row of audit.allEntities) {
    if (row.id === 'universe') continue;
    const actual = measure([row.id]),
      observed = measureObserved([row.id]);
    close(actual.population, row.population);
    close(observed.population, row.observedPopulation);
    assert.equal(actual.support, row.observedSupport);
    assert.equal(actual.modelMembers, row.modelMembers);
  }
  for (const row of audit.cases) {
    const actual = measure(row.ids);
    close(actual.population, row.population);
    close(actual.observedPopulation, row.observedPopulation);
    assert.equal(actual.support, row.observedSupport);
  }
});
void test('survey denominators: annual online shopping rate is conditional on monthly internet use', () => {
  for (const c of controls.controls.filter((v) => parseInt(v.age_band) < 70)) {
    const band = parseInt(c.age_band),
      ids = ['age_' + band, 'sex_' + c.sex];
    const rate = cfg.ageSexRates.find(
      (v) => v.ageBand === c.age_band && v.sex === c.sex,
    )!;
    close(
      measure([...ids, 'digital']).population,
      c.count * rate.internetRate,
      60,
    );
    close(
      measure([...ids, 'ecommerce']).population,
      c.count * rate.internetRate * rate.shoppingGivenInternet,
      100,
    );
    close(measure([...ids, 'planned_purchase']).population, c.count * 0.71, 60);
    close(measure([...ids, 'review']).population, c.count * 0.71 * 0.714, 100);
    close(
      measure([...ids, 'review', 'planned_purchase']).population,
      measure([...ids, 'review']).population,
    );
    close(
      measure([...ids, 'ecommerce', 'digital']).population,
      measure([...ids, 'ecommerce']).population,
    );
    const category = cfg.beautyParticipation.ageSexRates.find(
      (v) => v.ageBand === c.age_band && v.sex === c.sex,
    )!;
    const union =
      category.fashionSports +
      category.cosmetics -
      category.fashionSports * category.cosmetics;
    close(
      measure([...ids, 'beauty']).population,
      measure([...ids, 'ecommerce']).population * union,
      60,
    );
  }
});
void test('reported tiny cohorts are corrected without inventing observed support; nested conditions count only once', () => {
  const review = 'arc_planned_purchase_review',
    online = 'arc_ecommerce_planned_purchase';
  const a = summarize([review]),
    joint = summarize([review, online]);
  assert.ok(a.estimate.population > 10e6 && a.estimate.population < 30e6);
  assert.equal(a.estimate.support, 501);
  assert.equal(joint.estimate.support, 84);
  assert.ok(
    joint.estimate.population > 5e6 &&
      joint.estimate.population < a.estimate.population,
  );
  close(
    measure([review, online]).population,
    measure([review, online, 'planned_purchase']).population,
  );
  close(measure([review, review]).population, a.estimate.population);
  assert.ok(a.estimate.effectiveSampleSize <= a.estimate.support + 1);
  assert.ok(
    a.estimate.low < a.estimate.population &&
      a.estimate.high > a.estimate.population,
  );
  assert.equal(a.estimate.populationMethod, 'survey_calibrated_proxy');
  assert.deepEqual(
    a.estimate.calibrationSources!.map((s) => s.id),
    ['KCA-PURCHASE-2024'],
  );
  assert.deepEqual(
    joint.estimate.calibrationSources!.map((s) => s.id),
    ['NIA-INTERNET-2024', 'KCA-PURCHASE-2024'],
  );
});
void test('every type remains a subset of all its defining conditions and all profile shares stay within one', () => {
  for (const a of source.archetypes) {
    const current = measure([a.id]).population;
    for (const id of a.definition)
      assert.ok(current <= measure([id]).population + 0.01);
    const p = getProfile([a.id], false);
    assert.ok(
      [...p.signals, ...p.demographics, ...p.archetypes].every(
        (s) => s.share >= 0 && s.share <= 1.00000001,
      ),
    );
  }
});
