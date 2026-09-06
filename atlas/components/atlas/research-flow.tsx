'use client';
import Link from 'next/link';
import { useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowUpRight,
  ChevronRight,
  Compass,
  Network,
  Grid2X2,
  ChartScatter,
  Database,
  SlidersHorizontal,
  Bookmark,
  Check,
  ArrowLeft,
  Maximize2,
  Info,
} from 'lucide-react';
import type {
  ResearchExplorerPayload,
  ResearchProfile,
} from '@/lib/research-explorer';
import { researchHref } from '@/lib/research-explorer';
import { candidateKey, researchWorkspaceHref } from '@/lib/research-workspace';
import {
  formatKRW,
  SPEND_METHOD_LABELS,
  unitLabel,
  type MoneyMetric,
} from '@/lib/market-value';
import {
  ResearchIdeas,
  readResearchIdeas,
  researchIdeasKey,
} from './research-ideas';

function people(p: ResearchProfile, range: 'base' | 'low' | 'high' = 'base') {
  if (p.estimate.status !== 'estimated')
    return p.estimate.reason === 'outside_scope'
      ? '조사 대상 밖'
      : '근거 연결 중';
  const n = p.estimate[range],
    unit = p.estimate.unit === 'household' ? '가구' : '명';
  return (
    (n >= 10000
      ? (n / 10000).toLocaleString('ko-KR', {
          maximumFractionDigits: n >= 1e6 ? 0 : 1,
        }) + '만'
      : Math.round(n / 100) * 100) + unit
  );
}
const percent = (n: number) => (n * 100).toFixed(1) + '%';
const colors = ['#078a78', '#7e51dd', '#3379cb', '#d99940'];
export function ResearchFlow({
  data,
  node,
  age,
  compare = [],
  metric = 'population',
}: {
  data: ResearchExplorerPayload;
  node: string;
  age: string;
  compare?: string[];
  metric?: MoneyMetric;
}) {
  const router = useRouter();
  const [ranges, setRanges] = useState(true),
    [showFacts, setShowFacts] = useState(false),
    [saved, setSaved] = useState(false),
    [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const branch =
    data.branches.find((b) => b.id === node.split('~')[0]) ?? data.branches[0];
  const selected =
    node === data.root.id
      ? data.root
      : (branch?.children.find((p) => p.id === node) ??
        branch?.profile ??
        data.root);
  const selectedProblemMeasured =
    branch?.evidenceType === 'consumer_problem' ||
    selected.observations.some((o) =>
      /문제 경험/.test(`${o.label} ${o.value}`),
    );
  const ageDistribution: ResearchProfile['ages'] =
    selected.householdProfile?.ages ?? selected.ages;
  const sexDistribution = selected.householdProfile?.sexes ?? selected.sexes;
  const selectedIndex = Math.max(
    0,
    data.branches.findIndex((b) => b.id === branch?.id),
  );
  const color = colors[selectedIndex % colors.length];
  const choose = (id: string) => {
    setSaved(false);
    setNotice('');
    router.push(researchHref(data.market.id, id, age, compare, metric), {
      scroll: false,
    });
  };
  const save = () => {
    try {
      const key = researchIdeasKey;
      const items = readResearchIdeas();
      const id = [data.market.id, selected.id, age].join(':');
      localStorage.setItem(
        key,
        JSON.stringify([
          ...items.filter((i) => i && i.id !== id),
          {
            id,
            market: data.market.id,
            node: selected.id,
            age,
            label: selected.id.includes('~')
              ? branch.label + ' · ' + selected.label
              : selected.label,
            hypothesis: branch?.hypothesis ?? '',
            question: branch?.nextQuestion ?? '',
            url: researchHref(data.market.id, selected.id, age),
            version: data.version,
          },
        ]),
      );
      setSaved(true);
      setNotice('사업 가설과 다음 검증 질문을 이 브라우저에 저장했습니다.');
    } catch {
      setNotice('브라우저 저장 공간을 사용할 수 없습니다.');
    }
  };
  const height = Math.max(500, data.branches.length * 125 + 70);
  const y = (index: number) => 65 + index * 125;
  return (
    <div className="research-os">
      <a href="#research-main" className="skip-link">
        분석으로 이동
      </a>
      <aside className="research-nav" aria-label="수요 탐색 메뉴">
        <Link
          className="research-brand"
          href={researchWorkspaceHref('overview', { compare, metric })}
        >
          <span>ϟ</span>Market <b>Atlas</b>
        </Link>
        <small>DISCOVERY WORKSPACE</small>
        <Link href={researchWorkspaceHref('overview', { compare, metric })}>
          <Compass size={17} /> 시장 탐색
        </Link>
        <Link
          className="active"
          href={researchHref(data.market.id, node, age, compare, metric)}
        >
          <Network size={17} /> 수요 흐름
        </Link>
        <Link
          href={researchWorkspaceHref('matrix', {
            market: data.market.id,
            node: selected.id,
            age,
            compare,
            metric,
          })}
        >
          <Grid2X2 size={17} /> 교차분석
        </Link>
        <Link
          href={researchWorkspaceHref('opportunity', {
            market: data.market.id,
            node: selected.id,
            age,
            compare,
            metric,
          })}
        >
          <ChartScatter size={17} /> 기회 탐색기
        </Link>
        <small>시장을 바꾸며 탐색</small>
        <input
          aria-label="시장 찾기"
          placeholder="시장 찾기"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <nav className="research-market-list">
          {data.markets
            .filter((m) => m.label.includes(query))
            .map((m) => (
              <Link
                key={m.id}
                className={m.id === data.market.id ? 'market-current' : ''}
                href={researchHref(m.id, undefined, undefined, compare, metric)}
              >
                <i />
                {m.label}
              </Link>
            ))}
        </nav>
        <div className="research-nav-foot">
          <Database size={16} />
          <span>
            외부 조사 기반 수요
            <br />
            <small>한국 · 출처별 기준연도</small>
          </span>
        </div>
      </aside>
      <main id="research-main" className="research-main">
        <header className="research-header">
          <div>
            <span>
              시장 탐색 <ChevronRight size={12} /> {data.market.label}
            </span>
            <h1>수요의 흐름을 발견하세요</h1>
            <p>시장에서 시작해, 원하는 경험과 구매 방식으로 좁혀 봅니다.</p>
          </div>
          <div className="research-header-actions">
            <ResearchIdeas />
            <Link
              href={researchWorkspaceHref('compare', {
                metric,
                compare: [
                  ...new Set([
                    ...compare,
                    candidateKey(data.market.id, selected.id, age),
                  ]),
                ].slice(-3),
              })}
            >
              세그먼트 비교
            </Link>
            <Link href={researchWorkspaceHref('overview', { compare, metric })}>
              <ArrowLeft size={14} /> 전체 지도
            </Link>
            <button onClick={save}>
              {saved ? <Check size={15} /> : <Bookmark size={15} />}{' '}
              {saved ? '저장됨' : '아이디어 저장'}
            </button>
          </div>
        </header>
        <div className="research-toolbar">
          <label>
            시장{' '}
            <select
              aria-label="탐색 시장"
              value={data.market.id}
              onChange={(e) =>
                router.push(
                  researchHref(
                    e.target.value,
                    undefined,
                    undefined,
                    compare,
                    metric,
                  ),
                )
              }
            >
              {data.markets.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <span className="toolbar-divider" />
          <label>
            <SlidersHorizontal size={14} /> 연령{' '}
            <select
              aria-label="수요 연령 조건"
              value={age}
              disabled={data.market.unit !== 'person'}
              onChange={(e) =>
                router.push(
                  researchHref(
                    data.market.id,
                    node,
                    e.target.value,
                    compare,
                    metric,
                  ),
                )
              }
            >
              <option value="">
                {data.market.unit === 'household'
                  ? '가구 기준'
                  : '전체 20세 이상'}
              </option>
              {[20, 30, 40, 50, 60, 70].map((a) => (
                <option key={a} value={a}>
                  {a === 70 ? '70세 이상' : a + '대'}
                </option>
              ))}
            </select>
          </label>
          <span className="research-model-mark">외부 조사 × 공식 인구</span>
        </div>
        <div className="research-scope-strip">
          <div>
            <small>
              확보한 수요 범위 ·{' '}
              {data.market.unit === 'household' ? '가구' : '인구'}
            </small>
            <strong>
              {data.root.estimate.status === 'estimated' ? '≈ ' : ''}
              {people(data.root)}
            </strong>
          </div>
          <div className="research-scope-money">
            <small>연간 관련 소비금액</small>
            <strong>
              {data.root.marketValue.status === 'estimated'
                ? formatKRW(data.root.marketValue.annualValue)
                : '근거 연결 중'}
            </strong>
            <span>
              {data.root.marketValue.status === 'estimated'
                ? `${formatKRW(data.root.marketValue.annualSpendPerUnit)} / ${unitLabel(data.root.marketValue.populationUnit)}·년`
                : '같은 품목·채널·구매 주체의 기준 필요'}
            </span>
          </div>
          <p>
            {data.market.scope}
            <span>
              활동·조사 범위가 겹치므로 다른 시장과 합산하지 않습니다.
            </span>
          </p>
          <div>
            <small>추정 근거</small>
            <b>
              Research model <em>{data.root.evidenceGrade}</em>
            </b>
            <span>민감도 범위 제공</span>
          </div>
        </div>
        <div className="research-workspace">
          <section
            className="research-canvas-section"
            aria-label="시장 수요 흐름"
          >
            <div className="research-canvas-top">
              <h2>
                {data.market.label} <span>DEMAND EXPLORER</span>
              </h2>
              <button
                onClick={() => choose(data.root.id)}
                title="시장 전체 프로필 보기"
              >
                <Maximize2 size={16} />
                <span>전체 보기</span>
              </button>
            </div>
            <p className="research-mobile-hint">
              흐름 지도를 좌우로 밀어 하위 집단을 탐색하세요.
            </p>
            <div className="research-column-labels">
              <span>탐색 시장</span>
              <span>경험 · 니즈를 검증할 집단</span>
              <span>행동 · 문제 · 구매 방식</span>
            </div>
            {data.branches.length ? (
              <div className="research-canvas-scroll">
                <div className="research-canvas" style={{ height }}>
                  <svg
                    viewBox={`0 0 830 ${height}`}
                    preserveAspectRatio="none"
                    aria-hidden="true"
                  >
                    <defs>
                      {data.branches.map((b, i) => (
                        <linearGradient key={b.id} id={'flow-' + i}>
                          <stop stopColor="#61b7a8" stopOpacity=".2" />
                          <stop
                            offset="1"
                            stopColor={colors[i % 4]}
                            stopOpacity=".22"
                          />
                        </linearGradient>
                      ))}
                    </defs>
                    {data.branches.map((b, i) => (
                      <path
                        key={b.id}
                        d={`M 167 ${height / 2} C 220 ${height / 2}, 220 ${y(i) + 41}, 275 ${y(i) + 41}`}
                        stroke={`url(#flow-${i})`}
                        strokeWidth={i === selectedIndex ? 43 : 25}
                        fill="none"
                        className={i === selectedIndex ? 'flow-current' : ''}
                      />
                    ))}
                    {branch.children.map((p, i) => (
                      <path
                        key={p.id}
                        d={`M 485 ${y(selectedIndex) + 41} C 530 ${y(selectedIndex) + 41}, 530 ${130 + i * 125 + 36}, 592 ${130 + i * 125 + 36}`}
                        stroke={color}
                        opacity={p.id === selected.id ? '.4' : '.15'}
                        strokeWidth={p.id === selected.id ? 30 : 18}
                        fill="none"
                      />
                    ))}
                  </svg>
                  <button
                    className={
                      'research-root-node ' +
                      (selected.id === data.root.id ? 'selected' : '')
                    }
                    style={{ top: height / 2 - 61 }}
                    onClick={() => choose(data.root.id)}
                  >
                    <Network size={24} />
                    <b>{data.market.label}</b>
                    <strong>{people(data.root)}</strong>
                    <small>아래 수요 영역의 합집합</small>
                  </button>
                  {data.branches.map((b, i) => (
                    <button
                      key={b.id}
                      className={
                        'research-demand-node ' +
                        (branch.id === b.id ? 'selected' : '')
                      }
                      style={
                        {
                          top: y(i),
                          '--node-color': colors[i % 4],
                        } as CSSProperties
                      }
                      onClick={() => choose(b.id)}
                      aria-pressed={selected.id === b.id}
                    >
                      <span className="research-node-eyebrow">
                        {b.evidenceType === 'consumer_problem'
                          ? '조사된 문제 경험'
                          : b.painMeasured
                            ? '조사된 참여 목적·경험'
                            : '활동 경험 기반'}
                      </span>
                      <b>{b.label}</b>
                      <strong>{people(b.profile)}</strong>
                      <span className="research-node-dot" />
                    </button>
                  ))}
                  {branch.children.map((p, i) => (
                    <button
                      key={p.id}
                      className={
                        'research-leaf-node ' +
                        (selected.id === p.id ? 'selected' : '')
                      }
                      style={
                        {
                          top: 130 + i * 125,
                          '--node-color': color,
                        } as CSSProperties
                      }
                      onClick={() => choose(p.id)}
                      aria-pressed={selected.id === p.id}
                    >
                      <small>
                        {branch.evidenceType === 'consumer_problem'
                          ? '유형별 조사 · 분모 보정'
                          : p.evidenceGrade === 'D'
                            ? '전이 시나리오'
                            : '조건부 모형'}
                      </small>
                      <b>{p.label}</b>
                      <strong>{people(p)}</strong>
                      <ChevronRight size={13} />
                    </button>
                  ))}
                  {!branch.children.length && (
                    <div className="research-unit-gap" style={{ top: 170 }}>
                      <b>가구 기준의 하위 행동 조사</b>
                      <p>
                        개인 구매 성향을 가구 비율로 바꾸지 않습니다. 가구별
                        구매·관리 조사와 연결할 영역입니다.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="research-pending">
                <Database size={30} />
                <h3>이 시장의 수요 분모를 연결하고 있습니다</h3>
                <p>{data.market.gap}</p>
              </div>
            )}
            <div className="research-canvas-foot">
              <label>
                <input
                  type="checkbox"
                  checked={ranges}
                  onChange={(e) => setRanges(e.target.checked)}
                />{' '}
                불확실성 범위
              </label>
              <span>
                <i /> 선택한 경로
              </span>
              <span>연결은 중복 가능한 집단 관계 · 두께는 선택 강조</span>
            </div>
            {branch && (
              <div className="research-job-panel">
                <div>
                  <small>이 집단에서 검증할 JOB</small>
                  <h3>{branch.job}</h3>
                  <p>{branch.hypothesis}</p>
                  <span>
                    {selectedProblemMeasured
                      ? '문제 경험은 조사됨 · 해결 의향과 문제 강도는 추가 검증'
                      : '활동 경험으로부터 만든 사업 가설 · 문제 발생률은 미측정'}
                  </span>
                </div>
                <div>
                  <small>현재 대안 · 검토 가설</small>
                  <p>{branch.alternatives}</p>
                  <small>다음에 확인할 질문</small>
                  <p>{branch.nextQuestion}</p>
                </div>
              </div>
            )}
            {data.market.gap && (
              <p className="research-coverage-gap">
                <Info size={15} />
                {data.market.gap}
              </p>
            )}
            <div className="research-evidence-section">
              <button
                onClick={() => setShowFacts(!showFacts)}
                aria-expanded={showFacts}
              >
                <Database size={15} />
                <b>선택 집단의 산출 근거</b>
                <span>{selected.sources.length}개 출처</span>
                <ChevronRight
                  size={14}
                  className={showFacts ? 'rotated' : ''}
                />
              </button>
              {showFacts && (
                <div>
                  {selected.observations.map((o, i) => (
                    <article key={i}>
                      <b>{o.label}</b>
                      <p>{o.value}</p>
                    </article>
                  ))}
                  {selected.sources.map((s) => (
                    <a key={s.id} href={s.url} target="_blank" rel="noreferrer">
                      <b>
                        {s.publisher} · {s.title}
                      </b>
                      <span>
                        {s.referencePeriod} · {s.locator}
                      </span>
                      <ArrowUpRight size={14} />
                    </a>
                  ))}
                  {selected.estimate.status === 'estimated' && (
                    <ul>
                      {selected.estimate.assumptions.map((a, i) => (
                        <li key={i}>{a}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </section>
          <aside
            className="research-inspector"
            aria-label="선택 집단 상세"
            style={{ '--selected-color': color } as CSSProperties}
          >
            <div className="research-inspector-title">
              <small>SELECTED SEGMENT</small>
              <span>{selected.evidenceGrade} · 모델 근거</span>
            </div>
            <h2>{selected.label}</h2>
            <p>
              {selected.estimate.status === 'estimated'
                ? (selected.definition ??
                  selected.estimate.definitions.join(' · '))
                : selected.estimate.reason === 'outside_scope'
                  ? selected.estimate.detail
                  : (data.market.gap ?? '분모 또는 경험률 추가 확인 필요')}
            </p>
            <div className="research-selected-pop">
              <small>
                관련 {data.market.unit === 'household' ? '가구' : '인구'} · 외부
                근거 추정
              </small>
              <strong>
                {selected.estimate.status === 'estimated' ? '≈ ' : ''}
                {people(selected)}
              </strong>
              {ranges && selected.estimate.status === 'estimated' && (
                <>
                  <div className="research-range-line">
                    <i />
                    <b />
                    <i />
                  </div>
                  <div className="research-range-labels">
                    <span>Low {people(selected, 'low')}</span>
                    <span>High {people(selected, 'high')}</span>
                  </div>
                  <small>통계 신뢰구간이 아닌 민감도 범위</small>
                </>
              )}
            </div>
            {selected.observations.length > 0 && (
              <section className="research-observation-strip">
                <h3>
                  관찰된 이용 패턴 <span>조사 응답</span>
                </h3>
                {selected.observations.slice(-2).map((o, i) => (
                  <p key={i}>
                    <b>{o.label}</b>
                    <span>{o.value}</span>
                  </p>
                ))}
              </section>
            )}
            <section className="research-money-gap">
              <h3>이 집단의 연간 지출</h3>
              {selected.marketValue.status === 'estimated' ? (
                <>
                  <strong>
                    {formatKRW(selected.marketValue.annualValue)} / 년
                  </strong>
                  <p>
                    {selected.marketValue.scopeLabel}
                    <br />
                    {formatKRW(selected.marketValue.annualSpendPerUnit)} /{' '}
                    {unitLabel(selected.marketValue.populationUnit)}·년
                  </p>
                  <p className="research-money-meta">
                    {selected.marketValue.method
                      ? SPEND_METHOD_LABELS[selected.marketValue.method]
                      : '산출 방식'}{' '}
                    · {selected.marketValue.confidence} confidence · 근거 충족{' '}
                    {(selected.marketValue.completeness * 100).toFixed(0)}%
                  </p>
                  {ranges && (
                    <p>
                      Low {formatKRW(selected.marketValue.low)} · High{' '}
                      {formatKRW(selected.marketValue.high)}
                    </p>
                  )}
                  <details>
                    <summary>
                      지출 산출 근거 · {selected.marketValue.confidence}
                    </summary>
                    {selected.marketValue.assumptions.map((a, i) => (
                      <p key={i}>{a}</p>
                    ))}
                    {selected.marketValue.sourceBasis.map((s) => (
                      <a
                        key={s.id}
                        href={s.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {s.title} ↗
                      </a>
                    ))}
                  </details>
                </>
              ) : (
                <>
                  <strong>금액 기준 연결 중</strong>
                  <p>
                    활동 인구와 같은 품목·채널·구매 주체의 지출 기준이
                    필요합니다.
                  </p>
                </>
              )}
            </section>
            <section>
              <h3>
                {selected.householdProfile
                  ? '가구주 연령별 분포'
                  : '연령별 분포'}{' '}
                <span>
                  {selected.householdProfile
                    ? '가구 조사 구성'
                    : '공식 인구 × 조사율'}
                </span>
              </h3>
              {ageDistribution.length ? (
                <div className="research-age-chart">
                  {ageDistribution.map((a) => (
                    <div key={a.label}>
                      <span>
                        {a.covered === false ? '대상 밖' : percent(a.share)}
                      </span>
                      <i style={{ height: Math.max(2, a.share * 220) }} />
                      <small>{a.label}</small>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="research-missing">
                  {data.market.unit === 'household'
                    ? '가구 기준 연령 분포 미확보'
                    : '선택 조건이 조사 대상에 포함되는지 확인해 주세요.'}
                </p>
              )}
            </section>
            <section className="research-sex-row">
              <h3>
                {selected.householdProfile ? '가구주 성별 분포' : '성별 분포'}{' '}
                <span>모형 구성</span>
              </h3>
              {sexDistribution.length ? (
                <div>
                  <div
                    className="research-donut"
                    style={{
                      background: `conic-gradient(${color} 0 ${sexDistribution[0].share * 360}deg, #ded8f0 0 360deg)`,
                    }}
                  >
                    <i />
                  </div>
                  <div>
                    {sexDistribution.map((s) => (
                      <p key={s.label}>
                        <span>{s.label}</span>
                        <b>{percent(s.share)}</b>
                      </p>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="research-missing">
                  {data.market.unit === 'household'
                    ? '가구원 성별과 가구 수는 별도입니다.'
                    : '선택 조건은 조사 대상 밖이거나 분포 근거가 없습니다.'}
                </p>
              )}
            </section>
            <section>
              <h3>
                지역별 분포 <span>지역 배분 모형</span>
              </h3>
              {selected.regions.length ? (
                <div className="research-region-bars">
                  {[...selected.regions]
                    .sort((a, b) => b.share - a.share)
                    .slice(0, 5)
                    .map((r) => (
                      <div key={r.label}>
                        <span>{r.label}</span>
                        <i>
                          <b style={{ width: r.share * 230 + '%' }} />
                        </i>
                        <strong>{percent(r.share)}</strong>
                      </div>
                    ))}
                </div>
              ) : null}
              <p className="research-small-note">{selected.regionBasis}</p>
            </section>
            {selected.householdProfile?.sizes.length ? (
              <section>
                <h3>
                  가구원 수별 구성 <span>가구 조사 기반</span>
                </h3>
                <div className="research-region-bars">
                  {selected.householdProfile.sizes.map((r) => (
                    <div key={r.label}>
                      <span>{r.label}</span>
                      <i>
                        <b style={{ width: 100 * r.share + '%' }} />
                      </i>
                      <strong>{percent(r.share)}</strong>
                    </div>
                  ))}
                </div>
                <p className="research-small-note">
                  가구주 특성은 가족 전체의 연령·성별 분포와 다릅니다.
                </p>
              </section>
            ) : null}

            <button className="research-save-button" onClick={save}>
              {saved ? <Check size={16} /> : <Bookmark size={16} />}{' '}
              {saved ? '아이디어 저장됨' : '이 집단으로 아이디어 저장'}
            </button>
            <output className="research-save-notice">{notice}</output>
          </aside>
        </div>
        <footer className="research-footer">
          수요 인구는 공식 인구·외부 조사로 추정합니다. 합성 프로필의 케이스
          수는 인구 비율로 사용하지 않습니다.<span>{data.version}</span>
        </footer>
      </main>
    </div>
  );
}
