import { getResearchExplorer } from './research-explorer';
import { researchMarkets } from '../../config/research/market-journeys';
import oldFeatures from '../../config/atlas-features.json';
import scoring from '../../config/scoring.json';
import moneyConfig from '../../config/market-value.json';
import { adultResearchFrame, demandSources } from './research-registry';
import {
  candidateKey,
  type ResearchCandidate,
  type ResearchContext,
  type ResearchWorkspacePayload,
  type ResearchView,
} from '../../lib/research-workspace';
import type { ResearchProfile } from '../../lib/research-explorer';

/** A renamed research scope is explicit. Unmapped old conditions are retained as
 * unresolved, never silently removed or evaluated with synthetic prevalence. */
export const legacyResearchTargets: Record<string, [string, string]> = {
  int_travel_nature: ['travel', 'nature'],
  int_travel_culture: ['travel', 'culture'],
  int_travel_overseas: ['travel', 'overseas'],
  int_fitness_hiking: ['fitness', 'hiking'],
  int_fitness_training: ['fitness', 'gym'],
  int_content_short: ['content', 'short'],
  int_music_live: ['music', 'live'],
  int_music_playing: ['music', 'play'],
  int_music_listen: ['music', 'listen'],
  int_gaming_mobile: ['gaming', 'mobile'],
  int_beauty_skin: ['beauty', 'skin'],
  int_home_decor: ['home', 'decor'],
  int_garden_plants: ['garden', 'plants'],
  int_pet_dog: ['pet', 'dog'],
  int_pet_cat: ['pet', 'cat'],
  int_education_skill: ['education', 'career'],
  int_education_reading: ['education', 'reading'],
  int_wellness_rest: ['wellness', 'spa'],
  int_collect_objects: ['collect', 'objects'],
  int_collect_craft: ['collect', 'craft'],
  int_collect_fishing: ['collect', 'fishing'],
  int_photo_camera: ['photo', 'camera'],
  int_photo_art: ['photo', 'art'],
  int_community_club: ['community', 'club'],
  int_delivery_meal: ['delivery', 'delivery'],
  int_commerce_online: ['commerce', 'online'],
  int_mobility_drive: ['mobility', 'drive'],
  int_family_children: ['family', 'children'],
  int_family_senior: ['family', 'elder'],
};
const viewNames = [
  'overview',
  'matrix',
  'opportunity',
  'compare',
  'ideas',
  'sources',
];
const ageNames = ['20', '30', '40', '50', '60', '70'];
export function resolveResearchContext(
  path: string[],
  query: Record<string, string | string[] | undefined>,
) {
  const get = (k: string) =>
    typeof query[k] === 'string' ? (query[k] as string) : '';
  const unresolved: string[] = [];
  let market = get('market'),
    node = get('node'),
    age = get('age');
  const legacyIds = get('q').split('~').filter(Boolean);
  if (
    path.length === 2 &&
    ['markets', 'signals', 'archetypes', 'segments'].includes(path[0])
  ) {
    legacyIds.push(...path[1].split('~'));
  } else if (
    path.length &&
    !(path.length === 1 && [...viewNames, 'relationship'].includes(path[0]))
  ) {
    unresolved.push('경로: ' + path.join('/'));
  }
  for (const id of new Set(legacyIds)) {
    const target = legacyResearchTargets[id];
    const root = researchMarkets.find((m) => m.id === id);
    if (target) {
      if (
        (market && market !== target[0]) ||
        (node && node !== target[1] && node !== market)
      )
        unresolved.push(id);
      else {
        market = target[0];
        node = target[1];
      }
    } else if (root) {
      if (market && market !== id) unresolved.push(id);
      else market = id;
    } else if (/^age_(20|30|40|50|60|70)$/.test(id)) {
      const nextAge = id.slice(4);
      if (age && age !== nextAge) unresolved.push(id);
      else age = nextAge;
    } else if (id !== 'universe') unresolved.push(id);
  }
  if (age && !ageNames.includes(age)) unresolved.push('연령: ' + age);
  const selectedMarket = researchMarkets.find((m) => m.id === market);
  if (
    age &&
    (selectedMarket?.unit === 'household' ||
      (!market && get('unit') === 'household'))
  )
    unresolved.push('가구원 연령으로 가구를 나눌 교차표 미확보');
  if (market && !selectedMarket) unresolved.push('시장: ' + market);
  if (node && !market) unresolved.push('시장 없이 지정된 하위 조건: ' + node);
  const data = selectedMarket ? getResearchExplorer(market, age) : null;
  if (
    node &&
    data &&
    ![
      data.root.id,
      ...data.branches.flatMap((b) => [b.id, ...b.children.map((c) => c.id)]),
    ].includes(node)
  )
    unresolved.push('하위 조건: ' + node);
  const rawCompare = get('compare').split('|').filter(Boolean);
  const compare: string[] = [];
  for (const key of rawCompare.slice(0, 3)) {
    if (/^[a-z_]+:[a-z_~]+:(20|30|40|50|60|70)?$/.test(key)) {
      const [m, n, a] = key.split(':');
      const p = getResearchExplorer(m, a);
      if (a && p?.market.unit !== 'person') {
        unresolved.push('가구 연령 비교 조건: ' + key);
        continue;
      }
      if (
        p &&
        [
          p.root.id,
          ...p.branches.flatMap((b) => [b.id, ...b.children.map((c) => c.id)]),
        ].includes(n)
      )
        compare.push(key);
      else unresolved.push('비교 대상: ' + key);
    } else unresolved.push('이전 비교 조건: ' + key);
  }
  const context: ResearchContext = {
    view: viewNames.includes(path[0]) ? (path[0] as ResearchView) : 'overview',
    market,
    node,
    age,
    unit:
      selectedMarket?.unit ??
      (get('unit') === 'household' ? 'household' : 'person'),
    metric: ['population', 'marketValue', 'spendPerUnit', 'index'].includes(
      get('metric'),
    )
      ? (get('metric') as ResearchContext['metric'])
      : 'population',
    compare,
  };
  return {
    context,
    unresolved: unresolved.map(
      (id) => oldFeatures.features.find((f) => f.id === id)?.label ?? id,
    ),
  };
}

