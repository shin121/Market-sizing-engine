'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { NativeSelect } from '@/components/ui/native-select';
import {
  type AtlasPayload,
  type AtlasContext,
  type Summary,
  shortPopulation,
  pct,
  indexLabel,
  conditionKey,
} from '@/lib/atlas';
import {
  formatKRW,
  moneyStatus,
  unitLabel,
  type MarketValueEstimate,
  type MoneyAxis,
  MONEY_AXIS_LABELS,
} from '@/lib/market-value';
import { Module, href, Entry, jointHref } from './common';
export function MoneyControls({ data }: { data: AtlasPayload }) {
  const c = data.context,
    router = useRouter(),
    path = usePathname(),
    params = useSearchParams();
  const set = (key: string, value: string) => {
    const p = new URLSearchParams(params.toString());
    p.set(key, value);
    if (
      key === 'metric' &&
      (value === 'marketValue' || value === 'spendPerUnit')
    ) {
      p.set('x', 'population');
      p.set('y', 'spendPerUnit');
    }
    router.push(path + '?' + p, { scroll: false });
  };
  const metrics =
    c.view === 'matrix'
      ? [
          ['population', '인구 규모'],
          ['index', 'Index'],
          ['marketValue', '시장 규모 ₩'],
          ['spendPerUnit', '관련 인구당 지출'],
        ]
      : [
          ['population', '인구 규모'],
          ['marketValue', '시장 규모 ₩'],
        ];
  return (
    <div className="money-controls">
      <fieldset className="metric-switch" aria-label="핵심 지표">
        {metrics.map(([id, label]) => (
          <button
            key={id}
            aria-pressed={c.metric === id}
            onClick={() => set('metric', id)}
          >
            {label}
          </button>
        ))}
      </fieldset>
      {c.view === 'overview' && c.lens === 'markets' ? (
        <span>산업별 확보 범위 비교 · 전체 소비시장 합계 아님</span>
      ) : (
        <label>
          지출 범위{' '}
          <NativeSelect
            aria-label="지출 범위"
            value={c.moneyScope}
            onChange={(e) => set('spend', e.target.value)}
          >
            <option value="covered">확보된 소비 범위 · 중복 제외</option>
            {data.navigation
              .filter((e) => e.kind === 'market')
              .map((e) => (
                <option key={e.id} value={e.id}>
                  {e.label}
                  {data.money?.availableMarkets.includes(e.id)
                    ? ' · 일부 기준 확보'
                    : ' · 기준 미확보'}
                </option>
              ))}
          </NativeSelect>
        </label>
      )}
      <span className="money-scope-note">{data.money?.summary.scopeLabel}</span>
    </div>
  );
}
export function MoneyMetrics({ value }: { value?: MarketValueEstimate }) {
  if (!value) return null;
  return (
    <>
      <div
        className="money-main"
        title={`${value.scopeLabel}\n${moneyStatus(value)}\nLow ${formatKRW(value.low)} / Base ${formatKRW(value.base)} / High ${formatKRW(value.high)}`}
      >
        <span>연간 소비액 · 확보 범위</span>
        <strong>
          {formatKRW(value.base, false)}
          <small> / 년</small>
        </strong>
        <small>
          {value.status === 'estimated' ? value.scopeLabel : moneyStatus(value)}
        </small>
      </div>
      <div>
        <span>{value.denominatorLabel ?? '관련 인구당 연간 금액'}</span>
        <strong>{formatKRW(value.annualSpendPerUnit, false)}</strong>
        <small>
          {value.relevantPopulation === null
            ? '단위·대상에 맞는 기준 필요'
            : `${shortPopulation(value.relevantPopulation)}${unitLabel(value.populationUnit)} ${value.denominatorBasis === 'adult_profile_allocation' ? '소비 프로필 · 실제 구매자 수 아님' : '참여 추정 · 전체의 ' + pct(value.participationRate ?? 0)}`}
        </small>
      </div>
    </>
  );
}
export function MoneyBasis({ value }: { value: MarketValueEstimate }) {
  return (
    <details className="money-basis">
      <summary>
        {moneyStatus(value)} · {value.coverage.supportedMarkets}/
        {value.coverage.totalMarkets}개 산업의 일부 지출 · 계산 근거
      </summary>
      <div className="money-basis-grid">
        <div>
          <b>연간 소비액 범위</b>
          <span>
            {formatKRW(value.low)} / {formatKRW(value.base)} /{' '}
            {formatKRW(value.high)}
          </span>
          <small>Low / Base / High · 민감도 범위</small>
        </div>
        <div>
          <b>참여 인구와 지출</b>
          <span>
            {value.relevantPopulation === null
              ? '—'
              : shortPopulation(value.relevantPopulation) +
                unitLabel(value.populationUnit)}{' '}
            × {formatKRW(value.annualSpendPerUnit)}
          </span>
          <small>연간 · KRW · {unitLabel(value.populationUnit)} 단위</small>
        </div>
        <div>
          <b>금액 근거 coverage</b>
          <span>
            해당 관심집단의 {pct(value.coverage.anchor)} · 직접 지출 관측{' '}
            {pct(value.coverage.directSpend)}
          </span>
          <small>
            전체 집단에서 기준 적용 가능 인구 {pct(value.coverage.population)}
          </small>
        </div>
        <div>
          <b>서로 다른 Index</b>
          <span>
            참여 {indexLabel(value.participationIndex)} · 배분 강도{' '}
            {indexLabel(value.spendIntensityIndex)}
          </span>
          <small>산업 관심 Index를 지출 배수로 사용하지 않습니다.</small>
        </div>
      </div>
      {value.sourceBasis.map((s) => (
        <p key={s.id}>
          {s.url ? (
            <a href={s.url} target="_blank" rel="noreferrer">
              {s.title}
            </a>
          ) : (
            s.title
          )}{' '}
          · {s.referencePeriod} · {s.locator}
        </p>
      ))}
      <ul>
        {value.assumptions.map((a) => (
          <li key={a}>{a}</li>
        ))}
      </ul>
      <p>
        유형 간 금액은 중복될 수 있습니다. 합계가 전체 시장이 아니며, 소비액은
        회사의 획득 가능 매출·SOM이 아닙니다.
      </p>
    </details>
  );
}
export function MoneyAnalysis({ data }: { data: AtlasPayload }) {
  const [sort, setSort] = useState('value'),
    [typeSort, setTypeSort] = useState('value');
  const money = data.money;
  if (!money) return null;
  const rows = [...money.industries].sort((a, b) =>
    sort === 'affinity'
      ? b.population - a.population
      : sort === 'population'
        ? b.population - a.population
        : sort === 'unit'
          ? (b.estimate.annualSpendPerUnit ?? -1) -
            (a.estimate.annualSpendPerUnit ?? -1)
          : (b.estimate.base ?? -1) - (a.estimate.base ?? -1),
  );
  const contributions = [...money.contributions].sort((a, b) =>
    typeSort === 'affinity'
      ? b.population - a.population
      : typeSort === 'population'
        ? b.population - a.population
        : (b.estimate.base ?? -1) - (a.estimate.base ?? -1),
  );
  const c = data.context;
  return (
    <div className="money-analysis">
      <Module
        title="산업별 경제적 규모"
        note="관심·참여 인구·지출을 구분합니다. 온라인 거래 등 포함 범위의 금액을 비교합니다."
        action={
          <NativeSelect
            aria-label="산업 지출 정렬"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="value">연간 소비액순</option>
            <option value="affinity">집단 내 비중순</option>
            <option value="population">관련 인구순</option>
            <option value="unit">관련 인구당 지출순</option>
          </NativeSelect>
        }
      >
        <div className="table-scroll">
          <table className="money-table">
            <thead>
              <tr>
                <th>산업 / 포함 지출</th>
                <th>집단 내 비중</th>
                <th>관련 인구</th>
                <th>지출 배분 대상</th>
                <th>연간 지출 / 단위</th>
                <th>연간 소비액</th>
                <th>기준</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ entity, population, estimate: v }) => (
                <tr key={entity.id} data-money-market={entity.id}>
                  <td>
                    <Link
                      prefetch={false}
                      href={jointHref(entity.id, {
                        ...c,
                        moneyScope: entity.id,
                      })}
                    >
                      {entity.label}
                    </Link>
                    {v.base !== null && <small>{v.scopeLabel}</small>}
                    <small>
                      <Entry entity={entity} context={c}>
                        전체 시장 ↗
                      </Entry>
                    </small>
                  </td>
                  <td>
                    {pct(
                      data.profile.summary.estimate.population
                        ? population / data.profile.summary.estimate.population
                        : 0,
                    )}
                  </td>
                  <td>{shortPopulation(population)}명</td>
                  <td>
                    {v.relevantPopulation === null
                      ? '—'
                      : shortPopulation(v.relevantPopulation) +
                        unitLabel(v.populationUnit)}
                  </td>
                  <td>{formatKRW(v.annualSpendPerUnit, false)}</td>
                  <td className="money-number">{formatKRW(v.base, false)}</td>
                  <td>
                    {v.base === null ? (
                      moneyStatus(v)
                    ) : (
                      <Link
                        prefetch={false}
                        href={jointHref(entity.id, {
                          ...c,
                          moneyScope: entity.id,
                          metric: 'marketValue',
                        })}
                      >
                        교집합 분석 ↗
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Module>
      {c.ids.some(
        (id) => data.navigation.find((e) => e.id === id)?.kind === 'market',
      ) && (
        <Module
          title="이 지출 범위와 연결된 소비 유형"
          note="유형은 중복 소속합니다. 아래 소비액을 합산하지 않습니다."
          action={
            <NativeSelect
              aria-label="유형 지출 정렬"
              value={typeSort}
              onChange={(e) => setTypeSort(e.target.value)}
            >
              <option value="value">소비액순</option>
              <option value="population">인구순</option>
              <option value="affinity">집단 내 비중순</option>
            </NativeSelect>
          }
        >
          <div className="table-scroll">
            <table className="money-table">
              <thead>
                <tr>
                  <th>소비 유형</th>
                  <th>관련 인구</th>
                  <th>연간 소비액</th>
                  <th>연간 배분액 / 명</th>
                  <th>집단 내 비중</th>
                </tr>
              </thead>
              <tbody>
                {contributions.slice(0, 15).map((r) => (
                  <tr key={r.entity.id}>
                    <td>
                      <Link prefetch={false} href={jointHref(r.entity.id, c)}>
                        {r.entity.label}
                      </Link>
                      <small>
                        <Entry entity={r.entity} context={c}>
                          전체 유형 ↗
                        </Entry>
                      </small>
                    </td>
                    <td>{shortPopulation(r.population)}명</td>
                    <td>{formatKRW(r.estimate.base, false)}</td>
                    <td>{formatKRW(r.estimate.annualSpendPerUnit, false)}</td>
                    <td>
                      {pct(
                        data.profile.summary.estimate.population
                          ? r.population /
                              data.profile.summary.estimate.population
                          : 0,
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Module>
      )}
      <MoneyBasis value={money.summary} />
    </div>
  );
}
export function MoneyRadar({ data }: { data: AtlasPayload }) {
  return (
    <>
      {data.money?.radar.map((group) => (
        <section key={group.id} data-money-radar={group.id}>
          <h3>
            {group.label}
            <small>{group.metric}</small>
          </h3>
          {group.items.map((s, i) => (
            <Entry
              key={s.entity.id}
              entity={s.entity}
              context={data.context}
              className="radar-row"
            >
              <span className="rank">0{i + 1}</span>
              <span>
                {s.entity.label}
                <small>{shortPopulation(s.estimate.population)}명</small>
              </span>
              <strong>
                {group.id === 'money-niche'
                  ? formatKRW(s.marketValue?.annualSpendPerUnit, false)
                  : formatKRW(
                      group.id === 'high-spend'
                        ? s.marketValue?.annualSpendPerUnit
                        : s.marketValue?.base,
                      false,
                    )}
              </strong>
            </Entry>
          ))}
          {!group.items.length && (
            <p className="empty">이 범위의 금액 기준이 없습니다.</p>
          )}
        </section>
      ))}
      <p className="money-radar-note">
        {data.money?.summary.scopeLabel}
        <br />
        다른 산업을 포함한 전체 소비 순위가 아닙니다.
      </p>
    </>
  );
}
const axisValue = (s: Summary, axis: MoneyAxis) =>
  axis === 'population'
    ? s.estimate.population
    : axis === 'annualValue'
      ? s.marketValue?.base
      : axis === 'spendPerUnit'
        ? s.marketValue?.annualSpendPerUnit
        : axis === 'distinctiveness'
          ? s.metrics.distinctivenessScore
          : s.metrics.opportunity;
export function MoneyOpportunityChart({
  items,
  context,
}: {
  items: Summary[];
  context: AtlasContext;
}) {
  const router = useRouter(),
    path = usePathname(),
    params = useSearchParams();
  const [hover, setHover] = useState<Summary | null>(null);
  const set = (key: string, value: string) => {
    const p = new URLSearchParams(params.toString());
    p.set(key, value);
    router.push(path + '?' + p, { scroll: false });
  };
  const valid = items.filter((s) => {
    const x = axisValue(s, context.xAxis),
      y = axisValue(s, context.yAxis);
    return x != null && y != null && x > 0 && y >= 0;
  });
  const moneyAxis = (a: MoneyAxis) =>
    ['annualValue', 'spendPerUnit'].includes(a);
  const logarithmic = (a: MoneyAxis) => a === 'population' || moneyAxis(a);
  const transform = (n: number, a: MoneyAxis) =>
    logarithmic(a) ? Math.log10(Math.max(1, n)) : n;
  const values = (a: MoneyAxis) =>
    valid.map((s) => transform(axisValue(s, a)!, a));
  const xr = values(context.xAxis),
    yr = values(context.yAxis),
    xmin = logarithmic(context.xAxis)
      ? (xr.length ? Math.min(...xr) : 4) - 0.15
      : 0,
    xmax = logarithmic(context.xAxis)
      ? (xr.length ? Math.max(...xr) : 5) + 0.15
      : 100,
    ymin = logarithmic(context.yAxis)
      ? (yr.length ? Math.min(...yr) : 4) - 0.15
      : 0,
    ymax = logarithmic(context.yAxis)
      ? (yr.length ? Math.max(...yr) : 5) + 0.15
      : 100;
  const maxPool = Math.max(1, ...valid.map((s) => s.marketValue?.base ?? 0));
  const label = (n: number, a: MoneyAxis) =>
    moneyAxis(a)
      ? formatKRW(n, false)
      : a === 'population'
        ? shortPopulation(n) + '명'
        : Math.round(n).toString();
  return (
    <>
      <div className="money-chart-controls">
        {(['x', 'y'] as const).map((key) => (
          <label key={key}>
            {key.toUpperCase()}축{' '}
            <NativeSelect
              aria-label={`${key.toUpperCase()}축 지표`}
              value={key === 'x' ? context.xAxis : context.yAxis}
              onChange={(e) => set(key, e.target.value)}
            >
              {Object.entries(MONEY_AXIS_LABELS).map(([id, l]) => (
                <option key={id} value={id}>
                  {l}
                </option>
              ))}
            </NativeSelect>
          </label>
        ))}
      </div>
      {valid.length ? (
        <svg
          className="money-scatter"
          viewBox="0 0 950 365"
          aria-label="인구·지출·경제적 규모 기회지도"
        >
          <rect x="72" y="20" width="846" height="282" fill="#f5f8fa" />
          {[0, 0.25, 0.5, 0.75, 1].map((t) => {
            const xv = xmin + t * (xmax - xmin),
              yv = ymin + t * (ymax - ymin);
            return (
              <g key={t}>
                <line
                  x1="72"
                  x2="918"
                  y1={302 - t * 282}
                  y2={302 - t * 282}
                  stroke="#dce4ec"
                  strokeDasharray="3 4"
                />
                <text x={72 + t * 846} y="324" textAnchor="middle">
                  {label(
                    logarithmic(context.xAxis) ? 10 ** xv : xv,
                    context.xAxis,
                  )}
                </text>
                <text x="65" y={306 - t * 282} textAnchor="end">
                  {label(
                    logarithmic(context.yAxis) ? 10 ** yv : yv,
                    context.yAxis,
                  )}
                </text>
              </g>
            );
          })}
          {valid.map((s) => {
            const x =
                72 +
                ((transform(axisValue(s, context.xAxis)!, context.xAxis) -
                  xmin) /
                  (xmax - xmin)) *
                  846,
              y =
                302 -
                ((transform(axisValue(s, context.yAxis)!, context.yAxis) -
                  ymin) /
                  (ymax - ymin)) *
                  282,
              r = Math.max(
                4,
                24 * Math.sqrt((s.marketValue?.base ?? 0) / maxPool),
              ),
              selected = conditionKey(s.ids) === conditionKey(context.ids);
            return (
              <a
                key={conditionKey(s.ids)}
                href={href(s.entity, context)}
                aria-label={`${s.entity.label} 경제 규모 상세`}
                onMouseEnter={() => setHover(s)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(s)}
                onBlur={() => setHover(null)}
              >
                <title>{`${s.entity.label} · ${formatKRW(s.marketValue?.base)} / 년 · ${formatKRW(s.marketValue?.annualSpendPerUnit)} / 명`}</title>
                {selected && (
                  <circle
                    cx={x}
                    cy={y}
                    r={r + 4}
                    stroke="#112b4c"
                    strokeWidth="2"
                    fill="none"
                  />
                )}
                <circle
                  cx={x}
                  cy={y}
                  r={r}
                  fill={
                    (s.metrics.opportunity ?? 0) >= 55 ? '#087c6c' : '#7955a5'
                  }
                  opacity={selected ? 1 : 0.65}
                  stroke="white"
                />
                {selected && (
                  <text x={x + 14} y={y - 15}>
                    현재 선택
                  </text>
                )}
              </a>
            );
          })}
          <text x="72" y="13">
            {MONEY_AXIS_LABELS[context.yAxis]}
          </text>
          <text x="918" y="353" textAnchor="end">
            {MONEY_AXIS_LABELS[context.xAxis]}
            {logarithmic(context.xAxis) ? ' · 로그 눈금' : ''}
          </text>
        </svg>
      ) : (
        <p className="empty money-empty">
          이 축에 표시할 지출 기준이 없습니다. 지출 범위를 바꾸거나
          인구·Opportunity 축으로 탐색할 수 있습니다.
        </p>
      )}
      <div className="chart-caption">
        {hover
          ? `${hover.entity.label} · ${shortPopulation(hover.estimate.population)}명 · ${formatKRW(hover.marketValue?.base)} / 년`
          : '원 면적 = 연간 소비액 (최소 반지름 4px) · 색 = Opportunity · 확보 범위 내 비교'}
      </div>
      <div className="money-quadrants">
        <span>
          큰 인구 + 높은 지출{' '}
          <b>
            Scale prize ·{' '}
            {items.filter((s) => s.moneyQuadrant === 'scale').length}개
          </b>
        </span>
        <span>
          작은 인구 + 높은 지출{' '}
          <b>
            Premium niche ·{' '}
            {items.filter((s) => s.moneyQuadrant === 'premium_niche').length}개
          </b>
        </span>
        <span>
          큰 인구 + 낮은 지출{' '}
          <b>
            Volume market ·{' '}
            {items.filter((s) => s.moneyQuadrant === 'volume').length}개
          </b>
        </span>
        <span>
          작은 인구 + 낮은 지출{' '}
          <b>
            낮은 우선순위 ·{' '}
            {items.filter((s) => s.moneyQuadrant === 'small_low').length}개
          </b>
        </span>
      </div>
    </>
  );
}
