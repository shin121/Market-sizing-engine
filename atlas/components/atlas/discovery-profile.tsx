'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  ArrowUpRight,
  SlidersHorizontal,
  ChevronRight,
  Layers3,
} from 'lucide-react';
import {
  contextHref,
  pct,
  population,
  indexLabel,
  type AtlasPayload,
  type Profile,
  type AtlasContext,
  type Stat,
} from '@/lib/atlas';
import { orderedConditions, validationGaps } from '@/lib/discovery';
import { formatKRW } from '@/lib/market-value';
import {
  Module,
  href,
  jointHref,
  segmentEntity,
  StatList,
  ranked,
} from './common';
import { MarketMap, AgeChart, RegionChart } from './charts';
import {
  SpendBreakdown,
  BaselineTrend,
  SpendRange,
  EvidenceTable,
  PopulationCalibrationNote,
} from './economic-profile';
import { MoneyBasis, MoneyRadar } from './money';
import { WorkspaceActions } from './workspace';

export function FocusMetrics({ profile }: { profile: Profile }) {
  const s = profile.summary,
    v = s.marketValue;
  return (
    <div className="focus-metrics">
      <div>
        <span>관련 인구 · 추정</span>
        <strong>{population(s.estimate.population)}</strong>
        <small>
          Low {population(s.estimate.low)} · High {population(s.estimate.high)}
        </small>
        <div className="mini-range">
          <i />
          <b />
          <i />
        </div>
      </div>
      <div>
        <span>관련 연간 소비액</span>
        <strong>
          {formatKRW(v?.base, false)}
          <em> / 년</em>
        </strong>
        <small>{v?.base == null ? '지출 기준 미확보' : v.scopeLabel}</small>
      </div>
      <div>
        <span>
          {v?.denominatorBasis === 'adult_profile_allocation'
            ? '배분 대상 1인당 연간 금액'
            : '참여자당 연간 지출'}
        </span>
        <strong>{formatKRW(v?.annualSpendPerUnit, false)}</strong>
        <small>
          {v?.relevantPopulation != null
            ? `분모 ${population(v.relevantPopulation)} · ${v.denominatorBasis === 'adult_profile_allocation' ? '실제 구매자 평균 아님' : '참여 추정'}`
            : '대상·단위에 맞는 근거 필요'}
        </small>
      </div>
      <div>
        <span>탐색 우선도</span>
        <strong className="teal">
          {s.metrics.opportunity ?? '—'}
          <em> / 100</em>
        </strong>
        <small>상대 탐색 점수 · 사업 성공률 아님</small>
      </div>
      <div>
        <span>근거 상태</span>
        <strong className="confidence-value">
          {s.estimate.support < 30 ? '희소' : '모델 추정'}
        </strong>
        <small>
          서술 일치 {s.estimate.support.toLocaleString()}건 · 지출{' '}
          {v?.confidence === 'Unavailable'
            ? '미확보'
            : (v?.confidence ?? '미확보')}
        </small>
      </div>
    </div>
  );
}

