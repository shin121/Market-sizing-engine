"use client";

import Decimal from "decimal.js";
import {
  Check,
  Download,
  FileSearch,
  LoaderCircle,
  Plus,
  RotateCcw,
  Save,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type { IntervalInput } from "@/domain/interval";
import { calculateMarketSizing, marketScenarioInputSchema, type MarketSizingResult } from "@/domain/market-sizing";
import type { MarketScenarioSelection } from "@/domain/market-scenario-selection";
import {
  RESEARCH_EXTERNAL_TRANSMISSION_CONFIRMED,
  RESEARCH_EXTERNAL_TRANSMISSION_HEADER,
} from "@/lib/research-execution-consent";
import {
  cancelResearchJobAction,
  createOpportunityAction,
  createResearchJobAction,
  exportSnapshotAction,
  reviewRevisionAction,
  saveComparisonAction,
  saveSegmentAction,
  saveScenarioAction,
  updateOpportunityAction,
} from "@/actions/workbench";

type Result = {
  ok: boolean;
  id?: string;
  error?: string;
  configurationRequired?: boolean;
};

async function runResearchNow(jobId: string): Promise<Result> {
  try {
    const response = await fetch(`/api/research/${encodeURIComponent(jobId)}/run`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        [RESEARCH_EXTERNAL_TRANSMISSION_HEADER]: RESEARCH_EXTERNAL_TRANSMISSION_CONFIRMED,
      },
    });
    const payload = await response.json() as { ok?: boolean; error?: string };
    return response.ok && payload.ok
      ? { ok: true, id: jobId }
      : {
          ok: false,
          error: payload.error === "research_provider_configuration_required"
            ? "외부 AI Research가 아직 활성화되지 않았습니다."
            : payload.error ?? "외부 조사 실행에 실패했습니다.",
        };
  } catch {
    return { ok: false, error: "외부 조사 실행 요청에 연결하지 못했습니다." };
  }
}

function resultOf(value: unknown): Result {
  return value && typeof value === "object" ? (value as Result) : { ok: false, error: "응답 형식을 확인할 수 없습니다." };
}

function useMutationFeedback() {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  return { pending, startTransition, message, setMessage };
}

export function SaveCatalogSegmentButton({
  catalogId,
  sourceKind,
  label,
  entityUnit,
}: {
  catalogId: string;
  sourceKind: string;
  label: string;
  entityUnit: string;
}) {
  const router = useRouter();
  const feedback = useMutationFeedback();
  function save() {
    feedback.startTransition(async () => {
      const formData = new FormData();
      formData.set("name", `${label} 세그먼트`);
      formData.set("entity_unit", entityUnit);
      formData.set("conditions_json", JSON.stringify([{
        logic: "AND",
        enabled: true,
        conditions: [{
          sourceId: catalogId,
          sourceKind,
          label,
          group: sourceKind,
          unit: entityUnit,
          operator: "eq",
          value: catalogId.replace(/^[^:]+:/u, ""),
          matchStatus: "exact",
          referenceYear: null,
          enabled: true,
        }],
        groups: [],
      }]));
      const result = resultOf(await saveSegmentAction(formData));
      if (result.ok && result.id) router.push(`/builder/${encodeURIComponent(result.id)}`);
      else feedback.setMessage(result.error ?? "세그먼트 저장에 실패했습니다.");
    });
  }
  return (
    <span className="inline-feedback-control">
      <button className="button" type="button" onClick={save} disabled={feedback.pending} aria-label={`${label} 저장`}>
        {feedback.pending ? <LoaderCircle className="spin" aria-hidden="true" /> : <Save aria-hidden="true" />} 저장
      </button>
      {feedback.message ? <small role="status">{feedback.message}</small> : null}
    </span>
  );
}

function normalizeListField(formData: FormData, key: string) {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw) {
    formData.set(key, "[]");
    return;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      formData.set(key, JSON.stringify(parsed));
      return;
    }
  } catch {
    // Plain text is converted to a trimmed list below.
  }
  const items = raw.split(/[\n,]+/u).map((item) => item.trim()).filter(Boolean);
  formData.set(key, JSON.stringify(items));
}

