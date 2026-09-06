'use client';
import Link from 'next/link';
import { MoneyRadar, MoneyBasis } from './money';
import { ProfileOverview, EvidenceTable } from './economic-profile';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useRouter } from 'next/navigation';
import {
  contextHref,
  shortPopulation,
  pct,
  type AtlasPayload,
} from '@/lib/atlas';
import { Module, Entry, StatList } from './common';
import { MarketMap, AgeChart, Composition, RegionChart } from './charts';
export function Overview({ data }: { data: AtlasPayload }) {
  const c = data.context,
    router = useRouter();
  const best = data.radar[2].items[0];
  return (
    <div className="overview-grid">
      <div className="overview-main">
        <Module
          title="Global Market Atlas"
          note="소비 메커니즘에서 새로운 시장 연결을 찾으세요"
          action={
            <Tabs
              value={c.lens}
              onValueChange={(v) =>
                router.push(
                  contextHref('overview', c.ids, {
                    ...c,
                    lens: v as 'people' | 'markets',
                    moneyScope: v === 'markets' ? 'covered' : c.moneyScope,
                  }),
                )
              }
            >
              <TabsList>
                <TabsTrigger value="people">사람 / 유형</TabsTrigger>
                <TabsTrigger value="markets">산업 / 시장</TabsTrigger>
              </TabsList>
            </Tabs>
          }
        >
          <MarketMap items={data.mapItems} context={c} />
          {c.metric === 'marketValue' && data.money && (
            <MoneyBasis value={data.money.summary} />
          )}
        </Module>
        <ProfileOverview profile={data.profile} context={c} />
        <div className="overview-lower">
          <Module title="전체 소비자 구성" note="연령·성별 기준 인구">
            <AgeChart stats={data.profile.demographics} context={c} />
            <Composition stats={data.profile.demographics} context={c} />
          </Module>
          <Module title="산업별 관련 인구" note="각 시장 관심은 중복됩니다">
            <StatList
              stats={data.profile.signals
                .filter((s) => s.entity.kind === 'market')
                .sort((a, b) => b.population - a.population)}
              context={c}
              limit={6}
              showIndex={false}
            />
          </Module>
        </div>
        <div className="overview-bottom">
          <Module
            title="지역별 소비자 구성"
            note="합성 프로필의 지역 분포 · 지역별 인구는 별도 보정하지 않음"
          >
            <RegionChart stats={data.profile.demographics} context={c} />
          </Module>
          <Module
            title="산업을 넘는 발견"
            note="여러 시장에서 반복되는 소비 패턴"
          >
            <div className="adjacency-intro">
              {best && (
                <Entry entity={best.entity} context={c}>
                  <b>{best.entity.label}</b>
                  <span>
                    {best.metrics.crossIndustryBreadth}개 산업에서 평균 이상 ·
                    소비 관여 {best.metrics.consumptionIntensity}
                  </span>
                </Entry>
              )}
            </div>
            {data.radar[3].items.slice(0, 2).map((s) => (
              <Entry
                key={s.entity.id}
                entity={s.entity}
                context={c}
                className="adjacency-row"
              >
                {s.entity.label}
                <strong>{s.metrics.crossIndustryBreadth}개 산업 ↗</strong>
              </Entry>
            ))}
          </Module>
          <Module
            title="다음으로 볼 기회"
            note="규모 외에 관여와 차이도 함께 비교"
            action={
              <Link
                prefetch={false}
                href={contextHref('opportunity', c.ids, c)}
              >
                기회지도 ↗
              </Link>
            }
          >
            <div className="compact-candidates">
              {data.radar[4].items.map((s) => (
                <Entry key={s.entity.id} entity={s.entity} context={c}>
                  <b>{s.entity.label}</b>
                  <span>
                    {shortPopulation(s.estimate.population)}명 · 소비 관여{' '}
                    {s.metrics.consumptionIntensity}
                    <strong> {s.metrics.opportunity}</strong>
                  </span>
                </Entry>
              ))}
            </div>
          </Module>
        </div>
        <Module title="데이터 출처와 적용 범위">
          <EvidenceTable profile={data.profile} />
        </Module>
      </div>
      <aside className="discovery-radar" aria-label="발견 레이더">
        <div className="radar-title">
          <h2>Discovery Radar</h2>
          <span>
            {c.metric === 'marketValue'
              ? '경제적 규모의 3가지 출발점'
              : '5가지 발견의 출발점'}
          </span>
        </div>
        {c.metric === 'marketValue' ? (
          <MoneyRadar data={data} />
        ) : (
          data.radar.map((group) => (
            <section key={group.id} data-radar={group.id}>
              <h3>
                {group.label}
                <small>{group.metricLabel}</small>
              </h3>
              {group.items.map((s, i) => (
                <Entry
                  key={s.entity.id}
                  entity={s.entity}
                  context={c}
                  className="radar-row"
                >
                  <span className="rank">0{i + 1}</span>
                  <span>
                    {s.entity.label}
                    <small>
                      {shortPopulation(s.estimate.population)}명 · 전체{' '}
                      {pct(s.estimate.share)}
                    </small>
                  </span>
                  <strong>
                    {group.id === 'largest'
                      ? shortPopulation(s.estimate.population)
                      : group.id === 'cross'
                        ? s.metrics.crossIndustryBreadth
                        : group.id === 'distinctive'
                          ? s.metrics.distinctivenessScore
                          : group.id === 'small'
                            ? s.metrics.smallStrongScore
                            : s.metrics.consumptionIntensity}
                  </strong>
                </Entry>
              ))}
            </section>
          ))
        )}
        <div className="radar-foot">
          <b>{pct(data.universe.coverageShare, 0)}</b>의 소비자가 하나 이상
          유형에 해당합니다.
          <br />
          중복 소속 {pct(data.universe.multipleMembershipShare, 0)} · 미분류
          인구를 강제로 유형화하지 않았습니다.
        </div>
      </aside>
    </div>
  );
}
