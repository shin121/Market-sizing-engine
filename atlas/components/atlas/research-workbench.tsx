'use client';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowUpRight,
  Compass,
  Network,
  Grid2X2,
  ChartScatter,
  Columns3,
  Database,
  Search,
  Bookmark,
  Layers3,
} from 'lucide-react';
import { researchHref } from '@/lib/research-explorer';
import {
  candidateMetric,
  researchPopulation,
  researchWorkspaceHref,
  type ResearchCandidate,
  type ResearchContext,
  type ResearchMetric,
  type ResearchView,
  type ResearchWorkspacePayload,
} from '@/lib/research-workspace';
import { formatKRW, unitLabel } from '@/lib/market-value';
import { ResearchIdeas } from './research-ideas';
import { ResearchProfileDashboard } from './research-profile';

const metricLabels: Record<ResearchMetric, string> = {
  population: '인구·가구 규모',
  marketValue: '연간 소비금액 ₩',
  spendPerUnit: '단위당 연간 지출',
  index: '연령 구성 Index',
};
const titles: Record<ResearchView, string> = {
  overview: '어떤 시장의 수요를 발견할까요?',
  profile: '선택한 세그먼트의 시장 프로필',
  matrix: '인구와 돈은 다른 곳에 모입니다',
  opportunity: '다음에 검증할 기회를 고르세요',
  compare: '세그먼트를 나란히 비교하세요',
  ideas: '아이디어에서 다음 검증으로',
  sources: '숫자가 나온 범위를 확인하세요',
};
const navigation = [
  ['overview', '시장 탐색', Compass],
  ['matrix', '교차분석', Grid2X2],
  ['opportunity', '기회 탐색기', ChartScatter],
  ['compare', '세그먼트 비교', Columns3],
  ['ideas', '아이디어 보드', Bookmark],
  ['sources', '데이터·산출 근거', Database],
] as const;
function metricText(c: ResearchCandidate, metric: ResearchMetric) {
  const v = candidateMetric(c, metric);
  return metric === 'population'
    ? researchPopulation(v, c.unit)
    : metric === 'index'
      ? v === null
        ? '—'
        : v.toFixed(2) + '×'
      : v === null
        ? '지출 근거 미확보'
        : formatKRW(v) +
          (metric === 'marketValue'
            ? ' / 년'
            : ' / ' + unitLabel(c.unit) + '·년');
}
function ProfileLink({
  c,
  children,
}: {
  c: ResearchCandidate;
  children?: React.ReactNode;
}) {
  const query = useSearchParams();
  const compare = query.get('compare')?.split('|').slice(0, 3);
  const metric = (query.get('metric') ?? 'population') as ResearchMetric;
  return (
    <Link href={researchHref(c.market, c.node, c.age, compare, metric)}>
      {children ?? c.label}
      <ArrowUpRight size={13} />
    </Link>
  );
}
function MiniBars({
  rows,
}: {
  rows: { label: string; share: number; covered?: boolean }[];
}) {
  return rows.length ? (
    <div className="rw-bars">
      {rows.slice(0, 6).map((r) => (
        <div key={r.label}>
          <span>{r.label}</span>
          <i>
            <b style={{ width: `${100 * r.share}%` }} />
          </i>
          <small>
            {r.covered === false ? '범위 밖' : (100 * r.share).toFixed(1) + '%'}
          </small>
        </div>
      ))}
    </div>
  ) : (
    <p className="rw-muted">해당 집단의 교차표 미확보</p>
  );
}
function CandidateTable({
  rows,
  metric,
  context,
}: {
  rows: ResearchCandidate[];
  metric: ResearchMetric;
  context: ResearchContext;
}) {
  return (
    <div className="rw-table-scroll">
      <table className="rw-table">
        <thead>
          <tr>
            <th>수요 · 세그먼트</th>
            <th>관련 인구 / 가구</th>
            <th>연간 소비금액</th>
            <th>단위당 지출</th>
            <th>산출 근거</th>
            <th>비교</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.key}>
              <td>
                <small>
                  {c.marketLabel} · {c.parentLabel ? c.parentLabel + ' · ' : ''}
                  {c.level === 'market'
                    ? '조사 범위'
                    : c.level === 'branch'
                      ? '경험·목적'
                      : '구매·이용 방식'}
                </small>
                <ProfileLink c={c} />
                <p>{c.job || c.scope}</p>
              </td>
              <td className={metric === 'population' ? 'rw-emphasis' : ''}>
                {researchPopulation(c.population, c.unit)}
              </td>
              <td className={metric === 'marketValue' ? 'rw-emphasis' : ''}>
                {formatKRW(c.marketValue.annualValue)}
                <small>
                  {c.marketValue.annualValue === null
                    ? '지출 기준 미확보'
                    : c.marketValue.scopeLabel + ' / 년'}
                </small>
              </td>
              <td className={metric === 'spendPerUnit' ? 'rw-emphasis' : ''}>
                {formatKRW(c.marketValue.annualSpendPerUnit)}
                <small>/ {unitLabel(c.unit)} · 년</small>
              </td>
              <td>
                <span className="rw-grade">{c.grade}</span>
                <small>출처 {c.sourceIds.length}개</small>
              </td>
              <td>
                <Link
                  aria-label={c.label + ' 비교에 담기'}
                  href={researchWorkspaceHref('compare', {
                    ...context,
                    compare: [...new Set([...context.compare, c.key])].slice(
                      -3,
                    ),
                  })}
                >
                  <Columns3 size={17} />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && (
        <p className="rw-empty">
          이 조건에 해당하는 수요가 없습니다. 검색어나 시장 범위를 바꿔 보세요.
        </p>
      )}
    </div>
  );
}

