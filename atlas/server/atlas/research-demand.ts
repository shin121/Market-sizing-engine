import type {
  DemandCell,
  DemandEstimate,
  DemandFactor,
  DemandRange,
  DemandRate,
  DemandSource,
  DemandUnavailable,
} from '../../lib/demand';

/** Pure external estimator: intentionally has no import of Nemotron, bitmaps or catalog. */
export function estimateResearchDemand(
  ids: string[],
  frame: DemandCell[],
  factors: DemandFactor[],
  sources: DemandSource[],
): DemandEstimate | DemandUnavailable {
  const registry = new Map(factors.map((f) => [f.id, f]));
  const sourceIds = new Set(sources.map((s) => s.id));
  if (
    registry.size !== factors.length ||
    sourceIds.size !== sources.length ||
    new Set(frame.map((c) => c.id)).size !== frame.length
  )
    return {
      status: 'not_estimable',
      reason: 'invalid_model',
      detail: 'Duplicate factor, source or population cell identifiers.',
    };
  const expanded = new Set<string>();
  const visiting = new Set<string>();
  let error: DemandUnavailable | undefined;
  function visit(id: string) {
    if (expanded.has(id) || error) return;
    const f = registry.get(id);
    if (!f) {
      error = { status: 'not_estimable', reason: 'unknown_factor', detail: id };
      return;
    }
    if (visiting.has(id)) {
      error = {
        status: 'not_estimable',
        reason: 'invalid_model',
        detail: 'Cyclic prerequisites: ' + id,
      };
      return;
    }
    visiting.add(id);
    f.prerequisites.forEach(visit);
    visiting.delete(id);
    expanded.add(id);
  }
  [...new Set(ids)].sort().forEach(visit);
  if (error) return error;
  const active = [...expanded].sort().map((id) => registry.get(id)!);
  const scopes = active.flatMap((f) =>
    f.populationScope ? [f.populationScope] : [],
  );
  const populationScope = scopes.length
    ? {
        ageMin: Math.max(...scopes.map((s) => s.ageMin)),
        ageMax: Math.min(...scopes.map((s) => s.ageMax)),
      }
    : undefined;
  if (
    scopes.some(
      (s) =>
        !Number.isFinite(s.ageMin) ||
        !Number.isFinite(s.ageMax) ||
        s.ageMin < 0 ||
        s.ageMin > s.ageMax,
    )
  )
    return {
      status: 'not_estimable',
      reason: 'invalid_model',
      detail: 'Invalid survey population scope.',
    };
  if (populationScope && populationScope.ageMin > populationScope.ageMax)
    return {
      status: 'not_estimable',
      reason: 'outside_scope',
      detail: 'The survey populations have no shared age range.',
    };
  const units = new Set([
    ...frame.map((c) => c.unit),
    ...active.map((f) => f.unit),
  ]);
  if (units.size !== 1 || !frame.length)
    return {
      status: 'not_estimable',
      reason: 'unit_mismatch',
      detail:
        'A single explicit population frame is required; there is no implicit person/household conversion.',
    };
  for (const cell of frame) {
    if (
      !sourceIds.has(cell.sourceId) ||
      !Number.isFinite(cell.population) ||
      cell.population < 0 ||
      (cell.ageMin !== undefined &&
        (cell.ageMax === undefined || cell.ageMax < cell.ageMin))
    )
      return {
        status: 'not_estimable',
        reason: 'invalid_model',
        detail: 'Invalid population frame: ' + cell.id,
      };
  }
  for (const f of active) {
    if (
      !f.sourceIds.length ||
      f.sourceIds.some((id) => !sourceIds.has(id)) ||
      !f.rates.length ||
      !f.definition ||
      !f.observation ||
      !f.validationQuestion ||
      f.rates.some((r) => !validRate(r))
    )
      return {
        status: 'not_estimable',
        reason: 'invalid_model',
        detail: 'Incomplete evidence or invalid probability: ' + f.id,
      };
  }
  const assumptions = new Set(active.flatMap((f) => f.assumptions));
  // Split age bands at every externally defined boundary. Partial bands use an
  // explicit uniform-age assumption, not the synthetic case age distribution.
  const cells: DemandEstimate['cells'] = [];
  for (const cell of frame) {
    const bounds =
      cell.ageMin === undefined ? [0, 1] : [cell.ageMin, cell.ageMax! + 1];
    for (const f of active)
      for (const rate of f.rates) {
        if (cell.ageMin === undefined || (rate.sex && rate.sex !== cell.sex))
          continue;
        for (const boundary of [
          rate.ageMin,
          rate.ageMax === undefined ? undefined : rate.ageMax + 1,
        ])
          if (
            boundary !== undefined &&
            boundary > cell.ageMin &&
            boundary <= cell.ageMax!
          )
            bounds.push(boundary);
      }
    const sorted = [...new Set(bounds)].sort((a, b) => a - b);
    const total: DemandRange = { low: 0, base: 0, high: 0 };
    if (sorted.length > 2)
      assumptions.add(
        '공식 인구의 연령 구간을 나눌 때 구간 안 단일연령 인구를 균등 배분하는 근사를 사용합니다.',
      );
    for (let i = 0; i < sorted.length - 1; i++) {
      const age = cell.ageMin === undefined ? undefined : sorted[i];
      const portion =
        (sorted[i + 1] - sorted[i]) / (sorted.at(-1)! - sorted[0]);
      const value = {
        low: cell.population * portion,
        base: cell.population * portion,
        high: cell.population * portion,
      };
      for (const f of active) {
        const matches = f.rates.filter(
          (r) =>
            (!r.sex || r.sex === cell.sex) &&
            (r.ageMin === undefined ||
              (age !== undefined && age >= r.ageMin)) &&
            (r.ageMax === undefined || (age !== undefined && age <= r.ageMax)),
        );
        if (matches.length !== 1)
          return {
            status: 'not_estimable',
            reason: matches.length ? 'invalid_model' : 'missing_rate',
            detail: `${f.id}: ${cell.id} / age ${age ?? 'unknown'} has ${matches.length} matching rates`,
          };
        for (const level of ['low', 'base', 'high'] as const)
          value[level] *= matches[0][level];
      }
      for (const level of ['low', 'base', 'high'] as const)
        total[level] += value[level];
    }
    cells.push({ ...cell, ...total });
  }
  if (active.length > 1)
    assumptions.add(
      '동일한 조건은 한 번만 적용합니다. 함께 조사되지 않은 조건의 결합은 연령·성별 층 안 조건부 독립 가정이며 실제 조사 교집합이 아닙니다.',
    );
  return {
    status: 'estimated',
    unit: frame[0].unit,
    ...(populationScope ? { populationScope } : {}),
    low: cells.reduce((n, c) => n + c.low, 0),
    base: cells.reduce((n, c) => n + c.base, 0),
    high: cells.reduce((n, c) => n + c.high, 0),
    factorIds: active.map((f) => f.id),
    definitions: active.map((f) => f.definition),
    sourceIds: [
      ...new Set([
        ...frame.map((c) => c.sourceId),
        ...active.flatMap((f) => f.sourceIds),
      ]),
    ],
    methods: [...new Set(active.map((f) => f.method))],
    assumptions: [...assumptions],
    rangeMeaning: 'research_sensitivity',
    cells,
    isAdditive: false,
  };
}
function validRate(r: DemandRate) {
  return (
    [r.low, r.base, r.high].every(Number.isFinite) &&
    r.low >= 0 &&
    r.low <= r.base &&
    r.base <= r.high &&
    r.high <= 1 &&
    (r.ageMin === undefined || (Number.isFinite(r.ageMin) && r.ageMin >= 0)) &&
    (r.ageMax === undefined ||
      (Number.isFinite(r.ageMax) && r.ageMax >= (r.ageMin ?? 0)))
  );
}
