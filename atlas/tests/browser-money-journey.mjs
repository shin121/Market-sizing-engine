import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const cli =
  process.env.ATLAS_BROWSER_CLI ??
  '/Users/woocheolshin/.npm/_npx/6de2aa2fded2970c/node_modules/agent-browser/bin/agent-browser.js';
const out = path.resolve('work/market-value'),
  base = process.env.ATLAS_BROWSER_BASE ?? 'http://localhost:3001';
fs.mkdirSync(out, { recursive: true });
const report = { startedAt: new Date().toISOString(), steps: [] };
const bc = (...args) => {
  const r = spawnSync(
    process.execPath,
    [cli, '--session', 'nemotron-money', '--json', ...args],
    { encoding: 'utf8', timeout: 45000 },
  );
  const data = JSON.parse(r.stdout.trim());
  if (!data.success) throw Error(args.join(' ') + ': ' + JSON.stringify(data));
  return data.data;
};
const ev = (code) => bc('eval', code).result;
const ready = () =>
  bc(
    'wait',
    '--fn',
    '!!document.querySelector("h1")&&!document.querySelector("vite-error-overlay")',
  );
const record = (label) => {
  const s = ev(
    '({url:location.href,title:document.querySelector("h1")?.innerText,metrics:document.querySelector(".population-strip")?.innerText,moneyScope:document.querySelector(".money-scope-note")?.innerText,width:document.documentElement.scrollWidth})',
  );
  report.steps.push({ label, ...s });
  fs.writeFileSync(
    out + '/browser-money.json',
    JSON.stringify(report, null, 2),
  );
  console.log(label + ': ' + s.title);
  return s;
};
const open = (url) => {
  bc('open', base + url);
  ready();
};
const shot = (name) => bc('screenshot', out + '/' + name + '.png');
const clickHref = (href) => {
  assert.ok(href);
  const selector = `a[href=${JSON.stringify(href)}]`;
  bc('scrollintoview', selector);
  bc('click', selector);
  bc(
    'wait',
    '--fn',
    `location.pathname+location.search===${JSON.stringify(href)}`,
  );
  ready();
};
const observed = (selector) =>
  ev(
    `document.querySelector(${JSON.stringify(selector)})?.getAttribute('href')`,
  );