const catalogCache = new Map<string, ResearchCandidate[]>();
function candidate(
  p: ResearchProfile,
  market: (typeof researchMarkets)[number],
  age: string,
  level: ResearchCandidate['level'],
  branch?: (typeof market.branches)[number],
): ResearchCandidate {
  const e = p.estimate;
  return {
    key: candidateKey(market.id, p.id, age),
    market: market.id,
    marketLabel: market.label,
    parentLabel: level === 'archetype' ? (branch?.label ?? '') : '',
    node: p.id,
    age,
    level,
    label: p.label,
    scope:
      level === 'market'
        ? market.scope
        : e.status === 'estimated'
          ? p.definition
            ? p.definition +
              (age ? ` · ${age === '70' ? '70세 이상' : age + '대'}` : '')
            : e.definitions.join(' · ')
          : e.detail,
    unit: market.unit,
    population: e.status === 'estimated' ? e.base : null,
    low: e.status === 'estimated' ? e.low : null,
    high: e.status === 'estimated' ? e.high : null,
    marketValue: p.marketValue,
    grade: p.evidenceGrade,
    job: branch?.job ?? '',
    hypothesis: branch?.hypothesis ?? '',
    alternatives: branch?.alternatives ?? '',
    question: branch?.nextQuestion ?? market.gap ?? '',
    ages: p.householdProfile?.ages ?? p.ages,
    regions: p.regions,
    regionBasis: p.regionBasis,
    observations: p.observations,
    sourceIds: p.sources.map((s) => s.id),
    assumptions: e.status === 'estimated' ? e.assumptions : [e.detail],
    index: null,
    opportunity: {
      score: null,
      population: null,
      economicValue: null,
      completeness: 0,
    },
  };
}
/** All workspace views use exactly the same profiles as the demand flow. */
export function researchCatalog(age = ''): ResearchCandidate[] {
  const cached = catalogCache.get(age);
  if (cached) return cached;
  const rows = researchMarkets.flatMap((m) => {
    const data = getResearchExplorer(m.id, m.unit === 'person' ? age : '')!;
    return [
      candidate(data.root, m, m.unit === 'person' ? age : '', 'market'),
      ...data.branches.flatMap((b) => [
        candidate(b.profile, m, m.unit === 'person' ? age : '', 'branch', b),
        ...b.children.map((p) =>
          candidate(p, m, m.unit === 'person' ? age : '', 'archetype', b),
        ),
      ]),
    ];
  });
  // Rank within the same population unit and hierarchy depth. This is a
  // transparent evidence-limited screen, never a return/need/WTP forecast.
  for (const c of rows) {
    const peers = rows.filter((p) => p.unit === c.unit && p.level === c.level);
    const percentile = (value: number | null, values: (number | null)[]) => {
      const known = values.filter((v): v is number => v !== null);
      if (value === null || known.length < 2) return null;
      return (
        (100 *
          (known.filter((v) => v < value).length +
            (known.filter((v) => v === value).length - 1) / 2)) /
        Math.max(1, known.length - 1)
      );
    };
    const population = percentile(
      c.population,
      peers.map((p) => p.population),
    );
    const economicValue = percentile(
      c.marketValue.annualValue,
      peers.map((p) => p.marketValue.annualValue),
    );
    const sizeWeight = scoring.weights.size,
      economicWeight = moneyConfig.opportunityWeight;
    const availableWeight =
      (population === null ? 0 : sizeWeight) +
      (economicValue === null ? 0 : economicWeight);
    c.opportunity = {
      population,
      economicValue,
      score: availableWeight
        ? ((population ?? 0) * sizeWeight +
            (economicValue ?? 0) * economicWeight) /
          availableWeight
        : null,
      completeness:
        availableWeight /
        (Object.values(scoring.weights).reduce((a, b) => a + b, 0) +
          economicWeight),
    };
  }
  if (catalogCache.size < 8) catalogCache.set(age, rows);
  return rows;
}
export function researchWorkspace(
  context: ResearchContext,
  unresolved: string[] = [],
): ResearchWorkspacePayload {
  const candidates = researchCatalog(context.age);
  const selected = context.market
    ? (candidates.find(
        (c) =>
          c.market === context.market && c.node === (context.node || '_root'),
      ) ?? null)
    : null;
  const comparison = context.compare.flatMap((key) => {
    const [market, node, age] = key.split(':');
    const c = researchCatalog(age).find(
      (c) => c.market === market && c.node === node,
    );
    return c ? [c] : [];
  });
  let matrix: ResearchWorkspacePayload['matrix'] = null;
  if (context.view === 'matrix' && context.unit === 'person') {
    const columns = candidates.filter(
      (c) =>
        c.unit === context.unit &&
        (context.market
          ? c.market === context.market &&
            (context.node && context.node !== '_root'
              ? c.node === context.node || c.node.startsWith(context.node + '~')
              : c.level === 'branch')
          : c.level === 'market'),
    );
    const cells = ageNames.map((age) =>
      columns.map((column) => {
        const c = researchCatalog(age).find(
          (c) => c.market === column.market && c.node === column.node,
        )!;
        if (c.unit !== 'person')
          return { ...c, population: null, low: null, high: null, index: null };
        const all = researchCatalog('').find(
          (c) => c.key === candidateKey(column.market, column.node),
        )!;
        const ageFrame = adultResearchFrame
          .filter(
            (f) =>
              f.ageMin! >= Number(age) &&
              (age === '70' || f.ageMin! < Number(age) + 10),
          )
          .reduce((n, f) => n + f.population, 0);
        const fullFrame = adultResearchFrame.reduce(
          (n, f) => n + f.population,
          0,
        );
        const index =
          c.population !== null && all.population && ageFrame
            ? c.population / all.population / (ageFrame / fullFrame)
            : null;
        return { ...c, index };
      }),
    );
    matrix = { columns, rows: ageNames, cells };
  }
  return {
    context,
    candidates: candidates.map(compactCandidate),
    selected,
    comparison,
    matrix: matrix
      ? {
          ...matrix,
          columns: matrix.columns.map(compactCandidate),
          cells: matrix.cells.map((row) => row.map(compactCandidate)),
        }
      : null,
    sources: context.view === 'sources' ? demandSources : [],
    unresolved,
    version: 'research-workspace-v1',
  };
}

/** Detail is loaded by its canonical URL. Do not repeat demographic arrays and
 * source prose hundreds of times in each map/matrix response. */
function compactCandidate(c: ResearchCandidate): ResearchCandidate {
  return {
    ...c,
    ages: [],
    regions: [],
    regionBasis: '',
    observations: [],
    assumptions: [],
    marketValue: { ...c.marketValue, sourceBasis: [], assumptions: [] },
  };
}
