import { test } from 'node:test';
import assert from 'node:assert/strict';
import data from '../config/research/consumer-observations.json';
import { consumerJourneys } from '../config/research/consumer-journeys';
import {
  consumerAbsoluteRate,
  consumerChannelFactors,
  consumerChannelProblemFactors,
  consumerFactors,
} from '../server/atlas/consumer-research';
import {
  adultResearchFrame,
  researchEstimate,
} from '../server/atlas/research-registry';
import { getResearchExplorer } from '../server/atlas/research-explorer';
import {
  resolveResearchContext,
  researchWorkspace,
} from '../server/atlas/research-workspace';

void test('KCA product-specific problem rates undo the all-problem respondent denominator', () => {
  assert.equal(
    consumerAbsoluteRate('advertising', 26, '2025년'),
    (0.069 * 5035) / 10000,
  );
  assert.ok(
    Math.abs(consumerAbsoluteRate('problem', 26, '2025년')! - 0.082) < 1e-10,
  );
  assert.equal(
    consumerAbsoluteRate('advertising', 26, '20대'),
    (0.087 * 793) / 1403,
  );
  assert.equal(
    consumerAbsoluteRate('problem', 26, '광주'),
    null,
    'published missing remains missing',
  );
  assert.equal(
    data.tables.online_channels.rows['남성'].values[11],
    14.4,
    'PDF last-column recovery must retain printed values',
  );
});

void test('new problem subtypes preserve the same observed cohort across all age cells', () => {
  for (const j of consumerJourneys) {
    const parentId = 'kca_' + j.id;
    const parent = researchEstimate([parentId]);
    assert.equal(parent.status, 'estimated');
    if (parent.status !== 'estimated') continue;
    for (const [kind] of j.types) {
      const childId = parentId + '_' + kind;
      const child = researchEstimate([childId, parentId]);
      assert.equal(child.status, 'estimated', childId);
      if (child.status !== 'estimated') continue;
      assert.deepEqual(
        child,
        researchEstimate([childId]),
        'parent participation is applied once',
      );
      assert.ok(child.base < parent.base);
      assert.ok(child.low <= child.base && child.base <= child.high);
      for (const age of [20, 30, 40, 50, 60, 70]) {
        const label = age >= 60 ? '60대 이상' : age + '대';
        const frame = adultResearchFrame.filter(
          (c) => c.ageMin! >= age && (age === 70 || c.ageMin! < age + 10),
        );
        const expected =
          frame.reduce((n, c) => n + c.population, 0) *
          consumerAbsoluteRate(kind, j.column, label)!;
        const actual = child.cells
          .filter(
            (c) => c.ageMin! >= age && (age === 70 || c.ageMin! < age + 10),
          )
          .reduce((n, c) => n + c.base, 0);
        assert.ok(
          Math.abs(expected - actual) < 0.001,
          `${childId}/${age}: ${actual} vs ${expected}`,
        );
      }
    }
  }
});

void test('industry problem flows reach matrix and comparison without borrowing spend or generic purchase scenarios', () => {
  for (const j of consumerJourneys) {
    const branch = getResearchExplorer(j.market)!.branches.find(
      (b) => b.id === 'problem_' + j.id,
    )!;
    assert.equal(branch.evidenceType, 'consumer_problem');
    assert.equal(branch.children.length, 3);
    for (const p of [branch.profile, ...branch.children]) {
      assert.equal(p.marketValue.annualValue, null);
      assert.ok(!p.factors.includes('research_review'));
      assert.equal(p.regions.length, 17);
      assert.ok(
        Math.abs(p.regions.reduce((n, r) => n + r.share, 0) - 1) < 1e-9,
      );
      assert.ok(p.regionBasis.includes('교차표'));
    }
    const node = branch.children[0].id;
    const resolved = resolveResearchContext(['compare'], {
      compare: `${j.market}:${node}:30`,
    });
    assert.deepEqual(resolved.unresolved, []);
    const matrix = researchWorkspace(
      resolveResearchContext(['matrix'], { market: j.market, node: branch.id })
        .context,
    ).matrix!;
    assert.equal(matrix.columns.length, 4);
    assert.equal(matrix.cells.length, 6);
  }
  const beauty = getResearchExplorer('beauty')!.branches.find(
    (b) => b.id === 'problem_beauty',
  )!.profile;
  assert.match(beauty.regionBasis, /광주·세종.*결측.*전이/);
  assert.equal(consumerFactors.length, consumerJourneys.length * 4);
});

void test('KCA commerce channels expose use, frequency and channel-specific problem cohorts', () => {
  assert.equal(consumerChannelFactors.length, 4);
  assert.equal(consumerChannelProblemFactors.length, 12);
  const commerce = getResearchExplorer('commerce')!;
  const online = commerce.branches.find((b) => b.id === 'online')!;
  assert.equal(online.children.length, 16);
  const mobile = online.children.find((p) => p.id === 'online~mobile')!;
  assert.equal(mobile.estimate.status, 'estimated');
  if (mobile.estimate.status !== 'estimated') return;
  assert.equal(mobile.estimate.unit, 'person');
  assert.ok(mobile.observations.some((o) => /월평균 5\.1회/.test(o.value)));
  assert.ok(mobile.estimate.base > 20_000_000);
  assert.equal(mobile.regions.length, 17);
  const c2c = online.children.find((p) => p.id === 'online~c2c')!;
  assert.equal(c2c.estimate.status, 'estimated');
  if (c2c.estimate.status !== 'estimated') return;
  assert.ok(c2c.observations.some((o) => /월평균 1\.8회/.test(o.value)));
  assert.ok(c2c.estimate.base > 5_000_000);
  assert.equal(c2c.regions.length, 17);
  assert.ok(mobile.definition?.includes('모바일쇼핑'));
  const mobileQuality = online.children.find(
    (p) => p.id === 'online~mobile_quality',
  )!;
  assert.equal(mobileQuality.estimate.status, 'estimated');
  assert.equal(mobileQuality.label, '모바일 · 품질 문제 경험');
  assert.ok(
    mobileQuality.observations.some((o) => /가장 심각하게/.test(o.value)),
  );
  const channelProblem = researchEstimate([
    'kca_channel_c2c_redress',
  ]);
  assert.equal(channelProblem.status, 'estimated');
  if (channelProblem.status === 'estimated') {
    const c2cEstimate = researchEstimate(['kca_channel_c2c']);
    assert.equal(c2cEstimate.status, 'estimated');
    if (c2cEstimate.status !== 'estimated') return;
    assert.ok(channelProblem.base < c2cEstimate.base);
    assert.ok(channelProblem.assumptions.some((a) => a.includes('문제 경험률')));
  }
});