const OPPORTUNITY_SCORE_FIELDS = [
  { key: "market_size", label: "시장규모", weight: "15", negative: false },
  { key: "growth", label: "성장성", weight: "10", negative: false },
  { key: "willingness_to_pay", label: "지불의사", weight: "10", negative: false },
  { key: "problem_intensity", label: "문제 강도", weight: "15", negative: false },
  { key: "target_accessibility", label: "타깃 접근성", weight: "10", negative: false },
  { key: "competition_intensity", label: "경쟁 강도", weight: "10", negative: true },
  { key: "data_confidence", label: "데이터 신뢰도", weight: "10", negative: false },
  { key: "implementation_difficulty", label: "구현 난이도", weight: "10", negative: true },
  { key: "capability_fit", label: "역량 적합도", weight: "10", negative: false },
] as const;

const OPPORTUNITY_STATUS_OPTIONS = [
  ["discovered", "발견"],
  ["researching", "조사 중"],
  ["validating", "검증 중"],
  ["planned", "실행 계획"],
  ["paused", "보류"],
  ["rejected", "반려"],
  ["archived", "보관"],
] as const;

const EXPERIMENT_STATUS_OPTIONS = [
  ["draft", "초안"],
  ["planned", "실행 계획"],
  ["running", "진행 중"],
  ["completed", "완료"],
  ["cancelled", "취소"],
] as const;

function setOpportunityStructuredFields(formData: FormData) {
  const scoreValues = Object.fromEntries(OPPORTUNITY_SCORE_FIELDS.map(({ key }) => [key, String(formData.get(`score_${key}`) ?? "").trim()]));
  const scoreWeights = Object.fromEntries(OPPORTUNITY_SCORE_FIELDS.map(({ key }) => [key, String(formData.get(`weight_${key}`) ?? "").trim()]));
  if (Object.values(scoreValues).some(Boolean)) formData.set("score_json", JSON.stringify({ values: scoreValues, weights: scoreWeights }));
  const experiment = {
    name: String(formData.get("experiment_name") ?? "").trim(),
    hypothesis: String(formData.get("experiment_hypothesis") ?? "").trim(),
    method: String(formData.get("experiment_method") ?? "").trim(),
    primaryMetric: String(formData.get("experiment_primary_metric") ?? "").trim(),
    successCriteria: String(formData.get("experiment_success_criteria") ?? "").trim(),
    status: String(formData.get("experiment_status") ?? "draft").trim(),
  };
  if (experiment.name) formData.set("experiment_json", JSON.stringify(experiment));
}

function OpportunityScoreInputs({ value }: { value?: OpportunityFormValue }) {
  return (
    <fieldset className="opportunity-score-inputs">
      <legend>Opportunity Score · 9개 필수 차원 (가중치 합계 100%)</legend>
      {OPPORTUNITY_SCORE_FIELDS.map(({ key, label, weight, negative }) => (
        <div key={key}>
          <label><span>{label} 0–100{negative ? " · 높을수록 불리" : ""}</span><input type="number" min="0" max="100" step="any" name={`score_${key}`} defaultValue={value?.scores[key] ?? ""} required /></label>
          <label><span>가중치 %</span><input type="number" min="0" max="100" step="any" name={`weight_${key}`} defaultValue={value?.weights[key] ?? weight} required /></label>
          {negative ? <small>종합점수에는 100 − 입력 원점수로 정규화해 반영합니다.</small> : null}
        </div>
      ))}
      <small>점수는 사용자 판단이며 Production Baseline 값으로 취급되지 않습니다. 경쟁 강도와 구현 난이도는 낮을수록 유리한 역방향 지표입니다.</small>
    </fieldset>
  );
}

