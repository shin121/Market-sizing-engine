'use client';
import Link from 'next/link';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import {
  ArrowUpRight,
  Columns3,
  Lightbulb,
  Download,
  Trash2,
} from 'lucide-react';
import { population, pct, type AtlasPayload, type Profile } from '@/lib/atlas';
import { formatKRW } from '@/lib/market-value';
import { safeSourceUrl, validationGaps, type Candidate } from '@/lib/discovery';
import { useWorkspace, candidateHref } from './workspace';
import { SpendRange, EvidenceTable } from './economic-profile';
import { Module } from './common';

type Loaded = { key: string; profile?: Profile; error?: string };
function CompareDistribution({
  profile,
  kind,
}: {
  profile: Profile;
  kind: 'age' | 'region';
}) {
  const all = profile.demographics.filter((s) => s.entity.kind === kind);
  const rows =
    kind === 'age'
      ? all
      : [...all].sort((a, b) => b.share - a.share).slice(0, 5);
  const remaining = Math.max(0, 1 - rows.reduce((sum, s) => sum + s.share, 0));
  return (
    <div className="compare-distribution">
      <div className="distribution-legend">
        {rows.map((s, i) => (
          <span key={s.entity.id}>
            <i style={{ opacity: 1 - i * 0.13 }} />
            {s.entity.label}
          </span>
        ))}
      </div>
      <div className="distribution-stack">
        {rows.map((s, i) => (
          <span
            key={s.entity.id}
            style={{ width: `${s.share * 100}%`, opacity: 1 - i * 0.11 }}
            title={`${s.entity.label} ${pct(s.share)}`}
          >
            {s.share > 0.05 ? pct(s.share, 0) : ''}
          </span>
        ))}
        {remaining > 0.001 && (
          <span
            className="distribution-other"
            style={{ width: `${remaining * 100}%` }}
            title={`기타 지역 ${pct(remaining)}`}
          />
        )}
      </div>
      <small>
        {kind === 'region'
          ? '상위 5개 지역 · 회색은 기타 지역'
          : '20세 이상 · 연령 구성비'}
      </small>
    </div>
  );
}
function CompareTrend({ profile }: { profile: Profile }) {
  const series = profile.summary.marketValue?.nationalTrend;
  if (!series || series.length < 2)
    return (
      <div className="compact-trend-empty">
        추세 미확보<small>동일 항목의 시계열 근거 필요</small>
      </div>
    );
  const first = series[0],
    last = series[series.length - 1],
    change = first.value ? last.value / first.value - 1 : null;
  return (
    <div className="compact-trend">
      <strong>
        {change === null ? '—' : `${change >= 0 ? '+' : ''}${pct(change)}`}
      </strong>
      <div>
        <span>
          {first.year}
          <b>{formatKRW(first.value, false)}</b>
        </span>
        <span className="trend-connector">→</span>
        <span>
          {last.year}
          <b>{formatKRW(last.value, false)}</b>
        </span>
      </div>
      <small>전국 동일 항목 · 집단 성장률 아님</small>
    </div>
  );
}
function useProfiles(candidates: Candidate[]) {
  const requestKey = candidates.map((c) => c.key).join('|');
  const [loaded, setLoaded] = useState<Loaded[]>([]);
  useEffect(() => {
    if (!requestKey) return;
    const controller = new AbortController();
    void Promise.all(
      requestKey.split('|').map(async (key) => {
        const [q, scope] = key.split('@');
        try {
          const response = await fetch(
            '/api/atlas/profile?q=' +
              encodeURIComponent(q) +
              '&spend=' +
              encodeURIComponent(scope),
            { signal: controller.signal },
          );
          if (!response.ok) throw Error('unavailable');
          return { key, profile: (await response.json()) as Profile };
        } catch {
          return {
            key,
            error:
              '조건을 불러오지 못했습니다. 다시 불러오거나 후보를 다시 선택해 주세요.',
          };
        }
      }),
    ).then((rows) => {
      if (!controller.signal.aborted) setLoaded(rows);
    });
    return () => controller.abort();
  }, [requestKey]);
  return candidates.map(
    (c) => loaded.find((r) => r.key === c.key) ?? { key: c.key },
  );
}
function EmptyWorkspace({ compare = false }: { compare?: boolean }) {
  return (
    <div className="workspace-empty">
      {compare ? <Columns3 size={32} /> : <Lightbulb size={32} />}
      <h2>
        {compare
          ? '함께 판단할 후보를 담아보세요'
          : '다시 파볼 만한 기회를 모아두세요'}
      </h2>
      <p>
        시장이나 세그먼트 프로필에서 ‘
        {compare ? '비교에 담기' : '아이디어 저장'}’를 누르면 탐색 조건과 지출
        범위가 함께 저장됩니다.
      </p>
      <Link href="/atlas">
        시장 탐색 시작 <ArrowUpRight size={14} />
      </Link>
    </div>
  );
}
const criteria = [
  ['size', '인구 규모'],
  ['economicValue', '연간 소비액'],
  ['distinctiveness', '특이성'],
  ['consumption', '소비 관여'],
  ['need', '불편 공동 언급'],
] as const;
export function CompareWorkspace() {
  const { workspace, update } = useWorkspace();
  const candidates = workspace.compare.flatMap(
    (key) => workspace.candidates.find((c) => c.key === key) ?? [],
  );
  const loaded = useProfiles(candidates);
  const weights = workspace.decisionWeights;
  const setWeights = (next: Record<string, number>) =>
    update((w) => ({ ...w, decisionWeights: next }));
  if (!candidates.length) return <EmptyWorkspace compare />;
  const profiles = loaded.map((r) => r.profile);
  const complete = profiles.every(Boolean);
  const comparableMoney =
    complete &&
    new Set(profiles.map((p) => p!.summary.marketValue?.scopeId)).size === 1 &&
    profiles.every((p) => p!.summary.marketValue?.base != null);
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  const score = (p: Profile) => {
    const covered = criteria.filter(
      ([id]) =>
        p.summary.metrics.components[id] != null &&
        (id !== 'economicValue' || comparableMoney),
    );
    const denominator = covered.reduce((sum, [id]) => sum + weights[id], 0);
    return denominator
      ? {
          value:
            covered.reduce(
              (sum, [id]) =>
                sum + p.summary.metrics.components[id]! * weights[id],
              0,
            ) / denominator,
          coverage: total ? denominator / total : 0,
        }
      : null;
  };
  const row = (
    title: string,
    render: (p: Profile, c: Candidate) => ReactNode,
    note?: string,
  ) => (
    <div className="decision-row">
      <div className="decision-label">
        <b>{title}</b>
        {note && <small>{note}</small>}
      </div>
      {candidates.map((c, i) => (
        <div className={'decision-cell column-' + i} key={c.key}>
          {profiles[i] ? (
            render(profiles[i]!, c)
          ) : (
            <output className="empty">
              {loaded[i].error ?? '집계 불러오는 중…'}
              {loaded[i].error && (
                <button onClick={() => window.location.reload()}>
                  다시 불러오기
                </button>
              )}
            </output>
          )}
        </div>
      ))}
    </div>
  );
  return (
    <div
      className="decision-workspace"
      style={{ '--compare-count': candidates.length } as CSSProperties}
    >
      <div className="decision-note">
        <Columns3 size={16} />
        <span>
          같은 기준으로 후보를 비교하세요. 저장한 지출 범위는 후보마다
          유지됩니다.
        </span>
        <Link href="/atlas/ideas">아이디어 보드에서 후보 선택 ↗</Link>
      </div>
      <div className="decision-row decision-head">
        <div className="decision-label">
          <b>비교 후보</b>
          <small>{candidates.length}/3개 · 중복 합산 불가</small>
        </div>
        {candidates.map((c, i) => (
          <div className={'decision-cell column-' + i} key={c.key}>
            <div className="compare-title">
              <span>{i + 1}</span>
              <Link href={candidateHref(c)}>{c.label}</Link>
              <button
                aria-label={`${c.label} 비교에서 제거`}
                onClick={() =>
                  update((w) => ({
                    ...w,
                    compare: w.compare.filter((k) => k !== c.key),
                  }))
                }
              >
                ×
              </button>
            </div>
            <small>
              {profiles[i]?.summary.marketValue?.scopeLabel ?? c.scope}
            </small>
          </div>
        ))}
      </div>
      {row(
        '규모·관련 지출',
        (p) => (
          <div className="compare-kpis">
            <div>
              <span>관련 인구</span>
              <strong>{population(p.summary.estimate.population)}</strong>
            </div>
            <div>
              <span>연간 소비액</span>
              <strong>{formatKRW(p.summary.marketValue?.base, false)}</strong>
            </div>
            <small>
              1인당{' '}
              {formatKRW(p.summary.marketValue?.annualSpendPerUnit, false)} ·
              배분 분모{' '}
              {p.summary.marketValue?.relevantPopulation == null
                ? '—'
                : population(p.summary.marketValue.relevantPopulation)}
            </small>
          </div>
        ),
        '각 후보의 대상·지출 범위 확인',
      )}
      {row(
        '탐색 점수',
        (p) => (
          <div className="compare-score">
            <i>
              <em style={{ width: `${p.summary.metrics.opportunity ?? 0}%` }} />
            </i>
            <b>
              {p.summary.metrics.opportunity ?? '—'}
              <small>/100</small>
            </b>
          </div>
        ),
        '기존 엔진의 상대 점수',
      )}
      {row(
        '전국 소비 기준의 변화',
        (p) => (
          <CompareTrend profile={p} />
        ),
        '세그먼트 성장률 아님',
      )}
      {row(
        '연령별 분포',
        (p) => (
          <CompareDistribution profile={p} kind="age" />
        ),
        '구성비 · %',
      )}
      {row(
        '지역별 분포',
        (p) => (
          <CompareDistribution profile={p} kind="region" />
        ),
        '상위 지역 · %',
      )}
      {row(
        '소비액 범위',
        (p) => (
          <SpendRange value={p.summary.marketValue} />
        ),
        '모델 배분 민감도',
      )}
      {row(
        '하위 구매 유형',
        (p, c) => (
          <div className="compare-subtypes">
            {p.archetypes
              .filter((s) => s.population > 0 && s.share < 0.999)
              .slice(0, 3)
              .map((s) => (
                <Link
                  key={s.entity.id}
                  href={
                    '/atlas/segments/' +
                    [
                      ...new Set(
                        c.ids.length < 8 ? [...c.ids, s.entity.id] : c.ids,
                      ),
                    ]
                      .sort()
                      .join('~') +
                    '?spend=' +
                    c.scope
                  }
                >
                  <span>{s.entity.label}</span>
                  <i>
                    <em style={{ width: `${s.share * 100}%` }} />
                  </i>
                  <b>{pct(s.share)}</b>
                </Link>
              ))}
          </div>
        ),
        '현재 집단 내 · 유형 중복',
      )}
      {row('근거·미확인 사항', (p) => (
        <div className="compare-evidence">
          <b>
            서술 {p.summary.estimate.support.toLocaleString()}건 ·{' '}
            {p.summary.estimate.support < 30 ? '희소' : '모델 추정'}
          </b>
          <p>
            지출 {p.summary.marketValue?.confidence ?? '미확보'} · 직접 지출
            관측 0%
          </p>
          <p>경쟁 · 지불의향 · 집단 성장률 미측정</p>
          <details>
            <summary>산출 근거 확인</summary>
            <EvidenceTable profile={p} />
          </details>
        </div>
      ))}
      <Module
        title="의사결정 가중치"
        note="모델 신호에 대한 탐색 우선순위 · 사업 수익성 평가 아님"
      >
        {!comparableMoney && (
          <p className="decision-compatibility">
            지출 범위가 다르거나 금액 근거가 없는 후보가 있어 연간 소비액을 가중
            점수에서 제외했습니다. 금액의 크기를 같은 시장 기회로 비교하지
            마세요.
          </p>
        )}
        <div className="decision-weights">
          {criteria.map(([id, label]) => (
            <label key={id}>
              {label}
              <input
                aria-label={label + ' 가중치'}
                type="number"
                min="0"
                max="100"
                value={weights[id]}
                onChange={(e) =>
                  setWeights({
                    ...weights,
                    [id]: Math.min(
                      100,
                      Math.max(0, Number(e.target.value) || 0),
                    ),
                  })
                }
              />
              <span>
                {total ? Math.round((weights[id] / total) * 100) : 0}%
              </span>
            </label>
          ))}
        </div>
        {row(
          '사용자 가중 탐색 점수',
          (p) => {
            const s = score(p);
            return (
              <div className="weighted-result">
                <strong>{s ? s.value.toFixed(1) : '—'}</strong>
                <small>
                  계산 가능 가중치 {s ? pct(s.coverage) : '0%'} · 데이터 정확도
                  아님
                </small>
              </div>
            );
          },
          '입력 가중치는 합계로 정규화',
        )}
      </Module>
      {row('다음 검증', (_p, c) => (
        <div className="compare-next">
          <p>{c.nextStep}</p>
          <Link href="/atlas/ideas">가설·대안·검증 기록 ↗</Link>
        </div>
      ))}
    </div>
  );
}

