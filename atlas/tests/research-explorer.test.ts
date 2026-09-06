import { test } from 'node:test';
import assert from 'node:assert/strict';
import { researchMarkets } from '../config/research/market-journeys';
import {
  getResearchExplorer,
  researchAgeSlice,
} from '../server/atlas/research-explorer';
import type { ResearchProfile } from '../lib/research-explorer';

void test('every configured research journey has coherent external roots, children, demographics and sources', () => {
  let available = 0;
  const validate = (p: ResearchProfile) => {
    assert.equal(p.estimate.status, 'estimated', p.id);
    if (p.estimate.status !== 'estimated') return;
    assert.ok(
      p.estimate.low <= p.estimate.base + 0.01 &&
        p.estimate.base <= p.estimate.high + 0.01,
      p.id,
    );
    assert.ok(p.sources.length >= 1, p.id);
    for (const rows of [p.ages, p.sexes, p.regions])
      if (rows.length)
        assert.ok(
          Math.abs(rows.reduce((n, r) => n + r.share, 0) - 1) < 1e-9,
          p.id,
        );
  };
  for (const market of researchMarkets) {
    const data = getResearchExplorer(market.id)!;
    assert.ok(data);
    if (!market.branches.length) {
      assert.equal(data.root.estimate.status, 'not_estimable');
      assert.ok(market.gap);
      continue;
    }
    available++;
    validate(data.root);
    for (const b of data.branches) {
      validate(b.profile);
      assert.ok(b.job && b.hypothesis && b.nextQuestion);
      if (
        data.root.estimate.status === 'estimated' &&
        b.profile.estimate.status === 'estimated'
      )
        assert.ok(
          b.profile.estimate.base <= data.root.estimate.base + 0.01,
          market.id + '/' + b.id,
        );
      for (const c of b.children) {
        validate(c);
        if (
          c.estimate.status === 'estimated' &&
          b.profile.estimate.status === 'estimated'
        )
          for (const level of ['low', 'base', 'high'] as const)
            assert.ok(
              c.estimate[level] <= b.profile.estimate[level] + 0.01,
              c.id + '/' + level,
            );
      }
      if (market.unit === 'household') {
        for (const child of b.children)
          if (child.estimate.status === 'estimated')
            assert.equal(child.estimate.unit, 'household');
        assert.deepEqual(b.profile.ages, []);
        if (b.profile.householdProfile)
          for (const rows of [
            b.profile.householdProfile.ages,
            b.profile.householdProfile.sexes,
            b.profile.householdProfile.sizes,
          ])
            assert.ok(
              Math.abs(rows.reduce((n, r) => n + r.share, 0) - 1) < 1e-9,
            );
        else assert.deepEqual(b.profile.regions, []);
      }
    }
  }
  assert.equal(
    available,
    20,
    'Every market has a sourced demand scope; scope gaps remain explicit.',
  );
});
void test('age filters preserve the same external model and sum to their parent population', () => {
  for (const id of ['music', 'beauty', 'travel', 'gaming', 'education']) {
    const all = getResearchExplorer(id)!;
    const selected = all.branches[0].profile.estimate;
    assert.equal(selected.status, 'estimated');
    if (selected.status !== 'estimated') continue;
    const values = [20, 30, 40, 50, 60, 70].map((age) =>
      researchAgeSlice(selected, String(age)),
    );
    assert.ok(
      Math.abs(
        values.reduce(
          (n, v) => n + (v.status === 'estimated' ? v.base : 0),
          0,
        ) - selected.base,
      ) < 0.01,
    );
    const filtered = getResearchExplorer(id, '30')!.branches[0].profile
      .estimate;
    assert.equal(filtered.status, 'estimated');
    if (filtered.status === 'estimated' && values[1].status === 'estimated')
      assert.equal(filtered.base, values[1].base);
  }
  const household = getResearchExplorer('pet')!.root.estimate;
  assert.equal(researchAgeSlice(household, '30').status, 'not_estimable');
});
void test('beauty scope fixes the reported order of magnitude without equating care with all cosmetics users', () => {
  const data = getResearchExplorer('beauty')!;
  const skin = data.branches.find((b) => b.id === 'skin')!.profile;
  assert.equal(skin.estimate.status, 'estimated');
  if (skin.estimate.status !== 'estimated') return;
  assert.ok(skin.estimate.base > 16_000_000 && skin.estimate.base < 17_000_000);
  assert.ok(
    skin.estimate.definitions.some((d) =>
      d.includes('화장품 전체 사용자 수가 아님'),
    ),
  );
  const online = data.branches.find((b) => b.id === 'cosmetics')!.profile;
  assert.equal(online.estimate.status, 'estimated');
  assert.equal(data.root.estimate.status, 'estimated');
  if (
    online.estimate.status === 'estimated' &&
    data.root.estimate.status === 'estimated'
  ) {
    assert.notEqual(online.estimate.base, skin.estimate.base);
    assert.notEqual(
      data.root.estimate.base,
      skin.estimate.base + online.estimate.base,
    );
  }
});