const MARKET_SCENARIO_FACTORS = [
  { key: "annualSpendPerEntity", label: "연간 지출 / entity", required: false, ratio: false },
  { key: "serviceabilityRate", label: "서비스 가능 비율", required: true, ratio: true },
  { key: "attainableShare", label: "획득 가능 비율", required: true, ratio: true },
  { key: "operationalCapacity", label: "운영 수용량", required: false, ratio: false },
  { key: "realizedArpu", label: "실현 ARPU", required: false, ratio: false },
] as const;

function scenarioFactorsFromFormData(formData: FormData): Record<string, unknown> {
  const readDecimal = (key: string) => {
    const value = String(formData.get(key) ?? "").trim();
    return value || null;
  };
  const rawHorizon = String(formData.get("horizon_months") ?? "").trim();
  const horizonMonths = rawHorizon ? Number(rawHorizon) : null;
  const scenarioFactors: Record<string, unknown> = {
    currency: String(formData.get("currency") ?? "").trim() || undefined,
    horizonMonths: Number.isSafeInteger(horizonMonths) ? horizonMonths : null,
    productDefinition: String(formData.get("product_definition") ?? "").trim() || undefined,
  };
  for (const factor of MARKET_SCENARIO_FACTORS) {
    const interval = {
      low: readDecimal(`${factor.key}_low`),
      base: readDecimal(`${factor.key}_base`),
      high: readDecimal(`${factor.key}_high`),
    };
    scenarioFactors[factor.key] = factor.required || Object.values(interval).some((value) => value !== null)
      ? interval
      : null;
  }
  return scenarioFactors;
}

function previewValue(value: string): string {
  try {
    const decimal = new Decimal(value);
    if (!decimal.isFinite()) return value;
    const fixed = decimal.toFixed(Math.min(2, decimal.decimalPlaces()));
    const [integer, fraction] = fixed.split(".");
    const sign = integer.startsWith("-") ? "-" : "";
    const unsigned = sign ? integer.slice(1) : integer;
    const grouped = unsigned.replace(/\B(?=(\d{3})+(?!\d))/gu, ",");
    return `${sign}${grouped}${fraction ? `.${fraction}` : ""}`;
  } catch {
    return value;
  }
}

