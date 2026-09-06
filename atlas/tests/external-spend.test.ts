import test from 'node:test';
import assert from 'node:assert/strict';
import external from '../config/external-spend.json';
import {
  estimateMarketValue,
  assertAdditive,
} from '../server/atlas/market-value';
import { types, markets } from '../server/atlas/source';
import { measure } from '../server/atlas/population';
const close = (a: number, b: number) =>
  assert.ok(
    Math.abs(a - b) <= Math.max(1, Math.abs(b) * 1e-10),
    `${a} != ${b}`,
  );

void test('official annual transcription, units and channel exclusions reconcile independently', () => {
  // Published annual food service row: 414,882 억원, not December 38,281 억원.
  close(estimateMarketValue([], 'delivery').base!, 41_488_200_000_000);
  close(estimateMarketValue([], 'pet').base!, 2_954_700_000_000);
  close(estimateMarketValue([], 'home').base!, 25_365_000_000_000);
  const included = external.components.reduce((s, c) => s + c.annual2025, 0);
  const excluded = external.excludedRows.reduce((s, c) => s + c.value2025, 0);
  // Official rounding of component rows allows several 100-million-won units.
  assert.ok(Math.abs(included + excluded - external.onlineTotal2025) <= 5e8);
  close(estimateMarketValue([], 'commerce').base!, included);
  close(
    estimateMarketValue([], 'covered').base!,
    included + estimateMarketValue([], 'music').base!,
  );
  const covered = estimateMarketValue([], 'covered');
  close(
    covered.componentBreakdown!.reduce((sum, row) => sum + row.annualValue, 0),
    covered.base!,
  );
});
void test('all new scopes preserve national pools across disjoint age partitions and never invent household buyers', () => {
  for (const scope of Object.keys(external.scopes)) {
    const whole = estimateMarketValue([], scope);
    close(estimateMarketValue([scope], scope).base!, whole.base!);
    const ages = [20, 30, 40, 50, 60, 70].map((age) =>
      estimateMarketValue(['age_' + age], scope),
    );
    close(
      ages.reduce((s, v) => s + v.base!, 0),
      whole.base!,
    );
    assert.equal(whole.denominatorBasis, 'adult_profile_allocation');
    assert.equal(whole.populationUnit, 'person');
    assert.equal(whole.participationRate, null);
    assert.equal(whole.coverage.directSpend, 0);
    assert.equal(whole.coverage.isPartial, true);
  }
});
void test('overlapping industries and types are rejected, distinct spend components add', () => {
  assert.throws(() =>
    assertAdditive([
      estimateMarketValue([], 'food'),
      estimateMarketValue([], 'delivery'),
    ]),
  );
  assert.throws(() =>
    assertAdditive([
      estimateMarketValue([], 'commerce'),
      estimateMarketValue([], 'pet'),
    ]),
  );
  assert.throws(() =>
    assertAdditive(
      types.slice(0, 2).map((t) => estimateMarketValue([t.id], 'home')),
    ),
  );
  close(
    assertAdditive([
      estimateMarketValue([], 'pet'),
      estimateMarketValue([], 'home'),
    ]),
    28_319_700_000_000,
  );
});
void test('all actual type and market estimates have ordered ranges, conserving shares and explicit units', () => {
  for (const market of markets.filter((m) => m.id in external.scopes)) {
    const total = estimateMarketValue([], market.id).base!;
    for (const type of types) {
      const value = estimateMarketValue([type.id], market.id);
      assert.ok(value.base! >= 0 && value.base! <= total + 1);
      assert.ok(value.low! <= value.base! && value.base! <= value.high!);
      assert.ok(
        value.relevantPopulation! <= measure([type.id]).population + 0.01,
      );
      if (value.relevantPopulation)
        close(
          value.annualSpendPerUnit! * value.relevantPopulation,
          value.base!,
        );
      const joint = estimateMarketValue([type.id, 'age_30_49'], market.id);
      assert.ok(joint.base! <= value.base! + 1);
    }
  }
});
