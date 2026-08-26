import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BookOpenText,
  CircleHelp,
  Database,
  ExternalLink,
  FileSearch,
} from "lucide-react";
import type { ReactNode } from "react";

import {
  type DataRecord,
  countInterval,
  entityUnit,
  formatCompact,
  formatCount,
  label,
  number,
  recordList,
  status,
  text,
  unitLabel,
} from "@/components/record";

export function PageHeading({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description?: string | null;
  actions?: ReactNode;
}) {
  return (
    <header className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {description ? <p className="page-description">{description}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string | null;
  action?: ReactNode;
}) {
  return (
    <header className="section-heading">
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {action}
    </header>
  );
}

export function EntityUnitBadge({ unit }: { unit: string | null }) {
  return <span className={`unit-badge unit-${unit ?? "unknown"}`}>{unitLabel(unit)}</span>;
}

const STATUS_LABELS: Record<string, string> = {
    active: "활성",
    applicable: "적용 가능",
    approved: "승인됨",
    archived: "보관됨",
    blocked: "접근 제한",
    bounded_estimate: "범위 추정 완료",
    candidate: "후보",
    calibrated: "실제 분포 보정 완료",
    calibrated_baseline: "Calibration Baseline",
    calibrated_numeric: "Calibration 기반 수치",
    cancelled: "취소됨",
    changes_requested: "추가 조사 요청",
    closed: "기존 값 유지",
    complete: "구축 완료",
    completed: "완료",
    complete_with_evidence_constraints: "추정 완료 · 근거 보완 필요",
    configuration_required: "외부 AI 설정 필요",
    direct_observation: "직접 관측",
    discovered: "발견",
    downloaded: "자료 확보",
    draft: "초안",
    estimated: "추정 완료",
    estimable: "추정 가능",
    failed: "실패",
    incomplete: "보완 필요",
    input_locked: "입력 기준값 고정",
    inferred_need_not_observed: "관측되지 않은 추론 니즈",
    inferred_not_observed: "관측되지 않은 추론",
    in_progress: "진행 중",
    needs_review: "검토 필요",
    metadata_downloaded: "메타데이터 확보",
    no_release: "공개 버전 미등록",
    not_applicable: "적용 대상 아님",
    not_estimable: "현재 자료로 산출 어려움",
    not_required: "별도 승인 불필요",
    pending: "검토 대기",
    hypothesis_requires_validation: "외부 검증이 필요한 가설",
    post_hoc_interpreted: "사후 해석 라벨",
    planned: "실행 계획",
    paused: "보류",
    contextual_only: "맥락 기반 타기팅만 허용",
    external_behavior_validation_pending: "외부 행동 검증 대기",
    incremental_conversion: "증분 전환",
    inference: "모델 추론",
    proxy_based: "대체지표 기반 추정",
    proxy_calibrated: "대체지표 보정 완료",
    proxy_numeric: "대체지표 기반 수치",
    published: "게시됨",
    queued: "대기열 등록",
    rejected: "반려됨",
    researching: "조사 중",
    running: "조사 진행 중",
    retrying: "재시도 중",
    saved: "저장됨",
    selected: "선정됨",
    semantic_embedding_transport_unvalidated: "의미 임베딩 전달 검증 필요",
    skipped: "건너뜀",
    succeeded: "완료",
    synthetic_narrative_source: "합성 내러티브 근거",
    suppressed: "개인정보 보호 기준으로 비공개",
    superseded: "새 버전으로 대체됨",
    to_be_validated: "추가 검증 예정",
    unknown: "상태 확인 필요",
    validated: "검증 완료",
    verified: "검증 완료",
    validating: "검증 중",
    unverified_do_not_claim: "외부 플랫폼 주장 금지 · 검증 필요",
};

const METHOD_LABELS: Record<string, string> = {
  bounded_raking_ipf: "상·하한을 적용한 Raking/IPF 보정",
  bounded_sequential_conditionals_with_explicit_dependency_factor: "의존성 보정을 포함한 순차 조건부 추정",
  calibrated_prevalence_or_bounded_proxy: "보정 유병률 또는 범위형 대체지표",
  calibrated_synthetic_signal_with_registered_anchor: "등록 기준값에 맞춘 합성 신호 보정",
  calibrated_weighted_axis_distribution: "보정 가중치 기반 분류축 분포",
  domain_anchor_calibrated_membership: "Domain 기준값에 맞춘 멤버십 보정",
  existing_segment_then_weighted_joint_then_conditional_proxy: "기존 세그먼트·가중 교집합·조건부 대체지표 순차 적용",
  linked_feature_prevalence_with_frequency_band: "연결 Feature 보유율과 빈도 구간 결합",
  official_baseline_times_proxy_scenario: "공식 모집단 × 대체지표 시나리오",
  official_cross_tab: "공식 교차표 직접 관측",
  official_derived_difference: "공식 통계 차분 산출",
  official_direct: "공식 통계 직접 관측",
  official_rounded_thousand: "공식 통계 천 단위 반올림",
  phase1_official_baseline_times_proxy_scenario: "공식 모집단 × 대체지표 시나리오",
  query_spend_basis: "대표 질의 지출 근거",
  calibrated_market_summary: "보정된 시장 모집단 요약",
  direct_count: "직접 집계",
  weighted_intersection: "가중 교집합 추정",
  weighted_synthetic_joint: "가중 합성모집단 교집합",
  weighted_synthetic_joint_with_proxy_fields: "가중 교집합 · Proxy 차원",
  weighted_synthetic_joint_with_conditional_proxy: "가중 교집합 · 조건부 Proxy 보정",
  registered_gold_query_snapshot: "검증 질의 Snapshot 재사용",
  not_estimable: "현재 자료로 산정 방법 없음",
  region_x_stage_x_conditional_focus_context_model: "지역·단계·조건부 맥락 결합 모델",
  soft_cluster_share_reconciled_to_parent: "Parent 모집단에 정합화한 Soft Cluster 비중",
  unit_calibration_plus_conditional_region_stage_focus: "단위별 Calibration과 지역·단계 조건부 보정",
};

export function statusDisplayLabel(value: string | null): string {
  return STATUS_LABELS[value?.toLowerCase() ?? "unknown"] ?? "상태 확인 필요";
}

export function methodDisplayLabel(value: string | null): string {
  if (!value) return "방법 미등록";
  const registered = METHOD_LABELS[value.toLowerCase()];
  if (registered) return registered;
  return /^[a-z0-9_.:-]+$/u.test(value) ? "등록 산정 방법" : value;
}

export function StatusBadge({ value }: { value: string | null }) {
  const normalized = value?.toLowerCase() ?? "unknown";
  const positive = ["approved", "active", "complete", "published", "estimable", "estimated", "calibrated"].some((entry) =>
    normalized.includes(entry),
  );
  const attention = ["review", "queued", "running", "required", "gap", "constraint", "proxy"].some((entry) =>
    normalized.includes(entry),
  );
  return (
    <span className={`status-badge ${positive ? "status-positive" : attention ? "status-attention" : ""}`}>
      {statusDisplayLabel(normalized)}
    </span>
  );
}

export function ConfidenceBadge({ record }: { record: DataRecord }) {
  const grade = text(record, "confidenceGrade", "confidence_grade", "grade");
  const score = number(record, "confidenceScore", "confidence_score", "confidence", "totalScore", "total_score");
  return (
    <span className="confidence-badge" title="규칙 기반 신뢰도">
      신뢰도 {grade ?? (score !== null ? Math.round(score) : "미산정")}
    </span>
  );
}

export function Metric({
  label: metricLabel,
  value,
  note,
  state = "default",
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  state?: "default" | "selected" | "warning";
}) {
  return (
    <article className={`metric metric-${state}`}>
      <span>{metricLabel}</span>
      <strong>{value}</strong>
      {note ? <p>{note}</p> : null}
    </article>
  );
}

export function EstimateMetrics({ record }: { record: DataRecord }) {
  const interval = countInterval(record);
  const unit = entityUnit(record);
  const share = number(record, "shareBase", "share_base", "domainShareBase", "domain_share_base", "weightedPrevalenceBase", "weighted_prevalence_base");
  const year = text(
    record,
    "referencePeriod",
    "reference_period",
    "referenceYear",
    "reference_year",
    "period",
    "dataAsOf",
    "data_as_of",
    "asOf",
    "as_of",
  );
  const version = text(record, "modelVersion", "model_version", "version");
  return (
    <div className="metric-strip">
      <Metric
        label="BASE"
        value={formatCount(interval.base, unit)}
        note={interval.base === null ? "근거가 확보되면 산출할 수 있습니다." : `Low ${formatCompact(interval.low)} · High ${formatCompact(interval.high)}`}
      />
      <Metric label="전체 대비 비중" value={share === null ? "데이터 없음" : `${(Math.abs(share) <= 1 ? share * 100 : share).toFixed(1)}%`} />
      <Metric label="기준시점" value={year ?? "미확인"} />
      <Metric label="모델 버전" value={version ?? "미확인"} />
    </div>
  );
}

export function NotEstimable({
  title = "현재 근거로는 추정할 수 없습니다",
  description = "누락 변수를 0으로 처리하지 않았습니다. 필요한 근거를 확인하거나 리서치 작업으로 연결하세요.",
  researchHref = "/research",
  compact = false,
}: {
  title?: string;
  description?: string;
  researchHref?: string;
  compact?: boolean;
}) {
  return (
    <div className={`not-estimable ${compact ? "not-estimable-compact" : ""}`}>
      <FileSearch aria-hidden="true" />
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      <Link href={researchHref} className="text-link">
        추가 조사 <ArrowRight aria-hidden="true" />
      </Link>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <CircleHelp aria-hidden="true" />
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </div>
  );
}

export function DataUnavailable({ message }: { message: string }) {
  return (
    <div className="data-unavailable" role="status">
      <AlertTriangle aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}

export function RecordCard({
  record,
  href,
  kicker,
  footer,
}: {
  record: DataRecord;
  href: string;
  kicker?: string;
  footer?: ReactNode;
}) {
  const interval = countInterval(record);
  const unit = entityUnit(record);
  const summary = text(record, "description", "definition", "summary", "evidenceBoundary", "evidence_boundary");
  return (
    <Link href={href} className="record-card">
      <header>
        <span>{kicker ?? text(record, "code", "domainCode", "domain_code", "subtypeCode", "subtype_code") ?? "RECORD"}</span>
        <ArrowRight aria-hidden="true" />
      </header>
      <div className="record-card-title">
        <h3>{label(record)}</h3>
        <EntityUnitBadge unit={unit} />
      </div>
      {summary ? <p>{summary}</p> : <p className="muted">정의가 등록되지 않았습니다.</p>}
      <div className="record-card-metrics">
        <span>BASE</span>
        <strong>{formatCount(interval.base, unit)}</strong>
        {interval.base === null ? <small>추가 조사 필요</small> : <small>Low {formatCompact(interval.low)} · High {formatCompact(interval.high)}</small>}
      </div>
      <footer>
        <StatusBadge value={status(record)} />
        {footer ?? <ConfidenceBadge record={record} />}
      </footer>
    </Link>
  );
}

export function KeyValueList({
  rows,
}: {
  rows: Array<{ label: string; value: ReactNode }>;
}) {
  return (
    <dl className="key-value-list">
      {rows.map((row) => (
        <div key={row.label}>
          <dt>{row.label}</dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function EvidencePanel({ record }: { record: DataRecord }) {
  const source = text(record, "sourceTitle", "source_title", "source", "institution");
  const sources = recordList(record, "sources", "sourcesJson", "sources_json", "sourceReleases", "source_releases");
  const formula = text(record, "formula", "allocationFormula", "allocation_formula");
  const denominator = text(record, "denominator", "denominatorDefinition", "denominator_definition");
  const method = text(record, "method", "methodCode", "method_code", "inferenceMethod", "inference_method");
  const referencePeriod = text(record, "referencePeriod", "reference_period", "referenceYear", "reference_year", "period");
  const version = text(record, "calibrationVersion", "calibration_version", "modelVersion", "model_version", "dataVersion", "data_version", "version");
  const url = text(record, "url", "sourceUrl", "source_url");
  const validationGaps = recordList(record, "validationGaps", "validation_gaps", "validationGapsJson", "validation_gaps_json");
  return (
    <article className="panel evidence-panel">
      <SectionHeading eyebrow="EVIDENCE & LINEAGE" title="근거와 산출 경로" />
      {source || sources.length || formula || denominator || method || referencePeriod || version ? (
        <KeyValueList
          rows={[
            { label: "출처", value: source ?? "연결된 출처 목록 참조" },
            { label: "기준기간", value: referencePeriod ?? "기준기간 미확인" },
            { label: "분모", value: denominator ?? "분모 미확인" },
            { label: "산식", value: formula ? <code>{formula}</code> : "산식 미등록" },
            { label: "방법", value: methodDisplayLabel(method) },
            { label: "버전", value: version ?? "버전 미확인" },
          ]}
        />
      ) : (
        <NotEstimable compact title="연결된 근거가 없습니다" description="이 레코드의 source, denominator, formula 및 method 연결을 확인해야 합니다." />
      )}
      {url ? (
        <a href={url} target="_blank" rel="noreferrer" className="text-link">
          원문 열기 <ExternalLink aria-hidden="true" />
        </a>
      ) : null}
      {sources.length ? (
        <div className="evidence-source-list">
          {sources.map((item, index) => {
            const itemUrl = text(item, "url", "officialUrl", "official_url", "sourceUrl", "source_url");
            const title = label(item);
            const release = text(item, "releaseId", "release_id", "releaseName", "release_name", "version") ?? "release 미확인";
            const period = text(item, "referencePeriod", "reference_period", "referenceYear", "reference_year") ?? "기준기간 미확인";
            return (
              <div key={text(item, "sourceId", "source_id", "releaseId", "release_id", "id") ?? `${title}-${index}`}>
                <span><strong>{title}</strong><small>{release} · {period}</small></span>
                {itemUrl ? <a href={itemUrl} target="_blank" rel="noreferrer" aria-label={`${title} 원문 열기`}><ExternalLink aria-hidden="true" /></a> : <small>URL 미등록</small>}
              </div>
            );
          })}
        </div>
      ) : null}
      <div className="gap-review">
        <strong>Validation gap review</strong>
        {validationGaps.length ? (
          <ul>{validationGaps.map((gap, index) => <li key={text(gap, "validationGapId", "validation_gap_id", "gapId", "gap_id", "id") ?? index}><span>{text(gap, "description", "verificationQuestion", "verification_question") ?? label(gap)}</span><StatusBadge value={status(gap)} /></li>)}</ul>
        ) : <p>등록된 validation gap이 없거나 검토 정보가 연결되지 않았습니다.</p>}
      </div>
    </article>
  );
}

export function SourceCount({ count }: { count: number | null }) {
  return (
    <span className="source-count">
      <BookOpenText aria-hidden="true" /> {count === null ? "출처 미확인" : `출처 ${count.toLocaleString("ko-KR")}건`}
    </span>
  );
}

export function DatabaseState({ children }: { children: ReactNode }) {
  return (
    <span className="database-state">
      <Database aria-hidden="true" /> {children}
    </span>
  );
}
