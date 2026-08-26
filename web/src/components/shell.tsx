"use client";

import {
  BarChart3,
  BriefcaseBusiness,
  ChevronDown,
  Columns3,
  Compass,
  Database,
  FlaskConical,
  Lightbulb,
  Menu,
  PanelRightClose,
  PanelRightOpen,
  Search,
  ScanSearch,
  Shapes,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type FocusEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";

import { statusDisplayLabel } from "@/components/ui";

export type ShellDomain = {
  code: string;
  name: string;
  unit: string | null;
};

export type ShellLinkRecord = {
  id: string;
  name: string;
  status?: string | null;
};

type WorkbenchShellProps = {
  children: ReactNode;
  domains: ShellDomain[];
  savedSegments: ShellLinkRecord[];
  researchJobs: ShellLinkRecord[];
  dataVersion: string | null;
  dataAsOf: string | null;
};

type RecentPath = { href: string; label: string };
type RecentHistory = { domainCodes: string[]; segmentIds: string[]; paths: RecentPath[] };

export type GlobalSearchResult = {
  objectType: string;
  objectId: string;
  title: string;
  summary: string;
  entityUnit: string | null;
  routePath: string;
};

type GlobalSearchStatus = "idle" | "loading" | "ready" | "error";

const recentHistoryKey = "market-atlas:recent-history:v1";
const emptyRecentHistory: RecentHistory = { domainCodes: [], segmentIds: [], paths: [] };
let recentHistorySnapshot: RecentHistory | null = null;
const recentHistoryListeners = new Set<() => void>();
const globalSearchResultsId = "global-search-suggestions";
const globalSearchDelayMs = 250;

const globalSearchTypeLabels: Record<string, string> = {
  domain: "DOMAIN",
  axis: "AXIS",
  feature: "FEATURE",
  behavior: "BEHAVIOR",
  subtype: "SUBTYPE",
  archetype: "ARCHETYPE",
  estimate: "ESTIMATE",
  saved_segment: "SAVED SEGMENT",
  opportunity: "OPPORTUNITY",
};

const navigation = [
  { href: "/explore", label: "세그먼트 탐색", icon: Compass, flyout: true },
  { href: "/archetypes", label: "Archetype 탐색", icon: ScanSearch },
  { href: "/builder", label: "세그먼트 빌더", icon: Shapes },
  { href: "/sizing", label: "시장규모 분석", icon: BarChart3 },
  { href: "/compare", label: "비교", icon: Columns3 },
  { href: "/opportunities", label: "아이디어 보드", icon: Lightbulb },
  { href: "/research", label: "리서치 작업", icon: FlaskConical },
  { href: "/governance", label: "데이터 및 출처 관리", icon: Database },
];

const desktopRailQuery = "(min-width: 1251px)";

function subscribeDesktopRail(onStoreChange: () => void) {
  const media = window.matchMedia(desktopRailQuery);
  media.addEventListener("change", onStoreChange);
  return () => media.removeEventListener("change", onStoreChange);
}

function getDesktopRailSnapshot() {
  return window.matchMedia(desktopRailQuery).matches;
}

function getServerDesktopRailSnapshot() {
  return true;
}

const routeLabels: Record<string, string> = {
  explore: "세그먼트 탐색",
  axes: "분류축",
  segments: "세그먼트",
  subtypes: "Subtype",
  archetypes: "Archetype 탐색",
  builder: "세그먼트 빌더",
  sizing: "시장규모 분석",
  compare: "비교",
  opportunities: "아이디어 보드",
  research: "리서치 작업",
  jobs: "작업 상세",
  reviews: "검토",
  governance: "데이터 및 출처",
  sources: "출처",
  models: "모델",
  versions: "버전",
  audit: "감사 로그",
  search: "통합 검색",
};

const navigableBreadcrumbs = [
  /^\/explore(?:\/[^/]+(?:\/axes\/[^/]+)?)?$/u,
  /^\/archetypes(?:\/[^/]+)?$/u,
  /^\/builder(?:\/[^/]+)?$/u,
  /^\/sizing(?:\/[^/]+)?$/u,
  /^\/compare(?:\/[^/]+)?$/u,
  /^\/opportunities(?:\/[^/]+)?$/u,
  /^\/research(?:\/(?:jobs|reviews)\/[^/]+)?$/u,
  /^\/governance(?:\/(?:audit|sources\/[^/]+|models\/[^/]+|versions\/[^/]+))?$/u,
  /^\/segments\/subtypes\/[^/]+$/u,
  /^\/search$/u,
];

function breadcrumbExists(href: string): boolean {
  return navigableBreadcrumbs.some((pattern) => pattern.test(href));
}

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function readRecentHistory(): RecentHistory {
  try {
    const value = JSON.parse(window.localStorage.getItem(recentHistoryKey) ?? "null") as Partial<RecentHistory> | null;
    return {
      domainCodes: Array.isArray(value?.domainCodes) ? value.domainCodes.filter((item): item is string => typeof item === "string") : [],
      segmentIds: Array.isArray(value?.segmentIds) ? value.segmentIds.filter((item): item is string => typeof item === "string") : [],
      paths: Array.isArray(value?.paths) ? value.paths.flatMap((item) => item && typeof item.href === "string" && typeof item.label === "string" ? [item] : []) : [],
    };
  } catch {
    return emptyRecentHistory;
  }
}

function getRecentHistorySnapshot(): RecentHistory {
  recentHistorySnapshot ??= readRecentHistory();
  return recentHistorySnapshot;
}

function getServerRecentHistorySnapshot(): RecentHistory {
  return emptyRecentHistory;
}

function subscribeRecentHistory(listener: () => void): () => void {
  recentHistoryListeners.add(listener);
  const storageListener = (event: StorageEvent) => {
    if (event.key !== recentHistoryKey) return;
    recentHistorySnapshot = readRecentHistory();
    listener();
  };
  window.addEventListener("storage", storageListener);
  return () => {
    recentHistoryListeners.delete(listener);
    window.removeEventListener("storage", storageListener);
  };
}

function writeRecentHistory(next: RecentHistory): void {
  recentHistorySnapshot = next;
  try {
    window.localStorage.setItem(recentHistoryKey, JSON.stringify(next));
  } catch {
    // Browsing history is an optional local convenience; core navigation remains available.
  }
  recentHistoryListeners.forEach((listener) => listener());
}

function promote<T>(items: T[], item: T, limit: number): T[] {
  return [item, ...items.filter((candidate) => candidate !== item)].slice(0, limit);
}

function pathLabel(pathname: string, domains: ShellDomain[], savedSegments: ShellLinkRecord[]): string {
  const parts = pathname.split("/").filter(Boolean).map(decodeURIComponent);
  return parts.map((part, index) => {
    if (parts[0] === "explore" && index === 1) return domains.find((domain) => domain.code === part)?.name ?? part;
    if (parts[0] === "builder" && index === 1) return savedSegments.find((segment) => segment.id === part)?.name ?? part;
    return routeLabels[part] ?? part;
  }).join(" › ");
}

function Breadcrumbs({ pathname }: { pathname: string }) {
  const segments = pathname.split("/").filter(Boolean);
  return (
    <nav className="breadcrumbs" aria-label="현재 위치">
      <Link href="/explore">Market Atlas</Link>
      {segments.map((segment, index) => {
        const href = `/${segments.slice(0, index + 1).join("/")}`;
        const current = index === segments.length - 1;
        const decoded = decodeURIComponent(segment);
        const title = routeLabels[decoded] ?? decoded;
        return (
          <span key={href}>
            <span aria-hidden="true">/</span>
            {current ? <span aria-current="page">{title}</span> : breadcrumbExists(href) ? <Link href={href}>{title}</Link> : <span>{title}</span>}
          </span>
        );
      })}
    </nav>
  );
}

function DomainFlyout({
  domains,
  savedSegments,
  recentDomains,
  recentPaths,
  id,
  mobileCollapsed = false,
}: {
  domains: ShellDomain[];
  savedSegments: ShellLinkRecord[];
  recentDomains: ShellDomain[];
  recentPaths: RecentPath[];
  id?: string;
  mobileCollapsed?: boolean;
}) {
  const visibleDomains = domains.slice(0, 6);
  const visibleSaved = savedSegments.slice(0, 3);
  return (
    <div
      id={id}
      className="explorer-flyout"
      role="group"
      aria-label="세그먼트 탐색 세부 메뉴"
      aria-hidden={mobileCollapsed ? true : undefined}
      inert={mobileCollapsed ? true : undefined}
    >
      <div className="flyout-section">
        <p className="flyout-label">주요 DOMAIN</p>
        {visibleDomains.length ? (
          <div className="flyout-links">
            {visibleDomains.map((domain) => (
              <Link href={`/explore/${encodeURIComponent(domain.code)}`} key={domain.code}>
                <span>{domain.name}</span>
                <small>{domain.unit ?? "단위 미확인"}</small>
              </Link>
            ))}
          </div>
        ) : (
          <p className="flyout-empty">연결된 domain이 없습니다.</p>
        )}
      </div>
      <div className="flyout-section">
        <p className="flyout-label">최근 탐색 DOMAIN</p>
        {recentDomains.length ? (
          <div className="flyout-links">
            {recentDomains.slice(0, 4).map((domain) => (
              <Link href={`/explore/${encodeURIComponent(domain.code)}`} key={domain.code}>
                <span>{domain.name}</span>
                <small>{domain.unit ?? "단위 미확인"}</small>
              </Link>
            ))}
          </div>
        ) : <p className="flyout-empty">탐색 이력이 아직 없습니다.</p>}
      </div>
      <div className="flyout-section flyout-saved">
        <p className="flyout-label">저장된 세그먼트</p>
        {visibleSaved.length ? (
          visibleSaved.map((segment) => (
            <Link href={`/builder/${encodeURIComponent(segment.id)}`} key={segment.id}>
              {segment.name}
            </Link>
          ))
        ) : (
          <p className="flyout-empty">저장된 세그먼트가 없습니다.</p>
        )}
      </div>
      <div className="flyout-section flyout-saved">
        <p className="flyout-label">최근 탐색 경로</p>
        {recentPaths.length ? recentPaths.slice(0, 4).map((path) => (
          <Link href={path.href} key={path.href}>{path.label}</Link>
        )) : <p className="flyout-empty">최근 경로가 없습니다.</p>}
      </div>
      <Link href="/explore" className="flyout-all">
        전체 {domains.length.toLocaleString("ko-KR")}개 domain 탐색
      </Link>
    </div>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeGlobalSearchResults(value: unknown): GlobalSearchResult[] {
  if (!isRecord(value) || !Array.isArray(value.results)) return [];
  return value.results.flatMap((candidate) => {
    if (!isRecord(candidate)) return [];
    const { objectType, objectId, title, routePath } = candidate;
    if (
      typeof objectType !== "string" ||
      typeof objectId !== "string" ||
      typeof title !== "string" ||
      typeof routePath !== "string" ||
      !routePath.startsWith("/") ||
      routePath.startsWith("//")
    ) return [];
    return [{
      objectType,
      objectId,
      title,
      summary: typeof candidate.summary === "string" ? candidate.summary : "",
      entityUnit: typeof candidate.entityUnit === "string" ? candidate.entityUnit : null,
      routePath,
    }];
  });
}

function globalSearchStatusMessage(status: GlobalSearchStatus, query: string, resultCount: number): string {
  const trimmed = query.trim();
  if (!trimmed) return "검색어를 입력하면 등록된 데이터에서 바로 이동할 수 있는 결과를 보여줍니다.";
  if (trimmed.length < 2) return "검색어를 2글자 이상 입력하세요.";
  if (status === "loading") return `“${trimmed}” 검색 중…`;
  if (status === "error") return "검색 결과를 불러오지 못했습니다. 전체 검색을 이용해 다시 시도하세요.";
  if (status === "ready" && resultCount === 0) return `“${trimmed}”과 일치하는 결과가 없습니다.`;
  if (status === "ready") return `${resultCount.toLocaleString("ko-KR")}개의 바로 가기 결과가 있습니다.`;
  return "검색어를 입력하세요.";
}

export function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  const [status, setStatus] = useState<GlobalSearchStatus>("idle");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) return;

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch(`/api/search?q=${encodeURIComponent(term)}&limit=8`, {
            signal: controller.signal,
            headers: { Accept: "application/json" },
          });
          if (!response.ok) throw new Error(`global_search_${response.status}`);
          const payload: unknown = await response.json();
          if (controller.signal.aborted) return;
          setResults(normalizeGlobalSearchResults(payload));
          setStatus("ready");
        } catch {
          if (controller.signal.aborted) return;
          setResults([]);
          setStatus("error");
        }
      })();
    }, globalSearchDelayMs);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    setOpen(true);
    setResults([]);
    setStatus(value.trim().length >= 2 ? "loading" : "idle");
  };

  const handleBlur = (event: FocusEvent<HTMLFormElement>) => {
    const nextTarget = event.relatedTarget;
    if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) setOpen(false);
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLFormElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      inputRef.current?.focus();
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown" && event.target === inputRef.current && open && results.length) {
      event.preventDefault();
      resultPanelRef.current?.querySelector<HTMLAnchorElement>("a")?.focus();
    }
  };

  const statusMessage = globalSearchStatusMessage(status, query, results.length);

  return (
    <form
      className="global-search"
      action="/search"
      method="get"
      role="search"
      aria-label="전체 데이터 검색"
      onBlur={handleBlur}
      onFocus={() => setOpen(true)}
      onKeyDown={handleKeyDown}
      onSubmit={() => setOpen(false)}
    >
      <Search aria-hidden="true" />
      <label className="sr-only" htmlFor="global-search-input">
        전체 데이터 검색
      </label>
      <input
        ref={inputRef}
        id="global-search-input"
        name="q"
        type="search"
        role="combobox"
        autoComplete="off"
        placeholder="찾고 싶은 시장, 세그먼트 또는 조건 검색"
        value={query}
        aria-controls={globalSearchResultsId}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-describedby="global-search-live-status"
        onChange={(event) => handleQueryChange(event.currentTarget.value)}
        onClick={() => setOpen(true)}
      />
      <button type="submit">검색</button>
      <div
        ref={resultPanelRef}
        id={globalSearchResultsId}
        className="global-search-results"
        role="dialog"
        aria-label="검색 바로 가기"
        hidden={!open}
      >
        <p
          id="global-search-live-status"
          className="global-search-status"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {statusMessage}
        </p>
        {status === "ready" && results.length ? (
          <ul className="global-search-result-list">
            {results.map((result) => (
              <li key={`${result.objectType}:${result.objectId}`}>
                <Link
                  className="global-search-result"
                  href={result.routePath}
                  aria-label={`${globalSearchTypeLabels[result.objectType] ?? result.objectType} ${result.title} 바로 열기`}
                  onClick={() => setOpen(false)}
                >
                  <span className="global-search-result-meta">
                    <small className="global-search-result-kind">{globalSearchTypeLabels[result.objectType] ?? result.objectType.toUpperCase()}</small>
                    {result.entityUnit ? <small>{result.entityUnit}</small> : null}
                  </span>
                  <span className="global-search-result-copy">
                    <strong>{result.title}</strong>
                    <small>{result.summary || result.objectId}</small>
                  </span>
                  <span className="global-search-result-action" aria-hidden="true">바로 열기</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
        {query.trim().length >= 2 ? (
          <Link className="global-search-all" href={`/search?q=${encodeURIComponent(query.trim())}`} onClick={() => setOpen(false)}>
            전체 검색 결과 보기
          </Link>
        ) : null}
      </div>
    </form>
  );
}

export function WorkbenchShell({
  children,
  domains,
  savedSegments,
  researchJobs,
  dataVersion,
  dataAsOf,
}: WorkbenchShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileExplorerOpen, setMobileExplorerOpen] = useState(false);
  const desktopRailOpen = useSyncExternalStore(
    subscribeDesktopRail,
    getDesktopRailSnapshot,
    getServerDesktopRailSnapshot,
  );
  const [railPreference, setRailPreference] = useState<boolean | null>(null);
  const recentHistory = useSyncExternalStore(
    subscribeRecentHistory,
    getRecentHistorySnapshot,
    getServerRecentHistorySnapshot,
  );
  const railOpen = railPreference ?? desktopRailOpen;
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);
  const mobileCloseButtonRef = useRef<HTMLButtonElement>(null);
  const mobileNavigationRef = useRef<HTMLElement>(null);
  const activeJobs = researchJobs.filter((job) => ["queued", "running", "needs_review"].includes(job.status ?? ""));
  const recentDomains = recentHistory.domainCodes.flatMap((code) => {
    const domain = domains.find((candidate) => candidate.code === code);
    return domain ? [domain] : [];
  });
  const recentSegments = recentHistory.segmentIds.flatMap((id) => {
    const segment = savedSegments.find((candidate) => candidate.id === id);
    return segment ? [segment] : [];
  });

  const openMobileNavigation = useCallback(() => {
    setMobileExplorerOpen(false);
    setMobileOpen(true);
  }, []);

  const closeMobileNavigation = useCallback(() => {
    setMobileExplorerOpen(false);
    setMobileOpen(false);
  }, []);

  useEffect(() => {
    const parts = pathname.split("/").filter(Boolean).map(decodeURIComponent);
    const current = getRecentHistorySnapshot();
    const domainCode = parts[0] === "explore" && parts[1] && domains.some((domain) => domain.code === parts[1]) ? parts[1] : null;
    const segmentId = parts[0] === "builder" && parts[1] && savedSegments.some((segment) => segment.id === parts[1]) ? parts[1] : null;
    const path = { href: pathname, label: pathLabel(pathname, domains, savedSegments) || "Market Atlas" };
    const next = {
      domainCodes: domainCode ? promote(current.domainCodes, domainCode, 6) : current.domainCodes,
      segmentIds: segmentId ? promote(current.segmentIds, segmentId, 6) : current.segmentIds,
      paths: [path, ...current.paths.filter((candidate) => candidate.href !== pathname)].slice(0, 8),
    };
    writeRecentHistory(next);
  }, [domains, pathname, savedSegments]);

  useEffect(() => {
    if (!mobileOpen) return;
    const menuButton = mobileMenuButtonRef.current;
    mobileCloseButtonRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMobileNavigation();
      if (event.key !== "Tab") return;
      const focusable = [...(mobileNavigationRef.current?.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
      ) ?? [])].filter((element) => !element.hasAttribute("hidden") && !element.closest("[inert]"));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      menuButton?.focus();
    };
  }, [closeMobileNavigation, mobileOpen]);

  return (
    <div className={`workbench-shell ${railOpen ? "rail-visible" : ""}`}>
      <a href="#main-content" className="skip-link">
        본문으로 건너뛰기
      </a>
      <aside ref={mobileNavigationRef} id="primary-side-navigation" className={`side-navigation ${mobileOpen ? "mobile-open" : ""}`}>
        <div className="brand-lockup">
          <span className="brand-mark">MA</span>
          <span>
            <strong>MARKET ATLAS</strong>
            <small>Population Intelligence</small>
          </span>
          <button ref={mobileCloseButtonRef} className="mobile-nav-close" type="button" onClick={closeMobileNavigation} aria-label="메뉴 닫기">
            <X aria-hidden="true" />
          </button>
        </div>
        <nav className="primary-navigation" aria-label="주요 메뉴">
          {navigation.map((item) => {
            const Icon = item.icon;
            return (
              <div className={`navigation-item ${item.flyout ? "has-flyout" : ""} ${item.flyout && mobileExplorerOpen ? "mobile-flyout-open" : ""}`} key={item.href}>
                <Link
                  href={item.href}
                  className={isActive(pathname, item.href) ? "active" : ""}
                  aria-label={item.label}
                  aria-current={isActive(pathname, item.href) ? "page" : undefined}
                  onClick={closeMobileNavigation}
                >
                  <Icon aria-hidden="true" />
                  <span>{item.label}</span>
                  {item.flyout ? <ChevronDown className="nav-chevron" aria-hidden="true" /> : null}
                </Link>
                {item.flyout ? (
                  <>
                    <button
                      className="mobile-explorer-toggle"
                      type="button"
                      aria-label={`세그먼트 탐색 세부 메뉴 ${mobileExplorerOpen ? "닫기" : "열기"}`}
                      aria-controls="mobile-explorer-flyout"
                      aria-expanded={mobileExplorerOpen}
                      onClick={() => setMobileExplorerOpen((current) => !current)}
                    >
                      <ChevronDown aria-hidden="true" />
                    </button>
                    <DomainFlyout
                      id="mobile-explorer-flyout"
                      domains={domains}
                      savedSegments={savedSegments}
                      recentDomains={recentDomains}
                      recentPaths={recentHistory.paths}
                      mobileCollapsed={mobileOpen && !mobileExplorerOpen}
                    />
                  </>
                ) : null}
              </div>
            );
          })}
        </nav>
        <div className="nav-metadata">
          <span>PRODUCTION BASELINE</span>
          <strong>{dataVersion ?? "버전 미확인"}</strong>
          <small>{dataAsOf ? `DATA AS OF · ${dataAsOf}` : "기준시점 미확인"}</small>
        </div>
      </aside>

      <div className="main-column" inert={mobileOpen ? true : undefined}>
        <header className="global-header">
          <button ref={mobileMenuButtonRef} className="mobile-menu-button" type="button" onClick={openMobileNavigation} aria-label="메뉴 열기" aria-controls="primary-side-navigation" aria-expanded={mobileOpen}>
            <Menu aria-hidden="true" />
          </button>
          <GlobalSearch />
          <Link className="header-work-link" href="/opportunities">
            <BriefcaseBusiness aria-hidden="true" />
            <span>내 작업</span>
          </Link>
          <button
            type="button"
            className="rail-toggle"
            aria-label={railOpen ? "컨텍스트 패널 닫기" : "컨텍스트 패널 열기"}
            aria-expanded={railOpen}
            aria-controls="workbench-context-rail"
            onClick={() => setRailPreference(!railOpen)}
          >
            {railOpen ? <PanelRightClose aria-hidden="true" /> : <PanelRightOpen aria-hidden="true" />}
          </button>
        </header>
        <Breadcrumbs pathname={pathname} />
        <main id="main-content" tabIndex={-1} className="route-content">
          {children}
        </main>
      </div>

      <aside id="workbench-context-rail" className="context-rail" aria-label="작업 컨텍스트" aria-hidden={!railOpen} inert={!railOpen ? true : undefined}>
        <section>
          <div className="context-rail-heading">
            <span>RESEARCH STATUS</span>
            <strong>{activeJobs.length ? `${activeJobs.length}건 진행 중` : "대기 작업 없음"}</strong>
          </div>
          {activeJobs.length ? (
            <div className="context-list">
              {activeJobs.slice(0, 4).map((job) => (
                <Link href={`/research/jobs/${encodeURIComponent(job.id)}`} key={job.id}>
                  <span>{job.name}</span>
                  <small>{statusDisplayLabel(job.status ?? null)}</small>
                </Link>
              ))}
            </div>
          ) : (
            <p className="context-empty">새 근거가 필요할 때 리서치 작업을 등록할 수 있습니다.</p>
          )}
          <Link href="/research" className="context-link">리서치 작업 보기</Link>
        </section>
        <section>
          <div className="context-rail-heading">
            <span>RECENT SEGMENTS</span>
            <strong>{recentSegments.length ? `${recentSegments.length}건` : "기록 없음"}</strong>
          </div>
          {recentSegments.length ? (
            <div className="context-list">
              {recentSegments.slice(0, 5).map((segment) => (
                <Link href={`/builder/${encodeURIComponent(segment.id)}`} key={segment.id}>
                  <span>{segment.name}</span>
                  <small>최근 조회</small>
                </Link>
              ))}
            </div>
          ) : (
            <p className="context-empty">저장된 세그먼트를 열면 최근 조회 목록에 표시됩니다.</p>
          )}
        </section>
        <section>
          <div className="context-rail-heading">
            <span>SAVED SEGMENTS</span>
            <strong>{savedSegments.length ? `${savedSegments.length}건` : "저장 없음"}</strong>
          </div>
          {savedSegments.length ? (
            <div className="context-list">
              {savedSegments.slice(0, 5).map((segment) => (
                <Link href={`/builder/${encodeURIComponent(segment.id)}`} key={segment.id}>
                  <span>{segment.name}</span>
                  <small>{statusDisplayLabel(segment.status ?? "saved")}</small>
                </Link>
              ))}
            </div>
          ) : (
            <p className="context-empty">빌더에서 정의한 세그먼트가 여기에 표시됩니다.</p>
          )}
        </section>
        <section className="context-baseline">
          <div className="context-rail-heading">
            <span>BASELINE</span>
            <strong>{dataVersion ?? "미확인"}</strong>
          </div>
          <p>Baseline, 사용자 시나리오, 제안 수정값은 서로 분리됩니다.</p>
          <Link href="/governance" className="context-link">버전과 출처 확인</Link>
        </section>
      </aside>
      {mobileOpen ? <button type="button" className="mobile-scrim" aria-label="메뉴 닫기" onClick={closeMobileNavigation} /> : null}
    </div>
  );
}