function IdeaEditor({ candidate }: { candidate: Candidate }) {
  const { update } = useWorkspace();
  const [draft, setDraft] = useState(candidate),
    [message, setMessage] = useState('');
  const field = (key: keyof Candidate, value: string) =>
    setDraft({ ...draft, [key]: value });
  return (
    <form
      className="idea-editor"
      onSubmit={(event) => {
        event.preventDefault();
        if (draft.sourceUrl && !safeSourceUrl(draft.sourceUrl)) {
          setMessage('출처는 http 또는 https URL을 입력해 주세요.');
          return;
        }
        if (draft.status === 'validated' && !draft.evidence.trim()) {
          setMessage('검증 완료에는 확인한 증거를 기록해 주세요.');
          return;
        }
        const ok = update((w) => ({
          ...w,
          candidates: w.candidates.map((c) =>
            c.key === draft.key ? draft : c,
          ),
        }));
        setMessage(
          ok ? '기록을 저장했습니다.' : '저장 공간을 사용할 수 없습니다.',
        );
      }}
    >
      <label>
        아이디어 이름
        <input
          value={draft.label}
          maxLength={160}
          required
          onChange={(e) => field('label', e.target.value)}
        />
      </label>
      <label>
        사업 가설 · 누구의 어떤 문제를 해결하는가
        <textarea
          value={draft.hypothesis}
          maxLength={3000}
          placeholder="관심과 불편의 공동 언급을 실제 문제로 검증해 보세요."
          onChange={(e) => field('hypothesis', e.target.value)}
        />
      </label>
      <label>
        현재 대안 · 이름, 가격, 불만 (조사 전에는 가설로 기록)
        <textarea
          value={draft.alternative}
          maxLength={3000}
          onChange={(e) => field('alternative', e.target.value)}
        />
      </label>
      <label>
        다음 검증 · 대상, 질문, 확인할 기준
        <textarea
          value={draft.nextStep}
          maxLength={3000}
          onChange={(e) => field('nextStep', e.target.value)}
        />
      </label>
      <label>
        확인한 증거 · 조사 날짜와 표본/출처를 포함
        <textarea
          value={draft.evidence}
          maxLength={6000}
          onChange={(e) => field('evidence', e.target.value)}
        />
      </label>
      <label>
        외부 근거 URL
        <input
          type="url"
          value={draft.sourceUrl}
          maxLength={2000}
          placeholder="https://…"
          onChange={(e) => field('sourceUrl', e.target.value)}
        />
      </label>
      <label>
        진행 상태
        <select
          value={draft.status}
          onChange={(e) => field('status', e.target.value)}
        >
          <option value="hypothesis">가설</option>
          <option value="researching">조사 중</option>
          <option value="validated">사용자 검증 완료</option>
        </select>
      </label>
      <div className="idea-form-actions">
        <button className="save-idea" type="submit">
          기록 저장
        </button>
        <output>{message}</output>
      </div>
      <p className="inline-caveat">
        입력한 조사 메모는 엔진 추정치나 점수에 자동 반영되지 않습니다. ‘검증
        완료’는 사용자가 기록한 상태입니다.
      </p>
    </form>
  );
}
export function IdeasWorkspace() {
  const { workspace, update } = useWorkspace();
  const [selected, setSelected] = useState<string | null>(null),
    [message, setMessage] = useState('');
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  if (!workspace.candidates.length) return <EmptyWorkspace />;
  const active =
    workspace.candidates.find((c) => c.key === selected) ??
    workspace.candidates[workspace.candidates.length - 1];
  const exportIdeas = () => {
    const blob = new Blob([JSON.stringify(workspace, null, 2)], {
        type: 'application/json',
      }),
      url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'market-atlas-ideas.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <>
      <div className="ideas-toolbar">
        <span>
          {workspace.candidates.length}개 아이디어 · 이 브라우저에 저장
        </span>
        <output>{message}</output>
        <button onClick={exportIdeas}>
          <Download size={14} />
          기록 내보내기
        </button>
        <Link href="/atlas/compare">
          {workspace.compare.length}개 비교하기 ↗
        </Link>
      </div>
      <div className="ideas-layout">
        <aside aria-label="저장한 아이디어">
          {[...workspace.candidates].reverse().map((c) => (
            <div
              key={c.key}
              className={
                active.key === c.key ? 'idea-item active' : 'idea-item'
              }
            >
              <button onClick={() => setSelected(c.key)}>
                <span>
                  {c.status === 'hypothesis'
                    ? '가설'
                    : c.status === 'researching'
                      ? '조사 중'
                      : '사용자 검증 완료'}
                </span>
                <b>{c.label}</b>
                <small>
                  {c.ids.length}개 조건 ·{' '}
                  {new Date(c.savedAt).toLocaleDateString('ko-KR')}
                </small>
              </button>
              <label>
                <input
                  type="checkbox"
                  aria-label={`${c.label} 비교 선택`}
                  checked={workspace.compare.includes(c.key)}
                  onChange={(e) => {
                    if (e.target.checked && workspace.compare.length >= 3) {
                      setMessage('최대 3개를 비교할 수 있습니다.');
                      return;
                    }
                    const ok = update((w) => ({
                      ...w,
                      compare: e.target.checked
                        ? [...new Set([...w.compare, c.key])]
                        : w.compare.filter((key) => key !== c.key),
                    }));
                    setMessage(ok ? '' : '저장에 실패했습니다.');
                  }}
                />
                비교
              </label>
            </div>
          ))}
        </aside>
        <section className="idea-detail">
          <header>
            <Link href={candidateHref(active)}>
              저장된 조건으로 프로필 열기 ↗
            </Link>
            <button onClick={() => setPendingDelete(active.key)}>
              <Trash2 size={14} />
              삭제
            </button>
          </header>
          {pendingDelete === active.key && (
            <div className="delete-confirm">
              <span>이 아이디어와 조사 기록을 삭제합니다.</span>
              <button
                onClick={() => {
                  update((w) => ({
                    ...w,
                    candidates: w.candidates.filter(
                      (c) => c.key !== active.key,
                    ),
                    compare: w.compare.filter((key) => key !== active.key),
                  }));
                  setPendingDelete(null);
                }}
              >
                삭제 확인
              </button>
              <button onClick={() => setPendingDelete(null)}>취소</button>
            </div>
          )}
          <IdeaEditor key={active.key} candidate={active} />
        </section>
      </div>
    </>
  );
}