export function SegmentBuilder({ data }: { data: AtlasPayload }) {
  const [open, setOpen] = useState(false),
    router = useRouter();
  const c = data.context;
  const add = (id: string) => {
    if (!id) return;
    const entity = data.navigation.find((e) => e.id === id)!;
    const family = entity.kind === 'age_range' ? 'age' : entity.kind;
    const ids = c.ids.filter((old) => {
      const kind = data.navigation.find((e) => e.id === old)?.kind;
      return (
        !['age', 'sex', 'region', 'marital', 'housing'].includes(family) ||
        (kind === 'age_range' ? 'age' : kind) !== family
      );
    });
    if (ids.length >= 8 && !ids.includes(id)) return;
    router.push(href(segmentEntity([...new Set([...ids, id])]), c));
  };
  return (
    <div className="segment-builder">
      <button aria-expanded={open} onClick={() => setOpen(!open)}>
        <SlidersHorizontal size={14} />
        생활 조건·문제 추가 <span> {c.ids.length}/8</span>
      </button>
      <span>
        시장 <ChevronRight size={11} /> 관심 영역 <ChevronRight size={11} />{' '}
        생활 조건·문제 <ChevronRight size={11} /> 구매 행동
      </span>
      {open && (
        <div className="builder-panel">
          {(
            [
              ['연령', ['age', 'age_range']],
              ['지역', ['region']],
              ['성별', ['sex']],
              ['가구 구성', ['household']],
              ['혼인 상태', ['marital']],
              ['불편·욕구', ['need']],
            ] as [string, string[]][]
          ).map(([label, kinds]) => (
            <label key={label}>
              {label}
              <select
                aria-label={label + ' 조건 추가'}
                value=""
                onChange={(e) => add(e.target.value)}
              >
                <option value="">조건 선택</option>
                {data.navigation
                  .filter(
                    (e) => kinds.includes(e.kind) && !c.ids.includes(e.id),
                  )
                  .map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.label}
                    </option>
                  ))}
              </select>
            </label>
          ))}
          <p>
            조건 사이는 AND입니다. 연령 묶음(예: 50–69세)은 OR 합집합으로 중복
            없이 계산합니다. ‘맞벌이’, 비이용 여부, 소득은 현재 근거로 확인할 수
            없습니다.
          </p>
        </div>
      )}
    </div>
  );
}