try {
  bc('set', 'viewport', '1440', '900');
  open('/atlas');
  record('Population Atlas');
  assert.equal(ev('document.querySelectorAll(".map-tile").length'), 52);
  assert.equal(ev('document.querySelectorAll("[data-radar]").length'), 5);
  shot('qa-money-population');
  bc('find', 'role', 'button', 'click', '--name', '시장 규모 ₩', '--exact');
  bc(
    'wait',
    '--fn',
    'new URL(location.href).searchParams.get("metric")==="marketValue"',
  );
  ready();
  record('Money Atlas');
  assert.equal(ev('document.querySelectorAll("[data-money-radar]").length'), 3);
  assert.equal(
    ev('document.querySelectorAll("[data-money-radar] .radar-row").length'),
    9,
  );
  shot('qa-money-atlas');
  clickHref(observed('.map-tile[href*="arc_premium_recovery"]'));
  record('Premium-related actual archetype');
  assert.ok(
    ev('document.querySelector(".money-main strong").innerText') !== '—',
  );
  assert.equal(
    ev('document.querySelectorAll("[data-money-market]").length'),
    20,
  );
  shot('qa-money-archetype');
  bc('select', 'select[aria-label="산업 지출 정렬"]', 'value');
  clickHref(
    observed('[data-money-market="music"] td:first-child small:last-child a'),
  );
  record('Top supported industry by spend');
  assert.ok(ev('document.querySelector("h1").innerText').includes('음악'));
  bc('select', 'select[aria-label="유형 지출 정렬"]', 'value');
  shot('qa-money-market');
  const typeLink = ev(
    '[...document.querySelectorAll(".money-analysis table")].at(1)?.querySelector("tbody td:first-child small a")?.getAttribute("href")',
  );
  clickHref(typeLink);
  record('Market to archetype by spend');
  clickHref(observed('.context-views a[href*="/matrix"]'));
  record('Context to Matrix');
  bc('select', 'select[aria-label="행 축"]', 'age');
  bc('wait', '--fn', 'new URL(location.href).searchParams.get("row")==="age"');
  ready();
  bc('select', 'select[aria-label="열 축"]', 'archetype');
  bc(
    'wait',
    '--fn',
    'new URL(location.href).searchParams.get("col")==="archetype"',
  );
  ready();
  bc('find', 'role', 'button', 'click', '--name', '인구 규모', '--exact');
  bc(
    'wait',
    '--fn',
    'new URL(location.href).searchParams.get("metric")==="population"',
  );
  ready();
  const populationCells = ev(
    '[...document.querySelectorAll(".atlas-matrix td strong")].map(x=>x.innerText)',
  );
  shot('qa-money-matrix-population');
  bc('find', 'role', 'button', 'click', '--name', '시장 규모 ₩', '--exact');
  bc(
    'wait',
    '--fn',
    'new URL(location.href).searchParams.get("metric")==="marketValue"',
  );
  ready();
  const moneyCells = ev(
    '[...document.querySelectorAll(".atlas-matrix td strong")].map(x=>x.innerText)',
  );
  assert.equal(populationCells.length, moneyCells.length);
  assert.notDeepEqual(populationCells, moneyCells);
  record('Matrix money changes cell values');
  shot('qa-money-matrix');
  clickHref(observed('.matrix-highlights a'));
  record('Money cell to Segment');
  assert.ok(ev('document.querySelector("h1").innerText').includes('×'));
  assert.ok(ev('location.search').includes('spend=music'));
  shot('qa-money-segment');
  clickHref(observed('.context-views a[href*="/opportunity"]'));
  record('Segment to Money Opportunity');
  assert.equal(
    ev('document.querySelectorAll(".money-chart-controls select")[1].value'),
    'spendPerUnit',
  );
  assert.ok(
    ev('document.querySelector(".score-breakdown").innerText').includes(
      '경제적 규모',
    ),
  );
  shot('qa-money-opportunity');
  bc('select', 'select[aria-label="X축 지표"]', 'annualValue');
  bc('select', 'select[aria-label="Y축 지표"]', 'distinctiveness');
  bc(
    'wait',
    '--fn',
    'new URL(location.href).searchParams.get("y")==="distinctiveness"',
  );
  ready();
  record('Economic axis switching');
  bc('click', '.opportunity-table tbody tr:nth-child(1) button');
  bc('wait', '--fn', 'new URL(location.href).searchParams.has("compare")');
  ready();
  bc('click', '.opportunity-table tbody tr:nth-child(2) button');
  bc(
    'wait',
    '--fn',
    '(new URL(location.href).searchParams.get("compare")||"").includes("|")',
  );
  ready();
  bc('reload');
  ready();
  record('Money axes and comparison survive reload');
  assert.equal(
    ev('document.querySelectorAll(".comparison-grid>div").length'),
    2,
  );
  clickHref(observed('.context-views a[href*="/relationship"]'));
  record('Relationship keeps monetary context');
  assert.ok(ev('location.search').includes('spend=music'));
  bc('fill', 'input[aria-label="유형, 산업, 신호, 세그먼트 검색"]', '구독');
  bc('wait', '--fn', 'document.querySelectorAll(".search-results>a").length>0');
  assert.ok(
    ev('document.querySelector(".search-results").innerText').includes('/ 년'),
  );
  record('Search includes population and monetary scope');
  bc('press', 'Escape');
  open('/atlas?lens=markets&metric=marketValue');
  record('Industry money map states partial coverage');
  assert.equal(ev('document.querySelectorAll(".map-tile").length'), 14);
  shot('qa-money-industries');
  for (const id of [
    'pet',
    'travel',
    'education',
    'beauty',
    'wellness',
    'food',
    'content',
    'finance',
    'home',
    'music',
  ]) {
    open('/atlas/markets/' + id + '?metric=marketValue');
    const s = record('Industry audit ' + id);
    const amount = ev('document.querySelector(".money-main strong").innerText');
    assert.equal(amount === '—', ['content', 'finance'].includes(id));
    assert.ok(s.metrics.includes('명'));
  }
  open('/atlas/markets/pet?metric=marketValue');
  shot('qa-money-pet-allocation');
  open('/atlas/markets/home?metric=marketValue');
  record('Home dashboard includes dense evidence modules');
  assert.equal(
    ev(
      'document.querySelectorAll(".economic-overview .analysis-module").length',
    ),
    4,
  );
  const reviewLink = observed(
    '.stat-list .row-label[href*="arc_planned_purchase_review"]',
  );
  clickHref(reviewLink);
  record('Home to review type preserves home condition');
  assert.ok(ev('location.pathname').includes('home'));
  assert.ok(
    ev(
      'document.querySelector(".population-calibration-note").innerText',
    ).includes('서술 일치'),
  );
  assert.ok(
    ev('document.querySelector(".population-strip").innerText').includes(
      '320만',
    ),
  );
  shot('qa-revision-home-review');
  const onlineLink = observed(
    '.economic-overview .row-label[href*="arc_ecommerce_planned_purchase"]',
  );
  assert.ok(onlineLink);
  const onlinePopulation = ev(
    `document.querySelector('.economic-overview .row-label[href*="arc_ecommerce_planned_purchase"]').parentElement.querySelector('strong').innerText`,
  );
  clickHref(onlineLink);
  record('Nested online group population equals clicked row');
  assert.ok(
    ev('document.querySelector(".population-strip").innerText')
      .replace(/\s/g, '')
      .includes(onlinePopulation.replace(/\s/g, '')),
  );
  assert.equal(
    ev(
      'document.querySelectorAll(".economic-overview .analysis-module").length',
    ),
    4,
  );
  assert.ok(
    ev('document.querySelectorAll(".evidence-table tbody tr").length') >= 4,
  );
  shot('qa-revision-nested-online');
  open(
    '/atlas/archetypes/arc_delivery_order_digital?metric=marketValue&spend=delivery',
  );
  record('Digital delivery uses food service consumer transaction baseline');
  assert.ok(
    ev('document.querySelector(".money-main strong").innerText').includes(
      '40조',
    ),
  );
  assert.ok(
    ev('document.querySelector(".population-strip").innerText').includes(
      '관련 성인당 연간 배분액',
    ),
  );
  assert.ok(
    ev('document.querySelector(".baseline-trend").innerText').includes(
      '현재 세그먼트 성장률이 아닙니다',
    ),
  );
  shot('qa-revision-delivery');
  open('/atlas?metric=marketValue');
  bc('set', 'viewport', '390', '844');
  record('Mobile money Atlas');
  assert.equal(ev('document.documentElement.scrollWidth'), 390);
  shot('qa-money-mobile');
  bc('set', 'viewport', '1440', '900');
  report.completedAt = new Date().toISOString();
  report.errors = bc('errors');
  report.success = true;
  fs.writeFileSync(
    out + '/browser-money.json',
    JSON.stringify(report, null, 2),
  );
  console.log(
    'PASS: monetary navigation, modes, ranges, context, search and 10 markets',
  );
} catch (e) {
  report.error = String(e);
  fs.writeFileSync(
    out + '/browser-money.json',
    JSON.stringify(report, null, 2),
  );
  console.error(e);
  process.exit(1);
}