export function ResearchWorkbench({
  data,
}: {
  data: ResearchWorkspacePayload;
}) {
  const c = data.context,
    router = useRouter();
  const [search, setSearch] = useState('');
  const [pending, startTransition] = useTransition();
  const [depth, setDepth] = useState<'branch' | 'archetype'>(
    c.node && c.node !== '_root' ? 'archetype' : 'branch',
  );
  const [sort, setSort] = useState<'metric' | 'opportunity'>('metric');
  const [sourceSearch, setSourceSearch] = useState('');
  const change = (patch: Partial<ResearchContext>) =>
    startTransition(() =>
      router.push(researchWorkspaceHref(c.view, { ...c, ...patch }), {
        scroll: false,
      }),
    );
  const roots = data.candidates.filter((p) => p.level === 'market');
  const allMatches = data.candidates.filter(
    (p) =>
      (!search ||
        [p.label, p.marketLabel, p.scope, p.job, p.hypothesis]
          .join(' ')
          .toLowerCase()
          .includes(search.toLowerCase())) &&
      p.unit === c.unit,
  );
  const rows = allMatches.filter((p) =>
    c.market
      ? p.market === c.market &&
        (c.node && c.node !== '_root'
          ? p.node === c.node ||
            (p.node.startsWith(c.node + '~') && p.level === depth)
          : p.level === depth || (search && p.level === 'market'))
      : search
        ? true
        : p.level === (c.view === 'overview' ? 'market' : depth),
  );
  rows.sort(
    (a, b) =>
      (sort === 'opportunity'
        ? (b.opportunity.score ?? -1) - (a.opportunity.score ?? -1)
        : (candidateMetric(b, c.metric) ?? -1) -
          (candidateMetric(a, c.metric) ?? -1)) || a.key.localeCompare(b.key),
  );
  const moneyKnown = rows.filter(
    (p) => p.marketValue.annualValue !== null,
  ).length;
  const moneyMarkets = new Set(
    data.candidates
      .filter((p) => p.marketValue.annualValue !== null)
      .map((p) => p.market),
  ).size;
  const panelContext = { ...c, node: c.node || '_root' };
  return (
    <div className="research-os rw-shell">
      <a className="skip-link" href="#research-workbench">
        분석으로 이동
      </a>
      <aside className="research-nav" aria-label="Atlas 탐색 메뉴">
        <Link className="research-brand" href="/atlas">
          <span>ϟ</span>Market <b>Atlas</b>
        </Link>
        <small>DISCOVERY WORKSPACE</small>
        {navigation.slice(0, 1).map(([view, label, Icon]) => (
          <Link
            key={view}
            className={c.view === view ? 'active' : ''}
            href={researchWorkspaceHref(view, c)}
          >
            <Icon size={17} />
            {label}
          </Link>
        ))}
        {c.market && (
          <Link
            className={c.view === 'profile' ? 'active' : ''}
            href={researchWorkspaceHref('profile', c)}
          >
            <Layers3 size={17} />
            세그먼트 프로필
          </Link>
        )}
        {navigation.slice(1).map(([view, label, Icon]) => (
          <Link
            key={view}
            className={c.view === view ? 'active' : ''}
            href={researchWorkspaceHref(view, c)}
          >
            <Icon size={17} />
            {label}
          </Link>
        ))}
        {c.market && (
          <Link
            href={researchHref(
              c.market,
              c.node || '_root',
              c.age,
              c.compare,
              c.metric,
            )}
          >
            <Network size={17} />
            선택 시장의 수요 흐름
          </Link>
        )}
        <small>산업에서 시작하기</small>
        <nav className="research-market-list">
          {roots.map((m) => (
            <Link
              key={m.key}
              href={researchHref(
                m.market,
                undefined,
                undefined,
                c.compare,
                c.metric,
              )}
              className={c.market === m.market ? 'market-current' : ''}
            >
              <i />
              {m.label}
            </Link>
          ))}
        </nav>
        <div className="research-nav-foot">
          <Database size={17} />
          <span>
            외부 조사 × 공식 모집단
            <br />
            <small>인구와 가구를 구분합니다</small>
          </span>
        </div>
      </aside>
      <main id="research-workbench" className="research-main rw-main">
        <header className="research-header">
          <div>
            <span>MARKET ATLAS / DEMAND DISCOVERY</span>
            <h1>{titles[c.view]}</h1>
            <p>
              시장의 크기에서 출발해, 해결할 문제와 구매 방식을 구체화합니다.
            </p>
          </div>
          <div className="research-header-actions">
            <ResearchIdeas />
            {c.market && (
              <Link
                href={researchHref(
                  c.market,
                  c.node || '_root',
                  c.age,
                  c.compare,
                  c.metric,
                )}
              >
                선택 집단 프로필 <ArrowUpRight size={14} />
              </Link>
            )}
          </div>
        </header>
        {['overview', 'matrix', 'opportunity'].includes(c.view) && (
          <div className="research-toolbar rw-toolbar">
            <label>
              시장{' '}
              <select
                aria-label="분석 시장"
                disabled={pending}
                value={c.market}
                onChange={(e) =>
                  change({
                    market: e.target.value,
                    node: '',
                    age: '',
                    unit:
                      roots.find((m) => m.market === e.target.value)?.unit ??
                      c.unit,
                  })
                }
              >
                <option value="">전체 시장</option>
                {roots.map((m) => (
                  <option key={m.key} value={m.market}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              단위{' '}
              <select
                aria-label="인구 단위"
                value={c.unit}
                disabled={pending || !!c.market}
                onChange={(e) =>
                  change({
                    unit: e.target.value as 'person' | 'household',
                    age: '',
                  })
                }
              >
                <option value="person">개인</option>
                <option value="household">가구</option>
              </select>
            </label>
            <label>
              크기 기준{' '}
              <select
                aria-label="분석 지표"
                disabled={pending}
                value={c.metric}
                onChange={(e) =>
                  change({ metric: e.target.value as ResearchMetric })
                }
              >
                {Object.entries(metricLabels)
                  .filter(([k]) => c.view === 'matrix' || k !== 'index')
                  .map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
              </select>
            </label>
            {c.view !== 'matrix' && (
              <label>
                연령{' '}
                <select
                  aria-label="분석 연령"
                  value={c.age}
                  disabled={pending || c.unit !== 'person'}
                  onChange={(e) => change({ age: e.target.value })}
                >
                  <option value="">
                    {c.unit === 'household' ? '가구 기준' : '조사 범위 전체'}
                  </option>
                  {[20, 30, 40, 50, 60, 70].map((a) => (
                    <option key={a} value={a}>
                      {a === 70 ? '70세 이상' : a + '대'}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        )}
        {data.unresolved.length ? (
          <section className="rw-route-gap">
            <h2>이전 조건의 외부 근거를 연결해야 합니다</h2>
            <p>{data.unresolved.join(' · ')}</p>
            <p>
              이 조건을 제거하거나 합성 프로필 수로 계산하지 않았습니다. 전체
              시장에서 조사 범위가 확인된 수요를 선택할 수 있습니다.
            </p>
            <Link href="/atlas">전체 시장으로 이동</Link>
            {c.market && data.selected && (
              <p>
                <Link href={researchHref(c.market)}>
                  이 시장에서 근거가 연결된 수요 보기 →
                </Link>
              </p>
            )}
          </section>
        ) : (
          <>
            {(c.view === 'overview' || c.view === 'opportunity') && (
              <>
                <div className="rw-intro">
                  <div>
                    <small>
                      {c.market
                        ? data.selected?.marketLabel
                        : '대한민국 소비 수요'}
                    </small>
                    <strong>
                      {c.unit === 'household'
                        ? '가구가 구매하는 시장'
                        : '사람이 경험하는 시장'}
                    </strong>
                    <p>
                      경험 인구, 구매자, 유료 이용자는 서로 다른 집단입니다. 각
                      시장에 연결된 조사 대상과 범위를 확인하며 탐색하세요.
                    </p>
                  </div>
                  <div>
                    <b>{rows.length}</b>
                    <span>탐색 가능한 {c.market ? '세그먼트' : '범위'}</span>
                  </div>
                  <div>
                    <b>
                      {c.market ? moneyKnown : moneyMarkets}
                      <em> / {c.market ? rows.length : roots.length}</em>
                    </b>
                    <span>{c.market ? '지출 기준이 연결된 세그먼트' : '지출 기준이 연결된 시장(일부 하위 범위)'}</span>
                  </div>
                </div>
                <div className="rw-controls">
                  <label className="rw-search">
                    <Search size={16} />
                    <input
                      aria-label="시장과 세그먼트 검색"
                      placeholder="자연, 피부, 연습, 한 끼…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </label>
                  {(c.market || c.view === 'opportunity') && (
                    <label>
                      탐색 깊이{' '}
                      <select
                        aria-label="탐색 깊이"
                        value={depth}
                        onChange={(e) =>
                          setDepth(e.target.value as typeof depth)
                        }
                      >
                        <option value="branch">경험·목적</option>
                        <option value="archetype">구매·이용 방식</option>
                      </select>
                    </label>
                  )}
                  {c.view === 'opportunity' && (
                    <label>
                      정렬{' '}
                      <select
                        value={sort}
                        aria-label="기회 정렬"
                        onChange={(e) => setSort(e.target.value as typeof sort)}
                      >
                        <option value="metric">선택 지표</option>
                        <option value="opportunity">규모 신호 점수</option>
                      </select>
                    </label>
                  )}
                </div>
                {c.view === 'overview' && !search && !c.market ? (
                  <MarketMap rows={rows} metric={c.metric} context={c} />
                ) : c.view === 'opportunity' ? (
                  <OpportunityRows rows={rows} metric={c.metric} context={c} />
                ) : (
                  <CandidateTable rows={rows} metric={c.metric} context={c} />
                )}
                <p className="rw-footnote">
                  집단과 시장은 중복될 수 있어 합산하지 않습니다. 금액은 해당
                  범위의 소비액이며 확보 가능한 매출이 아닙니다.
                </p>
              </>
            )}
            {c.view === 'matrix' && <MatrixPanel data={data} />}
            {c.view === 'profile' && <ResearchProfileDashboard data={data} />}
            {c.view === 'compare' && <ComparisonPanel data={data} />}
            {c.view === 'ideas' && (
              <section className="rw-ideas-home">
                <Bookmark size={32} />
                <h2>관심 집단의 사업 가설과 검증 질문</h2>
                <p>
                  수요 흐름에서 저장한 조건을 다시 열면 현재 외부 근거로
                  재계산합니다.
                </p>
                <ResearchIdeas />
                <Link
                  href={
                    c.market ? researchHref(c.market, c.node, c.age) : '/atlas'
                  }
                >
                  탐색 이어가기 <ArrowUpRight size={16} />
                </Link>
              </section>
            )}
            {c.view === 'sources' && (
              <section className="rw-source-panel">
                <div className="rw-controls">
                  <h2>외부 근거 등록부</h2>
                  <input
                    aria-label="출처 검색"
                    placeholder="기관·조사명 검색"
                    value={sourceSearch}
                    onChange={(e) => setSourceSearch(e.target.value)}
                  />
                </div>
                {data.selected && (
                  <div className="rw-source-selection">
                    <strong>{data.selected.label}</strong>
                    <p>{data.selected.scope}</p>
                    <ul>
                      {data.selected.assumptions.map((a, i) => (
                        <li key={i}>{a}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="rw-table-scroll">
                  <table className="rw-table">
                    <thead>
                      <tr>
                        <th>기관 · 조사</th>
                        <th>기준기간</th>
                        <th>조사 대상 · 분모</th>
                        <th>표·페이지</th>
                        <th>한계</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.sources
                        .filter(
                          (s) =>
                            (!data.selected ||
                              data.selected.sourceIds.includes(s.id)) &&
                            (s.title + s.publisher).includes(sourceSearch),
                        )
                        .map((s) => (
                          <tr key={s.id}>
                            <td>
                              <a href={s.url} target="_blank" rel="noreferrer">
                                {s.title}
                                <ArrowUpRight size={13} />
                              </a>
                              <small>{s.publisher}</small>
                            </td>
                            <td>{s.referencePeriod}</td>
                            <td>{s.surveyUniverse}</td>
                            <td>{s.locator}</td>
                            <td>{s.limitations.join(' ')}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
            {data.selected && c.view !== 'compare' && c.view !== 'sources' && (
              <footer className="rw-context-footer">
                <span>
                  분석 조건: {data.selected.marketLabel} → {data.selected.label}
                  {c.age && ' · ' + c.age + '대'}
                </span>
                <Link href={researchWorkspaceHref('sources', panelContext)}>
                  산출 근거 확인
                </Link>
              </footer>
            )}
          </>
        )}
      </main>
    </div>
  );
}

/** Squarified display areas. This geometry never changes the estimates. */
function mapRectangles(rows: ResearchCandidate[], metric: ResearchMetric) {
  const total = rows.reduce((sum, c) => sum + candidateMetric(c, metric)!, 0);
  const pending = rows.map((c) => ({
    c,
    area: (candidateMetric(c, metric)! / total) * 570000,
  }));
  const result: {
    c: ResearchCandidate;
    x: number;
    y: number;
    width: number;
    height: number;
  }[] = [];
  let x = 0,
    y = 0,
    width = 1000,
    height = 570;
  const worst = (group: typeof pending, side: number) => {
    if (!group.length) return Infinity;
    const sum = group.reduce((n, r) => n + r.area, 0);
    return Math.max(
      (side * side * Math.max(...group.map((r) => r.area))) / (sum * sum),
      (sum * sum) / (side * side * Math.min(...group.map((r) => r.area))),
    );
  };
  while (pending.length) {
    const group = [pending.shift()!],
      side = Math.min(width, height);
    while (
      pending.length &&
      worst([...group, pending[0]], side) <= worst(group, side)
    )
      group.push(pending.shift()!);
    if (pending.length === 1) {
      const used = group.reduce((sum, r) => sum + r.area, 0) / side;
      const remainingWidth = width >= height ? width - used : width;
      const remainingHeight = width >= height ? height : height - used;
      const tailAspect = Math.max(
        remainingWidth / remainingHeight,
        remainingHeight / remainingWidth,
      );
      if (
        worst([...group, pending[0]], side) <
        Math.max(worst(group, side), tailAspect)
      )
        group.push(pending.shift()!);
    }
    const area = group.reduce((sum, r) => sum + r.area, 0);
    const vertical = width >= height,
      thickness = area / side;
    let offset = 0;
    for (const item of group) {
      const length = item.area / thickness;
      result.push({
        c: item.c,
        x: (x + (vertical ? 0 : offset)) / 10,
        y: (y + (vertical ? offset : 0)) / 5.7,
        width: (vertical ? thickness : length) / 10,
        height: (vertical ? length : thickness) / 5.7,
      });
      offset += length;
    }
    if (vertical) {
      x += thickness;
      width -= thickness;
    } else {
      y += thickness;
      height -= thickness;
    }
  }
  return result;
}
function MarketMap({
  rows,
  metric,
  context,
}: {
  rows: ResearchCandidate[];
  metric: ResearchMetric;
  context: ResearchContext;
}) {
  const known = rows.filter((c) => (candidateMetric(c, metric) ?? 0) > 0);
  const missing = rows.filter((c) => candidateMetric(c, metric) === null);
  return (
    <>
      <div className="rw-section-title">
        <div>
          <h2>시장의 수요 지형</h2>
          <p>
            면적 = {metricLabels[metric]} · 시장끼리 중복 가능 · 각 타일은 전체
            산업 중 확보한 조사 범위입니다.
          </p>
        </div>
      </div>
      <div className="rw-treemap-scroll">
        <div className="rw-treemap" aria-label="시장 수요 지도">
          {mapRectangles(known, metric).map((r, i) => (
            <Link
              key={r.c.key}
              href={researchHref(
                r.c.market,
                undefined,
                context.age,
                context.compare,
                context.metric,
              )}
              className={
                'rw-area rw-tone-' +
                (i % 4) +
                (r.width * r.height < 280 ? ' rw-area-compact' : '')
              }
              style={{
                left: r.x + '%',
                top: r.y + '%',
                width: r.width + '%',
                height: r.height + '%',
              }}
              title={r.c.scope + ' · ' + metricText(r.c, metric)}
            >
              <div>
                <h2>
                  {r.c.label}
                  <ArrowUpRight size={13} />
                </h2>
                <strong>{metricText(r.c, metric)}</strong>
                {r.width * r.height > 450 && <p>{r.c.scope}</p>}
                <small>Research {r.c.grade}</small>
              </div>
            </Link>
          ))}
        </div>
      </div>
      {missing.length > 0 && (
        <div className="rw-unpriced">
          <span>지출 근거 미확보 · 면적 비교 제외</span>
          {missing.map((c) => (
            <ProfileLink key={c.key} c={c} />
          ))}
        </div>
      )}
      <details className="rw-map-details">
        <summary>각 시장의 조사 대상과 금액 자세히 보기</summary>
        <CandidateTable rows={rows} metric={metric} context={context} />
      </details>
    </>
  );
}

function MatrixPanel({ data }: { data: ResearchWorkspacePayload }) {
  const c = data.context,
    matrix = data.matrix;
  if (!matrix)
    return (
      <section className="rw-empty">
        <h2>가구는 가구원 연령으로 나누지 않습니다</h2>
        <p>
          가구주 연령 교차표는 배달·간편식 프로필에서 확인할 수 있습니다. 가구원
          연령별 인구 Matrix로 변환하지 않습니다.
        </p>
        <Link href={researchHref(c.market || 'delivery', c.node)}>
          가구 프로필 열기
        </Link>
      </section>
    );
  const values = matrix.cells
    .flat()
    .map((p) => candidateMetric(p, c.metric))
    .filter((v): v is number => v !== null);
  const max = Math.max(1, ...values);
  const ranked = matrix.cells
    .flat()
    .filter((p) => candidateMetric(p, c.metric) !== null)
    .sort(
      (a, b) => candidateMetric(b, c.metric)! - candidateMetric(a, c.metric)!,
    );
  return (
    <section className="rw-matrix">
      <div className="rw-section-title">
        <div>
          <h2>연령 × {c.market ? '시장 내 수요' : '시장'}</h2>
          <p>
            셀을 누르면 같은 조건의 프로필로 이어집니다. Index는 20세 이상 공식
            인구의 연령 구성 대비 비율입니다.
          </p>
        </div>
        {c.node && c.node !== '_root' && (
          <Link href={researchWorkspaceHref('matrix', { ...c, node: '_root' })}>
            시장 전체 하위 수요 보기
          </Link>
        )}
      </div>
      <div className="rw-matrix-scroll">
        <table>
          <thead>
            <tr>
              <th>연령</th>
              {matrix.columns.map((p) => (
                <th key={p.key}>
                  <ProfileLink c={p} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.rows.map((age, i) => (
              <tr key={age}>
                <th>{age === '70' ? '70세 이상' : age + '대'}</th>
                {matrix.cells[i].map((p) => {
                  const v = candidateMetric(p, c.metric);
                  return (
                    <td key={p.key}>
                      <Link
                        href={researchHref(
                          p.market,
                          p.node,
                          p.age,
                          c.compare,
                          c.metric,
                        )}
                        aria-label={`${p.age}대 · ${p.label} · ${metricText(p, c.metric)}`}
                        style={{
                          background:
                            v === null
                              ? '#f2f4f8'
                              : `rgba(8, 150, 129, ${0.07 + (0.32 * v) / max})`,
                        }}
                      >
                        <strong>
                          {v === null
                            ? '근거·범위 미확보'
                            : metricText(p, c.metric)}
                        </strong>
                        <small>
                          {c.metric === 'population'
                            ? formatKRW(p.marketValue.annualValue) +
                              (p.marketValue.annualValue === null
                                ? ' 지출 미확보'
                                : ' / 년')
                            : researchPopulation(p.population, p.unit)}
                        </small>
                      </Link>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="rw-matrix-highlights">
        <h3>{metricLabels[c.metric]} 상위 셀</h3>
        {ranked.slice(0, 4).map((p, i) => (
          <ProfileLink key={p.key} c={p}>
            <b>{i + 1}</b>
            <span>
              {p.age}대 · {p.label}
              <small>{metricText(p, c.metric)}</small>
            </span>
          </ProfileLink>
        ))}
      </div>
      <p className="rw-footnote">
        조사 범위 밖은 비이용자 0명으로 처리하지 않습니다. 활동끼리 겹칠 수
        있으므로 열의 합계는 전체 시장이 아닙니다.
      </p>
    </section>
  );
}
function OpportunityRows({
  rows,
  metric,
  context,
}: {
  rows: ResearchCandidate[];
  metric: ResearchMetric;
  context: ResearchContext;
}) {
  const [visibleCount, setVisibleCount] = useState(30);
  const plotted = rows.filter(
    (p) =>
      p.population !== null &&
      p.marketValue.annualSpendPerUnit !== null &&
      p.marketValue.annualValue !== null,
  );
  const maxPop = Math.max(1, ...plotted.map((p) => p.population!)),
    maxSpend = Math.max(
      1,
      ...plotted.map((p) => p.marketValue.annualSpendPerUnit!),
    ),
    maxMoney = Math.max(1, ...plotted.map((p) => p.marketValue.annualValue!));
  return (
    <>
      <div className="rw-opportunity-intro">
        <div>
          <h2>인구 × 단위당 지출</h2>
          <p>
            원의 크기는 연간 소비금액입니다. 돈의 근거가 있는 집단만 표시합니다.
          </p>
        </div>
        <div className="rw-score-explainer">
          <b>점수는 확보한 규모 신호만 비교</b>
          <p>
            인구 가중치 0.18 · 경제 규모 0.10. Need·지불의향·경쟁·성장은 아직
            미확보이며 점수에서 제외합니다. 근거 충족률을 함께 확인하세요.
          </p>
        </div>
      </div>
      <div className="rw-landscape" aria-label="인구와 지출 기회 지도">
        <span className="rw-y-label">단위당 연간 지출 ↑</span>
        <span className="rw-x-label">관련 인구·가구 →</span>
        <div className="rw-quadrants">
          <span>작은 규모 · 높은 지출</span>
          <span>큰 규모 · 높은 지출</span>
          <span>작은 규모 · 낮은 지출</span>
          <span>큰 규모 · 낮은 지출</span>
        </div>
        {plotted.map((p) => (
          <Link
            key={p.key}
            href={researchHref(
              p.market,
              p.node,
              p.age,
              context.compare,
              context.metric,
            )}
            className="rw-bubble"
            style={{
              left: 9 + (80 * p.population!) / maxPop + '%',
              bottom:
                15 + (65 * p.marketValue.annualSpendPerUnit!) / maxSpend + '%',
              width: 24 + 46 * Math.sqrt(p.marketValue.annualValue! / maxMoney),
              height:
                24 + 46 * Math.sqrt(p.marketValue.annualValue! / maxMoney),
            }}
            title={
              p.label +
              ' · ' +
              researchPopulation(p.population, p.unit) +
              ' · ' +
              formatKRW(p.marketValue.annualValue)
            }
            aria-label={p.label + ' · ' + formatKRW(p.marketValue.annualValue)}
          >
            <span>{p.label}</span>
          </Link>
        ))}
        {!plotted.length && (
          <p className="rw-plot-empty">
            이 범위에는 비교 가능한 지출 기준이 아직 없습니다.
            <br />
            아래 인구·수요 후보에서 다음 조사 질문을 확인하세요.
          </p>
        )}
      </div>
      <div className="rw-opportunity-list">
        {rows.slice(0, visibleCount).map((p, i) => (
          <article key={p.key}>
            <div className="rw-candidate-number">
              {String(i + 1).padStart(2, '0')}
            </div>
            <div>
              <small>
                {p.marketLabel} {p.parentLabel && '· ' + p.parentLabel} ·
                Research {p.grade}
              </small>
              <h3>
                <ProfileLink c={p} />
              </h3>
              <p>
                <b>사업 가설</b> {p.hypothesis}
              </p>
              <p>
                <b>현재 대안 후보</b> {p.alternatives}
              </p>
              <p className="rw-next-question">
                <b>다음 검증</b> {p.question}
              </p>
            </div>
            <div className="rw-candidate-metrics">
              <strong>{metricText(p, metric)}</strong>
              <span>
                규모 신호{' '}
                {p.opportunity.score === null
                  ? '—'
                  : p.opportunity.score.toFixed(0)}{' '}
                / 100
              </span>
              <small>
                인구 {p.opportunity.population?.toFixed(0) ?? '—'} · 경제{' '}
                {p.opportunity.economicValue?.toFixed(0) ?? '—'}
              </small>
              <small>
                점수 근거 충족 {(100 * p.opportunity.completeness).toFixed(0)}%
              </small>
              <Link
                href={researchWorkspaceHref('compare', {
                  ...context,
                  compare: [...new Set([...context.compare, p.key])].slice(-3),
                })}
              >
                비교에 담기 →
              </Link>
            </div>
          </article>
        ))}
      </div>
      {rows.length > visibleCount && (
        <button
          className="rw-more"
          onClick={() => setVisibleCount((n) => n + 30)}
        >
          후보 더 보기 · {visibleCount} / {rows.length}
        </button>
      )}
    </>
  );
}
function ComparisonPanel({ data }: { data: ResearchWorkspacePayload }) {
  const router = useRouter(),
    c = data.context;
  const [filter, setFilter] = useState('');
  const [pending, startTransition] = useTransition();
  const choices = data.candidates.filter((p) =>
    (p.label + p.marketLabel).includes(filter),
  );
  const changeSlot = (i: number, key: string) => {
    const next = [...c.compare];
    next[i] = key;
    startTransition(() =>
      router.push(
        researchWorkspaceHref('compare', {
          ...c,
          compare: [...new Set(next.filter(Boolean))],
        }),
        { scroll: false },
      ),
    );
  };
  const mixed = new Set(data.comparison.map((p) => p.unit)).size > 1;
  return (
    <section className="rw-comparison">
      <div className="rw-controls">
        <p>최대 3개 집단 · URL로 비교 조건을 보존합니다.</p>
        <input
          aria-label="비교 대상 찾기"
          placeholder="비교할 수요 검색"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      <div className="rw-compare-selectors">
        {[0, 1, 2].map((i) => (
          <label key={i}>
            <b>{i + 1}</b>
            <select
              aria-label={'비교 세그먼트 ' + (i + 1)}
              disabled={pending}
              value={c.compare[i] ?? ''}
              onChange={(e) => changeSlot(i, e.target.value)}
            >
              <option value="">세그먼트 선택</option>
              {[
                ...new Map(
                  [...data.comparison, ...choices].map((p) => [p.key, p]),
                ).values(),
              ].map((p) => (
                <option key={p.key} value={p.key}>
                  {p.marketLabel} / {p.label}
                  {p.parentLabel ? ' · ' + p.parentLabel : ''}
                  {p.age ? ' / ' + p.age + '대' : ''}
                </option>
              ))}
            </select>
            <select
              aria-label={'비교 연령 ' + (i + 1)}
              value={data.comparison[i]?.age ?? ''}
              disabled={
                pending ||
                !data.comparison[i] ||
                data.comparison[i].unit !== 'person'
              }
              onChange={(e) => {
                const selected = data.comparison[i];
                changeSlot(
                  i,
                  [selected.market, selected.node, e.target.value].join(':'),
                );
              }}
            >
              <option value="">전체 연령</option>
              {[20, 30, 40, 50, 60, 70].map((a) => (
                <option key={a} value={a}>
                  {a === 70 ? '70세 이상' : a + '대'}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      {mixed && (
        <p className="rw-unit-notice">
          개인과 가구가 함께 선택되어 있습니다. 인구 수·단위당 지출을 같은
          기준으로 순위화하지 않습니다.
        </p>
      )}
      <div className="rw-comparison-grid">
        {data.comparison.map((p, i) => (
          <article key={p.key} className={'rw-comparison-column rw-tone-' + i}>
            <header>
              <small>
                {p.marketLabel} · {unitLabel(p.unit)} 기준
              </small>
              <h2>
                <ProfileLink c={p} />
              </h2>
              <p>{p.scope}</p>
            </header>
            <div className="rw-compare-metrics">
              <div>
                <small>관련 인구·가구</small>
                <strong>{researchPopulation(p.population, p.unit)}</strong>
                <span>
                  Low {researchPopulation(p.low, p.unit)}
                  <br />
                  High {researchPopulation(p.high, p.unit)}
                </span>
              </div>
              <div>
                <small>연간 소비금액</small>
                <strong>{formatKRW(p.marketValue.annualValue)}</strong>
                <span>
                  {p.marketValue.annualValue === null
                    ? '지출 기준 미확보'
                    : p.marketValue.scopeLabel}
                </span>
              </div>
              <div>
                <small>연간 지출 / {unitLabel(p.unit)}</small>
                <strong>{formatKRW(p.marketValue.annualSpendPerUnit)}</strong>
                <span>
                  근거 {p.grade} · 출처 {p.sourceIds.length}개
                </span>
              </div>
            </div>
            <section>
              <h3>
                {p.unit === 'household' ? '가구주 연령 구성' : '연령 구성'}
              </h3>
              <MiniBars rows={p.ages} />
            </section>
            <section>
              <h3>지역 분포</h3>
              <MiniBars
                rows={[...p.regions].sort((a, b) => b.share - a.share)}
              />
              <details>
                <summary>분포 산출 근거</summary>
                <p>{p.regionBasis}</p>
              </details>
            </section>
            <section>
              <h3>소비·이용 관측</h3>
              {p.observations.slice(-3).map((o) => (
                <p key={o.label}>
                  <b>{o.label}</b>
                  <br />
                  {o.value}
                </p>
              ))}
            </section>
            <section>
              <h3>해결할 문제 가설</h3>
              <p>
                {p.hypothesis ||
                  '수요 흐름에서 경험·목적을 선택해 가설을 구체화하세요.'}
              </p>
              <h3>현재 대안 후보</h3>
              <p>{p.alternatives || '하위 세그먼트에서 확인'}</p>
              <h3>다음 검증</h3>
              <p>{p.question || '품목·구매 주체·이용 목적을 구체화하기'}</p>
            </section>
            <footer>
              <Link
                href={researchWorkspaceHref('sources', {
                  market: p.market,
                  node: p.node,
                  age: p.age,
                  compare: c.compare,
                  metric: c.metric,
                })}
              >
                산출 근거 보기 →
              </Link>
            </footer>
          </article>
        ))}
      </div>
      {!data.comparison.length && (
        <p className="rw-empty">
          관심 있는 수요 2~3개를 선택해 인구·돈·행동과 남은 질문을 비교하세요.
        </p>
      )}
    </section>
  );
}
