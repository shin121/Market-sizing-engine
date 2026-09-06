'use client';
import Link from 'next/link';
import { formatKRW, moneyStatus } from '@/lib/market-value';
import type { ReactNode, ComponentProps } from 'react';
import { ArrowUpRight, Plus } from 'lucide-react';
import {
  canonicalIds,
  conditionKey,
  entityPath,
  KIND_NAMES,
  FAMILY_NAMES,
  population,
  shortPopulation,
  pct,
  type AtlasEntity,
  type AtlasContext,
  type Summary,
  type Stat,
  type Profile,
} from '@/lib/atlas';
export function segmentEntity(
  ids: string[],
  label = '조합 세그먼트',
): AtlasEntity {
  return {
    id: conditionKey(ids) || 'universe',
    label,
    kind: 'segment',
    family: 'affinity',
    definition: ids,
  };
}
export function href(entity: AtlasEntity, c: AtlasContext) {
  const p = new URLSearchParams();
  const trail = [...c.trail, ...(c.ids.length ? [conditionKey(c.ids)] : [])]
    .filter((v, i, a) => i === 0 || v !== a[i - 1])
    .slice(-6);
  if (trail.length) p.set('trail', trail.join('|'));
  if (c.metric !== 'population') p.set('metric', c.metric);
  p.set(
    'spend',
    entity.kind === 'market'
      ? entity.id
      : entity.kind === 'interest' && entity.parent
        ? entity.parent
        : c.moneyScope,
  );
  if (c.compare.length) p.set('compare', c.compare.map(conditionKey).join('|'));
  p.set('x', c.xAxis);
  p.set('y', c.yAxis);
  const target =
    entity.kind === 'interest' && entity.parent
      ? segmentEntity([entity.parent, entity.id], entity.label)
      : entity;
  return entityPath(target) + (p.size ? '?' + p.toString() : '');
}
export function jointHref(id: string, c: AtlasContext) {
  return href(
    segmentEntity(canonicalIds(c.ids.length >= 8 ? c.ids : [...c.ids, id])),
    c,
  );
}
export function Entry({
  entity,
  context,
  children,
  className = '',
}: {
  entity: AtlasEntity;
  context: AtlasContext;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <Link
      prefetch={false}
      className={className}
      href={href(entity, context)}
      title={`${entity.label} · ${KIND_NAMES[entity.kind]} 대시보드`}
    >
      {children ?? entity.label}
    </Link>
  );
}
export function Module({
  title,
  note,
  action,
  children,
  className = '',
}: {
  title: string;
  note?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={'analysis-module ' + className}>
      <header>
        <div>
          <h2>{title}</h2>
          {note && <span className="module-note">{note}</span>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}
export function ranked(stats: Stat[], limit = 7, kind?: string) {
  return stats
    .filter(
      (s) =>
        !s.defining &&
        s.support >= 30 &&
        s.index !== null &&
        s.share >= 0.005 &&
        (!kind || s.entity.kind === kind),
    )
    .sort(
      (a, b) =>
        Math.abs(Math.log2(Math.max(0.03, b.index!))) * Math.sqrt(b.share) -
        Math.abs(Math.log2(Math.max(0.03, a.index!))) * Math.sqrt(a.share),
    )
    .slice(0, limit);
}
export function StatList({
  stats,
  context,
  limit = 6,
  join = true,
  showIndex = true,
}: {
  stats: Stat[];
  context: AtlasContext;
  limit?: number;
  join?: boolean;
  showIndex?: boolean;
}) {
  const list = stats.slice(0, limit);
  return (
    <div className="stat-list">
      {list.map((s, i) => (
        <div className="stat-row" key={s.entity.id}>
          <span className="rank">{String(i + 1).padStart(2, '0')}</span>
          <Entry
            entity={
              context.ids.length &&
              join &&
              !s.defining &&
              context.ids.length < 8
                ? segmentEntity(
                    canonicalIds([...context.ids, s.entity.id]),
                    s.entity.label,
                  )
                : s.entity
            }
            context={context}
            className="row-label"
          >
            <span>{s.entity.label}</span>
            <span className="micro-track">
              <i style={{ width: Math.min(100, s.share * 100) + '%' }} />
            </span>
          </Entry>
          <span className="row-share">{pct(s.share)}</span>
          {showIndex && (
            <strong
              className={s.direction === 'under' ? 'index-under' : 'index-over'}
              title={`전체 ${pct(s.baseShare)} → 현재 ${pct(s.share)} · 원본 ${s.support.toLocaleString()}건`}
            >
              {population(s.population)}
            </strong>
          )}
          {join &&
            context.ids.length > 0 &&
            !context.ids.includes(s.entity.id) &&
            context.ids.length < 8 && (
              <Link
                prefetch={false}
                className="join-button"
                href={jointHref(s.entity.id, context)}
                title={`${s.entity.label} 조건 추가`}
                aria-label={`${s.entity.label} 조건 추가`}
              >
                <Plus size={13} />
              </Link>
            )}
        </div>
      ))}
      {!list.length && (
        <p className="empty">이 조건에서 충분히 반복된 신호가 없습니다.</p>
      )}
    </div>
  );
}
export function SummaryRows({
  items,
  context,
  limit = 5,
  metric = 'opportunity',
}: {
  items: Summary[];
  context: AtlasContext;
  limit?: number;
  metric?: 'opportunity' | 'population' | 'small';
}) {
  return (
    <div className="summary-rows">
      {items.slice(0, limit).map((s, i) => (
        <Entry
          key={conditionKey(s.ids)}
          entity={s.entity}
          context={context}
          className="summary-row"
        >
          <span className="rank">{String(i + 1).padStart(2, '0')}</span>
          <span className="summary-name">
            {s.entity.label}
            <small>
              {population(s.estimate.population)} ·{' '}
              {s.metrics.crossIndustryBreadth}개 산업 연결
            </small>
          </span>
          <strong>
            {metric === 'population'
              ? shortPopulation(s.estimate.population)
              : metric === 'small'
                ? s.metrics.smallStrongScore
                : (s.metrics.opportunity ?? '—')}
          </strong>
          <ArrowUpRight size={13} />
        </Entry>
      ))}
    </div>
  );
}
export function PopulationStrip({
  summary,
  global = false,
}: {
  summary: Summary;
  global?: boolean;
}) {
  const { estimate: e, metrics: m } = summary;
  return (
    <div className="population-strip with-money">
      <div className="metric-main">
        <span>
          {global
            ? '대한민국 20세 이상'
            : e.populationMethod === 'survey_calibrated_proxy'
              ? '조사 비율로 보정한 추정 인구'
              : '관련 소비자 · 서술 기반 추정'}
        </span>
        <strong>
          {shortPopulation(e.population)}
          <small> 명</small>
        </strong>
        <small>
          {global
            ? '인구주택총조사 연령·성별 기준'
            : `${shortPopulation(e.low)}–${shortPopulation(e.high)}명 · 전체 ${pct(e.share)}`}
        </small>
      </div>
      {summary.marketValue && (
        <>
          <div className="money-main" title={summary.marketValue.scopeLabel}>
            <span>연간 소비액 · 확보 범위</span>
            <strong>{formatKRW(summary.marketValue.base, false)}</strong>
            <small>
              {summary.marketValue.status === 'estimated'
                ? summary.marketValue.scopeLabel
                : moneyStatus(summary.marketValue)}
            </small>
          </div>
          <div>
            <span>
              {summary.marketValue.denominatorLabel ?? '참여자당 연간 지출'}
            </span>
            <strong>
              {formatKRW(summary.marketValue.annualSpendPerUnit, false)}
            </strong>
            <small>
              {summary.marketValue.relevantPopulation === null
                ? '참여 인구 산정 기준 필요'
                : shortPopulation(summary.marketValue.relevantPopulation) +
                  (summary.marketValue.denominatorBasis ===
                  'adult_profile_allocation'
                    ? '명 소비 프로필'
                    : '명 참여 추정')}
            </small>
          </div>
        </>
      )}
      <div>
        <span>Opportunity</span>
        <strong>
          {m.opportunity ?? '—'}
          <small> / 100</small>
        </strong>
        <small>탐색 후보의 상대 점수</small>
      </div>
      <div>
        <span>소비 관여</span>
        <strong>
          {m.consumptionIntensity ?? '—'}
          <small> / 100</small>
        </strong>
        <small>구매·이용 신호 proxy</small>
      </div>
      <div>
        <span>평균과의 차이</span>
        <strong>
          {m.distinctivenessScore}
          <small> / 100</small>
        </strong>
        <small>정의 신호를 제외한 분포</small>
      </div>
      <div>
        <span>산업 연결</span>
        <strong>
          {m.crossIndustryBreadth}
          <small> 개</small>
        </strong>
        <small>평균보다 연결 비중이 높은 산업</small>
      </div>
    </div>
  );
}
export function Basis({ profile }: { profile: Profile }) {
  const { summary: s } = profile;
  return (
    <div className="basis-grid">
      <div>
        <b>분석 표본</b>
        <span>{s.estimate.support.toLocaleString()}건 / 989,509건</span>
        <small>합성 페르소나에서 명시적으로 검출한 신호</small>
      </div>
      <div>
        <b>규모 추정</b>
        <span>연령대 × 성별 16개 인구 기준</span>
        <small>2024.11.01 · 사람 단위 / 가구·매출 규모 아님</small>
      </div>
      <div>
        <b>추정 범위</b>
        <span>
          {shortPopulation(s.estimate.low)}–{shortPopulation(s.estimate.high)}명
        </span>
        <small>
          민감도 ±
          {s.estimate.support >= 1000
            ? s.estimate.populationMethod === 'survey_calibrated_proxy'
              ? '40'
              : '30'
            : '50'}
          % · 통계적 신뢰구간 아님
        </small>
      </div>
      <div>
        <b>신호 범위</b>
        <span>
          {s.metrics.confidence} · 점수 입력 {s.metrics.completeness}%
        </span>
        <small>개별 지출·소득·경쟁은 미관측 · 외부 소비 기준은 별도 연결</small>
      </div>
      <div>
        <b>출처</b>
        <a
          href="https://huggingface.co/datasets/nvidia/Nemotron-Personas-Korea"
          target="_blank"
          rel="noreferrer"
        >
          NVIDIA Nemotron-Personas-Korea ↗
        </a>
        <small>v1.0 · 2026.04.20 · CC BY 4.0</small>
      </div>
      <div>
        <b>해석</b>
        <span>동시 언급은 인과·구매율을 뜻하지 않습니다</span>
        <small>정의 신호, 공통 서술 양식, 미언급에 따른 편향 존재</small>
      </div>
    </div>
  );
}
export function Definitions({
  profile,
  context,
}: {
  profile: Profile;
  context: AtlasContext;
}) {
  const definitions = profile.signals.filter((s) => s.defining);
  return (
    <div className="definition-line">
      <span>유형을 정하는 소비 신호</span>
      {definitions.map((s) => (
        <Entry key={s.entity.id} entity={s.entity} context={context}>
          {s.entity.label}
        </Entry>
      ))}
      <small>이 신호는 ‘평균과의 차이’ 계산에서 제외</small>
    </div>
  );
}
export function familyLabel(f: string) {
  return FAMILY_NAMES[f] ?? f;
}

export function JointLink({
  condition,
  context,
  children,
  ...props
}: Omit<ComponentProps<'a'>, 'href'> & {
  condition: string;
  context: AtlasContext;
}) {
  const blocked = context.ids.length >= 8 && !context.ids.includes(condition);
  return (
    <Link
      {...props}
      prefetch={false}
      href={blocked ? '#' : jointHref(condition, context)}
      aria-disabled={blocked || undefined}
      title={
        blocked
          ? '최대 8개 조건입니다. 먼저 현재 조건 하나를 제거하세요.'
          : props.title
      }
      onClick={(e) => {
        if (blocked) e.preventDefault();
        else props.onClick?.(e);
      }}
    >
      {children}
    </Link>
  );
}