const domains = [
  { label: '소비재·커머스', ids: ['commerce', 'beauty', 'food', 'delivery'] },
  { label: '여행·이동', ids: ['travel', 'mobility'] },
  { label: '건강·운동', ids: ['wellness', 'fitness'] },
  { label: '교육·성장', ids: ['education', 'finance'] },
  {
    label: '콘텐츠·취미',
    ids: ['content', 'music', 'gaming', 'collect', 'photo'],
  },
  { label: '가족·생활', ids: ['family', 'home', 'pet', 'garden', 'community'] },
];
export function MarketDiscovery({ data }: { data: AtlasPayload }) {
  const [domain, setDomain] = useState('전체'),
    c = data.context;
  const marketItems = data.mapItems;
  const selected = domains.find((d) => d.label === domain);
  const items = selected
    ? marketItems.filter((s) => selected.ids.includes(s.entity.id))
    : marketItems;
  return (
    <>
      <div className="discovery-intro">
        <span>EXPLORE THE MARKET</span>
        <div className="universe-inline">
          대한민국 20세 이상 <b>{population(data.universe.population)}</b>
          <span>·</span>
          {data.universe.markets}개 시장<span>·</span>
          {data.money?.availableMarkets.length ?? 0}개 시장의 일부 지출 기준
          확보
        </div>
        <h2>어떤 일상에서 기회를 찾고 싶으세요?</h2>
        <p>
          시장을 고르고, 관심 영역과 생활 조건을 좁혀 보세요. 구매 방식은 선택한
          사람들 안에서 살펴봅니다.
        </p>
      </div>
      <div className="domain-tabs" aria-label="탐색 영역">
        {['전체', ...domains.map((d) => d.label)].map((label) => (
          <button
            key={label}
            aria-pressed={domain === label}
            onClick={() => setDomain(label)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="discovery-map-grid">
        <Module
          title="시장 지도"
          note="면적을 인구 또는 확보된 연간 소비액으로 비교"
        >
          <MarketMap items={items} context={c} />
          {c.metric === 'marketValue' && (
            <div className="unpriced-markets">
              <b>금액 근거를 기다리는 시장</b>
              {items
                .filter((s) => s.marketValue?.base == null)
                .map((s) => (
                  <Link href={href(s.entity, c)} key={s.entity.id}>
                    {s.entity.label}{' '}
                    <small>{population(s.estimate.population)}</small> ↗
                  </Link>
                ))}
              <small>
                기준 미확보는 0원이나 낮은 기회 가치를 뜻하지 않습니다.
              </small>
            </div>
          )}
        </Module>
        <Module
          title="관심 영역으로 들어가기"
          note="상위 시장 → 세부 관심 · 집단은 서로 중복될 수 있음"
        >
          <div className="market-directory">
            {items.map((s) => (
              <div key={s.entity.id}>
                <Link
                  className="market-directory-title"
                  href={href(s.entity, c)}
                >
                  <b>{s.entity.label}</b>
                  <span>
                    {population(s.estimate.population)}{' '}
                    <ArrowUpRight size={12} />
                  </span>
                </Link>
                <div>
                  {data.navigation
                    .filter(
                      (e) => e.kind === 'interest' && e.parent === s.entity.id,
                    )
                    .map((e) => (
                      <Link
                        key={e.id}
                        href={href(segmentEntity([s.entity.id, e.id]), {
                          ...c,
                          moneyScope: s.entity.id,
                        })}
                      >
                        {e.label}
                      </Link>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </Module>
      </div>
      <div className="discovery-bottom">
        <Module
          title="관심 → 문제 → 사업 가설"
          note="숫자를 보고 끝내지 않고 다음 검증으로 연결"
        >
          <ol className="journey-steps">
            <li>
              <b>01 시장과 관심 선택</b>
              <p>먼저 무엇을 하는 사람들인지 정의합니다.</p>
            </li>
            <li>
              <b>02 생활 조건과 불편 탐색</b>
              <p>
                누구의 어떤 문제인지 좁힙니다. 공동 언급과 실제 문제를
                구분합니다.
              </p>
            </li>
            <li>
              <b>03 비교·아이디어 저장</b>
              <p>근거와 빈칸을 비교하고 인터뷰·가격 조사 질문을 남깁니다.</p>
            </li>
          </ol>
        </Module>
        <Module title="데이터가 답할 수 있는 범위">
          <div className="scope-summary">
            <b>
              {data.universe.markets}개 시장 · {data.universe.archetypes}개 하위
              구매 유형
            </b>
            <p>
              인구·관심·행동은 합성 프로필 기반 추정입니다. 소비액은 외부 항목별
              지출을 배분합니다.
            </p>
            <Link href={contextHref('sources', [], c)}>
              데이터 출처와 필요한 검증 보기 ↗
            </Link>
          </div>
        </Module>
      </div>
    </>
  );
}

function SignalGroup({
  title,
  stats,
  context,
}: {
  title: string;
  stats: Stat[];
  context: AtlasContext;
}) {
  return (
    <div className="signal-group">
      <h3>{title}</h3>
      {stats.length ? (
        stats.slice(0, 3).map((s) => (
          <Link href={jointHref(s.entity.id, context)} key={s.entity.id}>
            <span>{s.entity.label}</span>
            <b>{pct(s.share)}</b>
          </Link>
        ))
      ) : (
        <p>독립적으로 확인된 신호 부족</p>
      )}
    </div>
  );
}
export function SegmentProfile({ data }: { data: AtlasPayload }) {
  const c = data.context,
    p = data.profile,
    v = p.summary.marketValue;
  const [sort, setSort] = useState('population'),
    [typeQuery, setTypeQuery] = useState(''),
    [showAll, setShowAll] = useState(false);
  const submarkets = p.submarkets.filter(
    (s) => !s.defining && s.population > 0,
  );
  const isBroad = !data.conditions.some(
    (e) => e.kind === 'interest' || e.kind === 'archetype',
  );
  const types = p.archetypes
    .filter((s) => s.population > 0 && s.share < 0.999)
    .map((s) => ({
      ...s,
      money: data.money?.contributions.find((m) => m.entity.id === s.entity.id)
        ?.estimate,
    }));
  types.sort((a, b) =>
    sort === 'value'
      ? (b.money?.base ?? -1) - (a.money?.base ?? -1)
      : sort === 'index'
        ? (b.index ?? 0) - (a.index ?? 0)
        : b.population - a.population,
  );
  return (
    <>
      {isBroad && submarkets.length > 0 && (
        <Module
          title="먼저, 어떤 관심 영역인가요?"
          note="관심을 선택한 뒤 생활 조건과 구매 유형으로 세분화하세요"
        >
          <div className="submarket-grid">
            {submarkets.map((s) => (
              <Link key={s.entity.id} href={jointHref(s.entity.id, c)}>
                <Layers3 size={17} />
                <span>
                  <b>{s.entity.label}</b>
                  <small>{pct(s.share)} · 현재 집단 내</small>
                </span>
                <strong>
                  {population(s.population)} <ChevronRight size={13} />
                </strong>
              </Link>
            ))}
          </div>
        </Module>
      )}
      <div className="profile-visuals">
        <Module title="연령별 분포" note="현재 집단 내 구성비">
          <AgeChart stats={p.demographics} context={c} />
        </Module>
        <Module title="지역별 분포" note="지역 인구는 별도 보정하지 않음">
          <RegionChart stats={p.demographics} context={c} />
        </Module>
        <Module title="전국 기준액의 변화" note="세그먼트 성장률은 미측정">
          <BaselineTrend value={v} />
        </Module>
        <Module title="연간 소비액 범위" note="Low / Base / High · 배분 민감도">
          <SpendRange value={v} />
        </Module>
      </div>
      <div className="profile-composition">
        <Module
          title="구성 및 소비 행동"
          note="비중 = 현재 집단 안의 공동 언급·모델 구성"
        >
          <div className="signal-groups">
            <SignalGroup
              title="가구·생활 상황"
              stats={p.demographics
                .filter((s) => s.entity.kind === 'household')
                .sort((a, b) => b.share - a.share)}
              context={c}
            />
            <SignalGroup
              title="발견·접점 채널"
              stats={ranked(p.signals, 3, 'channel')}
              context={c}
            />
            <SignalGroup
              title="소비 방식"
              stats={ranked(
                p.signals.filter((s) => s.entity.kind === 'behavior'),
                3,
              )}
              context={c}
            />
            <SignalGroup
              title="함께 나타나는 욕구"
              stats={ranked(
                p.signals.filter(
                  (s) => s.entity.kind === 'need' && s.entity.family !== 'pain',
                ),
                3,
              )}
              context={c}
            />
          </div>
        </Module>
        <Module
          title="어느 소비 항목에 돈이 연결되는가"
          note="확보된 항목만 포함 · 서비스 매출과 구분"
        >
          <SpendBreakdown value={v} limit={4} />
        </Module>
      </div>
      <div className="profile-problem">
        <Module
          title="문제에서 사업 가설 찾기"
          note="이 집단이 언급한 불편 · 해당 시장의 문제인지 추가 확인 필요"
        >
          <StatList
            stats={p.signals
              .filter(
                (s) =>
                  s.entity.family === 'pain' && !s.defining && s.population > 0,
              )
              .sort((a, b) => b.population - a.population)}
            context={c}
            limit={4}
          />
          <p className="inline-caveat">
            예: 여행 관심과 신체 부담의 공동 언급만으로 ‘여행 중 신체 부담’이나
            유료 서비스 수요를 확정하지 않습니다.
          </p>
        </Module>
        <Module
          title="다음에 확인할 질문"
          note="아이디어에 문제·대안·검증 계획을 남기세요"
        >
          <div className="validation-list">
            {validationGaps(p)
              .slice(0, 3)
              .map((g) => (
                <div key={g.label}>
                  <b>{g.label}</b>
                  <span>{g.state}</span>
                  <p>{g.detail}</p>
                </div>
              ))}
          </div>
          <WorkspaceActions summary={p.summary} context={c} />
        </Module>
      </div>
      <Module
        title="하위 구매 유형"
        note="선택한 관심 집단 중 어떤 구매 방식을 보이는가 · 유형 간 중복 소속"
        action={
          <label className="compact-select">
            정렬{' '}
            <select
              aria-label="하위 구매 유형 정렬"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="population">인구</option>
              <option value="value">연간 소비액</option>
              <option value="index">전체 대비 특이성</option>
            </select>
          </label>
        }
      >
        <div className="subtype-controls">
          <input
            aria-label="하위 구매 유형 검색"
            placeholder="현재 관심 집단 안에서 구매 유형 검색"
            value={typeQuery}
            onChange={(e) => setTypeQuery(e.target.value)}
          />
          <button onClick={() => setShowAll(!showAll)}>
            {showAll ? '상위 유형만' : `전체 ${types.length}개 유형`}
          </button>
        </div>
        <div className="table-scroll">
          <table className="os-table">
            <thead>
              <tr>
                <th>구매 유형</th>
                <th>현재 집단 내 인구</th>
                <th>구성비</th>
                <th>전체 대비</th>
                <th>연간 소비액 · 현재 지출 범위</th>
                <th>원 서술 근거</th>
              </tr>
            </thead>
            <tbody>
              {types
                .filter((s) => !typeQuery || s.entity.label.includes(typeQuery))
                .slice(0, showAll || typeQuery ? 52 : 8)
                .map((s) => (
                  <tr key={s.entity.id}>
                    <td>
                      <Link href={jointHref(s.entity.id, c)}>
                        {s.entity.label} ↗
                      </Link>
                    </td>
                    <td>{population(s.population)}</td>
                    <td>
                      <div className="table-bar">
                        <i style={{ width: `${s.share * 100}%` }} />
                      </div>
                      {pct(s.share)}
                    </td>
                    <td>{indexLabel(s.index)}</td>
                    <td>{formatKRW(s.money?.base, false)}</td>
                    <td>
                      {s.support.toLocaleString()}건
                      {s.support < 30 ? ' · 희소' : ''}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Module>
      <details className="subtype-radar">
        <summary>
          하위 구매 유형 Discovery Radar · 규모·특이성·소비액으로 찾기
        </summary>
        <div className="subtype-radar-grid">
          {data.radar.map((group) => (
            <section key={group.id}>
              <h3>{group.label}</h3>
              {group.items.map((s) => (
                <Link key={s.entity.id} href={href(s.entity, c)}>
                  <span>{s.entity.label}</span>
                  <b>{population(s.estimate.population)}</b>
                </Link>
              ))}
            </section>
          ))}
          <MoneyRadar data={data} />
        </div>
      </details>
      <div className="profile-adjacency">
        <Module
          title="연결 가능한 다른 관심 영역"
          note="동일 집단의 공동 관심 · 시장 간 금액 합산 불가"
        >
          <StatList
            stats={p.signals
              .filter(
                (s) =>
                  s.entity.kind === 'interest' &&
                  !s.defining &&
                  !data.conditions.some((e) => e.id === s.entity.parent),
              )
              .sort((a, b) => (b.index ?? 0) - (a.index ?? 0))}
            context={c}
            limit={4}
          />
        </Module>
        <Module title="이 집단을 더 탐색하기">
          <div className="analysis-shortcuts">
            <Link href={contextHref('relationship', c.ids, c)}>
              관심·욕구의 연결 보기 ↗
            </Link>
            <Link
              href={contextHref('matrix', c.ids, {
                ...c,
                row: 'age',
                column: 'archetype',
              })}
            >
              연령 × 하위 구매 유형 비교 ↗
            </Link>
            <Link href={contextHref('opportunity', c.ids, c)}>
              기회 후보 우선순위 살펴보기 ↗
            </Link>
          </div>
        </Module>
      </div>
      <Module
        title="산출 근거"
        note="실제 관측·모델 배분·외부 검증 필요 항목을 구분"
      >
        <EvidenceTable profile={p} />
        <PopulationCalibrationNote profile={p} />
        {v && <MoneyBasis value={v} />}
      </Module>
    </>
  );
}

export function ConditionTrail({ data }: { data: AtlasPayload }) {
  return (
    <nav className="condition-trail" aria-label="시장부터 구매 행동까지">
      <Link href="/atlas">시장 탐색</Link>
      {orderedConditions(data.conditions).map((e, i, all) => (
        <span key={e.id}>
          <ChevronRight size={12} />
          <Link
            href={href(
              segmentEntity(all.slice(0, i + 1).map((x) => x.id)),
              data.context,
            )}
          >
            {e.label}
          </Link>
        </span>
      ))}
    </nav>
  );
}
