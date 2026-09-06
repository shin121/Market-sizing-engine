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
  ArrowLeft,
  ChevronRight,
  X,
  ArrowUpRight,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  contextHref,
  KIND_NAMES,
  pct,
  type AtlasPayload,
  type AtlasEntity,
  type AtlasView,
} from '@/lib/atlas';
import { Entry, href, segmentEntity, PopulationStrip } from './common';
import { Overview } from './overview';
import { MoneyControls, MoneyMetrics } from './money';
import { formatKRW, type MarketValueEstimate } from '@/lib/market-value';
import { shortPopulation } from '@/lib/atlas';
type SearchResult = AtlasEntity & {
  population?: number;
  marketValue?: MarketValueEstimate;
};
import { EntityDashboard } from './entity';
import { Relationship, Matrix, Opportunity } from './analysis-views';
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
    [searchError, setSearchError] = useState(false),
    [searchPending, setSearchPending] = useState(false);
  useEffect(() => {
    if (!query.trim()) return;
    const controller = new AbortController(),
      timer = setTimeout(() => {
        fetch(
          '/api/atlas/search?q=' +
            encodeURIComponent(query) +
            '&spend=' +
            encodeURIComponent(c.moneyScope),
          {
            signal: controller.signal,
          },
        )
          .then((r) => {
            if (!r.ok) throw Error('search');
            return r.json();
          })
          .then((body) => {
            setResults((body as { results: SearchResult[] }).results);
            setSearchError(false);
            setSearchPending(false);
          })
          .catch((error) => {
            if (error.name !== 'AbortError') {
              setSearchError(true);
              setSearchPending(false);
            }
          });
      }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, c.moneyScope]);
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
  const navigation = [
    { view: 'overview', label: '전체 시장', icon: Compass },
    { view: 'relationship', label: '관계 탐색', icon: Network },
    { view: 'matrix', label: '교차분석', icon: Grid2X2 },
    { view: 'opportunity', label: '기회지도', icon: ChartScatter },
  ] as const;
  const changeTab = (tab: 'profile' | 'data') => {
    const q = new URLSearchParams(params.toString());
    if (tab === 'data') q.set('tab', 'data');
    else q.delete('tab');
    router.push(pathname + (q.size ? '?' + q.toString() : ''), {
      scroll: false,
    });
  };
  const title =
    c.view === 'overview'
      ? '한국 소비자 시장을 한눈에'
      : c.view === 'entity'
        ? p.summary.entity.label
        : (
            {
              relationship: '관계 탐색',
              matrix: '교차분석',
              opportunity: '기회지도',
            } as Record<string, string>
          )[c.view];
  const description =
    c.view === 'overview'
      ? `${data.universe.archetypes}개 소비 유형과 ${data.universe.markets}개 산업을 연결해 사업 후보를 발견하세요.`
      : c.view === 'entity'
        ? (p.summary.entity.description ??
          `${KIND_NAMES[p.summary.entity.kind]}의 인구 구성, 소비 행동과 연결 시장을 탐색합니다.`)
        : p.summary.entity.label;
  return (
    <div className="atlas-shell">
      <a className="skip-link" href="#analysis-main">
        분석 내용으로 이동
      </a>
      <aside className="atlas-sidebar" aria-label="Atlas 탐색 메뉴">
        <Link href="/atlas" className="brand">
          <span>▧</span> Market <b>Atlas</b>
        </Link>
        <div className="sidebar-label">DISCOVER</div>
        <nav aria-label="주요 분석 화면">
          {navigation.map(({ view, label, icon: Icon }) => (
            <Link
              key={view}
              prefetch={false}
              className={c.view === view ? 'active' : ''}
              href={contextHref(
                view as AtlasView,
                view === 'overview'
                  ? []
                  : view === 'relationship' && !c.ids.length
                    ? data.radar[1].items[0].ids
                    : c.ids,
                c,
              )}
            >
              <Icon size={17} />
              {label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-label">EXPLORE MARKETS</div>
        <nav className="market-nav" aria-label="산업 탐색">
          {data.navigation
            .filter((e) => e.kind === 'market')
            .map((e) => (
              <Entry
                key={e.id}
                entity={e}
                context={c}
                className={c.ids.includes(e.id) ? 'market-active' : ''}
              >
                <span className="market-dot" />
                {e.label}
              </Entry>
            ))}
        </nav>
        <div className="sidebar-universe">
          <span>UNIVERSE SNAPSHOT</span>
          <b>
            4,410만 <small>명</small>
          </b>
          <p>
            대한민국 · 20세 이상
            <br />
            2024.11 인구 기준
          </p>
          <div>
            <strong>{data.universe.sourceRows.toLocaleString()}</strong> 합성
            페르소나
          </div>
          <div>
            <strong>{pct(data.universe.coverageShare, 0)}</strong> 유형 포괄
            비중
          </div>
          <small>
            추정 인구 · 개인 단위
            <br />
            산업과 유형 간 중복 가능
          </small>
        </div>
      </aside>
      <div className="atlas-body">
        <header className="global-header">
          <div className="global-search">
            <Search size={16} />
            <Input
              ref={input}
              aria-label="유형, 산업, 신호, 세그먼트 검색"
              placeholder="유형, 산업, 소비 행동을 검색하세요"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSearchPending(Boolean(e.target.value.trim()));
                setSearchError(false);
                setResults([]);
                setSearchOpen(true);
              }}
              onFocus={() => setSearchOpen(true)}
            />
            <kbd>⌘ K</kbd>
            {searchOpen && query.trim() && (
              <div className="search-results">
                <div className="search-heading">
                  전체 탐색 · {results.length}개 결과
                  <button
                    onClick={() => setSearchOpen(false)}
                    aria-label="검색 결과 닫기"
                  >
                    <X size={14} />
                  </button>
                </div>
                {results.map((e) => (
                  <Link
                    prefetch={false}
                    key={e.id}
                    href={href(e, c)}
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
                          ? shortPopulation(e.population) + '명'
                          : ''}
                        {e.marketValue?.base !== null &&
                        e.marketValue?.base !== undefined
                          ? ' · ' +
                            formatKRW(e.marketValue.base, false) +
                            ' / 년 (' +
                            e.marketValue.scopeLabel +
                            ')'
                          : ' · 지출 기준 미확보'}
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
                        : '검색 결과가 없습니다. 가격, 구독, 수집 같은 표현도 사용해 보세요.'}
                  </p>
                )}
              </div>
            )}
          </div>
          <div className="header-meta">
            KOREA CONSUMER INTELLIGENCE<span>Nemotron-derived</span>
          </div>
        </header>
        <main id="analysis-main">
          <nav className="breadcrumbs" aria-label="탐색 경로">
            <button
              onClick={() => router.back()}
              aria-label="이전 탐색으로 돌아가기"
            >
              <ArrowLeft size={14} />
            </button>
            <Link href="/atlas">전체 시장</Link>
            {data.breadcrumbs.map((e, i) => (
              <span key={e.id + '-' + i}>
                <ChevronRight size={12} />
                <Entry
                  entity={e}
                  context={{ ...c, trail: c.trail.slice(0, i), ids: [] }}
                />
              </span>
            ))}
            {c.view !== 'overview' && (
              <span>
                <ChevronRight size={12} />
                {c.view === 'entity'
                  ? KIND_NAMES[p.summary.entity.kind]
                  : title}
              </span>
            )}
          </nav>
          <div className="entity-heading">
            <div>
              <h1>{title}</h1>
              <p>{description}</p>
            </div>
            {c.view === 'entity' && (
              <div className="entity-actions">
                <button
                  className={c.tab === 'profile' ? 'active' : ''}
                  onClick={() => changeTab('profile')}
                >
                  프로필
                </button>
                <button
                  className={c.tab === 'data' ? 'active' : ''}
                  onClick={() => changeTab('data')}
                >
                  집계 데이터
                </button>
                <Link
                  prefetch={false}
                  href={contextHref('opportunity', c.ids, c)}
                >
                  기회지도 ↗
                </Link>
              </div>
            )}
          </div>
          {c.ids.length > 0 && (
            <div className="context-bar">
              <b>현재 조건</b>
              {data.conditions.map((e) => (
                <span key={e.id}>
                  <Entry entity={e} context={c} />
                  <Link
                    prefetch={false}
                    href={href(
                      segmentEntity(c.ids.filter((id) => id !== e.id)),
                      c,
                    )}
                    aria-label={`${e.label} 조건 제거`}
                  >
                    <X size={11} />
                  </Link>
                </span>
              ))}
              <small>AND · {c.ids.length}/8</small>
              <div className="context-views">
                {navigation
                  .filter((n) => n.view !== 'overview')
                  .map((n) => (
                    <Link
                      prefetch={false}
                      key={n.view}
                      href={contextHref(n.view, c.ids, c)}
                    >
                      {n.label}
                    </Link>
                  ))}
              </div>
            </div>
          )}
          <MoneyControls data={data} />
          {c.view === 'overview' ? (
            <div className="population-strip global-strip">
              <div className="metric-main">
                <span>대한민국 20세 이상</span>
                <strong>
                  4,410만<small> 명</small>
                </strong>
                <small>2024.11 인구 기준</small>
              </div>
              <div>
                <span>소비 유형</span>
                <strong>
                  {data.universe.archetypes}
                  <small> 개</small>
                </strong>
                <small>중복 소속 가능한 소비 메커니즘</small>
              </div>
              <div>
                <span>산업·시장</span>
                <strong>
                  {data.universe.markets}
                  <small> 개</small>
                </strong>
                <small>유형과 구분된 산업 Lens</small>
              </div>
              <MoneyMetrics value={data.money?.summary} />
            </div>
          ) : (
            <PopulationStrip summary={p.summary} />
          )}
          {c.view === 'overview' ? (
            <Overview data={data} />
          ) : c.view === 'entity' ? (
            <EntityDashboard data={data} />
          ) : c.view === 'relationship' ? (
            <Relationship data={data} />
          ) : c.view === 'matrix' ? (
            <Matrix data={data} />
          ) : (
            <Opportunity data={data} />
          )}
          <footer className="atlas-footer">
            <span>Nemotron Market Atlas · 인구와 소비액에서 사업 후보까지</span>
            <span>합성 소비자 서술 · 인구 추정 · 실제 매출·시계열 없음</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
