'use client';
import Link from 'next/link';
import { ArrowUpRight, Database, Info, Network } from 'lucide-react';
import {
  formatKRW,
  unitLabel,
} from '@/lib/market-value';
import {
  researchPopulation,
  type ResearchCandidate,
  type ResearchWorkspacePayload,
} from '@/lib/research-workspace';
import { researchHref } from '@/lib/research-explorer';

function BarList({
  rows,
  empty,
}: {
  rows: { label: string; share: number; covered?: boolean }[];
  empty: string;
}) {
  if (!rows.length) return <p className="rp-empty">{empty}</p>;
  return (
    <div className="rp-bars">
      {rows.slice(0, 6).map((row) => (
        <div key={row.label}>
          <span>{row.label}</span>
          <i>
            <b style={{ width: `${Math.max(0, Math.min(100, row.share * 100))}%` }} />
          </i>
          <strong>{row.covered === false ? '범위 밖' : `${(row.share * 100).toFixed(1)}%`}</strong>
        </div>
      ))}
    </div>
  );
}

function selectedChildren(
  data: ResearchWorkspacePayload,
  selected: ResearchCandidate,
) {
  if (selected.level === 'market')
    return data.candidates.filter(
      (candidate) =>
        candidate.market === selected.market && candidate.level === 'branch',
    );
  const branchLabel = selected.level === 'branch' ? selected.label : selected.parentLabel;
  return data.candidates.filter(
    (candidate) =>
      candidate.market === selected.market &&
      candidate.level === 'archetype' &&
      candidate.parentLabel === branchLabel,
  );
}

function moneyStatus(candidate: ResearchCandidate) {
  return candidate.marketValue.annualValue === null
    ? '지출 기준 미확보'
    : `${formatKRW(candidate.marketValue.annualValue)} / 년`;
}