export function SourcesWorkspace({ data }: { data: AtlasPayload }) {
  return (
    <>
      <div className="sources-intro">
        <h2>무엇을 알 수 있고, 무엇을 더 확인해야 하는가</h2>
        <p>
          합성 프로필에서 도출한 신호, 외부 소비 기준으로 배분한 금액, 추가
          조사가 필요한 항목을 구분합니다.
        </p>
      </div>
      <Module title="Discovery 데이터 지도">
        <div className="table-scroll">
          <table className="os-table sources-table">
            <thead>
              <tr>
                <th>알고 싶은 것</th>
                <th>현재 상태</th>
                <th>다음 데이터</th>
                <th>해석과 필요한 작업</th>
              </tr>
            </thead>
            <tbody>
              {validationGaps(data.profile).map((g) => (
                <tr key={g.label}>
                  <td>{g.label}</td>
                  <td>{g.state}</td>
                  <td>{g.origin}</td>
                  <td>{g.detail}</td>
                </tr>
              ))}
              <tr>
                <td>생활 조건·세그먼트</td>
                <td>계산 가능</td>
                <td>Nemotron 인구 속성</td>
                <td>
                  연령·성별·지역·가구·혼인 상태. 연령 묶음 OR 및 조건 간 AND.
                  맞벌이·소득·비이용은 확인 불가.
                </td>
              </tr>
              <tr>
                <td>하위 구매 행동·산업 연결</td>
                <td>계산 가능</td>
                <td>Nemotron 행동 공동 언급</td>
                <td>
                  특이성과 동시 관심을 탐색할 수 있습니다. 행동 간 인과관계나
                  미충족 수요의 증거는 아닙니다.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Module>
      <Module title="현재 범위의 산출 근거">
        <EvidenceTable profile={data.profile} />
      </Module>
      <div className="source-principles">
        <b>
          직접 지출 관측 0% · 참여자는 실제 구매자와 구분 · 상이한 산업의 소비액
          합산 금지
        </b>
        <p>
          가구/사업체 단위 매핑, 매출 포착률, SAM/SOM은 지원하지 않습니다. 외부
          연구 결과는 아이디어 보드에서 출처와 함께 기록할 수 있습니다.
        </p>
      </div>
    </>
  );
}