export function ScenarioForm({
  estimateId,
  currency,
  entityUnit,
  eligibleEntities,
}: {
  estimateId: string;
  currency?: string | null;
  entityUnit: string;
  eligibleEntities: IntervalInput;
}) {
  const router = useRouter();
  const feedback = useMutationFeedback();
  const [preview, setPreview] = useState<MarketSizingResult | null>(null);
  function updatePreview(form: HTMLFormElement) {
    const factors = scenarioFactorsFromFormData(new FormData(form));
    const parsed = marketScenarioInputSchema.safeParse({
      entityUnit,
      currency: factors.currency,
      horizonMonths: factors.horizonMonths,
      eligibleEntities,
      annualSpendPerEntity: factors.annualSpendPerEntity,
      serviceabilityRate: factors.serviceabilityRate,
      attainableShare: factors.attainableShare,
      operationalCapacity: factors.operationalCapacity,
      realizedArpu: factors.realizedArpu,
    });
    if (!parsed.success) {
      setPreview(null);
      return;
    }
    try {
      setPreview(calculateMarketSizing(parsed.data));
    } catch {
      setPreview(null);
    }
  }
  function submit(formData: FormData) {
    feedback.startTransition(async () => {
      const scenarioFactors = scenarioFactorsFromFormData(formData);
      formData.set("factors_json", JSON.stringify(scenarioFactors));
      const result = resultOf(await saveScenarioAction(formData));
      feedback.setMessage(result.ok ? "사용자 시나리오를 별도 저장했습니다." : result.error ?? "시나리오 저장에 실패했습니다.");
      if (result.ok) router.refresh();
    });
  }
  return (
    <form className="scenario-form" action={submit} onChange={(event) => updatePreview(event.currentTarget)}>
      <input type="hidden" name="estimate_id" value={estimateId} />
      <label><span>시나리오 이름</span><input name="name" required placeholder="Baseline과 구분할 이름" /></label>
      <div className="scenario-meta-grid">
        <label><span>통화</span><input name="currency" defaultValue={currency ?? "KRW"} placeholder="예: KRW" /></label>
        <label><span>기간 (개월)</span><input type="number" min="1" step="1" name="horizon_months" required placeholder="예: 12" /></label>
        <label><span>Product definition</span><input name="product_definition" placeholder="시장의 제품·서비스 경계" /></label>
      </div>
      <div className="scenario-factor-list">
        {MARKET_SCENARIO_FACTORS.map((factor) => (
          <fieldset key={factor.key}>
            <legend>{factor.label}{factor.required ? " *" : " (선택)"}</legend>
            <label><span>Low</span><input type="text" inputMode="decimal" pattern="[0-9]+(?:[.][0-9]+)?" name={`${factor.key}_low`} required={factor.required} /></label>
            <label><span>Base</span><input type="text" inputMode="decimal" pattern="[0-9]+(?:[.][0-9]+)?" name={`${factor.key}_base`} required={factor.required} /></label>
            <label><span>High</span><input type="text" inputMode="decimal" pattern="[0-9]+(?:[.][0-9]+)?" name={`${factor.key}_high`} required={factor.required} /></label>
          </fieldset>
        ))}
      </div>
      <small className="scenario-preview-help">집계 시장 정보만 입력하세요. 명백한 식별자 패턴은 차단하지만 자동 탐지는 완전하지 않습니다.</small>
      {preview ? (
        <section className="scenario-live-preview" aria-live="polite" aria-label="시나리오 실시간 미리보기">
          <header><strong>저장 전 계산 미리보기</strong><small>{preview.horizonMonths}개월 · {preview.entityUnit}</small></header>
          <div>
            <span><small>TAM</small><b>{previewValue(preview.entities.tam.base)}</b></span>
            <span><small>SAM</small><b>{previewValue(preview.entities.sam.base)}</b></span>
            <span><small>SOM</small><b>{previewValue(preview.entities.som.base)}</b></span>
          </div>
          {preview.revenue ? <p>Revenue Base · {previewValue(preview.revenue.tam.base)} / {previewValue(preview.revenue.sam.base)} / {previewValue(preview.revenue.som.base)} {preview.currency}</p> : <p>연간 지출 근거가 없어 revenue는 미산정입니다.</p>}
        </section>
      ) : <small className="scenario-preview-help">기간과 필수 비율의 Low/Base/High를 모두 입력하면 저장 전 계산값을 확인할 수 있습니다.</small>}
      {feedback.message ? <p className="form-message" role="status">{feedback.message}</p> : null}
      <button className="button button-primary" disabled={feedback.pending} type="submit">{feedback.pending ? <LoaderCircle className="spin" aria-hidden="true" /> : <Save aria-hidden="true" />} 시나리오 저장</button>
    </form>
  );
}

export function SaveComparisonForm({ segmentIds, comparisonId }: { segmentIds: string[]; comparisonId?: string }) {
  const router = useRouter();
  const feedback = useMutationFeedback();
  function submit(formData: FormData) {
    feedback.startTransition(async () => {
      const result = resultOf(await saveComparisonAction(formData));
      if (result.ok && result.id) router.push(`/compare/${encodeURIComponent(result.id)}`);
      feedback.setMessage(result.ok ? "비교 workspace를 저장했습니다." : result.error ?? "비교 저장에 실패했습니다.");
    });
  }
  return (
    <form className="compact-form" action={submit}>
      {comparisonId ? <input type="hidden" name="comparison_id" value={comparisonId} /> : null}
      <input type="hidden" name="segment_ids_json" value={JSON.stringify(segmentIds)} />
      <label><span className="sr-only">비교 이름</span><input name="name" required placeholder="비교 이름" /></label>
      <small>집계 세그먼트 이름만 사용하세요. 개인정보 자동 탐지는 완전하지 않습니다.</small>
      <button className="button button-primary" type="submit" disabled={feedback.pending}><Save aria-hidden="true" /> 저장</button>
      {feedback.message ? <small role="status">{feedback.message}</small> : null}
    </form>
  );
}

