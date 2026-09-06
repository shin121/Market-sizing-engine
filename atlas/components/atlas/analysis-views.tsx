'use client';
import Link from 'next/link';
import { formatKRW } from '@/lib/market-value';
import { MoneyOpportunityChart, MoneyBasis } from './money';
import { SpendRange, SpendBreakdown, EvidenceTable } from './economic-profile';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useWorkspace } from './workspace';
import { candidateKey, makeCandidate } from '@/lib/discovery';
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
        title={`${s.entity.label}: 관련 인구 ${shortPopulation(s.population)}명 · 현재 집단의 ${pct(s.share)}`}
      >
        <b>{s.entity.label}</b>
        <span>
          ≈ {shortPopulation(s.population)}명 <strong>{pct(s.share)}</strong>
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
        <h4>연간 소비액 · 범위</h4>
        <SpendRange value={p.summary.marketValue} />
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
        <SpendBreakdown value={p.summary.marketValue} limit={4} />
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
        <details>
          <summary>연결된 출처 확인</summary>
          <EvidenceTable profile={p} />
        </details>
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
        note="서술 일치(n)와 보정 모델 배정을 구분합니다 · 하이라이트는 n≥30인 셀 중 선정"
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
                href={href(segmentEntity(h.cell.ids), {
                  ...c,
                  moneyScope: h.cell.marketValue?.scopeId ?? c.moneyScope,
                })}
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
                            {cell.support === 0 && cell.population > 0
                              ? ' · 모델 배정만'
                              : cell.support < 30
                                ? ' · 희소'
                                : ''}
                            {money && (
                              <em className="matrix-scope">
                                {cell.marketValue?.scopeLabel}
                              </em>
                            )}
                            {money &&
                              cell.marketValue?.relevantPopulation != null &&
                              Math.abs(
                                cell.marketValue.relevantPopulation -
                                  cell.population,
                              ) > 1 && (
                                <em
                                  className="matrix-scope"
                                  title="관심 인구와 연간 소비액의 배분 분모가 다릅니다. 실제 구매자 수가 아닙니다."
                                >
                                  배분 대상{' '}
                                  {shortPopulation(
                                    cell.marketValue.relevantPopulation,
                                  )}
                                  명 · 관심 인구와 구분
                                </em>
                              )}
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
                            href={href(segmentEntity(cell.ids), {
                              ...c,
                              moneyScope:
                                cell.marketValue?.scopeId ?? c.moneyScope,
                            })}
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
  '관련 인구당 지출순',
  '작은 고지출 집단',
];
export function Opportunity({ data }: { data: AtlasPayload }) {
  const c = data.context;
  const { workspace, update } = useWorkspace();
  const [compareMessage, setCompareMessage] = useState('');
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
  if (group === '관련 인구당 지출순')
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
  const selected = (s: Summary) =>
    workspace.compare.includes(
      candidateKey(s.ids, s.marketValue?.scopeId ?? c.moneyScope),
    );
  const compare = (s: Summary) => {
    const scope = s.marketValue?.scopeId ?? c.moneyScope,
      key = candidateKey(s.ids, scope);
    if (!selected(s) && workspace.compare.length >= 3) {
      setCompareMessage(
        '최대 3개입니다. 세그먼트 비교에서 후보를 정리해 주세요.',
      );
      return;
    }
    const ok = update((w) => ({
      ...w,
      candidates: w.candidates.some((x) => x.key === key)
        ? w.candidates
        : [...w.candidates, makeCandidate(s.ids, scope, s.entity.label)],
      compare: selected(s)
        ? w.compare.filter((k) => k !== key)
        : [...w.compare, key],
    }));
    setCompareMessage(
      ok
        ? '비교 선택을 저장했습니다.'
        : '브라우저 저장 공간을 사용할 수 없습니다.',
    );
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
              큰 집단: 전체 인구의 3% 이상 · 고지출: 해당 범위의 관련 인구당
              평균 초과
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
            {selected(data.profile.summary) ? '비교에서 제거' : '비교에 담기'}
          </button>
        </Module>
      </div>
      <Module
        title="기회 후보 비교"
        note="최대 3개 집단 · 화면을 이동해도 비교 선택과 지출 범위 유지"
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
                <th>연간 금액 / 명</th>
                <th>소비 관여</th>
                <th>산업 연결</th>
                <th>원 서술 n / 계산 입력</th>
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
                    {conditionKey(s.ids) !== conditionKey(c.ids) &&
                      c.ids.length > 0 && (
                        <span className="candidate-reason">
                          현재 인구의{' '}
                          {pct(
                            data.profile.summary.estimate.population
                              ? s.estimate.population /
                                  data.profile.summary.estimate.population
                              : 0,
                          )}{' '}
                          · 점수 변화{' '}
                          {(s.metrics.opportunity ?? 0) -
                            (data.profile.summary.metrics.opportunity ?? 0) >=
                          0
                            ? '+'
                            : ''}
                          {(s.metrics.opportunity ?? 0) -
                            (data.profile.summary.metrics.opportunity ??
                              0)}{' '}
                          · 조건 추가에 따른 상대 신호 변화
                        </span>
                      )}
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
                      {selected(s) ? '✓ 선택됨' : '+ 비교'}
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
      <div className="opportunity-workspace-link">
        <output>{compareMessage}</output>
        <Link href="/atlas/compare">
          선택한 {workspace.compare.length}개 세그먼트 나란히 비교 ↗
        </Link>
      </div>
      <p className="inline-caveat">
        계산 입력 비율은 점수에 사용 가능한 가중치의 비중입니다. 데이터 정확도나
        실제 구매 가능성이 아닙니다. 유사 후보는 중복 인구를 가지며 합산할 수
        없습니다.
      </p>
      {data.money && <MoneyBasis value={data.money.summary} />}
      <Module title="점수 해석과 추정 근거">
        <Basis profile={data.profile} />
      </Module>
    </>
  );
}
