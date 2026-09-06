'use client';
import Link from 'next/link';
import { formatKRW } from '@/lib/market-value';
import { MoneyOpportunityChart, MoneyBasis } from './money';
import { useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { NativeSelect } from '@/components/ui/native-select';
import {
  contextHref,
  conditionKey,
  KIND_NAMES,
  shortPopulation,
  pct,
  indexLabel,
  type AtlasPayload,
  type AtlasAxis,
  type Summary,
} from '@/lib/atlas';
import {
  Module,
  Entry,
  StatList,
  ranked,
  href,
  segmentEntity,
  Basis,
} from './common';
import { AgeChart, RegionChart } from './charts';
export function Relationship({ data }: { data: AtlasPayload }) {
  const c = data.context,
    router = useRouter(),
    p = data.relationship.selected ?? data.profile;
  const left = data.relationship.archetypes.slice(0, 6),
    right = data.relationship.signals.slice(0, 8);
  const node = ({
    s,
    index,
    side,
  }: {
    s: (typeof right)[number];
    index: number;
    side: 'left' | 'right';
  }) => {
    const x = side === 'left' ? 0 : 70,
      y = 5 + index * (side === 'left' ? 14.7 : 11.4);
    return (
      <button
        key={s.entity.id}
        className={'graph-node ' + (c.focus === s.entity.id ? 'selected' : '')}
        style={{ left: x + '%', top: y + '%', width: '28%' }}
        onClick={() =>
          router.push(
            contextHref('relationship', c.ids, { ...c, focus: s.entity.id }),
          )
        }
        title={`${s.entity.label}: 동시 언급 ${shortPopulation(s.population)}명, 전체 대비 ${indexLabel(s.index)}`}
      >
        <b>{s.entity.label}</b>
        <span>
          ≈ {shortPopulation(s.population)}명{' '}
          <strong>{indexLabel(s.index)}</strong>
        </span>
      </button>
    );
  };
  return (
    <div className="relationship-layout">
      <div>
        <Module
          title="관계 탐색"
          note="연결 두께 = 현재 집단에서의 동시 언급 비중 · 인과나 배타적 분할이 아닙니다"
          action={
            <Link
              prefetch={false}
              href={contextHref('relationship', c.ids, {
                ...c,
                allSignals: !c.allSignals,
              })}
            >
              {c.allSignals ? '유용한 신호만' : 'All signals'}
            </Link>
          }
        >
          <div className="graph-labels">
            <span>연관 소비 유형</span>
            <span>현재 탐색 집단</span>
            <span>행동 · 욕구 · 채널</span>
          </div>
          <div className="relationship-graph">
            <svg
              viewBox="0 0 1000 500"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              {left.map((s, i) => (
                <path
                  key={s.entity.id}
                  d={`M 270 ${47 + i * 73.5} C 340 ${47 + i * 73.5}, 340 250, 400 250`}
                  fill="none"
                  stroke="#bca8df"
                  strokeOpacity=".4"
                  strokeWidth={Math.max(2, Math.min(22, s.share * 90))}
                />
              ))}
              {right.map((s, i) => (
                <path
                  key={s.entity.id}
                  d={`M 600 250 C 650 250, 650 ${47 + i * 57}, 700 ${47 + i * 57}`}
                  fill="none"
                  stroke="#8bd2c0"
                  strokeOpacity=".45"
                  strokeWidth={Math.max(2, Math.min(24, s.share * 40))}
                />
              ))}
            </svg>
            {left.map((s, index) => node({ s, index, side: 'left' }))}
            <div className="graph-center">
              <small>선택 집단</small>
              <Entry entity={data.profile.summary.entity} context={c}>
                <b>{data.profile.summary.entity.label}</b>
              </Entry>
              <strong>
                {shortPopulation(data.profile.summary.estimate.population)}명
              </strong>
              <span>
                {c.ids.length || '전체'} {c.ids.length ? '개 조건' : '시장'}
              </span>
            </div>
            {right.map((s, index) => node({ s, index, side: 'right' }))}
          </div>
          <div className="graph-footer">
            연결을 선택하면 오른쪽에서 해당 교집합의 분포와 신호를 함께
            확인합니다.
          </div>
        </Module>
        <div className="profile-linked">
          <Module title="산업 연결">
            <StatList stats={data.relationship.markets} context={c} limit={6} />
          </Module>
          <Module
            title={c.allSignals ? '전체 관측 신호' : '추가로 연결된 신호'}
            note="강한 over-index와 under-index를 함께 해석"
          >
            <StatList
              stats={data.relationship.signals}
              context={c}
              limit={c.allSignals ? 30 : 8}
            />
          </Module>
        </div>
      </div>
      <aside className="node-inspector" aria-label="선택 연결 프로필">
        <h2>{c.focus ? '선택한 연결' : '현재 집단'}</h2>
        <h3>{p.summary.entity.label}</h3>
        <strong className="inspector-pop">
          ≈ {shortPopulation(p.summary.estimate.population)}명
        </strong>
        <span>
          현재 집단의{' '}
          {pct(
            data.profile.summary.estimate.population
              ? p.summary.estimate.population /
                  data.profile.summary.estimate.population
              : 0,
          )}
        </span>
        <Entry entity={p.summary.entity} context={c} className="primary-link">
          전체 대시보드 열기 ↗
        </Entry>
        <h4>소비자 구성 · 연령</h4>
        <AgeChart
          stats={p.demographics}
          context={{ ...c, ids: p.summary.ids }}
        />
        <h4>지역 분포</h4>
        <RegionChart
          stats={p.demographics}
          context={{ ...c, ids: p.summary.ids }}
        />
        <h4>함께 나타나는 신호</h4>
        <StatList
          stats={ranked(
            p.signals.filter((s) =>
              ['behavior', 'need', 'channel'].includes(s.entity.kind),
            ),
            5,
          )}
          context={{ ...c, ids: p.summary.ids }}
          limit={5}
          join={false}
        />
        <div className="inspector-basis">
          동시 검출 {p.summary.estimate.support.toLocaleString()}건<br />
          Opportunity {p.summary.metrics.opportunity ?? '—'} · 입력 완성도{' '}
          {p.summary.metrics.completeness}%<br />
          합성 서술 · 연령/성별 보정 추정
        </div>
      </aside>
    </div>
  );
}
const axes: AtlasAxis[] = [
  'archetype',
  'market',
  'need',
  'channel',
  'behavior',
  'interest',
  'age',
  'region',
];
export function Matrix({ data }: { data: AtlasPayload }) {
  const c = data.context,
    m = data.matrix!,
    router = useRouter();
  return (
    <>
      <Module
        title="교차분석 · 현재 집단을 더 나누기"
        note="모든 셀은 실제 동시 검출을 연령·성별 가중 합산합니다"
        action={
          <div className="axis-controls">
            <label>
              행
              <NativeSelect
                aria-label="행 축"
                value={c.row}
                onChange={(e) =>
                  router.push(
                    contextHref('matrix', c.ids, {
                      ...c,
                      row: e.target.value as AtlasAxis,
                    }),
                  )
                }
              >
                {axes.map((k) => (
                  <option key={k} value={k}>
                    {KIND_NAMES[k]}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <span>×</span>
            <label>
              열
              <NativeSelect
                aria-label="열 축"
                value={c.column}
                onChange={(e) =>
                  router.push(
                    contextHref('matrix', c.ids, {
                      ...c,
                      column: e.target.value as AtlasAxis,
                      focus: null,
                    }),
                  )
                }
              >
                {axes.map((k) => (
                  <option key={k} value={k}>
                    {KIND_NAMES[k]}
                  </option>
                ))}
              </NativeSelect>
            </label>
          </div>
        }
      >
        <div className="matrix-highlights">
          {m.highlights
            .filter((h) =>
              c.metric === 'marketValue' || c.metric === 'spendPerUnit'
                ? [
                    'Largest spend pool',
                    'Highest spend / person',
                    'Money-dense niche',
                  ].includes(h.label)
                : ![
                    'Largest spend pool',
                    'Highest spend / person',
                    'Money-dense niche',
                  ].includes(h.label),
            )
            .map((h) => (
              <Link
                prefetch={false}
                key={h.label}
                href={href(segmentEntity(h.cell.ids), c)}
              >
                <small>{h.label}</small>
                <b>
                  {h.cell.row.label} × {h.cell.column.label}
                </b>
                <span>
                  ≈ {shortPopulation(h.cell.population)}명{' '}
                  <strong>
                    {c.metric === 'marketValue'
                      ? formatKRW(h.cell.marketValue?.base, false)
                      : c.metric === 'spendPerUnit'
                        ? formatKRW(
                            h.cell.marketValue?.annualSpendPerUnit,
                            false,
                          )
                        : indexLabel(h.cell.index)}
                  </strong>
                </span>
              </Link>
            ))}
        </div>
        <div className="table-scroll">
          <table className="atlas-matrix">
            <thead>
              <tr>
                <th>
                  {KIND_NAMES[c.row]} / {KIND_NAMES[c.column]}
                </th>
                {m.columns.map((e) => (
                  <th key={e.id}>
                    <Entry entity={e} context={c} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {m.rows.map((row) => (
                <tr key={row.id}>
                  <th>
                    <Entry entity={row} context={c} />
                  </th>
                  {m.columns.map((col) => {
                    const cell = m.cells.find(
                      (x) => x.row.id === row.id && x.column.id === col.id,
                    )!;
                    const money =
                      c.metric === 'marketValue' || c.metric === 'spendPerUnit';
                    const cellValue =
                      c.metric === 'spendPerUnit'
                        ? cell.marketValue?.annualSpendPerUnit
                        : cell.marketValue?.base;
                    const maxMoney = Math.max(
                      1,
                      ...m.cells.map(
                        (x) =>
                          (c.metric === 'spendPerUnit'
                            ? x.marketValue?.annualSpendPerUnit
                            : x.marketValue?.base) ?? 0,
                      ),
                    );
                    const intensity = money
                        ? Math.min(
                            0.36,
                            0.04 +
                              0.32 * Math.sqrt((cellValue ?? 0) / maxMoney),
                          )
                        : Math.min(
                            0.28,
                            Math.max(0, (cell.index ?? 0) - 0.7) * 0.16,
                          ),
                      contents = (
                        <>
                          <strong>
                            {money
                              ? formatKRW(cellValue, false)
                              : c.metric === 'index'
                                ? indexLabel(cell.index)
                                : shortPopulation(cell.population) + '명'}
                          </strong>
                          <span
                            className={
                              cell.index !== null && cell.index < 1
                                ? 'index-under'
                                : 'index-over'
                            }
                          >
                            {money
                              ? shortPopulation(cell.population) + '명'
                              : cell.defining
                                ? '정의상 포함'
                                : indexLabel(cell.index)}
                          </span>
                          <small>
                            {money && cellValue === null
                              ? '지출 기준 미확보 · '
                              : ''}
                            {pct(cell.share)} · n=
                            {cell.support.toLocaleString()}
                          </small>
                        </>
                      );
                    return (
                      <td
                        key={col.id}
                        style={{
                          background: cell.population
                            ? `rgba(9,144,120,${intensity})`
                            : '#f7f8fa',
                        }}
                      >
                        {cell.ids.length <= 8 ? (
                          <Link
                            prefetch={false}
                            href={href(segmentEntity(cell.ids), c)}
                            title={`${row.label} × ${col.label} 상세 세그먼트`}
                          >
                            {contents}
                          </Link>
                        ) : (
                          <div
                            className="matrix-disabled"
                            title="최대 8개 조건까지 선택할 수 있습니다."
                          >
                            {contents}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="basis-note">
          셀 Index = P(행 ∩ 열 | 현재 집단) ÷ [P(행 | 현재 집단) × P(열 | 현재
          집단)]. 셀을 열면 현재 조건에 행과 열을 더한 전체 Segment Dashboard로
          이동합니다. 빈도가 30건 미만인 셀은 희소한 관측으로 해석하세요.
        </p>
      </Module>
      <div className="profile-linked">
        <Module title="현재 집단의 주요 신호">
          <StatList
            stats={ranked(data.profile.signals, 7)}
            context={c}
            limit={7}
          />
        </Module>
        <Module title="다른 방향으로 나누기">
          <div className="matrix-presets">
            {[
              ['need', 'channel', '욕구 × 채널'],
              ['archetype', 'archetype', '유형 × 유형'],
              ['age', 'market', '연령 × 산업'],
              ['behavior', 'interest', '행동 × 하위 시장'],
            ].map(([row, column, label]) => (
              <Link
                prefetch={false}
                key={label}
                href={contextHref('matrix', c.ids, {
                  ...c,
                  row: row as AtlasAxis,
                  column: column as AtlasAxis,
                  focus: null,
                })}
              >
                {label} ↗
              </Link>
            ))}
          </div>
          <p className="basis-note">
            행·열은 현재 인구가 큰 상위 항목부터 표시합니다. 관련 관심 산업을
            지정한 경우 해당 산업을 열에 포함합니다.
          </p>
        </Module>
      </div>
    </>
  );
}
const groups = [
  '전체 후보',
  '작지만 강한 후보',
  '규모가 큰 후보',
  '여러 산업 연결',
  '검증이 더 필요한 후보',
  '연간 소비액순',
  '참여자당 지출순',
  '작은 고지출 집단',
];
export function Opportunity({ data }: { data: AtlasPayload }) {
  const c = data.context,
    router = useRouter(),
    pathname = usePathname(),
    params = useSearchParams();
  const [group, setGroup] = useState(groups[0]);
  let items = [...data.opportunities];
  if (group === groups[1])
    items = items
      .filter((s) => s.estimate.share < 0.03)
      .sort((a, b) => b.metrics.smallStrongScore - a.metrics.smallStrongScore);
  if (group === groups[2])
    items.sort((a, b) => b.estimate.population - a.estimate.population);
  if (group === groups[3])
    items = items
      .filter((s) => s.metrics.crossIndustryBreadth >= 3)
      .sort(
        (a, b) =>
          b.metrics.crossIndustryBreadth - a.metrics.crossIndustryBreadth,
      );
  if (group === groups[4])
    items = items.filter((s) => s.metrics.confidence === 'Limited');
  if (group === '연간 소비액순')
    items = items
      .filter((s) => s.marketValue?.base !== null)
      .sort((a, b) => (b.marketValue?.base ?? 0) - (a.marketValue?.base ?? 0));
  if (group === '참여자당 지출순')
    items = items
      .filter((s) => s.marketValue?.annualSpendPerUnit !== null)
      .sort(
        (a, b) =>
          (b.marketValue?.annualSpendPerUnit ?? 0) -
          (a.marketValue?.annualSpendPerUnit ?? 0),
      );
  if (group === '작은 고지출 집단')
    items = items.filter(
      (s) =>
        s.estimate.share < 0.03 && (s.marketValue?.spendDensityIndex ?? 0) > 1,
    );
  const compare = (s: Summary) => {
    const key = conditionKey(s.ids),
      current = c.compare.map(conditionKey);
    const next = current.includes(key)
      ? current.filter((k) => k !== key)
      : [...current, key].slice(-3);
    const p = new URLSearchParams(params.toString());
    if (next.length) p.set('compare', next.join('|'));
    else p.delete('compare');
    router.push(pathname + '?' + p.toString(), { scroll: false });
  };
  return (
    <>
      <div className="opportunity-main">
        <Module
          title="Opportunity Landscape"
          note="같은 모집단에서 규모 · 소비 관여 · 니즈 · 산업 연결을 비교합니다"
        >
          <MoneyOpportunityChart items={data.opportunities} context={c} />
          <div className="opportunity-legend">
            <span>
              <i /> 현재 선택 유지
            </span>
            <span>점수는 사업 가치나 성공 확률이 아닙니다.</span>
            <span>
              큰 집단: 전체 인구의 3% 이상 · 고지출: 해당 범위의 참여자당 평균
              초과
            </span>
            <span>추세·경쟁 미확보 → 남은 입력으로 가중치 재정규화</span>
          </div>
        </Module>
        <Module
          title="지금 선택한 집단"
          note="이 집단을 기준으로 후보를 비교하세요"
        >
          <Entry
            entity={data.profile.summary.entity}
            context={c}
            className="current-entity-name"
          >
            {data.profile.summary.entity.label}
          </Entry>
          <div className="score-breakdown">
            {Object.entries(data.profile.summary.metrics.components).map(
              ([k, v]) => (
                <div key={k}>
                  <span>
                    {
                      {
                        size: '인구 규모',
                        economicValue: '경제적 규모',
                        distinctiveness: '차별성',
                        consumption: '소비 관여',
                        need: '불편·니즈',
                        reach: '디지털 접점',
                        crossIndustry: '산업 연결',
                        momentum: '시장 추세',
                        competition: '경쟁',
                      }[k]
                    }
                  </span>
                  <i>
                    <em style={{ width: (v ?? 0) + '%' }} />
                  </i>
                  <b>{v === null ? '미확보' : Math.round(v)}</b>
                </div>
              ),
            )}
          </div>
          <button
            className="secondary-button"
            disabled={!c.ids.length}
            onClick={() => compare(data.profile.summary)}
          >
            현재 집단{' '}
            {c.compare.some((x) => conditionKey(x) === conditionKey(c.ids))
              ? '비교에서 제거'
              : '비교에 담기'}
          </button>
        </Module>
      </div>
      <Module
        title="기회 후보 비교"
        note="최대 3개 집단 · 주소에 비교 선택을 유지합니다"
      >
        <div className="candidate-tabs">
          {groups.map((g) => (
            <button
              key={g}
              className={group === g ? 'active' : ''}
              onClick={() => setGroup(g)}
            >
              {g}
            </button>
          ))}
        </div>
        <div className="table-scroll">
          <table className="opportunity-table">
            <thead>
              <tr>
                <th>기회 후보</th>
                <th>추정 규모</th>
                <th>Opportunity</th>
                <th>연간 소비액</th>
                <th>지출 / 참여자</th>
                <th>소비 관여</th>
                <th>산업 연결</th>
                <th>표본 / 입력</th>
                <th>비교</th>
              </tr>
            </thead>
            <tbody>
              {items.map((s) => (
                <tr
                  key={conditionKey(s.ids)}
                  className={
                    conditionKey(s.ids) === conditionKey(c.ids)
                      ? 'current-row'
                      : ''
                  }
                >
                  <td>
                    <Entry entity={s.entity} context={c} />
                    {conditionKey(s.ids) === conditionKey(c.ids) && (
                      <small>현재 선택</small>
                    )}
                  </td>
                  <td>{shortPopulation(s.estimate.population)}명</td>
                  <td>
                    <b>{s.metrics.opportunity ?? '—'}</b>
                  </td>
                  <td>{formatKRW(s.marketValue?.base, false)}</td>
                  <td>{formatKRW(s.marketValue?.annualSpendPerUnit, false)}</td>
                  <td>{s.metrics.consumptionIntensity ?? '—'}</td>
                  <td>{s.metrics.crossIndustryBreadth}개</td>
                  <td>
                    {s.estimate.support.toLocaleString()} /{' '}
                    {s.metrics.completeness}%
                  </td>
                  <td>
                    <button
                      onClick={() => compare(s)}
                      aria-label={`${s.entity.label} 비교 선택`}
                    >
                      {c.compare.some(
                        (ids) => conditionKey(ids) === conditionKey(s.ids),
                      )
                        ? '✓ 선택됨'
                        : '+ 비교'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!items.length && (
            <p className="empty">
              현재 범위에는 이 기준을 충족하는 후보가 없습니다.
            </p>
          )}
        </div>
      </Module>
      {data.comparison.length > 0 && (
        <Module title="선택한 집단 나란히 비교">
          <div className="comparison-grid">
            {data.comparison.map((s) => (
              <div key={conditionKey(s.ids)}>
                <Entry entity={s.entity} context={c} />
                <strong>{shortPopulation(s.estimate.population)}명</strong>
                <span>
                  범위 {shortPopulation(s.estimate.low)}–
                  {shortPopulation(s.estimate.high)}명
                </span>
                <dl>
                  <dt>연간 소비액</dt>
                  <dd>{formatKRW(s.marketValue?.base, false)}</dd>
                  <dt>참여자당 지출</dt>
                  <dd>{formatKRW(s.marketValue?.annualSpendPerUnit, false)}</dd>
                  <dt>지출 범위</dt>
                  <dd>{s.marketValue?.scopeLabel}</dd>
                  <dt>Opportunity</dt>
                  <dd>{s.metrics.opportunity}</dd>
                  <dt>소비 관여</dt>
                  <dd>{s.metrics.consumptionIntensity}</dd>
                  <dt>평균과의 차이</dt>
                  <dd>{s.metrics.distinctivenessScore}</dd>
                  <dt>연결 산업</dt>
                  <dd>{s.metrics.crossIndustryBreadth}개</dd>
                  <dt>데이터 입력</dt>
                  <dd>{s.metrics.completeness}%</dd>
                </dl>
                <button onClick={() => compare(s)}>비교에서 제거</button>
              </div>
            ))}
          </div>
        </Module>
      )}
      {data.money && <MoneyBasis value={data.money.summary} />}
      <Module title="점수 해석과 추정 근거">
        <Basis profile={data.profile} />
      </Module>
    </>
  );
}
