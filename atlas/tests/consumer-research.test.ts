import { test } from 'node:test';
import assert from 'node:assert/strict';
import data from '../config/research/consumer-observations.json';
import { consumerJourneys } from '../config/research/consumer-journeys';
import {
  consumerAbsoluteRate,
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
  assert.equal(consumerFactors.length, 40);
});
