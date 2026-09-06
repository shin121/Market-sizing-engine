import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const cli =
  '/Users/woocheolshin/.npm/_npx/6de2aa2fded2970c/node_modules/agent-browser/bin/agent-browser.js';
const out = 'work/atlas-v2';
const resume = process.argv.includes('--resume');
const report = resume
  ? JSON.parse(fs.readFileSync(out + '/browser-discovery.json', 'utf8'))
  : { startedAt: new Date().toISOString(), steps: [], themes: [] };
delete report.error;
const bc = (...args) => {
  const r = spawnSync(
    process.execPath,
    [cli, '--session', 'nemotron-qa', '--json', ...args],
    { encoding: 'utf8', timeout: 35000 },
  );
  let result;
  try {
    result = JSON.parse(r.stdout.trim());
  } catch {
    throw Error(args.join(' ') + ' ' + r.stdout + ' ' + r.stderr);
  }
  if (!result.success)
    throw Error(args.join(' ') + ' ' + JSON.stringify(result));
  return result.data;
};
const ev = (code) => bc('eval', code).result;
const ready = () =>
  bc(
    'wait',
    '--fn',
    '!!document.querySelector("h1") && !document.querySelector("vite-error-overlay")',
  );
function record(label) {
  const state = ev(
    '({url:location.href,title:document.querySelector("h1")?.innerText,conditions:[...document.querySelectorAll(".context-bar>span>a:first-child")].map(a=>a.innerText),breadcrumbs:document.querySelector(".breadcrumbs")?.innerText,modules:[...document.querySelectorAll("h2")].map(x=>x.innerText)})',
  );
  report.steps.push({ at: new Date().toISOString(), label, ...state });
  fs.writeFileSync(
    out + '/browser-discovery.json',
    JSON.stringify(report, null, 2),
  );
  console.log(label + ': ' + state.title);
  return state;
}
function clickHref(href) {
  assert.ok(href);
  const selector = ev(
    `!!document.querySelector('main a[href=${JSON.stringify(href)}]')`,
  )
    ? `main a[href=${JSON.stringify(href)}]`
    : `a[href=${JSON.stringify(href)}]`;
  bc('scrollintoview', selector);
  bc('click', selector);
  bc(
    'wait',
    '--fn',
    `location.pathname+location.search===${JSON.stringify(href)}`,
  );
  ready();
}
function link(selector) {
  return ev(
    `document.querySelector(${JSON.stringify(selector)})?.getAttribute('href')`,
  );
}
function shot(name) {
  bc('screenshot', out + '/' + name + '.png');
}
function open(url) {
  bc('open', 'http://localhost:3001' + url);
  ready();
}
try {
  if (!resume) {
    bc('set', 'viewport', '1440', '900');
    open('/atlas');
    record('1. Global Atlas people lens');
    const visual = ev(
      '({tiles:document.querySelectorAll(".map-tile").length,radar:[...document.querySelectorAll("[data-radar]")].map(s=>({id:s.getAttribute("data-radar"),rows:s.querySelectorAll(".radar-row").length,bottom:s.getBoundingClientRect().bottom})),width:document.documentElement.scrollWidth})',
    );
    assert.equal(visual.tiles, 52);
    assert.equal(visual.width, 1440);
    assert.ok(visual.radar.every((r) => r.rows === 3));
    assert.ok(visual.radar.at(-1).bottom <= 900, JSON.stringify(visual));
    report.visual = visual;
    shot('qa-atlas-1440');
    bc('find', 'role', 'tab', 'click', '--name', '산업 / 시장');
    bc('wait', '--fn', 'document.querySelectorAll(".map-tile").length===20');
    record('2. Industry lens');
    bc('find', 'role', 'tab', 'click', '--name', '사람 / 유형');
    bc('wait', '--fn', 'document.querySelectorAll(".map-tile").length===52');
    clickHref(link('.map-tile[href*="arc_collecting_planning"]'));
    const type = record('3. Map → full archetype');
    assert.ok(type.url.includes('/archetypes/'));
    assert.equal(ev('document.querySelectorAll("[role=dialog]").length'), 0);
    assert.ok(
      ev(
        '[...document.querySelectorAll(".profile-core .analysis-module:first-child .stat-row>strong")].filter(e=>Math.abs(parseFloat(e.innerText)-1)>=.15).length',
      ) >= 5,
    );
    shot('qa-archetype-1440');
    clickHref(link('.profile-core a[href*="/markets/pet"]'));
    const market = record('4. Archetype → Pet');
    assert.deepEqual(market.conditions, ['반려동물']);
    assert.ok(market.breadcrumbs.includes('계획 중심 수집몰입형'));
    const another = link(
      '.profile-core .analysis-module:nth-child(2) a.row-label',
    );
    clickHref(another);
    const second = record('5. Pet → different archetype');
    assert.notEqual(second.title, type.title);
    const secondUrl = ev('location.pathname+location.search');
    const signalHref = link(
      '.profile-core .analysis-module:nth-child(3) a.row-label',
    );
    clickHref(signalHref);
    const signal = record('6. Archetype → need full dashboard');
    assert.ok(signal.url.includes('/signals/'));
    bc('back');
    bc(
      'wait',
      '--fn',
      `location.pathname+location.search===${JSON.stringify(secondUrl)}`,
    );
    assert.equal(ev('document.querySelector("h1").innerText'), second.title);
    bc('forward');
    bc(
      'wait',
      '--fn',
      `location.pathname+location.search===${JSON.stringify(signalHref)}`,
    );
    bc('reload');
    ready();
    assert.ok(
      ev('document.querySelector(".breadcrumbs").innerText').includes(
        second.title,
      ),
    );
    record('7. Back / Forward / Reload');
    open('/atlas/archetypes/arc_collecting_planning');
    clickHref(link('.inline-callout>a'));
    record('8. Archetype → age × Pet matrix');
    assert.equal(
      ev('document.querySelector(".axis-controls select").value'),
      'age',
    );
    assert.ok(ev('location.search').includes('arc_collecting_planning'));
    const cell = ev(
      '[...document.querySelectorAll(".atlas-matrix td>a")].find(a=>a.href.includes("age_30~arc_collecting_planning~pet"))?.getAttribute("href")',
    );
    clickHref(cell);
    const segment = record('9. Matrix → three-condition segment');
    assert.equal(segment.conditions.length, 3);
    assert.equal(
      ev('document.querySelectorAll(".parent-differences>section").length'),
      2,
    );
    shot('qa-segment-1440');
    bc('find', 'role', 'button', 'click', '--name', '집계 데이터');
    bc('wait', '.dataset-table');
    assert.ok(
      ev('document.querySelectorAll(".dataset-table tbody tr").length') > 170,
    );
    record('10. Underlying aggregate dataset');
    shot('qa-dataset');
    bc('reload');
    bc('wait', '.dataset-table');
    clickHref(link('.entity-actions>a'));
    record('11. Segment → Opportunity');
    assert.equal(ev('document.querySelectorAll(".current-point").length'), 1);
    shot('qa-opportunity');
    const buttons = ev(
      '[...document.querySelectorAll(".opportunity-table button")].slice(0,2).map(x=>x.getAttribute("aria-label"))',
    );
    for (const label of buttons) {
      bc('click', `button[aria-label=${JSON.stringify(label)}]`);
      bc('wait', '--load', 'networkidle');
    }
    assert.equal(
      ev('document.querySelectorAll(".comparison-grid>div").length'),
      2,
    );
    bc('reload');
    ready();
    assert.equal(
      ev('document.querySelectorAll(".comparison-grid>div").length'),
      2,
    );
    record('12. Two comparisons persist in URL');
    clickHref(link('.context-views a[href*="/relationship"]'));
    bc('wait', '.graph-node');
    bc('click', '.graph-node:first-of-type');
    bc('wait', '--fn', 'new URL(location.href).searchParams.has("focus")');
    record('13. Relationship node → inline analytics');
    assert.ok(
      ev('document.querySelector(".node-inspector h2").innerText').includes(
        '선택',
      ),
    );
    shot('qa-relationship');
    clickHref(link('.node-inspector .primary-link'));
    record('14. Relationship → full joint dashboard');
  }
  for (const [id, label] of [
    ['pet', '반려동물'],
    ['travel', '여행·로컬 경험'],
    ['education', '배움·자기계발'],
    ['beauty', '뷰티·패션'],
    ['wellness', '건강·휴식'],
    ['food', '외식·미식'],
    ['content', '영상·콘텐츠'],
    ['finance', '개인 재테크 관심'],
    ['home', '집·인테리어'],
    ['collect', '수집·취미용품'],
  ]) {
    if (report.themes.some((t) => t.id === id)) continue;
    open('/atlas');
    clickHref(link(`.market-nav a[href="/atlas/markets/${id}"]`));
    const m = record('Theme ' + id + ' market');
    assert.equal(m.title, label);
    const data = ev(
      '({types:document.querySelectorAll(".profile-core .analysis-module:first-child .row-label").length,pains:[...document.querySelectorAll(".pain-cohorts a")].map(a=>a.innerText),submarkets:document.querySelectorAll(".market-consumers .analysis-module:last-child .stat-row").length})',
    );
    assert.ok(data.types >= 3);
    assert.ok(data.pains.length > 0);
    if (id === 'pet') shot('qa-market-pet');
    const joint = link(
      '.profile-core .analysis-module:nth-child(2) a.join-button',
    );
    clickHref(joint);
    const scoped = record('Theme ' + id + ' commercial cohort');
    assert.equal(scoped.conditions.length, 2);
    const cohortUrl = ev('location.pathname+location.search');
    const cohortData = ev(
      '({signals:[...document.querySelectorAll(".profile-core .analysis-module:first-child .stat-row")].map(e=>e.innerText),adjacency:[...document.querySelectorAll(".profile-core .analysis-module:nth-child(2) a.row-label")].map(a=>({label:a.innerText,href:a.getAttribute("href")}))})',
    );
    assert.ok(cohortData.adjacency.length >= 2);
    clickHref(link('.context-views a[href*="/relationship"]'));
    assert.ok(ev('document.querySelectorAll(".graph-node").length') > 0);
    record('Theme ' + id + ' strong relationships');
    clickHref(link('.context-views a[href*="/matrix"]'));
    bc('select', 'select[aria-label="행 축"]', 'need');
    bc(
      'wait',
      '--fn',
      'new URL(location.href).searchParams.get("row")==="need"',
    );
    bc('select', 'select[aria-label="열 축"]', 'channel');
    bc(
      'wait',
      '--fn',
      'new URL(location.href).searchParams.get("col")==="channel"',
    );
    let interesting = ev(
      '[...document.querySelectorAll(".atlas-matrix td>a")].map(a=>({href:a.getAttribute("href"),index:parseFloat(a.querySelector("span").innerText),n:parseInt(a.querySelector("small").innerText.split("n=")[1].replaceAll(",","")),label:a.innerText})).filter(x=>x.n>=30&&x.index>=1.1).sort((a,b)=>b.index-a.index)[0]',
    );
    if (!interesting) {
      record(
        'Theme ' + id + ' sparse joint: broaden to market and type × need',
      );
      clickHref(link(`.context-bar a[href^="/atlas/markets/${id}"]`));
      clickHref(link('.context-views a[href*="/matrix"]'));
      bc('select', 'select[aria-label="행 축"]', 'archetype');
      bc(
        'wait',
        '--fn',
        'new URL(location.href).searchParams.get("row")==="archetype"',
      );
      bc('select', 'select[aria-label="열 축"]', 'need');
      bc(
        'wait',
        '--fn',
        'new URL(location.href).searchParams.get("col")==="need"',
      );
      interesting = ev(
        '[...document.querySelectorAll(".atlas-matrix td>a")].map(a=>({href:a.getAttribute("href"),index:parseFloat(a.querySelector("span").innerText),n:parseInt(a.querySelector("small").innerText.split("n=")[1].replaceAll(",","")),label:a.innerText})).filter(x=>x.n>=30&&x.index>=1.1).sort((a,b)=>b.index-a.index)[0]',
      );
    }
    assert.ok(interesting, id + ' over-index cell');
    clickHref(interesting.href);
    record('Theme ' + id + ' meaningful matrix segment');
    clickHref(link('.entity-actions>a'));
    assert.ok(ev('document.querySelectorAll(".current-point").length') === 1);
    assert.ok(
      ev('document.querySelectorAll(".opportunity-table tbody tr").length') > 0,
    );
    const opportunity = record('Theme ' + id + ' opportunity candidates');
    open(cohortUrl);
    clickHref(
      cohortData.adjacency.find((a) => !a.href.includes('/markets/' + id + '?'))
        .href,
    );
    const adjacent = record('Theme ' + id + ' cross-industry market');
    assert.ok(adjacent.url.includes('/markets/'));
    report.themes.push({
      id,
      label,
      ...data,
      cohort: scoped.title,
      ...cohortData,
      matrix: interesting,
      opportunity: opportunity.conditions,
      adjacent: adjacent.title,
    });
    fs.writeFileSync(
      out + '/browser-discovery.json',
      JSON.stringify(report, null, 2),
    );
  }
  open('/atlas');
  for (const q of [
    '가격',
    '수집',
    '전문가',
    '구독',
    '반려동물',
    '육아',
    '여행',
    '수집 반려동물',
  ]) {
    bc('fill', 'input[aria-label="유형, 산업, 신호, 세그먼트 검색"]', q);
    bc(
      'wait',
      '--fn',
      'document.querySelectorAll(".search-results>a").length>0',
    );
    const results = ev(
      '[...document.querySelectorAll(".search-results>a")].map(a=>({text:a.innerText,href:a.getAttribute("href")}))',
    );
    assert.ok(results.length > 0);
    report.steps.push({ label: 'Search ' + q, results: results.slice(0, 3) });
    if (q === '수집 반려동물') {
      clickHref(results[0].href);
      record('Search → generated segment');
    }
  }
  report.finishedAt = new Date().toISOString();
  report.success = true;
  fs.writeFileSync(
    out + '/browser-discovery.json',
    JSON.stringify(report, null, 2),
  );
  console.log('PASS — all browser journeys');
} catch (error) {
  report.error = String(error.stack ?? error);
  fs.writeFileSync(
    out + '/browser-discovery.json',
    JSON.stringify(report, null, 2),
  );
  console.error(error);
  process.exitCode = 1;
}
