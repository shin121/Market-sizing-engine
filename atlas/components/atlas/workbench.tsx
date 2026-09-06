'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import {
  Search,
  Network,
  Grid2X2,
  ChartScatter,
  Compass,
  Database,
  Layers3,
  ArrowUpRight,
  X,
} from 'lucide-react';
import {
  contextHref,
  KIND_NAMES,
  population,
  type AtlasPayload,
  type AtlasEntity,
} from '@/lib/atlas';
import { orderedConditions } from '@/lib/discovery';
import { href, segmentEntity } from './common';
import { MoneyControls } from './money';
import { formatKRW, type MarketValueEstimate } from '@/lib/market-value';
import { EntityDashboard } from './entity';
import { Relationship, Matrix, Opportunity } from './analysis-views';
import {
  MarketDiscovery,
  SegmentProfile,
  FocusMetrics,
  SegmentBuilder,
  ConditionTrail,
} from './discovery-profile';
import { WorkspaceActions, WorkspaceLinks } from './workspace';
import {
  CompareWorkspace,
  IdeasWorkspace,
  SourcesWorkspace,
} from './decision-workspace';
type SearchResult = AtlasEntity & {
  population?: number;
  marketValue?: MarketValueEstimate;
};
export function AtlasWorkbench({ data }: { data: AtlasPayload }) {
  const c = data.context,
    p = data.profile;
  const router = useRouter(),
    pathname = usePathname(),
    params = useSearchParams();
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(''),
    [results, setResults] = useState<SearchResult[]>([]),
    [searchOpen, setSearchOpen] = useState(false),
    [searchPending, setSearchPending] = useState(false),
    [searchError, setSearchError] = useState(false);
  useEffect(() => {
    if (!query.trim()) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch('/api/atlas/search?q=' + encodeURIComponent(query), {
        signal: controller.signal,
      })
        .then((r) => {
          if (!r.ok) throw Error('search');
          return r.json();
        })
        .then((body) => {
          setResults(body.results);
          setSearchError(false);
          setSearchPending(false);
        })
        .catch((e) => {
          if (e.name !== 'AbortError') {
            setSearchError(true);
            setSearchPending(false);
          }
        });
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        input.current?.focus();
        setSearchOpen(true);
      }
      if (e.key === 'Escape') setSearchOpen(false);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  const analysis = [
    { view: 'relationship', label: '관계 탐색', icon: Network },
    { view: 'matrix', label: '교차분석', icon: Grid2X2 },
    { view: 'opportunity', label: '기회 탐색기', icon: ChartScatter },
  ] as const;
  const titles: Record<string, string> = {
    overview: '시장 탐색',
    entity: data.conditions.some((e) => e.kind === 'interest')
      ? data.conditions
          .filter((e) => e.kind === 'interest')
          .map((e) => e.label)
          .join(' · ')
      : p.summary.entity.label,
    relationship: '관계 탐색',
    matrix: '교차분석',
    opportunity: '기회 탐색기',
    compare: '세그먼트 비교',
    ideas: '아이디어 보드',
    sources: '데이터·산출 근거',
  };
  const workspaceView = ['compare', 'ideas', 'sources'].includes(c.view);
  const changeTab = (tab: string) => {
    const q = new URLSearchParams(params.toString());
    q.set('tab', tab);
    router.push(pathname + '?' + q, { scroll: false });
  };
  const profileUrl = c.ids.length ? href(segmentEntity(c.ids), c) : '/atlas';
  return (
    <div className={'atlas-shell os-shell view-' + c.view}>
      <a className="skip-link" href="#analysis-main">
        분석 내용으로 이동
      </a>
      <aside className="atlas-sidebar" aria-label="Atlas 탐색 메뉴">
        <Link href="/atlas" className="brand">
          <span>ϟ</span>Market <b>Atlas</b>
        </Link>
        <div className="sidebar-label">탐색</div>
        <nav aria-label="주요 탐색 화면">
          <Link href="/atlas" className={c.view === 'overview' ? 'active' : ''}>
            <Compass size={18} />
            시장 탐색
          </Link>
          <Link
            href={profileUrl}
            className={c.view === 'entity' ? 'active' : ''}
          >
            <Layers3 size={18} />
            세그먼트 프로필
          </Link>
          <WorkspaceLinks context={c} />
        </nav>
        <div className="sidebar-label">분석</div>
        <nav aria-label="분석 도구">
          {analysis.map(({ view, label, icon: Icon }) => (
            <Link
              key={view}
              className={c.view === view ? 'active' : ''}
              href={contextHref(view, c.ids, c)}
              prefetch={false}
            >
              <Icon size={18} />
              {label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-label">데이터</div>
        <nav>
          <Link
            href={contextHref('sources', c.ids, c)}
            className={c.view === 'sources' ? 'active' : ''}
          >
            <Database size={18} />
            데이터·산출 근거
          </Link>
        </nav>
        <div className="sidebar-label">시장 바로가기</div>
        <nav className="market-nav" aria-label="산업 탐색">
          {data.navigation
            .filter((e) => e.kind === 'market')
            .map((e) => (
              <Link
                key={e.id}
                href={href(e, c)}
                className={c.ids.includes(e.id) ? 'market-active' : ''}
              >
                <span className="market-dot" />
                {e.label}
              </Link>
            ))}
        </nav>
        <div className="os-sidebar-foot">
          <span className="avatar-mark">MA</span>
          <div>
            <b>Opportunity workspace</b>
            <small>한국 소비자 · 모델 추정</small>
          </div>
        </div>
      </aside>
      <div className="atlas-body">
        <header className="global-header">
          <div className="global-search">
            <Search size={16} />
            <input
              ref={input}
              aria-label="시장·관심·조건 검색"
              placeholder="시장, 관심 영역, 생활 조건 검색"
              value={query}
              onFocus={() => setSearchOpen(true)}
              onChange={(e) => {
                setQuery(e.target.value);
                setResults([]);
                setSearchError(false);
                setSearchPending(!!e.target.value.trim());
                setSearchOpen(true);
              }}
            />
            <kbd>⌘ K</kbd>
            {searchOpen && query.trim() && (
              <div className="search-results">
                <div className="search-heading">
                  <span>시장과 관심에서 탐색을 시작하세요</span>
                  <button
                    aria-label="검색 닫기"
                    onClick={() => setSearchOpen(false)}
                  >
                    <X size={14} />
                  </button>
                </div>
                {results.map((e) => (
                  <Link
                    key={e.id}
                    href={href(e, {
                      ...c,
                      moneyScope: e.marketValue?.scopeId ?? 'covered',
                    })}
                    onClick={() => {
                      setSearchOpen(false);
                      setQuery('');
                    }}
                  >
                    <span>
                      <b>{e.label}</b>
                      <small>
                        {KIND_NAMES[e.kind]} ·{' '}
                        {e.population !== undefined
                          ? population(e.population)
                          : ''}{' '}
                        ·{' '}
                        {e.marketValue?.base != null
                          ? formatKRW(e.marketValue.base) +
                            ' / 년 · ' +
                            e.marketValue.scopeLabel
                          : '지출 기준 미확보'}
                      </small>
                    </span>
                    <ArrowUpRight size={14} />
                  </Link>
                ))}
                {!results.length && (
                  <p>
                    {searchPending
                      ? '검색 중…'
                      : searchError
                        ? '검색을 불러오지 못했습니다. 다시 입력해 주세요.'
                        : '일치하는 조건이 없습니다. 맞벌이·소득·비이용 여부는 현재 데이터로 확인할 수 없습니다. 연령·가구·관심 조건으로 탐색해 보세요.'}
                  </p>
                )}
              </div>
            )}
          </div>
          <span className="header-meta">
            KOREA CONSUMER INTELLIGENCE <span>Population × Economic value</span>
          </span>
        </header>
        <main id="analysis-main">
          <ConditionTrail data={data} />
          <div className="entity-heading">
            <div>
              <h1>{titles[c.view]}</h1>
              <p>
                {c.view === 'overview'
                  ? '시장과 관심 영역에서 출발해 다음 사업 가설을 발견하세요.'
                  : c.view === 'compare'
                    ? '후보의 규모·소비·행동·근거를 같은 기준으로 비교하세요.'
                    : c.view === 'ideas'
                      ? '관심 집단을 사업 가설로 바꾸고, 다음 검증을 기록하세요.'
                      : c.view === 'sources'
                        ? '추정값의 범위와 추가로 필요한 데이터를 확인하세요.'
                        : orderedConditions(data.conditions)
                            .map((e) => KIND_NAMES[e.kind])
                            .join(' › ') + ' · 현재 집단 안에서 탐색'}
              </p>
            </div>
            {!workspaceView && c.ids.length > 0 && (
              <WorkspaceActions
                key={c.ids.join('~') + c.moneyScope}
                summary={p.summary}
                context={c}
              />
            )}
          </div>
          {!workspaceView && c.ids.length > 0 && (
            <>
              <div className="context-bar">
                <b>선택한 조건</b>
                {orderedConditions(data.conditions).map((e) => (
                  <span key={e.id}>
                    {e.label}
                    <Link
                      aria-label={`${e.label} 조건 제거`}
                      href={href(
                        segmentEntity(c.ids.filter((id) => id !== e.id)),
                        c,
                      )}
                    >
                      <X size={11} />
                    </Link>
                  </span>
                ))}
              </div>
              <SegmentBuilder data={data} />
            </>
          )}
          {!workspaceView && <MoneyControls data={data} />}
          {!workspaceView && c.view !== 'overview' && (
            <FocusMetrics profile={p} />
          )}
          {c.view === 'entity' && (
            <div className="profile-tabbar">
              <button
                className={c.tab === 'profile' ? 'active' : ''}
                onClick={() => changeTab('profile')}
              >
                세그먼트 프로필
              </button>
              <button
                className={c.tab === 'data' ? 'active' : ''}
                onClick={() => changeTab('data')}
              >
                집계 데이터
              </button>
              {analysis.map((a) => (
                <Link key={a.view} href={contextHref(a.view, c.ids, c)}>
                  {a.label} ↗
                </Link>
              ))}
            </div>
          )}
          {c.view === 'overview' ? (
            <MarketDiscovery data={data} />
          ) : c.view === 'entity' ? (
            c.tab === 'data' ? (
              <EntityDashboard data={data} />
            ) : (
              <SegmentProfile key={c.ids.join('~')} data={data} />
            )
          ) : c.view === 'relationship' ? (
            <Relationship data={data} />
          ) : c.view === 'matrix' ? (
            <Matrix data={data} />
          ) : c.view === 'opportunity' ? (
            <Opportunity data={data} />
          ) : c.view === 'compare' ? (
            <CompareWorkspace />
          ) : c.view === 'ideas' ? (
            <IdeasWorkspace />
          ) : (
            <SourcesWorkspace data={data} />
          )}
          <footer className="atlas-footer">
            <span>Market Atlas · 시장에서 관심으로, 관심에서 사업 가설로</span>
            <span>
              합성 프로필·외부 기준 배분 · 실제 매출이나 구매자 조사 아님
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