export function OpportunityCreateForm({ segmentId }: { segmentId?: string }) {
  const router = useRouter();
  const feedback = useMutationFeedback();
  function submit(formData: FormData) {
    feedback.startTransition(async () => {
      normalizeListField(formData, "competing_alternatives");
      setOpportunityStructuredFields(formData);
      const result = resultOf(await createOpportunityAction(formData));
      if (result.ok && result.id) router.push(`/opportunities/${encodeURIComponent(result.id)}`);
      feedback.setMessage(result.ok ? "Opportunity를 생성했습니다." : result.error ?? "생성에 실패했습니다.");
    });
  }
  if (!segmentId) {
    return <div className="data-unavailable" role="status">Opportunity를 만들려면 먼저 저장된 세그먼트 snapshot을 선택하세요.</div>;
  }
  return (
    <form className="opportunity-create-form" action={submit}>
      {segmentId ? <input type="hidden" name="segment_id" value={segmentId} /> : null}
      <label><span>Opportunity 이름</span><input name="name" required placeholder="검토할 사업기회" /></label>
      <label><span>해결하려는 문제</span><textarea name="problem" required placeholder="데이터에서 확인한 문제" /></label>
      <label><span>핵심 가설</span><textarea name="hypothesis" required placeholder="검증 가능한 시장 가설" /></label>
      <label><span>상품·서비스 아이디어</span><textarea name="idea" required placeholder="가설에 대응하는 제안" /></label>
      <label><span>경쟁 대안</span><textarea name="competing_alternatives" placeholder="현재 고객이 사용하는 대안 (줄바꿈 또는 쉼표 구분)" /></label>
      <small className="wide">집계 시장 정보만 입력하세요. 이메일·전화번호 등 명백한 식별자 패턴은 자동 차단하지만 모든 개인정보를 탐지하지는 못하므로 실명·연락처·상세 주소·계정 ID·미성년자 식별정보를 입력하지 마세요.</small>
      <OpportunityScoreInputs />
      <button className="button button-primary" type="submit" disabled={feedback.pending}><Plus aria-hidden="true" /> 생성</button>
      {feedback.message ? <p className="form-message" role="status">{feedback.message}</p> : null}
    </form>
  );
}

export type OpportunityFormValue = {
  id: string;
  lockVersion: string;
  name: string;
  problem: string;
  hypothesis: string;
  idea: string;
  revenueModel: string;
  price: string;
  channels: string;
  competingAlternatives: string;
  assumptions: string;
  nextExperiment: string;
  status: string;
  notes: string;
  scores: Record<string, string>;
  weights: Record<string, string>;
};

