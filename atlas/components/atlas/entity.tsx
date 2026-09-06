'use client';
import Link from 'next/link';
import { MoneyAnalysis, MoneyBasis } from './money';
import {
  ProfileOverview,
  EvidenceTable,
  PopulationCalibrationNote,
} from './economic-profile';
import { useState } from 'react';
import { NativeSelect } from '@/components/ui/native-select';
import {
  contextHref,
  conditionKey,
  KIND_NAMES,
  shortPopulation,
  pct,
  indexLabel,
  type AtlasPayload,
  type Profile,
  type AtlasContext,
} from '@/lib/atlas';
import {
  Module,
  Entry,
  StatList,
  SummaryRows,
  ranked,
  Basis,
  Definitions,
  href,
  jointHref,
  familyLabel,
} from './common';
import { AgeChart, RegionChart, Composition, OpportunityChart } from './charts';
export function Dataset({
  profile,
  context,
}: {
  profile: Profile;
  context: AtlasContext;
}) {
  const [kind, setKind] = useState('all');
  const all = [
    ...profile.signals,
    ...profile.demographics,
    ...profile.archetypes,
  ];
  const list = all.filter((s) => kind === 'all' || s.entity.kind === kind);
  return (
    <>
      <Module
        title="이 집단의 기초 집계 데이터"
        note="원본 개별 서술 대신, 동일한 실제 교집합에서 계산한 집계값을 확인합니다"
        action={
          <NativeSelect
            aria-label="데이터 종류"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            <option value="all">모든 항목</option>
            {[...new Set(all.map((s) => s.entity.kind))].map((k) => (
              <option key={k} value={k}>
                {KIND_NAMES[k]}
              </option>
            ))}
          </NativeSelect>
        }
      >
        <div className="dataset-summary">
          <span>현재 조건: {profile.summary.entity.label}</span>
          <b>
            {profile.summary.estimate.support.toLocaleString()}개 합성 표본 ·{' '}
            {list.length}개 집계 항목
          </b>
        </div>
        <div className="table-scroll">
          <table className="dataset-table">
            <thead>
              <tr>
                <th>분석 항목</th>
                <th>구분</th>
                <th>추정 인구</th>
                <th>현재 비중</th>
                <th>전체 비중</th>
                <th>Index</th>
                <th>원본 표본 수</th>
                <th>해석</th>
                <th>교집합</th>
              </tr>
            </thead>
            <tbody>
              {list.map((s) => (
                <tr key={s.entity.id}>
                  <td>
                    <Entry entity={s.entity} context={context} />
                  </td>
                  <td>{KIND_NAMES[s.entity.kind]}</td>
                  <td>{shortPopulation(s.population)}명</td>
                  <td>{pct(s.share)}</td>
                  <td>{pct(s.baseShare)}</td>
                  <td
                    className={
                      s.direction === 'under' ? 'index-under' : 'index-over'
                    }
                  >
                    {indexLabel(s.index)}
                  </td>
                  <td>{s.support.toLocaleString()}</td>
                  <td>
                    {s.defining
                      ? '정의 조건'
                      : s.support < 30
                        ? '희소 관측'
                        : familyLabel(s.entity.family)}
                  </td>
                  <td>
                    {context.ids.length < 8 && !s.defining && (
                      <Link
                        prefetch={false}
                        href={jointHref(s.entity.id, context)}
                      >
                        상세 ↗
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Module>
      <Module title="집계 기준과 데이터 범위">
        <Basis profile={profile} />
        <p className="basis-note">
          Index = 현재 집단의 해당 신호 비중 ÷ 전체 20세 이상 소비자의 신호
          비중. 인구 수는 연령·성별 보정값이며 표본 수는 가공하지 않은 검출
          건수입니다. 유형은 중복 소속되고, 미언급은 실제 행동의 부재를 의미하지
          않습니다. 지역과 생활 맥락은 합성 표본의 분포입니다.
        </p>
      </Module>
    </>
  );
}
export function EntityDashboard({ data }: { data: AtlasPayload }) {
  const c = data.context,
    p = data.profile,
    isMarket = p.summary.entity.kind === 'market';
  if (c.tab === 'data')
    return (
      <>
        <Dataset profile={p} context={c} />
        <MoneyAnalysis data={data} />
      </>
    );
  const behavioral = p.signals.filter((s) =>
    ['behavior', 'need', 'channel'].includes(s.entity.kind),
  );
  const affinities = p.signals
    .filter((s) => s.entity.kind === 'market' && !s.defining)
    .sort((a, b) => (b.index ?? 0) - (a.index ?? 0));
  const needs = ranked(
    p.signals.filter((s) => s.entity.kind === 'need'),
    5,
  );
  return (
    <div className="entity-dashboard">
      <Definitions profile={p} context={c} />
      <PopulationCalibrationNote profile={p} />
      {data.money && <MoneyBasis value={data.money.summary} />}
      <div className="profile-top">
        <Module title="연령별 분포" note="회색 선 = 전체 소비자 비중">
          <AgeChart stats={p.demographics} context={c} />
        </Module>
        <Module
          title="지역 분포"
          note="연령·성별 보정 · 지역은 별도 보정하지 않음"
        >
          <RegionChart stats={p.demographics} context={c} />
        </Module>
        <Module title="성별 · 생활 맥락" note="조건을 클릭해 더 좁혀보세요">
          <Composition stats={p.demographics} context={c} />
          <StatList
            stats={p.demographics
              .filter((s) => s.entity.kind === 'household')
              .sort((a, b) => b.share - a.share)}
            context={c}
            limit={3}
          />
        </Module>
      </div>
      <ProfileOverview profile={p} context={c} />
      <div className="profile-core">
        <Module
          title={
            isMarket ? '이 시장의 주요 소비 유형' : '이 유형을 구별하는 신호'
          }
          note="현재 집단 내 비중 · 함께 해당하는 추정 인구"
        >
          <StatList
            stats={
              isMarket
                ? p.archetypes.filter((s) => s.support >= 30)
                : ranked(behavioral, 8)
            }
            context={c}
            limit={8}
          />
        </Module>
        <Module
          title={isMarket ? '평균보다 강한 소비 유형' : '산업별 관심 연결'}
          note="현재 집단 내 비중·인원 · + 버튼으로 조건 결합"
        >
          <StatList
            stats={
              isMarket
                ? [...p.archetypes]
                    .filter((s) => s.support >= 100)
                    .sort((a, b) => (b.index ?? 0) - (a.index ?? 0))
                : affinities
            }
            context={c}
            limit={8}
          />
        </Module>
        <Module title="욕구 · 불편" note="관측된 표현의 상대적 강도">
          <StatList
            stats={
              isMarket
                ? p.signals
                    .filter(
                      (s) => s.entity.family === 'pain' && s.support >= 30,
                    )
                    .sort((a, b) => b.population - a.population)
                : needs
            }
            context={c}
            limit={5}
          />
          <div className="inline-callout">
            <Link
              prefetch={false}
              href={contextHref('matrix', c.ids, {
                ...c,
                row: 'age',
                column: 'market',
                focus: 'pet',
              })}
            >
              연령 × 반려동물 관심으로 더 나누기 ↗
            </Link>
            <small>현재 조건을 유지하고 두 특성을 겹칩니다.</small>
          </div>
        </Module>
      </div>
      {isMarket && (
        <div className="market-consumers">
          <Module
            title="이 시장에서 구별되는 소비 행동"
            note="시장 내 독립 신호의 상대적 강도"
          >
            <StatList stats={ranked(behavioral, 8)} context={c} limit={8} />
          </Module>
          <Module
            title="관심이 이어지는 다른 시장"
            note="다른 산업으로 이어지는 동시 관심"
          >
            <StatList stats={affinities} context={c} limit={8} />
          </Module>
          <Module
            title="작지만 강한 시장 내 집단"
            note="규모와 신호 차이로 찾는 후보"
          >
            <SummaryRows
              items={data.radar.find((r) => r.id === 'small')?.items ?? []}
              context={c}
              metric="small"
            />
            <h3 className="subheading">주요 하위 시장</h3>
            <StatList stats={p.submarkets} context={c} limit={4} />
          </Module>
        </div>
      )}
      {isMarket && (
        <Module
          title="어떤 불편을 느끼는 소비자인가"
          note="시장 × 불편을 실제로 함께 언급한 집단"
        >
          <div className="pain-cohorts">
            {p.painPatterns.map((s) => (
              <Entry key={conditionKey(s.ids)} entity={s.entity} context={c}>
                <b>
                  {s.entity.label
                    .replace(p.summary.entity.label + ' × ', '')
                    .replace(' × ' + p.summary.entity.label, '')}
                </b>
                <strong>{shortPopulation(s.estimate.population)}명</strong>
                <span>
                  시장 내{' '}
                  {pct(s.estimate.population / p.summary.estimate.population)} ·
                  소비 관여 {s.metrics.consumptionIntensity}
                </span>
                <small>소비 유형과 상세 신호 확인 ↗</small>
              </Entry>
            ))}
          </div>
        </Module>
      )}
      <div className="profile-families">
        <Module
          title="구매·선택 방식"
          note="실제 구매 금액이나 빈도를 뜻하지 않음"
        >
          <StatList
            stats={ranked(
              p.signals.filter((s) =>
                ['purchase', 'value', 'premium'].includes(s.entity.family),
              ),
              5,
            )}
            context={c}
            limit={5}
          />
        </Module>
        <Module title="발견·신뢰 방식">
          <StatList
            stats={ranked(
              p.signals.filter((s) => s.entity.family === 'trust'),
              5,
            )}
            context={c}
            limit={5}
          />
        </Module>
        <Module title="이용 채널">
          <StatList
            stats={ranked(
              p.signals.filter((s) => s.entity.kind === 'channel'),
              5,
            )}
            context={c}
            limit={5}
          />
        </Module>
      </div>
      {p.differences.length > 0 && (
        <div className="parent-differences">
          {p.differences.map((d) => (
            <Module
              key={d.parent.id}
              title={`${d.parent.label}와 비교`}
              note="선택 집단 비중 − 상위 집단 비중 · %p"
            >
              <div className="difference-rows">
                {d.signals.slice(0, 6).map((s) => (
                  <div key={s.entity.id}>
                    <Entry entity={s.entity} context={c} />
                    <span>
                      {pct(s.parentShare)} → {pct(s.share)}
                    </span>
                    <strong
                      className={s.delta < 0 ? 'index-under' : 'index-over'}
                    >
                      {s.delta > 0 ? '+' : ''}
                      {(s.delta * 100).toFixed(1)}%p
                    </strong>
                    <small>전체 기준과 비교</small>
                  </div>
                ))}
              </div>
            </Module>
          ))}
        </div>
      )}
      <MoneyAnalysis data={data} />
      <div className="profile-linked">
        <Module
          title={isMarket ? '시장 내 기회 후보' : '산업을 넘는 기회 후보'}
          note="상대 점수와 규모를 함께 비교"
          action={
            <Link prefetch={false} href={contextHref('opportunity', c.ids, c)}>
              기회지도에서 보기 ↗
            </Link>
          }
        >
          <OpportunityChart
            items={[p.summary, ...p.relatedOpportunities]}
            context={c}
            compact
          />
          <SummaryRows items={p.relatedOpportunities} context={c} limit={3} />
        </Module>
        <Module
          title="함께 나타나는 소비 유형"
          note="유형 간 중복 소속이 가능합니다"
          action={
            <Link prefetch={false} href={contextHref('relationship', c.ids, c)}>
              전체 관계 탐색 ↗
            </Link>
          }
        >
          <StatList
            stats={p.archetypes
              .filter((s) => s.support >= 30)
              .sort((a, b) => (b.index ?? 0) - (a.index ?? 0))}
            context={c}
            limit={7}
          />
          <h3 className="subheading">연결 신호</h3>
          <StatList stats={ranked(behavioral, 3)} context={c} limit={3} />
        </Module>
      </div>
      <div className="profile-linked">
        <Module
          title="더 구체적인 소비 패턴"
          note="현재 집단 + 추가 신호 · 실제 교집합"
        >
          <SummaryRows items={p.microPatterns} context={c} limit={6} />
        </Module>
        <Module
          title={isMarket ? '하위 시장을 더 살펴보기' : '관련 관심·하위 시장'}
          note="생활 영역을 한 번 더 구체화"
        >
          <StatList stats={p.submarkets} context={c} limit={7} />
          <Link
            className="text-link"
            prefetch={false}
            href={
              href(p.summary.entity, c) +
              (href(p.summary.entity, c).includes('?') ? '&' : '?') +
              'tab=data'
            }
          >
            모든 집계 항목 보기 ↗
          </Link>
        </Module>
      </div>
      <Module
        title="산출 근거 · 데이터 범위"
        note="실측 매출과 추세 대신, 관측된 소비 패턴으로 후보를 비교합니다"
      >
        <EvidenceTable profile={p} />
        <Basis profile={p} />
      </Module>
    </div>
  );
}
