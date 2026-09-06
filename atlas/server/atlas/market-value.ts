import config from '../../config/market-value.json';
import controls from '../../config/population-controls.json';
import type {
  MarketValueEstimate,
  MoneyRange,
  PopulationUnit,
} from '../../lib/market-value';
import { canonicalIds, conditionKey } from '../../lib/atlas';
import { measure, measureUnion, linearMoments, bounded } from './population';
import {
  externalPool,
  externalScopes,
  externalSource,
  externalAllocation,
} from './external-spend';
import { markets, registry, source } from './source';
import { annualFactor } from './spend-methods';
const cache = new Map<string, MarketValueEstimate>();
const anchors = config.anchors;
const totalMarkets = markets.length;
export const availableSpendMarkets = [
  ...new Set([
    ...anchors.map((a) => a.marketId),
    ...Object.keys(externalScopes),
  ]),
];
export function inferSpendScope(ids: string[]) {
  return ids.find((id) => registry.get(id)?.kind === 'market') ?? 'covered';
}
function blank(ids: string[], scope: string): MarketValueEstimate {
  const market = registry.get(scope),
    population = measure(ids).population;
  const categoryPopulation =
    scope === 'covered'
      ? population
      : measure(canonicalIds([...ids, scope])).population;
  const requiredUnit =
    (config.requiredUnits as Record<string, PopulationUnit>)[scope] ?? 'person';
  return {
    annualValue: null,
    low: null,
    base: null,
    high: null,
    currency: 'KRW',
    period: 'annual',
    populationUnit: requiredUnit,
    scopeId: scope,
    scopeLabel: market?.label ?? '확보된 지출 범위',
    categoryPopulation,
    categoryPopulationUnit: 'person',
    relevantPopulation: null,
    annualSpendPerUnit: null,
    spendPerUnitRange: null,
    participationRate: null,
    participationIndex: null,
    spendIntensityIndex: null,
    spendDensity: null,
    spendDensityIndex: null,
    shareOfSpendPool: null,
    method: null,
    confidence: 'Unavailable',
    completeness: 0,
    status:
      requiredUnit === 'person'
        ? 'missing_calibration_anchor'
        : 'unit_mapping_required',
    isAdditive: false,
    additiveForDisjointPopulations: false,
    componentIds: [],
    coverage: {
      population: 0,
      directSpend: 0,
      anchor: 0,
      isPartial: true,
      supportedMarkets: 0,
      totalMarkets: scope === 'covered' ? totalMarkets : 1,
    },
    sourceBasis: [],
    assumptions: [
      requiredUnit === 'person'
        ? 'missing calibration anchor: 단위·기간·대상이 맞는 기존 지출 기준이 없습니다.'
        : '개인 생활 맥락은 가구 ID가 아닙니다. 중복 제거된 가구 수와 지출 기준을 연결하기 전에는 사람 수에 가구 지출을 곱하지 않습니다.',
    ],
  };
}
function anchorPool(ids: string[], anchor: (typeof anchors)[number]) {
  const selected = linearMoments(
    canonicalIds([...ids, anchor.marketId]),
    config.proxyCoefficients,
  );
  const universe = linearMoments([anchor.marketId], config.proxyCoefficients);
  if (selected.length !== controls.controls.length)
    throw Error('Monetary stratum mismatch');
  let eligible = 0,
    support = 0,
    participants = 0,
    base = 0,
    low = 0,
    high = 0,
    unadjusted = 0;
  selected.forEach((s, i) => {
    const a = anchor.ageBands.find(
      (a) => a.ageBand === controls.controls[i].age_band,
    );
    if (!a) return;
    const u = universe[i];
    eligible += s.population;
    support += s.support;
    const participation = a.paidUsers / a.musicUsers,
      units = s.population * participation;
    participants += units;
    const norm = u.population ? u.weightedSignalSum / u.population : 1;
    const allocated = (s.weightedSignalSum / norm) * participation;
    const shareSum = a.paymentShares.reduce((a, b) => a + b, 0);
    const annual = (bins: number[]) =>
      (annualFactor(anchor.spendPeriod as 'monthly') *
        a.paymentShares.reduce((n, p, j) => n + p * bins[j], 0)) /
      shareSum;
    base += allocated * annual(anchor.binBase);
    low += allocated * annual(anchor.binLow);
    high += allocated * annual(anchor.binHigh);
    unadjusted += units * annual(anchor.binBase);
  });
  return { eligible, support, participants, base, low, high, unadjusted };
}
export function estimateMarketValue(
  input: string[],
  requestedScope?: string,
): MarketValueEstimate {
  const ids = canonicalIds(input),
    scope = requestedScope ?? inferSpendScope(ids),
    key = conditionKey(ids) + '|' + scope;
  const cached = cache.get(key);
  if (cached) return cached;
  if (scope !== 'covered' && registry.get(scope)?.kind !== 'market')
    throw Error('Invalid monetary scope');
  const empty = blank(ids, scope);
  const external = externalPool(ids, scope);
  if (external) {
    const music =
      scope === 'covered' ? estimateMarketValue(ids, 'music') : null;
    const allMusic =
      scope === 'covered' ? estimateMarketValue([], 'music') : null;
    const relevantPopulation =
      scope === 'covered'
        ? measureUnion(ids, [...external.allocationMarkets, 'music']).population
        : external.relevantPopulation;
    const baselinePopulation =
      scope === 'covered'
        ? measureUnion([], [...external.allocationMarkets, 'music']).population
        : external.baselinePopulation;
    const base = external.base + (music?.base ?? 0);
    const national = external.national + (allMusic?.base ?? 0);
    const low =
      external.base * externalAllocation.lowMultiplier + (music?.low ?? 0);
    const high =
      external.base * externalAllocation.highMultiplier + (music?.high ?? 0);
    const density = relevantPopulation ? base / relevantPopulation : null;
    const result: MarketValueEstimate = {
      ...empty,
      base,
      annualValue: base,
      low,
      high,
      populationUnit: 'person',
      denominatorBasis: 'adult_profile_allocation',
      denominatorLabel: '관련 성인당 연간 배분액',
      scopeLabel: external.scopeLabel + (music ? ' + 디지털 음악(2024)' : ''),
      categoryPopulation: relevantPopulation,
      relevantPopulation,
      annualSpendPerUnit: density,
      spendPerUnitRange:
        density !== null
          ? {
              low: low / relevantPopulation,
              base: density,
              high: high / relevantPopulation,
            }
          : null,
      participationRate: null,
      participationIndex: null,
      spendIntensityIndex: null,
      spendDensity: density,
      spendDensityIndex:
        density !== null && baselinePopulation
          ? density / (national / baselinePopulation)
          : null,
      shareOfSpendPool: national ? base / national : null,
      method: 'calibrated_baseline',
      confidence: 'Low',
      status: 'estimated',
      completeness: Math.round(
        100 *
          (scope === 'covered'
            ? availableSpendMarkets.length / totalMarkets
            : 1),
      ),
      componentIds: [
        ...external.breakdown.map((v) => v.id),
        ...(music?.componentIds ?? []),
      ],
      componentBreakdown: [
        ...external.breakdown,
        ...(music?.base != null
          ? [
              {
                id: 'digital-music-2024',
                label: '디지털 음악 · 2024',
                annualValue: music.base,
                nationalValue: allMusic!.base!,
                sourceId:
                  music.sourceBasis.find((s) => s.id !== source.version)?.id ??
                  'music-2024',
              },
            ]
          : []),
      ],
      nationalTrend: external.nationalTrend,
      additiveForDisjointPopulations: true,
      coverage: {
        population: external.inputPopulation
          ? relevantPopulation / external.inputPopulation
          : 0,
        directSpend: 0,
        anchor: 1,
        isPartial: true,
        supportedMarkets:
          scope === 'covered' ? availableSpendMarkets.length : 1,
        totalMarkets: scope === 'covered' ? totalMarkets : 1,
      },
      sourceBasis: [
        externalSource,
        ...(music?.sourceBasis ?? []),
        {
          id: source.version,
          title: 'Nemotron 소비 프로필 · 연령·성별 인구 보정',
          url: source.sourceUrl,
        },
      ].filter((v, i, a) => a.findIndex((s) => s.id === v.id) === i),
      assumptions: [
        ...externalAllocation.assumptions,
        ...(music
          ? [
              '디지털 음악은 기타서비스 통계와 중복될 수 있어 온라인 기타서비스를 전체 합산에서 제외했습니다. 2024 음악과 2025 온라인 지출을 결합한 혼합 기준연도이며 추세는 2024–2025 온라인 항목만 비교합니다.',
            ]
          : []),
      ],
    };
    return bounded(cache, key, result, 2048);
  }
  // An explicit disjoint component registry permits future expansion. Never sum overlapping industries or archetypes.
  const selected =
    scope === 'covered' ? anchors : anchors.filter((a) => a.marketId === scope);
  if (!selected.length) return bounded(cache, key, empty, 2048);
  if (selected.length !== 1)
    throw Error(
      'Additional anchors require a reviewed additive component mapping',
    );
  const anchor = selected[0],
    p = anchorPool(ids, anchor),
    all = anchorPool([], anchor);
  const categoryPopulation = measure(
    canonicalIds([...ids, anchor.marketId]),
  ).population;
  const overallCategory = measure([anchor.marketId]).population;
  const inputPopulation = measure(ids).population;
  const fraction =
    p.support >= config.populationSensitivity.minimumSupport
      ? config.populationSensitivity.regular
      : config.populationSensitivity.sparse;
  const unitRange: MoneyRange | null = p.participants
    ? {
        low: (p.low / p.participants) * config.proxySensitivity.low,
        base: p.base / p.participants,
        high: (p.high / p.participants) * config.proxySensitivity.high,
      }
    : null;
  const inScope =
    p.eligible > 0 || inputPopulation === 0 || categoryPopulation === 0;
  const participationRate = inputPopulation
    ? p.participants / inputPopulation
    : null;
  const baselineParticipation = source.population
    ? all.participants / source.population
    : 0;
  const density = unitRange?.base ?? null,
    baseDensity = all.participants ? all.base / all.participants : 0;
  const result: MarketValueEstimate = {
    ...empty,
    populationUnit: 'person',
    denominatorBasis: 'modeled_participant',
    denominatorLabel: '참여자당 연간 지출',
    scopeLabel:
      scope === 'covered'
        ? '확보 범위: ' + anchor.scopeLabel
        : anchor.scopeLabel,
    categoryPopulation,
    relevantPopulation: inScope ? p.participants : null,
    annualValue: inScope ? p.base : null,
    base: inScope ? p.base : null,
    low: inScope ? p.low * (1 - fraction) * config.proxySensitivity.low : null,
    high: inScope
      ? p.high * (1 + fraction) * config.proxySensitivity.high
      : null,
    annualSpendPerUnit: density,
    spendPerUnitRange: unitRange,
    participationRate: inScope ? participationRate : null,
    participationIndex:
      inScope && participationRate !== null && baselineParticipation
        ? participationRate / baselineParticipation
        : null,
    spendIntensityIndex: inScope && p.unadjusted ? p.base / p.unadjusted : null,
    spendDensity: density,
    spendDensityIndex:
      density !== null && baseDensity ? density / baseDensity : null,
    shareOfSpendPool: inScope && all.base ? p.base / all.base : null,
    method: inScope ? 'calibrated_baseline' : null,
    confidence: inScope ? 'Low' : 'Unavailable',
    completeness: categoryPopulation
      ? Math.round((100 * p.eligible) / categoryPopulation)
      : 0,
    status: inScope ? 'estimated' : 'outside_anchor_scope',
    componentIds: [anchor.id],
    additiveForDisjointPopulations: true,
    coverage: {
      population: inputPopulation ? p.eligible / inputPopulation : 0,
      directSpend: 0,
      anchor: categoryPopulation ? p.eligible / categoryPopulation : 0,
      isPartial: true,
      supportedMarkets: 1,
      totalMarkets: scope === 'covered' ? totalMarkets : 1,
    },
    sourceBasis: [
      {
        id: anchor.sourceId,
        title: anchor.sourceTitle,
        url: anchor.sourceUrl,
        locator: anchor.sourceLocator,
        referencePeriod: anchor.referencePeriod,
      },
      {
        id: source.version,
        title: 'Nemotron 합성 소비 패턴 + 2024.11 연령·성별 인구 보정',
        url: source.sourceUrl,
      },
    ],
    assumptions: [
      ...anchor.assumptions,
      `전체 음악 관심 인구 ${Math.round(overallCategory).toLocaleString('ko-KR')}명 중 조사 연령만 반영. 포함 지출 항목은 서로 중복되지 않는 단일 디지털 음악 항목입니다.`,
    ],
  };
  return bounded(cache, key, result, 2048);
}
export function economicValueScore(v: MarketValueEstimate) {
  if (v.base === null) return null;
  const reference = estimateMarketValue([], v.scopeId).base;
  return reference
    ? Math.min(
        100,
        100 * Math.sqrt(v.base / (reference * config.economicReferenceShare)),
      )
    : null;
}
export function assertAdditive(values: MarketValueEstimate[]) {
  const seen = new Set<string>();
  let unit: PopulationUnit | undefined;
  for (const v of values) {
    if (v.base === null) throw Error('Incomplete aggregate');
    if (unit && unit !== v.populationUnit) throw Error('Mixed units');
    unit = v.populationUnit;
    for (const id of v.componentIds) {
      if (seen.has(id)) throw Error('Overlapping spend components');
      seen.add(id);
    }
  }
  return values.reduce((sum, v) => sum + v.base!, 0);
}