export function OpportunityEditor({ value }: { value: OpportunityFormValue }) {
  const router = useRouter();
  const feedback = useMutationFeedback();
  function submit(formData: FormData) {
    feedback.startTransition(async () => {
      normalizeListField(formData, "channels");
      normalizeListField(formData, "competing_alternatives");
      normalizeListField(formData, "assumptions");
      setOpportunityStructuredFields(formData);
      const result = resultOf(await updateOpportunityAction(formData));
      if (result.ok) router.refresh();
      feedback.setMessage(result.ok ? "변경사항과 수정 이력을 저장했습니다." : result.error ?? "저장에 실패했습니다.");
    });
  }
  return (
    <form className="opportunity-editor" action={submit}>
      <input type="hidden" name="opportunity_id" value={value.id} />
      <input type="hidden" name="expected_lock_version" value={value.lockVersion} />
      <label className="wide"><span>이름</span><input name="name" defaultValue={value.name} required /></label>
      <label><span>해결하려는 문제</span><textarea name="problem" defaultValue={value.problem} required /></label>
      <label><span>핵심 가설</span><textarea name="hypothesis" defaultValue={value.hypothesis} required /></label>
      <label><span>상품·서비스 아이디어</span><textarea name="idea" defaultValue={value.idea} required /></label>
      <label><span>수익모델</span><textarea name="revenue_model" defaultValue={value.revenueModel} /></label>
      <label><span>가격 가설</span><input name="price" defaultValue={value.price} /></label>
      <label><span>접근 채널</span><input name="channels" defaultValue={value.channels} /></label>
      <label><span>경쟁 대안</span><textarea name="competing_alternatives" defaultValue={value.competingAlternatives} /></label>
      <label><span>검증할 가정</span><textarea name="assumptions" defaultValue={value.assumptions} /></label>
      <label><span>다음 실험</span><textarea name="next_experiment" defaultValue={value.nextExperiment} /></label>
      <label><span>상태</span><select name="status" defaultValue={value.status}>{OPPORTUNITY_STATUS_OPTIONS.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}</select></label>
      <label className="wide"><span>메모</span><textarea name="notes" defaultValue={value.notes} /></label>
      <OpportunityScoreInputs value={value} />
      <fieldset className="opportunity-experiment-inputs wide">
        <legend>새 검증 실험 추가 (선택)</legend>
        <label><span>실험 이름</span><input name="experiment_name" placeholder="예: 가격 제안 인터뷰" /></label>
        <label><span>가설</span><textarea name="experiment_hypothesis" placeholder="반증 가능한 가설" /></label>
        <label><span>방법</span><textarea name="experiment_method" placeholder="표본·처치·대조 방법" /></label>
        <label><span>주요 지표</span><input name="experiment_primary_metric" placeholder="예: 동의율" /></label>
        <label><span>성공 기준</span><input name="experiment_success_criteria" placeholder="예: 5명 중 3명 이상" /></label>
        <label><span>상태</span><select name="experiment_status" defaultValue="draft">{EXPERIMENT_STATUS_OPTIONS.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}</select></label>
      </fieldset>
      <div className="form-footer wide">
        {feedback.message ? <p className="form-message" role="status">{feedback.message}</p> : null}
        <button className="button button-primary" type="submit" disabled={feedback.pending}><Save aria-hidden="true" /> Opportunity 저장</button>
      </div>
    </form>
  );
}

export function ResearchCreateForm({
  segmentId,
  defaultQuestion = "",
  defaultTargetSegment = "",
  defaultTargetVariable = "",
  defaultBaselineJson = "",
  buttonLabel = "Research Queue 등록",
}: {
  segmentId?: string;
  defaultQuestion?: string;
  defaultTargetSegment?: string;
  defaultTargetVariable?: string;
  defaultBaselineJson?: string;
  buttonLabel?: string;
}) {
  const router = useRouter();
  const feedback = useMutationFeedback();
  function submit(formData: FormData) {
    if (!window.confirm("외부 조사 기능이 활성화되어 있으면 입력한 질문·대상 세그먼트·Baseline이 OpenAI Research provider로 전송됩니다. 등록할까요?")) return;
    feedback.startTransition(async () => {
      const result = resultOf(await createResearchJobAction(formData));
      const execution = result.ok && result.id && !result.configurationRequired
        ? await runResearchNow(result.id)
        : null;
      if (result.ok && result.id) router.push(`/research/jobs/${encodeURIComponent(result.id)}`);
      feedback.setMessage(result.configurationRequired
        ? "외부 AI Credential 설정이 필요합니다. 작업은 ‘외부 AI 설정 필요’ 상태로 기록됩니다."
        : execution && !execution.ok
          ? execution.error ?? "리서치 작업은 등록했지만 즉시 실행하지 못했습니다."
          : result.ok
            ? "리서치 작업을 실행했습니다."
            : result.error ?? "작업 등록에 실패했습니다.");
    });
  }
  return (
    <form className="research-create-form" action={submit}>
      {segmentId ? <input type="hidden" name="segment_id" value={segmentId} /> : null}
      <label><span>조사 질문</span><textarea name="research_question" required defaultValue={defaultQuestion} placeholder="기존 Baseline으로 계산할 수 없는 질문" /></label>
      <label><span>대상 세그먼트</span><input name="target_segment" required defaultValue={defaultTargetSegment} placeholder="예: 대한민국 소상공인" /></label>
      <label><span>대상 변수</span><input name="target_variable" required defaultValue={defaultTargetVariable} placeholder="검증할 단일 변수" /></label>
      <label><span>Canonical Baseline JSON (선택)</span><textarea name="baseline_json" defaultValue={defaultBaselineJson} placeholder={'예: {"description":"현재 자료로 산정 어려움","denominator":"대한민국 사업체"}'} spellCheck={false} /></label>
      <small>집계 근거만 입력하세요. 이메일·전화번호 등 명백한 식별자 패턴은 자동 차단하지만 모든 개인정보를 탐지하지는 못하므로 실명·연락처·상세 주소·계정 ID·미성년자 식별정보를 입력하지 마세요.</small>
      <button className="button button-primary" type="submit" disabled={feedback.pending}><FileSearch aria-hidden="true" /> {buttonLabel}</button>
      {feedback.message ? <p className="form-message" role="status">{feedback.message}</p> : null}
    </form>
  );
}

