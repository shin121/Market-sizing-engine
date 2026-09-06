import { enrichMarketValue } from './market-value-service';
import { inferSpendScope } from './market-value';
import type { MoneyMetric, MoneyAxis } from '../../lib/market-value';
import {
  canonicalIds,
  conditionKey,
  KIND_NAMES,
  type AtlasContext,
  type AtlasAxis,
  type AtlasEntity,
  type AtlasPayload,
  type Summary,
  type Stat,
  type Profile,
  type AtlasMatrix,
  type RadarGroup,
} from '../../lib/atlas';
import {
  source,
  features,
  entities,
  registry,
  types,
  markets,
  definitions,
  entityForIds,
  assertIds,
} from './source';
import { statistics, measure, bounded } from './population';
import { deriveMetrics } from './metrics';
export { measure } from './population';
const summaries = new Map<string, Summary>(),
  profiles = new Map<string, Profile>();
const basePopulation = new Map(
  [...source.features, ...source.archetypes, ...source.dimensions].map((e) => [
    e.id,
    e.populationEstimate,
  ]),
);
export function summarize(input: string[]): Summary {
  const ids = canonicalIds(input);
  assertIds(ids);
  const key = conditionKey(ids);
  const cached = summaries.get(key);
  if (cached) return cached;
  const stats = statistics(ids);
  const rates = stats.counts.map((n) =>
    stats.population ? n / stats.population : 0,
  );
  const fraction = stats.support >= 1000 ? 0.3 : 0.5;
  return bounded(
    summaries,
    key,
    {
      entity: entityForIds(ids),
      ids,
      estimate: {
        population: stats.population,
        support: stats.support,
        share: stats.population / source.population,
        low: stats.population * (1 - fraction),
        high: Math.min(source.population, stats.population * (1 + fraction)),
        effectiveSampleSize: stats.weightSquareSum
          ? stats.population ** 2 / stats.weightSquareSum
          : 0,
      },
      metrics: deriveMetrics(ids, stats.population, stats.support, rates),
    },
    256,
  );
}
function stat(
  entity: AtlasEntity,
  population: number,
  support: number,
  parentPopulation: number,
  defining = false,
): Stat {
  const share = parentPopulation ? population / parentPopulation : 0,
    baseShare = (basePopulation.get(entity.id) ?? 0) / source.population,
    index = parentPopulation && baseShare ? share / baseShare : null;
  const effect =
    index === null ? 1 : index >= 1 ? index : 1 / Math.max(0.02, index);
  return {
    entity,
    population,
    support,
    share,
    baseShare,
    index,
    defining,
    direction:
      index === null || (index > 0.9 && index < 1.1)
        ? 'typical'
        : index >= 1.1
          ? 'over'
          : 'under',
    strength:
      support < 30
        ? 'Weak'
        : effect >= 1.35 && share >= 0.01
          ? 'Strong'
          : effect >= 1.1 && share >= 0.005
            ? 'Medium'
            : 'Weak',
  };
}
export function rankSignals(stats: Stat[], limit = 8, positive = false) {
  return stats
    .filter(
      (s) =>
        !s.defining &&
        s.support >= 30 &&
        s.share >= 0.005 &&
        s.index !== null &&
        (!positive || s.index > 1),
    )
    .sort(
      (a, b) =>
        Math.abs(Math.log2(Math.max(0.03, b.index!))) * Math.sqrt(b.share) -
        Math.abs(Math.log2(Math.max(0.03, a.index!))) * Math.sqrt(a.share),
    )
    .slice(0, limit);
}
function combine(ids: string[], id: string) {
  return canonicalIds([...ids, id]);
}
export function getProfile(input: string[], deep = true): Profile {
  const ids = canonicalIds(input),
    key = conditionKey(ids) + (deep ? '!deep' : '');
  const cached = profiles.get(key);
  if (cached) return cached;
  const summary = summarize(ids),
    raw = statistics(ids),
    def = definitions(ids);
  const signals = features.map((f, i) =>
    stat(
      registry.get(f.id)!,
      raw.counts[i],
      raw.supports[i],
      raw.population,
      def.has(f.id),
    ),
  );
  const demographics = source.dimensions.map((d) => {
    const m = measure(combine(ids, d.id));
    return stat(
      registry.get(d.id)!,
      m.population,
      m.support,
      raw.population,
      ids.includes(d.id),
    );
  });
  const archetypes = types
    .filter((t) => !ids.includes(t.id))
    .map((t) => {
      const m = measure(combine(ids, t.id));
      return stat(t, m.population, m.support, raw.population);
    })
    .sort((a, b) => b.population - a.population);
  const marketsInContext = ids.filter(
    (id) => registry.get(id)?.kind === 'market',
  );
  const submarkets = signals
    .filter(
      (s) =>
        s.entity.kind === 'interest' &&
        (!marketsInContext.length ||
          marketsInContext.includes(s.entity.parent ?? '')),
    )
    .sort((a, b) => b.population - a.population);
  const parents =
    ids.length > 1
      ? ids.filter((id) =>
          ['archetype', 'market'].includes(registry.get(id)!.kind),
        )
      : [];
  const differences = parents.map((id) => {
    const parentStats = statistics([id]);
    return {
      parent: registry.get(id)!,
      population: parentStats.population,
      signals: signals
        .filter((s) => !s.defining && s.support >= 30)
        .map((s) => {
          const i = features.findIndex((f) => f.id === s.entity.id),
            parentShare = parentStats.population
              ? parentStats.counts[i] / parentStats.population
              : 0;
          return {
            entity: s.entity,
            share: s.share,
            parentShare,
            index: parentShare ? s.share / parentShare : null,
            delta: s.share - parentShare,
          };
        })
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
        .slice(0, 8),
    };
  });
  const painStats = signals
    .filter((s) => s.entity.family === 'pain' && !s.defining && s.support >= 30)
    .sort((a, b) => b.population - a.population);
  const available = ids.length < 8;
  const microStats = rankSignals(
    signals.filter(
      (s) =>
        s.entity.kind !== 'market' &&
        s.entity.kind !== 'interest' &&
        s.share < 0.85,
    ),
    10,
    true,
  );
  const microPatterns =
    deep && available
      ? microStats.map((s) => summarize(combine(ids, s.entity.id)))
      : [];
  const painPatterns =
    deep && available
      ? painStats.slice(0, 6).map((s) => summarize(combine(ids, s.entity.id)))
      : [];
  const relatedOpportunities = deep
    ? opportunities(ids)
        .filter((s) => conditionKey(s.ids) !== conditionKey(ids))
        .slice(0, 8)
    : [];
  return bounded(
    profiles,
    key,
    {
      summary,
      signals,
      demographics,
      archetypes,
      submarkets,
      differences,
      microPatterns,
      painPatterns,
      relatedOpportunities,
    },
    40,
  );
}
export function opportunities(ids: string[]): Summary[] {
  if (ids.length >= 8) return [summarize(ids)];
  const hasType = ids.some((id) => registry.get(id)?.kind === 'archetype'),
    hasMarket = ids.some((id) => registry.get(id)?.kind === 'market');
  let targets: AtlasEntity[];
  if (hasType && hasMarket) {
    const stats = statistics(ids);
    targets = features
      .map((f, i) => ({ f, i }))
      .filter(
        ({ f, i }) =>
          !definitions(ids).has(f.id) &&
          ['need', 'channel', 'behavior'].includes(f.kind) &&
          stats.supports[i] >= 30 &&
          stats.counts[i] < stats.population * 0.85,
      )
      .sort(
        (a, b) =>
          stats.counts[b.i] / Math.max(features[b.i].share, 0.0001) -
          stats.counts[a.i] / Math.max(features[a.i].share, 0.0001),
      )
      .slice(0, 14)
      .map(({ f }) => registry.get(f.id)!);
  } else targets = hasType ? markets : types;
  const result = targets
    .filter((t) => !ids.includes(t.id))
    .filter((t) => measure(combine(ids, t.id)).support >= 30)
    .map((t) => summarize(combine(ids, t.id)))
    .sort(
      (a, b) => (b.metrics.opportunity ?? -1) - (a.metrics.opportunity ?? -1),
    );
  return ids.length ? [summarize(ids), ...result] : result;
}
export function radar(ids: string[]): RadarGroup[] {
  const all = types
    .filter((t) => !ids.includes(t.id))
    .filter((t) => measure(combine(ids, t.id)).support >= 100)
    .map((t) => summarize(combine(ids, t.id)));
  const sorted = (
    f: (s: Summary) => number,
    predicate: (s: Summary) => boolean = () => true,
  ) =>
    all
      .filter(predicate)
      .sort((a, b) => f(b) - f(a))
      .slice(0, 3);
  return [
    {
      id: 'largest',
      label: '규모가 큰 유형',
      metricLabel: '추정 인구',
      items: sorted((s) => s.estimate.population),
    },
    {
      id: 'distinctive',
      label: '평균과 다른 유형',
      metricLabel: '독립 신호의 차이',
      items: sorted((s) => s.metrics.distinctiveness),
    },
    {
      id: 'intensity',
      label: '소비 관여가 높은 유형',
      metricLabel: '이용·구매 proxy',
      items: sorted((s) => s.metrics.consumptionIntensity ?? -1),
    },
    {
      id: 'cross',
      label: '여러 산업에 연결',
      metricLabel: '높은 관심 산업 수',
      items: sorted(
        (s) =>
          s.metrics.crossIndustryBreadth +
          s.metrics.crossIndustryStrength / 100,
        (s) => s.metrics.crossIndustryBreadth >= 2,
      ),
    },
    {
      id: 'small',
      label: '작지만 신호가 강한 유형',
      metricLabel: '규모 × 신호',
      items: sorted(
        (s) => s.metrics.smallStrongScore,
        (s) => s.estimate.share < 0.03,
      ),
    },
  ];
}
function axisEntities(
  axis: AtlasAxis,
  ids: string[],
  limit: number,
  focus: string | null,
): AtlasEntity[] {
  let choices = entities.filter((e) => e.kind === axis && !ids.includes(e.id));
  if (axis === 'interest') {
    const m = ids.find((id) => registry.get(id)?.kind === 'market');
    if (m) choices = choices.filter((e) => e.parent === m);
  }
  const ranked = choices
    .map((e) => ({ e, m: measure(combine(ids, e.id)) }))
    .filter((x) => x.m.support > 0)
    .sort((a, b) => b.m.population - a.m.population)
    .map((x) => x.e)
    .slice(0, limit);
  if (
    focus &&
    registry.get(focus)?.kind === axis &&
    !ranked.some((e) => e.id === focus) &&
    !ids.includes(focus)
  ) {
    if (ranked.length >= limit) ranked.pop();
    ranked.push(registry.get(focus)!);
  }
  return ranked;
}
export function getMatrix(context: AtlasContext): AtlasMatrix {
  const { ids } = context,
    rows = axisEntities(context.row, ids, 9, null),
    columns = axisEntities(context.column, ids, 7, context.focus),
    base = measure(ids).population;
  const cells = rows.flatMap((row) =>
    columns.map((column) => {
      const jointIds = canonicalIds([...ids, row.id, column.id]);
      const joint = measure(jointIds),
        rp = measure(combine(ids, row.id)).population,
        cp = measure(combine(ids, column.id)).population;
      return {
        row,
        column,
        defining:
          definitions([row.id]).has(column.id) ||
          definitions([column.id]).has(row.id),
        ids: jointIds,
        population: joint.population,
        support: joint.support,
        share: base ? joint.population / base : 0,
        index: rp && cp && base ? (joint.population * base) / (rp * cp) : null,
      };
    }),
  );
  const eligible = cells.filter(
    (c) =>
      c.support >= 30 &&
      !c.defining &&
      c.row.id !== c.column.id &&
      c.ids.length <= 8,
  );
  const top = (score: (c: (typeof cells)[number]) => number, minimum = 0) =>
    eligible
      .filter((c) => c.index !== null && c.index >= minimum)
      .sort((a, b) => score(b) - score(a))[0];
  const picks = [
    { label: 'Largest', cell: top((c) => c.population) },
    { label: 'Most over-indexed', cell: top((c) => c.index ?? 0, 1.1) },
    {
      label: 'Unexpected',
      cell: top(
        (c) => (c.index! - 1) * Math.sqrt(c.population / c.index!),
        1.1,
      ),
    },
    {
      label: 'Large + high index',
      cell: top((c) => c.population * (c.index! - 1), 1.1),
    },
  ];
  return {
    rows,
    columns,
    cells,
    highlights: picks.filter(
      (p): p is { label: string; cell: (typeof cells)[number] } =>
        Boolean(p.cell),
    ),
  };
}
const axes: AtlasAxis[] = [
  'archetype',
  'market',
  'behavior',
  'need',
  'channel',
  'interest',
  'age',
  'region',
];
export function resolveContext(
  path: string[],
  query: Record<string, string | string[] | undefined>,
): AtlasContext {
  const get = (key: string) =>
    typeof query[key] === 'string' ? (query[key] as string) : '';
  let ids: string[] = [],
    view: AtlasContext['view'] = 'overview';
  if (path.length) {
    if (
      ['relationship', 'matrix', 'opportunity'].includes(path[0]) &&
      path.length === 1
    )
      view = path[0] as AtlasContext['view'];
    else if (
      path.length === 2 &&
      ['archetypes', 'markets', 'segments', 'signals'].includes(path[0])
    ) {
      view = 'entity';
      ids =
        path[0] === 'segments'
          ? path[1] === 'universe'
            ? []
            : path[1].split('~')
          : [path[1]];
      assertIds(ids, 8);
      const kind = ids.length === 1 ? registry.get(ids[0])?.kind : null;
      if (
        (path[0] === 'archetypes' && kind !== 'archetype') ||
        (path[0] === 'markets' && kind !== 'market') ||
        (path[0] === 'signals' &&
          (!kind || kind === 'archetype' || kind === 'market'))
      )
        throw new Error('존재하지 않는 프로필입니다.');
    } else throw new Error('존재하지 않는 Atlas 경로입니다.');
  }
  if (get('q')) ids.push(...get('q').split('~'));
  ids = canonicalIds(ids);
  assertIds(ids, 8);
  const row = (get('row') ||
      (ids.some((id) => registry.get(id)?.kind === 'archetype')
        ? 'age'
        : 'archetype')) as AtlasAxis,
    column = (get('col') || 'market') as AtlasAxis;
  if (!axes.includes(row) || !axes.includes(column))
    throw new Error('지원하지 않는 교차분석 축입니다.');
  const compare = get('compare')
    ? get('compare')
        .split('|')
        .slice(0, 3)
        .map((x) => canonicalIds(x.split('~')))
    : [];
  compare.forEach((ids) => assertIds(ids, 8));
  const trail = get('trail')
    ? get('trail')
        .split('|')
        .slice(-6)
        .filter((k) => k.split('~').every((id) => registry.has(id)))
    : [];
  const focus = get('focus');
  if (focus && !registry.has(focus)) throw new Error('알 수 없는 신호입니다.');
  return {
    view,
    ids,
    trail,
    lens: get('lens') === 'markets' ? 'markets' : 'people',
    row,
    column,
    focus: focus || null,
    allSignals: get('all') === '1',
    compare,
    tab: get('tab') === 'data' ? 'data' : 'profile',
    metric: (['population', 'index', 'marketValue', 'spendPerUnit'].includes(
      get('metric'),
    )
      ? get('metric')
      : 'population') as MoneyMetric,
    moneyScope: get('spend') || inferSpendScope(ids),
    xAxis: ([
      'population',
      'annualValue',
      'spendPerUnit',
      'opportunity',
      'distinctiveness',
    ].includes(get('x'))
      ? get('x')
      : 'population') as MoneyAxis,
    yAxis: ([
      'population',
      'annualValue',
      'spendPerUnit',
      'opportunity',
      'distinctiveness',
    ].includes(get('y'))
      ? get('y')
      : get('metric') === 'marketValue' || get('metric') === 'spendPerUnit'
        ? 'spendPerUnit'
        : 'opportunity') as MoneyAxis,
  };
}
export function analyzeAtlas(context: AtlasContext): AtlasPayload {
  assertIds(context.ids);
  const profile = getProfile(context.ids, context.view === 'entity'),
    mapItems = (context.lens === 'markets' ? markets : types)
      .filter((e) => !context.ids.includes(e.id))
      .filter((e) => measure(combine(context.ids, e.id)).support > 0)
      .map((e) => summarize(combine(context.ids, e.id)))
      .sort((a, b) => b.estimate.population - a.estimate.population);
  const related = rankSignals(
    profile.signals.filter(
      (s) => s.entity.kind !== 'interest' && s.entity.kind !== 'market',
    ),
    context.allSignals ? 100 : 14,
  );
  const rSignals = context.allSignals
    ? profile.signals
        .filter(
          (s) =>
            !s.defining &&
            s.entity.kind !== 'interest' &&
            s.entity.kind !== 'market' &&
            s.support >= 30,
        )
        .sort((a, b) => (b.index ?? 0) - (a.index ?? 0))
    : related.filter((s) => s.strength !== 'Weak');
  const matrix = context.view === 'matrix' ? getMatrix(context) : null;
  return enrichMarketValue(
    {
      context,
      conditions: context.ids.map((id) => registry.get(id)!),
      profile,
      mapItems,
      radar: radar(context.ids),
      opportunities:
        context.view === 'opportunity'
          ? opportunities(context.ids)
          : profile.relatedOpportunities.slice(0, 8),
      comparison: context.compare.map((ids) => summarize(ids)),
      matrix,
      relationship: {
        signals: rSignals,
        archetypes: profile.archetypes
          .filter((s) => s.support >= 30 && (s.index ?? 0) > 1.05)
          .sort((a, b) => (b.index ?? 0) - (a.index ?? 0))
          .slice(0, 6),
        markets: profile.signals
          .filter((s) => s.entity.kind === 'market' && s.support >= 30)
          .sort((a, b) => (b.index ?? 0) - (a.index ?? 0))
          .slice(0, 8),
        selected:
          context.view === 'relationship' &&
          context.focus &&
          context.ids.length < 8
            ? getProfile(combine(context.ids, context.focus), false)
            : null,
      },
      universe: {
        population: source.population,
        sourceRows: source.sourceRows,
        eligibleRows: source.eligibleRows,
        coverageShare: source.overlap.coverageShare,
        multipleMembershipShare: source.overlap.multipleMembershipShare,
        archetypes: types.length,
        markets: markets.length,
        signals: features.filter((f) => f.kind !== 'market').length,
        referenceDate: source.referenceDate,
        sourceDate: source.sourceDate,
      },
      navigation: entities.filter((e) =>
        ['market', 'age', 'age_range', 'region', 'sex', 'household'].includes(
          e.kind,
        ),
      ),
      breadcrumbs: context.trail.map((key) => entityForIds(key.split('~'))),
    },
    types
      .filter((t) => !context.ids.includes(t.id))
      .map((t) => summarize(combine(context.ids, t.id))),
  );
}
export function searchAtlas(query: string): AtlasEntity[] {
  const q = query.trim().toLocaleLowerCase();
  if (!q || q.length > 100) return [];
  const words = q.split(/\s+/);
  const aliases: Record<string, string> = {
    family: '육아 가족 돌봄',
    premium: '고급 프리미엄',
    collecting: '취미 수집',
    expert: '전문가 상담',
    paid_subscription: '구독 넷플릭스',
    value_seeking: '가격 절약 실속',
  };
  const matches = (e: AtlasEntity) =>
    words.every((w) =>
      (
        e.label +
        ' ' +
        e.id +
        ' ' +
        (aliases[e.id] ?? '') +
        ' ' +
        KIND_NAMES[e.kind] +
        ' ' +
        (e.definition ?? [])
          .map((id) => registry.get(id)?.label ?? '')
          .join(' ')
      )
        .toLocaleLowerCase()
        .includes(w),
    );
  const direct = entities.filter((e) => matches(e));
  const segments: AtlasEntity[] = [];
  for (const a of types) {
    for (const m of markets) {
      const e = entityForIds(canonicalIds([a.id, m.id]));
      if (matches(e) && measure([a.id, m.id]).support >= 100) segments.push(e);
    }
  }
  return [
    ...direct.sort(
      (a, b) =>
        Number(b.label.startsWith(q)) - Number(a.label.startsWith(q)) ||
        Number(b.kind === 'archetype') - Number(a.kind === 'archetype'),
    ),
    ...segments,
  ].slice(0, 36);
}
export function getDefinitionMetadata(ids: string[]) {
  const def = definitions(ids);
  return features
    .filter((f) => def.has(f.id))
    .map((f) => ({
      id: f.id,
      label: f.label,
      sourceFields: f.sourceFields,
      pattern: f.pattern,
    }));
}
export function getSanitySummary() {
  return {
    types: types.length,
    markets: markets.length,
    features: features.length,
    population: source.population,
    overlap: source.overlap,
    minimumNonDefiningIndexes: Math.min(
      ...source.archetypes.map((a) => a.independentIndexCount),
    ),
    archetypes: source.archetypes.map((a) => ({
      id: a.id,
      label: a.name,
      definition: a.definition,
      associationLift: a.associationLift,
      holdoutLift: a.holdoutLift,
    })),
  };
}