export function ResearchProfileDashboard({
  data,
}: {
  data: ResearchWorkspacePayload;
}) {
  const selected = data.selected;
  if (!selected)
    return (
      <section className="rp-missing">
        <Network size={28} />
        <h2>프로필로 볼 집단을 먼저 선택하세요</h2>
        <p>시장 탐색에서 시장이나 관심·경험 집단을 선택하면 이 화면에서 규모와 근거를 함께 확인할 수 있습니다.</p>
        <Link href="/atlas">시장 탐색으로 이동 <ArrowUpRight size={14} /></Link>
      </section>
    );

  const children = selectedChildren(data, selected);
  const value = selected.marketValue;
  const trend = value.nationalTrend ?? [];
  const first = trend[0]?.value ?? null;
  const last = trend.at(-1)?.value ?? null;
  const change = first && last ? last / first - 1 : null;
  const confidence = value.status === 'estimated' ? value.confidence : 'Unavailable';
  const unit = unitLabel(selected.unit);

  return (
    <section className="research-profile-dashboard" aria-label="세그먼트 프로필">
      <div className="rp-breadcrumb">
        세그먼트 프로필 <span>›</span> {selected.marketLabel}
        {selected.parentLabel && <><span>›</span> {selected.parentLabel}</>}
      </div>
      <header className="rp-heading">
        <div>
          <small>SEGMENT PROFILE · {selected.grade} 근거</small>
          <h2>{selected.label}</h2>
          <p>{selected.scope}</p>
        </div>
        <Link href={researchHref(selected.market, selected.node, selected.age, data.context.compare, data.context.metric)}>
          수요 흐름에서 보기 <Network size={14} />
        </Link>
      </header>

      <div className="rp-metrics">
        <div>
          <small>관련 인구 / 가구</small>
          <strong>{researchPopulation(selected.population, selected.unit)}</strong>
          <span>Low {researchPopulation(selected.low, selected.unit)} · High {researchPopulation(selected.high, selected.unit)}</span>
        </div>
        <div>
          <small>연간 관련 소비금액</small>
          <strong className={value.annualValue === null ? 'muted' : ''}>{moneyStatus(selected)}</strong>
          <span>{value.scopeLabel ?? '같은 품목·채널·구매 주체의 기준 필요'}</span>
        </div>
        <div>
          <small>단위당 연간 지출</small>
          <strong className={value.annualSpendPerUnit === null ? 'muted' : ''}>
            {value.annualSpendPerUnit === null ? '근거 미확보' : `${formatKRW(value.annualSpendPerUnit)} / ${unit}·년`}
          </strong>
          <span>{value.denominatorLabel ?? '참여 인구 기준'}</span>
        </div>
        <div>
          <small>추정 신뢰도</small>
          <strong className="rp-grade">{selected.grade}<em>{confidence}</em></strong>
          <span>인구·지출 근거의 범위와 가정 포함</span>
        </div>
      </div>

      <div className="rp-grid">
        <section className="rp-card rp-trend">
          <div className="rp-card-head"><div><small>RECENT TREND · 기준 시장</small><h3>최근 기준 시장 추이</h3></div>{change !== null && <strong>{change >= 0 ? '+' : ''}{(change * 100).toFixed(1)}%</strong>}</div>
          {trend.length >= 2 ? (
            <div className="rp-trend-chart">
              {trend.map((point) => {
                const max = Math.max(...trend.map((item) => item.value), 1);
                return <div key={point.year}><span>{formatKRW(point.value)}</span><i style={{ height: `${Math.max(10, (point.value / max) * 105)}px` }} /><small>{point.year}</small></div>;
              })}
            </div>
          ) : <p className="rp-empty">동일한 품목·기간의 시계열 근거가 없어 추세를 표시하지 않습니다.</p>}
          {trend.length >= 2 && <p className="rp-note">전국 기준액 변화이며 선택 집단의 성장률이 아닙니다.</p>}
        </section>
        <section className="rp-card">
          <div className="rp-card-head"><div><small>COMPOSITION · OFFICIAL FRAME</small><h3>연령별 분포</h3></div><span>공식 인구 × 조사율</span></div>
          <BarList rows={selected.ages} empty="교차 연령표를 확보하지 못했습니다." />
        </section>
        <section className="rp-card">
          <div className="rp-card-head"><div><small>REGION MODEL</small><h3>지역별 분포</h3></div><span>배분 모형</span></div>
          <BarList rows={[...selected.regions].sort((a, b) => b.share - a.share)} empty="지역 분포를 확보하지 못했습니다." />
          <p className="rp-note">{selected.regionBasis}</p>
        </section>
        <section className="rp-card rp-job">
          <div className="rp-card-head"><div><small>JOB TO VALIDATE</small><h3>이 집단에서 검증할 문제</h3></div><span>가설</span></div>
          <h4>{selected.job || '다음 탐색에서 문제 강도를 확인하세요.'}</h4>
          <p>{selected.hypothesis || '활동·구매 경험이 실제 불편과 지불 의향으로 이어지는지 추가 조사가 필요합니다.'}</p>
          <div className="rp-job-columns"><div><small>현재 대안</small><p>{selected.alternatives || '대안 정보 미확보'}</p></div><div><small>다음 질문</small><p>{selected.question || '최근 구매·사용 빈도와 해결 의향을 확인하세요.'}</p></div></div>
        </section>
      </div>

      <section className="rp-lower-types">
        <div className="rp-card-head"><div><small>LOWER TYPES · BRANCH LOCAL</small><h3>{selected.level === 'market' ? '주요 경험·니즈' : `${selected.label} 안의 하위 행동·구매 방식`}</h3><p>하위 유형은 상위 시장과 동급으로 합산하지 않고, 선택 집단 안에서 추가 비교합니다.</p></div><span>{children.length}개</span></div>
        {children.length ? <div className="rp-lower-table"><div className="rp-lower-row rp-lower-header"><span>유형</span><span>관련 인구</span><span>연간 소비금액</span><span>근거</span></div>{children.map((child) => <Link key={child.key} href={researchHref(child.market, child.node, child.age, data.context.compare, data.context.metric)} className="rp-lower-row"><span><b>{child.label}</b><small>{child.job || child.scope}</small></span><strong>{researchPopulation(child.population, child.unit)}</strong><strong>{moneyStatus(child)}</strong><span className="rp-lower-grade">{child.grade}<ArrowUpRight size={13} /></span></Link>)}</div> : <p className="rp-empty">이 집단의 하위 유형이 아직 연결되지 않았습니다.</p>}
      </section>

      <section className="rp-evidence">
        <div className="rp-card-head"><div><small>EVIDENCE & ASSUMPTIONS</small><h3>산출 근거</h3></div><span><Database size={13} /> {selected.sourceIds.length}개 출처</span></div>
        <div className="rp-evidence-grid"><div>{selected.observations.map((observation) => <p key={observation.label}><b>{observation.label}</b><span>{observation.value}</span></p>)}</div><ul>{selected.assumptions.slice(0, 5).map((assumption) => <li key={assumption}>{assumption}</li>)}</ul></div>
        <p className="rp-footnote"><Info size={13} /> 인구와 금액은 외부 조사·공식 모집단으로 만든 추정입니다. 지출 풀은 확보 가능한 범위이며 매출·SOM이 아닙니다.</p>
      </section>
    </section>
  );
}