export function CancelResearchButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const feedback = useMutationFeedback();
  function cancel() {
    feedback.startTransition(async () => {
      const formData = new FormData();
      formData.set("job_id", jobId);
      const result = resultOf(await cancelResearchJobAction(formData));
      if (result.ok) router.refresh();
      feedback.setMessage(result.ok ? "작업을 취소했습니다." : result.error ?? "취소에 실패했습니다.");
    });
  }
  return <div className="inline-feedback"><button type="button" className="button button-danger" onClick={cancel} disabled={feedback.pending}><X aria-hidden="true" /> 작업 취소</button>{feedback.message ? <small role="status">{feedback.message}</small> : null}</div>;
}

export function RetryResearchButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const feedback = useMutationFeedback();
  function retry() {
    if (!window.confirm("이 작업의 질문·대상 세그먼트·Baseline이 외부 OpenAI Research provider로 전송됩니다. 재실행할까요?")) return;
    feedback.startTransition(async () => {
      const result = await runResearchNow(jobId);
      if (result.ok) router.refresh();
      feedback.setMessage(result.ok ? "외부 조사를 실행했습니다." : result.error ?? "재실행에 실패했습니다.");
    });
  }
  return <div className="inline-feedback"><button type="button" className="button" onClick={retry} disabled={feedback.pending}><RotateCcw aria-hidden="true" /> 외부 조사 재실행</button>{feedback.message ? <small role="status">{feedback.message}</small> : null}</div>;
}

