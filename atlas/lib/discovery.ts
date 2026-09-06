import {
  canonicalIds,
  conditionKey,
  type AtlasEntity,
  type Profile,
} from './atlas';

export const AGE_UNIONS: Record<string, string[]> = {
  age_20_39: ['age_20', 'age_30'],
  age_40_59: ['age_40', 'age_50'],
  age_50_69: ['age_50', 'age_60'],
  age_60_plus: ['age_60', 'age_70'],
};
export function hierarchyOrder(e: AtlasEntity) {
  return e.kind === 'market'
    ? 0
    : e.kind === 'interest'
      ? 1
      : [
            'age',
            'age_range',
            'sex',
            'region',
            'household',
            'marital',
            'housing',
          ].includes(e.kind)
        ? 2
        : e.kind === 'need'
          ? 3
          : e.kind === 'archetype'
            ? 5
            : 4;
}
export function orderedConditions(entities: AtlasEntity[]) {
  return [...entities].sort((a, b) => hierarchyOrder(a) - hierarchyOrder(b));
}
export interface Candidate {
  key: string;
  ids: string[];
  scope: string;
  label: string;
  savedAt: string;
  hypothesis: string;
  alternative: string;
  nextStep: string;
  evidence: string;
  sourceUrl: string;
  status: 'hypothesis' | 'researching' | 'validated';
}
export interface Workspace {
  version: 1;
  candidates: Candidate[];
  compare: string[];
  decisionWeights: Record<string, number>;
}
export const EMPTY_WORKSPACE: Workspace = {
  version: 1,
  candidates: [],
  compare: [],
  decisionWeights: {
    size: 20,
    economicValue: 25,
    distinctiveness: 20,
    consumption: 20,
    need: 15,
  },
};
export const candidateKey = (ids: string[], scope: string) =>
  conditionKey(ids) + '@' + scope;
export function parseWorkspace(raw: string | null): Workspace {
  try {
    const data = JSON.parse(raw ?? '{}');
    if (
      data.version !== 1 ||
      !Array.isArray(data.candidates) ||
      !Array.isArray(data.compare)
    )
      return EMPTY_WORKSPACE;
    const candidates = data.candidates
      .filter(
        (v: Candidate) =>
          v &&
          Array.isArray(v.ids) &&
          v.ids.length > 0 &&
          v.ids.length <= 8 &&
          v.ids.every(
            (id) => typeof id === 'string' && /^[a-z0-9_]+$/.test(id),
          ) &&
          typeof v.scope === 'string' &&
          typeof v.label === 'string' &&
          v.key === candidateKey(v.ids, v.scope) &&
          ['hypothesis', 'researching', 'validated'].includes(v.status) &&
          [
            'hypothesis',
            'alternative',
            'nextStep',
            'evidence',
            'sourceUrl',
            'savedAt',
          ].every((k) => typeof v[k as keyof Candidate] === 'string'),
      )
      .slice(0, 100) as Candidate[];
    return {
      version: 1,
      candidates,
      compare: [...new Set<string>(data.compare)]
        .filter((key) => candidates.some((c) => c.key === key))
        .slice(0, 3),
      decisionWeights: Object.fromEntries(
        Object.entries(EMPTY_WORKSPACE.decisionWeights).map(([key, value]) => [
          key,
          typeof data.decisionWeights?.[key] === 'number' &&
          Number.isFinite(data.decisionWeights[key])
            ? Math.max(0, Math.min(100, data.decisionWeights[key]))
            : value,
        ]),
      ),
    };
  } catch {
    return EMPTY_WORKSPACE;
  }
}
export function makeCandidate(
  ids: string[],
  scope: string,
  label: string,
): Candidate {
  return {
    key: candidateKey(ids, scope),
    ids: canonicalIds(ids),
    scope,
    label,
    savedAt: new Date().toISOString(),
    hypothesis: '',
    alternative: '',
    nextStep: '이 집단의 실제 문제와 기존 해결 방식을 인터뷰로 확인',
    evidence: '',
    sourceUrl: '',
    status: 'hypothesis',
  };
}
export function safeSourceUrl(value: string) {
  try {
    const u = new URL(value);
    return ['http:', 'https:'].includes(u.protocol) ? u.href : null;
  } catch {
    return null;
  }
}
export function validationGaps(p: Profile) {
  const money = p.summary.marketValue;
  return [
    {
      label: '문제의 맥락·강도',
      origin: 'Nemotron 재추출 + 인터뷰',
      state: '공동 언급',
      detail:
        '동일 인물의 관심과 불편입니다. 해당 시장에서 겪는 문제인지는 문장·분야별 재추출과 인터뷰가 필요합니다.',
    },
    {
      label: '지출·구매 빈도',
      origin: '외부 거래·소비 조사',
      state: money?.base == null ? '기준 미확보' : '일부 범위 배분',
      detail:
        money?.base == null
          ? '현재 관심 영역에 맞는 지출 기준이 없습니다. 관련 인구만으로 0원으로 판단하지 않습니다.'
          : `${money.scopeLabel}. 실제 고객 지출이나 서비스 매출로 해석할 수 없습니다.`,
    },
    {
      label: '기존 대안·지불의향',
      origin: '경쟁 조사 + 가격 실험',
      state: '검증 필요',
      detail: '대안 가격, 불만, 전환 비용, 실제 유료 선택을 확인해야 합니다.',
    },
    {
      label: '성장·도달 가능성',
      origin: '시계열·채널 실험',
      state: '검증 필요',
      detail:
        '전국 항목의 변화와 채널 공동 언급만 확보했습니다. 집단 성장률, 도달 인원, 획득 비용은 미측정입니다.',
    },
  ];
}