export function ReviewActions({ reviewId, defaultModificationJson }: { reviewId: string; defaultModificationJson: string }) {
  const router = useRouter();
  const feedback = useMutationFeedback();
  const [pendingDecision, setPendingDecision] = useState<"approve" | "approve_modified" | "request_more_research" | "reject" | "keep_baseline" | null>(null);
  const decisionLabels = {
    approve: "승인",
    approve_modified: "수정 후 승인",
    request_more_research: "추가 조사",
    reject: "반려",
    keep_baseline: "기존 값 유지",
  } as const;
  function submit(formData: FormData) {
    feedback.startTransition(async () => {
      const result = resultOf(await reviewRevisionAction(formData));
      if (result.ok) {
        setPendingDecision(null);
        router.refresh();
      }
      feedback.setMessage(result.ok ? "검토 결정을 기록했습니다." : result.error ?? "검토 처리에 실패했습니다.");
    });
  }
  return (
    <form className="review-action-form" action={submit}>
      <input type="hidden" name="review_id" value={reviewId} />
      <input type="hidden" name="decision" value={pendingDecision ?? ""} />
      <label><span>검토 메모</span><textarea name="note" required placeholder="판단 근거와 후속 작업 (추가 조사 시 다음 prompt 제약으로 전달)" /></label>
      <label><span>수정안 JSON</span><textarea name="modification_json" defaultValue={defaultModificationJson} spellCheck={false} aria-describedby="modification-json-help" /></label>
      <small id="modification-json-help">“수정 후 승인”을 선택하면 이 JSON이 승인 payload가 됩니다. 다른 결정에서는 사용하지 않습니다.</small>
      <div className="review-buttons">
        <button className="button button-primary" type="button" disabled={feedback.pending} onClick={() => setPendingDecision("approve")}><Check aria-hidden="true" /> 승인</button>
        <button className="button" type="button" disabled={feedback.pending} onClick={() => setPendingDecision("approve_modified")}>수정 후 승인</button>
        <button className="button" type="button" disabled={feedback.pending} onClick={() => setPendingDecision("request_more_research")}>추가 조사</button>
        <button className="button button-danger" type="button" disabled={feedback.pending} onClick={() => setPendingDecision("reject")}><X aria-hidden="true" /> 반려</button>
        <button className="button" type="button" disabled={feedback.pending} onClick={() => setPendingDecision("keep_baseline")}>기존 값 유지</button>
      </div>
      {pendingDecision ? (
        <div className="review-decision-confirmation" role="alertdialog" aria-labelledby="review-decision-confirmation-title" aria-describedby="review-decision-confirmation-description">
          <strong id="review-decision-confirmation-title">{decisionLabels[pendingDecision]} 결정을 기록할까요?</strong>
          <p id="review-decision-confirmation-description">입력한 검토 메모와 함께 감사 이력에 남습니다. 종료 결정은 후속 버전 상태에 영향을 줍니다.</p>
          <div className="inline-actions">
            <button className={pendingDecision === "reject" ? "button button-danger" : "button button-primary"} type="submit" disabled={feedback.pending}>{decisionLabels[pendingDecision]} 확정</button>
            <button className="button" type="button" disabled={feedback.pending} onClick={() => setPendingDecision(null)}>취소</button>
          </div>
        </div>
      ) : null}
      {feedback.message ? <p className="form-message" role="status">{feedback.message}</p> : null}
    </form>
  );
}

export function ExportButtons({
  snapshotId,
  kind = "estimate",
  scenarioSelection = null,
}: {
  snapshotId: string;
  kind?: "estimate" | "segment" | "comparison" | "opportunity";
  scenarioSelection?: MarketScenarioSelection | null;
}) {
  const feedback = useMutationFeedback();
  function exportFormat(format: "csv" | "json") {
    feedback.startTransition(async () => {
      const formData = new FormData();
      formData.set("snapshot_id", snapshotId);
      formData.set("format", format);
      formData.set("snapshot_kind", kind);
      if (scenarioSelection) {
        formData.set("scenario_id", scenarioSelection.scenarioId);
        formData.set("scenario_version", scenarioSelection.scenarioVersion);
        formData.set("scenario_selection_mode", scenarioSelection.selectionMode ?? "explicit");
      }
      const result = resultOf(await exportSnapshotAction(formData));
      if (result.ok && result.id) window.location.assign(result.id);
      feedback.setMessage(result.ok ? `${format.toUpperCase()} 내보내기를 준비했습니다.` : result.error ?? "내보내기에 실패했습니다.");
    });
  }
  const printQuery = new URLSearchParams();
  if (scenarioSelection) {
    printQuery.set("scenarioId", scenarioSelection.scenarioId);
    printQuery.set("scenarioVersion", scenarioSelection.scenarioVersion);
    printQuery.set("scenarioSelectionMode", scenarioSelection.selectionMode ?? "explicit");
  }
  const printSuffix = printQuery.size ? `?${printQuery.toString()}` : "";
  return (
    <div className="export-actions">
      <button type="button" className="button" onClick={() => exportFormat("csv")}><Download aria-hidden="true" /> CSV</button>
      <button type="button" className="button" onClick={() => exportFormat("json")}><Download aria-hidden="true" /> JSON</button>
      <a className="button" href={kind === "estimate" ? `/reports/${encodeURIComponent(snapshotId)}/print${printSuffix}` : `/api/exports/${encodeURIComponent(snapshotId)}?kind=${kind}&format=print`} target="_blank" rel="noreferrer">인쇄 보고서</a>
      {feedback.message ? <small role="status">{feedback.message}</small> : null}
    </div>
  );
}
