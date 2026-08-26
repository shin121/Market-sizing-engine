import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  BookOpenText,
  CheckCircle2,
  FileClock,
  History,
  Scale,
  TriangleAlert,
} from "lucide-react";

import {
  asRecord,
  boolean,
  type DataRecord,
  countInterval,
  description,
  entityUnit,
  formatCompact,
  formatCount,
  formatPercent,
  hrefId,
  identifier,
  label,
  nested,
  number,
  recordList,
  records,
  status,
  stringList,
  text,
  unitLabel,
} from "@/components/record";
import {
  ConfidenceBadge,
  DataUnavailable,
  EmptyState,
  EntityUnitBadge,
  EstimateMetrics,
  EvidencePanel,
  KeyValueList,
  methodDisplayLabel,
  Metric,
  NotEstimable,
  PageHeading,
  RecordCard,
  SectionHeading,
  statusDisplayLabel,
  StatusBadge,
} from "@/components/ui";
import {
  CancelResearchButton,
  ExportButtons,
  OpportunityCreateForm,
  OpportunityEditor,
  type OpportunityFormValue,
  ResearchCreateForm,
  RetryResearchButton,
  ReviewActions,
  SaveComparisonForm,
  ScenarioForm,
} from "@/components/workbench-controls";
import { ComparisonSelection } from "@/components/comparison-selection";
import { ResearchJobEventStream } from "@/components/research-job-poller";

function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "{}";
  }
}

export function EstimateDirectory({ value }: { value: unknown }) {
  const estimates = records(value, ["estimates"]);
  return (
    <div className="page-stack">
      <PageHeading eyebrow="MARKET SIZING" title="시장규모 분석" description="Baseline, Derived Estimate, User Scenario를 분리해 추적합니다." actions={<Link href="/builder" className="button button-primary">새 세그먼트 계산</Link>} />
      {estimates.length ? (
        <div className="record-grid">
          {estimates.map((estimate) => {
            const id = hrefId(estimate, ["estimateId", "estimate_id"]);
            return id ? <RecordCard key={id} record={estimate} href={`/sizing/${encodeURIComponent(id)}`} kicker={text(estimate, "estimateType", "estimate_type") ?? "ESTIMATE"} /> : null;
          })}
        </div>
      ) : <EmptyState title="저장된 estimate가 없습니다" description="세그먼트 빌더에서 실제 조건을 구성하고 계산 snapshot을 생성하세요." action={<Link href="/builder" className="button button-primary">빌더 열기</Link>} />}
    </div>
  );
}

function factorRows(estimate: DataRecord) {
  return recordList(estimate, "factors", "estimateFactors", "estimate_factors");
}

const COUNT_UNITS = new Set(["person", "child_person", "household", "establishment", "enterprise"]);

function factorValue(factor: DataRecord, ...keys: string[]): string {
  const componentType = text(factor, "componentType", "component_type");
  const operation = text(factor, "operation");
  if (componentType === "source_evidence" || operation === "evidence") return "해당 없음";
  const value = number(factor, ...keys);
  const unit = text(factor, "unit");
  if (componentType === "conditional_probability" || unit === "ratio" || unit === "share" || unit === "probability") return formatPercent(value);
  if (componentType === "parent_population" || (unit && COUNT_UNITS.has(unit))) return formatCount(value, unit);
  if (value === null) return "데이터 없음";
  return unit ? `${formatCompact(value)} ${unitLabel(unit)}` : formatCompact(value);
}

function factorReferencePeriod(factor: DataRecord): string {
  return text(
    factor,
    "referencePeriod",
    "reference_period",
    "referenceYear",
    "reference_year",
    "period",
  ) ?? "미확인";
}

const FACTOR_DISPLAY_LABELS: Record<string, string> = {
  parent_population: "기준 모집단",
  calibrated_membership_share: "보정 멤버십 비중",
};

const FACTOR_OPERATION_LABELS: Record<string, string> = {
  input: "입력",
  multiply: "곱셈",
  evidence: "근거",
};

function factorDisplayLabel(factor: DataRecord): string {
  const code = label(factor);
  return FACTOR_DISPLAY_LABELS[code] ?? code;
}

function factorOperationLabel(factor: DataRecord): string {
  const operation = text(factor, "operation") ?? "";
  return FACTOR_OPERATION_LABELS[operation] ?? (operation || "연산 미확인");
}

function factorAdjustmentReason(factor: DataRecord): string {
  const reason = text(factor, "adjustmentReason", "adjustment_reason");
  if (reason === "Official parent Universe used by the calibrated Archetype context.") {
    return "공식 기준 모집단과 보정된 Archetype 컨텍스트를 사용했습니다.";
  }
  if (reason === "unit_calibration_plus_conditional_region_stage_focus") {
    return "단위별 Calibration과 조건부 지역·단계 분포를 반영했습니다.";
  }
  return reason ?? "미등록";
}

function scenarioSelectionLabel(value: string | null): string {
  if (value === "explicit") return "명시 선택";
  if (value === "unique_active") return "유일한 활성 시나리오 자동 선택";
  return "미선택";
}

function intervalDeviationPercent(base: number | null, low: number | null, high: number | null): number | null {
  if (base === null || low === null || high === null || base === 0) return null;
  return Math.max(Math.abs((low - base) / base), Math.abs((high - base) / base)) * 100;
}

const OPPORTUNITY_SCORE_LABELS: Record<string, string> = {
  market_size: "시장규모",
  growth: "성장성",
  willingness_to_pay: "지불의사",
  problem_intensity: "문제 강도",
  target_accessibility: "타깃 접근성",
  competition_intensity: "경쟁 강도",
  data_confidence: "데이터 신뢰도",
  implementation_difficulty: "구현 난이도",
  capability_fit: "역량 적합도",
};

const OPPORTUNITY_SCORE_SOURCE_LABELS: Record<string, string> = {
  data: "데이터 원자료",
  user_input: "사용자 입력",
  ai_hypothesis: "AI 가설",
  derived: "계산값",
};

const OPPORTUNITY_INTERVAL_PARTS = [
  { key: "low", label: "Low" },
  { key: "base", label: "Base" },
  { key: "high", label: "High" },
] as const;

const RESEARCH_STEP_LABELS: Record<string, string> = {
  provider_research: "외부 근거 조사",
  validate_output: "구조화 결과 검증",
  create_revision: "제안 버전 생성",
  queue_review: "사람 검토 Queue 등록",
};

function researchErrorLabel(code: string | null): string {
  if (code === "configuration_required") return "외부 AI 연결 설정 필요";
  return code ? "리서치 작업 오류" : "오류 상세";
}

function researchErrorMessage(message: string | null): string {
  if (!message) return "오류 상세가 없습니다.";
  if (message.includes("OPENAI_RESEARCH_ENABLED") || message.includes("OPENAI_API_KEY")) {
    return "Research Worker의 외부 AI 사용 설정과 API Credential을 확인하세요.";
  }
  return message;
}

function opportunitySegmentName(opportunity: DataRecord): string | null {
  const snapshots = recordList(opportunity, "segmentSnapshots", "segment_snapshots");
  const primary = snapshots.find((snapshot) => text(snapshot, "linkRole", "link_role") === "primary_target")
    ?? snapshots[0]
    ?? {};
  return text(primary, "segmentName", "segment_name", "title", "name")
    ?? text(opportunity, "segmentName", "segment_name")
    ?? text(primary, "savedSegmentId", "saved_segment_id");
}

function signedCountDelta(current: number | null, snapshot: number | null, unit: string | null): string {
  if (current === null || snapshot === null) return "비교 불가";
  const delta = current - snapshot;
  if (delta === 0) return "변화 없음";
  return `저장 시점 대비 ${delta > 0 ? "+" : "−"}${formatCount(Math.abs(delta), unit)}`;
}

function OpportunitySnapshotCard({
  heading,
  record,
  comparedWith,
  footer,
}: {
  heading: string;
  record: DataRecord;
  comparedWith?: DataRecord;
  footer: string;
}) {
  const interval = countInterval(record);
  const comparedInterval = comparedWith ? countInterval(comparedWith) : null;
  const unit = entityUnit(record);
  return (
    <article>
      <span>{heading}</span>
      <strong className="snapshot-interval-heading">Low / Base / High</strong>
      <dl className="snapshot-interval-list">
        {OPPORTUNITY_INTERVAL_PARTS.map(({ key, label: partLabel }) => (
          <div key={key}>
            <dt>{partLabel}</dt>
            <dd>
              <b>{formatCount(interval[key], unit)}</b>
              {comparedInterval ? <small>{signedCountDelta(interval[key], comparedInterval[key], unit)}</small> : null}
            </dd>
          </div>
        ))}
      </dl>
      <small>{footer}</small>
    </article>
  );
}

function OpportunityIdeaExperiment({ value }: { value: DataRecord }) {
  if (!Object.keys(value).length) return <>근거 부족 · null</>;
  return (
    <span className="ai-experiment-plan">
      <strong>{text(value, "hypothesis") ?? "가설 미확인"}</strong>
      <span>{text(value, "method") ?? "방법 미확인"}</span>
      <small>{text(value, "primaryMetric", "primary_metric") ?? "지표 미확인"} · {text(value, "successCriteria", "success_criteria") ?? "성공 기준 미확인"}</small>
    </span>
  );
}

function verifiedSourceIds(content: DataRecord, provenance: DataRecord, kind: "subtype" | "archetype"): string[] {
  const direct = stringList(content, `source_${kind}_ids`, `source${kind === "subtype" ? "Subtype" : "Archetype"}Ids`);
  if (direct.length) return direct;
  const verification = nested(nested(provenance, "sourceIdVerification", "source_id_verification"), kind);
  return stringList(verification, "verified");
}

function verifiedConditionReferences(
  provenance: DataRecord,
  kind: "feature" | "behavior",
): DataRecord[] {
  const verification = nested(
    nested(provenance, "sourceConditionVerification", "source_condition_verification"),
    kind,
  );
  return recordList(verification, "verified");
}

function conditionReferenceValue(condition: DataRecord): string {
  const value = condition.value ?? condition.value_json;
  if (value === undefined) return "미확인";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return "직렬화 불가";
  }
}

function OpportunityIdeaProvenance({
  content,
  brief,
  provenance,
  snapshot,
  segmentName,
}: {
  content: DataRecord;
  brief: DataRecord;
  provenance: DataRecord;
  snapshot: DataRecord;
  segmentName: string | null;
}) {
  const researchJobId = text(provenance, "researchJobId", "research_job_id");
  const queryResultId = text(provenance, "queryResultId", "query_result_id")
    ?? text(content, "sourceQueryResultId", "source_query_result_id");
  const marketEstimateId = text(provenance, "marketEstimateId", "market_estimate_id")
    ?? text(content, "sourceMarketEstimateId", "source_market_estimate_id");
  const savedSegmentId = text(snapshot, "savedSegmentId", "saved_segment_id");
  const estimateId = text(snapshot, "estimateId", "estimate_id");
  const subtypeIds = verifiedSourceIds(content, provenance, "subtype");
  const archetypeIds = verifiedSourceIds(content, provenance, "archetype");
  const conditionReferences = [
    ...verifiedConditionReferences(provenance, "feature").map((condition) => ({ kind: "Feature", condition })),
    ...verifiedConditionReferences(provenance, "behavior").map((condition) => ({ kind: "Behavior", condition })),
  ];
  const sources = recordList(provenance, "sources");
  const evidenceSourceIndexes = Array.isArray(brief.evidenceSourceIndexes)
    ? brief.evidenceSourceIndexes.filter((value): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0)
    : [];
  const evidenceSources = evidenceSourceIndexes.length
    ? evidenceSourceIndexes.flatMap((sourceIndex) => sources[sourceIndex] ? [{ sourceIndex, source: sources[sourceIndex] }] : [])
    : sources.map((source, sourceIndex) => ({ sourceIndex, source }));
  const citations = recordList(provenance, "citations");

  return (
    <div className="ai-provenance">
      <SectionHeading eyebrow="PINNED PROVENANCE" title="연결된 근거" description="승인된 가설이 사용한 고정 snapshot과 원문입니다." />
      <div className="ai-provenance-links">
        {savedSegmentId ? <Link href={`/builder/${encodeURIComponent(savedSegmentId)}`}>세그먼트 · {segmentName ?? savedSegmentId}</Link> : <span>세그먼트 미연결</span>}
        {estimateId ? <Link href={`/sizing/${encodeURIComponent(estimateId)}`}>Estimate snapshot · {estimateId}</Link> : <span>Estimate snapshot 미연결</span>}
        {researchJobId ? <Link href={`/research/jobs/${encodeURIComponent(researchJobId)}`}>Research Job · {researchJobId}</Link> : <span>Research Job 미연결</span>}
        {queryResultId ? <code>Query result · {queryResultId}</code> : null}
        {marketEstimateId ? <code>Market scenario snapshot · {marketEstimateId}</code> : null}
      </div>
      {subtypeIds.length || archetypeIds.length ? (
        <div className="ai-provenance-links">
          {subtypeIds.map((subtypeId) => <Link href={`/segments/subtypes/${encodeURIComponent(subtypeId)}`} key={subtypeId}>Subtype · {subtypeId}</Link>)}
          {archetypeIds.map((archetypeId) => <Link href={`/archetypes/${encodeURIComponent(archetypeId)}`} key={archetypeId}>Archetype · {archetypeId}</Link>)}
        </div>
      ) : <DataUnavailable message="승인된 아이디어에 subtype 또는 archetype 근거가 연결되지 않았습니다." />}
      {conditionReferences.length ? (
        <ol className="ai-source-list" aria-label="검증된 feature 및 behavior 조건 근거">
          {conditionReferences.map(({ kind, condition }, index) => {
            const sourceCode = text(condition, "sourceCode", "source_code") ?? "source code 미확인";
            const conditionId = text(condition, "conditionId", "condition_id") ?? `${kind}-${sourceCode}-${index}`;
            const namespace = text(condition, "conditionNamespace", "condition_namespace") ?? "namespace 미확인";
            const operator = text(condition, "operator") ?? "operator 미확인";
            const entity = text(condition, "entityUnit", "entity_unit") ?? "unit 미확인";
            const referenceYear = text(condition, "referenceYear", "reference_year") ?? "미확인";
            const evidenceId = text(condition, "evidenceId", "evidence_id") ?? "미연결";
            const dependencyGroup = text(condition, "dependencyGroup", "dependency_group") ?? "미연결";
            const referenceLabel = text(condition, "catalogLabel", "catalog_label", "sourceText", "source_text")
              ?? "registry 설명 미확인";
            return (
              <li key={conditionId}>
                <span>
                  <strong>{kind} · {sourceCode}</strong>
                  <small>{namespace} · {operator} {conditionReferenceValue(condition)}</small>
                  <small>{referenceLabel} · 단위 {entity} · 기준연도 {referenceYear} · evidence {evidenceId} · dependency {dependencyGroup}</small>
                </span>
                <Link
                  href={`/search?q=${encodeURIComponent(sourceCode)}`}
                  aria-label={`${kind} 조건 검색 · ${sourceCode}`}
                >검색</Link>
              </li>
            );
          })}
        </ol>
      ) : <DataUnavailable message="승인 시 검증된 feature 또는 behavior 조건 근거가 없습니다." />}
      {evidenceSources.length ? (
        <ol className="ai-source-list">
          {evidenceSources.map(({ sourceIndex, source }) => {
            const sourceUrl = text(source, "url");
            const citation = citations.find((candidate) => number(candidate, "sourceIndex", "source_index") === sourceIndex);
            return (
              <li key={`${sourceIndex}-${sourceUrl ?? label(source)}`}>
                <span>
                  <strong>[{sourceIndex}] {label(source)}</strong>
                  <small>{text(source, "institution") ?? "기관 미확인"} · 기준연도 {text(source, "referenceYear", "reference_year") ?? "미확인"} · {text(source, "locator") ?? "locator 미확인"}</small>
                  {citation ? <small>{text(citation, "claim") ?? "인용 주장 미확인"}</small> : null}
                </span>
                {sourceUrl ? <a href={sourceUrl} target="_blank" rel="noreferrer">원문</a> : <small>URL 미등록</small>}
              </li>
            );
          })}
        </ol>
      ) : <DataUnavailable message="승인된 아이디어의 evidence source가 없습니다." />}
    </div>
  );
}

function OpportunityEditHistory({ entries }: { entries: DataRecord[] }) {
  if (!entries.length) return <DataUnavailable message="생성·수정 이력이 없습니다." />;
  return (
    <div className="status-history-list">
      {entries.map((entry, index) => {
        const before = nested(entry, "before");
        const after = nested(entry, "after");
        const occurredAt = text(entry, "occurredAt", "occurred_at");
        return (
          <div key={`${occurredAt ?? "unknown"}-${text(entry, "action") ?? "edit"}-${index}`}>
            <time>{occurredAt ?? "시각 미확인"}</time>
            <strong>{{ create: "생성", update: "수정", status_change: "상태 변경" }[text(entry, "action") ?? ""] ?? "Opportunity 변경"}</strong>
            <span>{text(entry, "previousStatus", "previous_status") ? statusDisplayLabel(text(entry, "previousStatus", "previous_status")) : "생성"} → {text(entry, "newStatus", "new_status") ? statusDisplayLabel(text(entry, "newStatus", "new_status")) : "상태 유지"}</span>
            {Object.keys(before).length || Object.keys(after).length ? (
              <details>
                <summary>전체 before / after 보기</summary>
                <div className="audit-payload-grid">
                  <section><b>Before</b><pre>{prettyJson(before)}</pre></section>
                  <section><b>After</b><pre>{prettyJson(after)}</pre></section>
                </div>
              </details>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function EstimateDetail({ value }: { value: unknown }) {
  const estimate = asRecord(value);
  const id = text(estimate, "estimateId", "estimate_id", "id") ?? "";
  const factors = factorRows(estimate);
  const sensitivity = recordList(estimate, "sensitivity", "sensitivityResults", "sensitivity_results");
  const marketScenarios = recordList(estimate, "marketScenarios", "market_scenarios");
  const tam = number(estimate, "tam", "tamBase", "tam_base");
  const sam = number(estimate, "sam", "samBase", "sam_base");
  const som = number(estimate, "som", "somBase", "som_base");
  const tamRevenue = number(estimate, "tamRevenue", "tam_revenue");
  const samRevenue = number(estimate, "samRevenue", "sam_revenue");
  const somRevenue = number(estimate, "somRevenue", "som_revenue");
  const countUnit = entityUnit(estimate);
  const currency = text(estimate, "marketCurrency", "market_currency", "currency");
  const activeScenarioCount = number(estimate, "activeMarketScenarioCount", "active_market_scenario_count") ?? 0;
  const activeScenarioName = text(estimate, "activeMarketScenarioName", "active_market_scenario_name");
  const activeScenarioVersion = text(estimate, "activeMarketScenarioVersion", "active_market_scenario_version");
  const selectedScenarioId = text(estimate, "selectedMarketScenarioId", "selected_market_scenario_id");
  const scenarioSelectionMode = text(estimate, "marketScenarioSelectionMode", "market_scenario_selection_mode") ?? "none";
  const marketUnavailableReason = text(estimate, "marketMetricUnavailableReason", "market_metric_unavailable_reason");
  const exportScenarioSelection = ["explicit", "unique_active"].includes(scenarioSelectionMode) && selectedScenarioId && activeScenarioVersion
    ? {
      scenarioId: selectedScenarioId,
      scenarioVersion: activeScenarioVersion,
      selectionMode: scenarioSelectionMode as "explicit" | "unique_active",
    }
    : null;
  const scenarioSelectionDescription = activeScenarioName
    ? scenarioSelectionMode === "explicit"
      ? `명시 선택 · ${activeScenarioName}${activeScenarioVersion ? ` (${activeScenarioVersion})` : ""}`
      : `유일한 활성 시나리오 자동 선택 · ${activeScenarioName}${activeScenarioVersion ? ` (${activeScenarioVersion})` : ""}`
    : "각 단계의 조건과 가정은 별도로 저장됩니다.";
  const ambiguousScenario = scenarioSelectionMode === "none" && activeScenarioCount > 1;
  const ordered = tam === null || sam === null || som === null ? null : som <= sam && sam <= tam;
  const eligibleEntities = {
    low: text(estimate, "countLow", "count_low", "low", "weightedCountLow"),
    base: text(estimate, "countBase", "count_base", "base", "weightedCountBase"),
    high: text(estimate, "countHigh", "count_high", "high", "weightedCountHigh"),
  };
  const canCreateScenario = eligibleEntities.low !== null && eligibleEntities.base !== null && eligibleEntities.high !== null;
  const intervalSensitivity = [
    { name: "TAM Low/High 구간", impact: intervalDeviationPercent(tam, number(estimate, "tamLow", "tam_low"), number(estimate, "tamHigh", "tam_high")) },
    { name: "SAM Low/High 구간", impact: intervalDeviationPercent(sam, number(estimate, "samLow", "sam_low"), number(estimate, "samHigh", "sam_high")) },
    { name: "SOM Low/High 구간", impact: intervalDeviationPercent(som, number(estimate, "somLow", "som_low"), number(estimate, "somHigh", "som_high")) },
  ].filter((item): item is { name: string; impact: number } => item.impact !== null);
  const displayedSensitivity: DataRecord[] = sensitivity.length ? sensitivity : intervalSensitivity;
  const relatedSpend = nested(estimate, "relatedSpend", "related_spend", "relatedSpendJson", "related_spend_json");
  const relatedSpendBase = number(relatedSpend, "valueBase", "value_base", "base");
  const relatedSpendUnit = text(relatedSpend, "unit", "metricUnit", "metric_unit") ?? "KRW";
  const relatedSpendMetric = text(relatedSpend, "metricCode", "metric_code");
  const relatedSpendPeriod = relatedSpendMetric?.startsWith("monthly_")
    ? "월간"
    : relatedSpendMetric?.startsWith("annual_")
      ? "연간"
      : "등록 주기";
  const relatedSpendSourceIds = stringList(relatedSpend, "sourceReleaseIds", "source_release_ids");

  return (
    <div className="page-stack">
      <PageHeading eyebrow="ESTIMATE SNAPSHOT" title={label(estimate)} description={description(estimate)} actions={<ExportButtons snapshotId={id} scenarioSelection={exportScenarioSelection} />} />
      <div className="inline-badges"><EntityUnitBadge unit={entityUnit(estimate)} /><StatusBadge value={status(estimate)} /><ConfidenceBadge record={estimate} /></div>
      <EstimateMetrics record={estimate} />
      {relatedSpendBase !== null ? (
        <section className="panel related-spend-panel">
          <SectionHeading
            eyebrow="RELATED SPEND"
            title={text(relatedSpend, "displayName", "display_name") ?? "관련 지출 범위"}
            description="시장규모와 같은 Gold Query 분모에 등록된 1개 entity 기준 지출·가격수용도 범위이며 전체 시장 매출로 합산한 값이 아닙니다."
          />
          <div className="metric-strip">
            <Metric label={`${relatedSpendPeriod} Low`} value={formatCount(number(relatedSpend, "valueLow", "value_low", "low"), relatedSpendUnit)} />
            <Metric label={`${relatedSpendPeriod} Base`} value={formatCount(relatedSpendBase, relatedSpendUnit)} />
            <Metric label={`${relatedSpendPeriod} High`} value={formatCount(number(relatedSpend, "valueHigh", "value_high", "high"), relatedSpendUnit)} />
          </div>
          <KeyValueList rows={[
            { label: "기준연도", value: text(relatedSpend, "referenceYear", "reference_year") ?? "미확인" },
            { label: "산정 방법", value: methodDisplayLabel(text(relatedSpend, "methodCode", "method_code")) },
            { label: "Confidence", value: <ConfidenceBadge record={relatedSpend} /> },
            { label: "연결 출처", value: relatedSpendSourceIds.length ? `${relatedSpendSourceIds.length.toLocaleString("ko-KR")}건` : "미연결" },
          ]} />
        </section>
      ) : null}
      <section>
        <SectionHeading eyebrow="TAM / SAM / SOM" title="시장 범위와 획득 가정" description={scenarioSelectionDescription} />
        {tam !== null || sam !== null || som !== null ? (
          <div className="market-funnel">
            <Metric label="TAM · entity" value={formatCount(tam, countUnit)} note={`Low ${formatCount(number(estimate, "tamLow", "tam_low"), countUnit)} · High ${formatCount(number(estimate, "tamHigh", "tam_high"), countUnit)}`} />
            <Metric label="SAM · entity" value={formatCount(sam, countUnit)} note={`Low ${formatCount(number(estimate, "samLow", "sam_low"), countUnit)} · High ${formatCount(number(estimate, "samHigh", "sam_high"), countUnit)}`} />
            <Metric label="SOM · entity" value={formatCount(som, countUnit)} note={`Low ${formatCount(number(estimate, "somLow", "som_low"), countUnit)} · High ${formatCount(number(estimate, "somHigh", "som_high"), countUnit)}`} />
            <div className={`funnel-validation ${ordered === false ? "invalid" : ""}`}>{ordered === false ? <TriangleAlert aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}<span>{ordered === null ? "검증할 TAM/SAM/SOM 값이 부족합니다." : ordered ? "SOM ≤ SAM ≤ TAM" : "시장 범위 순서 오류"}</span></div>
          </div>
        ) : <NotEstimable title={ambiguousScenario ? "활성 시나리오가 여러 개라 값을 선택하지 않았습니다" : "TAM / SAM / SOM이 산출되지 않았습니다"} description={marketUnavailableReason === "multiple_active_market_scenarios_require_explicit_selection" ? "상단 수치는 임의의 최신값을 사용하지 않습니다. 아래 활성 시나리오 중 하나를 명시적으로 선택하세요." : activeScenarioCount === 0 ? "활성 시장규모 시나리오를 먼저 저장하세요." : "가격, 제공범위, 도달률 또는 전환율 근거가 필요합니다."} />}
        {tamRevenue !== null || samRevenue !== null || somRevenue !== null ? (
          <div className="metric-strip">
            <Metric label="TAM · revenue" value={formatCount(tamRevenue, currency)} />
            <Metric label="SAM · revenue" value={formatCount(samRevenue, currency)} />
            <Metric label="SOM · revenue" value={formatCount(somRevenue, currency)} />
          </div>
        ) : tam !== null ? <DataUnavailable message="지출 근거가 없어 매출 TAM/SAM/SOM은 산정하지 않았습니다. Entity 시나리오는 유효합니다." /> : null}
        {marketScenarios.length ? <div className="data-table-wrap"><table className="data-table"><caption className="sr-only">사용자 시나리오 Low Base High 비교</caption><thead><tr><th>시나리오</th><th>상태</th><th>TAM Low / Base / High</th><th>SAM Low / Base / High</th><th>SOM Low / Base / High</th><th>매출 근거</th></tr></thead><tbody>{marketScenarios.map((scenario, index) => {
          const scenarioUnit = text(scenario, "market_unit") ?? countUnit;
          const scenarioCurrency = text(scenario, "scenario_currency", "currency");
          const revenueBase = number(scenario, "tam_revenue_base");
          const scenarioId = text(scenario, "scenario_id");
          const scenarioVersion = text(scenario, "scenario_version", "version");
          const scenarioStatus = text(scenario, "scenario_status", "status");
          const isSelected = scenarioId === selectedScenarioId && scenarioVersion === activeScenarioVersion;
          const selectionLabel = isSelected
            ? scenarioSelectionMode === "explicit" ? "현재 · 명시 선택" : "현재 · 유일 활성 자동 선택"
            : "이 시나리오 선택";
          return <tr key={scenarioId ?? index}><td><strong>{text(scenario, "scenario_name", "name") ?? `시나리오 ${index + 1}`}</strong><small>{scenarioVersion ?? "버전 미확인"}</small>{scenarioStatus === "active" && scenarioId && scenarioVersion ? <Link className="text-link" href={{ pathname: `/sizing/${encodeURIComponent(id)}`, query: { scenarioId, scenarioVersion } }} aria-current={isSelected ? "page" : undefined}>{selectionLabel}</Link> : null}</td><td><StatusBadge value={scenarioStatus} /></td><td>{["low", "base", "high"].map((part) => formatCount(number(scenario, `tam_entities_${part}`), scenarioUnit)).join(" / ")}</td><td>{["low", "base", "high"].map((part) => formatCount(number(scenario, `sam_entities_${part}`), scenarioUnit)).join(" / ")}</td><td>{["low", "base", "high"].map((part) => formatCount(number(scenario, `som_entities_${part}`), scenarioUnit)).join(" / ")}</td><td>{revenueBase === null ? "미산정" : formatCount(revenueBase, scenarioCurrency)}</td></tr>;
        })}</tbody></table></div> : null}
      </section>
      <section>
        <SectionHeading eyebrow="FACTOR TRACE" title="적용 Factor와 산식" description="직접 관측, proxy 및 추론 여부를 함께 표시합니다." />
        {factors.length ? (
          <div className="data-table-wrap"><table className="data-table"><caption className="sr-only">Estimate 적용 Factor와 산출 근거</caption><thead><tr><th>Factor</th><th>Low</th><th>Base</th><th>High</th><th>Evidence ID</th><th>직접성</th><th>기준기간</th><th>조정 사유</th><th>신뢰도</th></tr></thead><tbody>{factors.map((factor, index) => <tr key={text(factor, "factorId", "factor_id", "id") ?? index}><td><strong>{factorDisplayLabel(factor)}</strong><small>{label(factor)} · {factorOperationLabel(factor)}</small></td><td className="numeric">{factorValue(factor, "low", "valueLow", "value_low")}</td><td className="numeric">{factorValue(factor, "base", "valueBase", "value_base")}</td><td className="numeric">{factorValue(factor, "high", "valueHigh", "value_high")}</td><td>{text(factor, "evidenceId", "evidence_id") ?? "미연결"}</td><td><StatusBadge value={text(factor, "directnessClass", "directness_class", "observationType", "observation_type", "method")} /></td><td>{factorReferencePeriod(factor)}</td><td>{factorAdjustmentReason(factor)}</td><td><ConfidenceBadge record={factor} /></td></tr>)}</tbody></table></div>
        ) : <NotEstimable compact title="Factor가 연결되지 않았습니다" description="산출식을 검증할 수 없어 값 대신 근거 gap을 표시합니다." />}
      </section>
      <div className="detail-grid">
        <article className="panel sensitivity-panel">
          <SectionHeading eyebrow="SENSITIVITY" title="민감도 분석" description={sensitivity.length ? "저장된 Factor 민감도 결과입니다." : "저장된 Low/High 구간에서 Base 대비 최대 변동폭을 계산했습니다. 탄력성 추정은 아닙니다."} />
          {displayedSensitivity.length ? <div className="sensitivity-list">{displayedSensitivity.map((item, index) => { const impact = number(item, "impact", "elasticity", "change"); const width = impact === null ? 0 : Math.min(100, Math.abs(impact)); return <div key={`${label(item)}-${index}`}><span>{label(item)}</span><i aria-hidden="true"><b style={{ "--bar-width": `${width}%` } as CSSProperties} /></i><strong>{impact === null ? "미산정" : `${impact.toFixed(1)}%`}</strong></div>; })}</div> : <DataUnavailable message="Low / Base / High 또는 저장된 민감도 결과가 없어 분석할 수 없습니다." />}
        </article>
        <article className="panel">
          <SectionHeading eyebrow="USER SCENARIO" title="Factor 수정" description="수정값은 Baseline을 덮어쓰지 않습니다." />
          {canCreateScenario && countUnit ? <ScenarioForm estimateId={id} currency={text(estimate, "currency")} entityUnit={countUnit} eligibleEntities={{ low: eligibleEntities.low!, base: eligibleEntities.base!, high: eligibleEntities.high! }} /> : <DataUnavailable message="Baseline 수량 또는 단위가 not estimable 상태라 시장 시나리오를 생성할 수 없습니다." />}
        </article>
      </div>
      <EvidencePanel record={estimate} />
    </div>
  );
}

const COMPARISON_UNAVAILABLE_REASONS: Record<string, string> = {
  registered_estimate_not_available: "등록된 estimate가 없습니다.",
  same_unit_comparator_required: "같은 단위의 산정 가능한 후보가 2개 이상 필요합니다.",
  confidence_assessment_not_available: "신뢰도 평가가 연결되지 않았습니다.",
  validation_gap_review_not_available: "검증 gap 검토가 기록되지 않았습니다.",
  estimate_component_evidence_not_available: "estimate component 근거가 연결되지 않았습니다.",
  estimate_timestamp_not_available: "estimate 갱신시점을 확인할 수 없습니다.",
  active_market_scenario_not_available: "활성 TAM/SAM/SOM 시나리오가 없습니다.",
  multiple_active_market_scenarios_require_explicit_selection: "활성 시나리오가 여러 개라 사용할 시나리오를 명시적으로 선택해야 합니다.",
  active_market_estimate_not_available: "활성 시나리오는 있지만 연결된 시장규모 snapshot이 없습니다.",
  annual_spend_evidence_not_available: "활성 시나리오는 있지만 연간 지출 근거가 없어 revenue를 산정하지 않았습니다.",
  annual_spend_inputs_not_available: "TAM entity와 TAM revenue 근거가 모두 필요합니다.",
  time_series_evidence_not_available: "시계열 성장 근거가 등록되지 않았습니다.",
  target_accessibility_evidence_not_available: "타깃 접근성 근거가 등록되지 않았습니다.",
  digital_reachability_evidence_not_available: "디지털 도달성 근거가 등록되지 않았습니다.",
  competition_evidence_not_available: "경쟁 강도 근거가 등록되지 않았습니다.",
  purchase_frequency_evidence_not_available: "구매 빈도 근거가 등록되지 않았습니다.",
  willingness_to_pay_evidence_not_available: "지불의사 근거가 등록되지 않았습니다.",
};

const COMPARISON_DEFAULT_REASONS: Record<string, string> = {
  raw_count: "Low/Base/High 산출 근거가 없습니다.",
  normalized_count_score: "같은 단위의 비교 가능한 Base가 부족합니다.",
  confidence_score: "신뢰도 평가가 연결되지 않았습니다.",
  validation_gap_count: "검증 gap 검토가 기록되지 않았습니다.",
  direct_observation_share: "직접 관측 component 비중을 계산할 수 없습니다.",
  estimate_updated_at: "estimate 갱신시점을 확인할 수 없습니다.",
  market_scenario_id: "비교에 사용할 활성 시나리오가 확정되지 않았습니다.",
  tam_entities_base: "활성 TAM 시나리오가 없습니다.",
  sam_entities_base: "활성 SAM 시나리오가 없습니다.",
  som_entities_base: "활성 SOM 시나리오가 없습니다.",
  tam_revenue_base: "활성 TAM revenue 시나리오가 없습니다.",
  sam_revenue_base: "활성 SAM revenue 시나리오가 없습니다.",
  som_revenue_base: "활성 SOM revenue 시나리오가 없습니다.",
  annual_spend_per_entity: "연간 지출 산출 근거가 없습니다.",
  growth_rate: "시계열 성장 근거가 등록되지 않았습니다.",
  target_accessibility: "타깃 접근성 근거가 등록되지 않았습니다.",
  digital_reachability: "디지털 도달성 근거가 등록되지 않았습니다.",
  competition_intensity: "경쟁 강도 근거가 등록되지 않았습니다.",
  purchase_frequency: "구매 빈도 근거가 등록되지 않았습니다.",
  willingness_to_pay: "지불의사 근거가 등록되지 않았습니다.",
};

function comparisonMetrics(item: DataRecord): DataRecord {
  return nested(item, "normalizedMetrics", "normalized_metrics");
}

function comparisonMetricNumber(item: DataRecord, metric: string, ...fallbackKeys: string[]): number | null {
  return number(comparisonMetrics(item), metric) ?? number(item, ...fallbackKeys);
}

function numericValue(record: DataRecord, ...keys: string[]): number | string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const candidate = value.trim().replaceAll(",", "");
      if (/^[+-]?\d+(?:\.\d+)?$/u.test(candidate)) return candidate;
    }
  }
  return null;
}

function comparisonMetricValue(item: DataRecord, metric: string, ...fallbackKeys: string[]): number | string | null {
  return numericValue(comparisonMetrics(item), metric) ?? numericValue(item, ...fallbackKeys);
}

function comparisonMetricText(item: DataRecord, metric: string, ...fallbackKeys: string[]): string | null {
  return text(comparisonMetrics(item), metric) ?? text(item, ...fallbackKeys);
}

function comparisonUnavailableReason(item: DataRecord, metric: string): string {
  const metrics = comparisonMetrics(item);
  const reasons = nested(metrics, "metricUnavailableReasons", "metric_unavailable_reasons");
  const code = text(reasons, metric)
    ?? (metric === "raw_count" || metric === "normalized_count_score"
      ? text(metrics, "unavailableReason", "unavailable_reason")
      : null);
  return (code ? COMPARISON_UNAVAILABLE_REASONS[code] : null)
    ?? COMPARISON_DEFAULT_REASONS[metric]
    ?? "비교 snapshot에 이 변수의 근거가 등록되지 않았습니다.";
}

function ComparisonUnavailable({ item, metric }: { item: DataRecord; metric: string }) {
  return (
    <span className="comparison-unavailable">
      <strong>데이터 없음</strong>
      <small>{comparisonUnavailableReason(item, metric)}</small>
    </span>
  );
}

function ComparisonValue({
  item,
  metric,
  value,
  render,
}: {
  item: DataRecord;
  metric: string;
  value: number | string | null;
  render: (value: number | string) => ReactNode;
}) {
  return value === null
    ? <ComparisonUnavailable item={item} metric={metric} />
    : <>{render(value)}</>;
}

function comparisonDate(value: string | number): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Seoul",
  }).format(parsed);
}

function comparisonMoney(value: number | string, currency: string | null): string {
  return `${comparisonDecimal(value)} ${currency ?? "통화 미확인"}`;
}

function comparisonDecimal(value: number | string): string {
  if (typeof value === "number") {
    return Number.isFinite(value)
      ? new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 20 }).format(value)
      : String(value);
  }
  const candidate = value.trim().replaceAll(",", "");
  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/u.exec(candidate);
  if (!match) return value;
  const [, sign, integer, fraction] = match;
  const groupedInteger = BigInt(integer).toLocaleString("ko-KR");
  const significantFraction = fraction?.replace(/0+$/u, "") ?? "";
  return `${sign}${groupedInteger}${significantFraction ? `.${significantFraction}` : ""}`;
}

function comparisonCount(value: number | string, unit: string): string {
  if (typeof value === "string") {
    const candidate = value.trim().replaceAll(",", "");
    const match = /^([+-]?)(\d+)(?:\.(\d+))?$/u.exec(candidate);
    if (match) {
      const [, sign, integer, fraction] = match;
      const rounded = BigInt(integer) + (fraction && fraction[0] >= "5" ? BigInt(1) : BigInt(0));
      return `${sign}${rounded.toLocaleString("ko-KR")} ${unitLabel(unit)}`;
    }
  }
  return typeof value === "number" && Number.isFinite(value)
    ? formatCount(value, unit)
    : `${value} ${unitLabel(unit)}`;
}

function comparisonScore(value: number | string): string {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return String(value);
  const normalized = Math.abs(numeric) <= 1 ? numeric * 100 : numeric;
  return `${new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 1 }).format(normalized)} / 100`;
}

function comparisonInterval(item: DataRecord) {
  const metrics = comparisonMetrics(item);
  return {
    low: numericValue(metrics, "raw_count_low") ?? numericValue(item, "countLow", "count_low", "low", "weightedCountLow"),
    base: numericValue(metrics, "raw_count_base") ?? numericValue(item, "countBase", "count_base", "base", "weightedCountBase"),
    high: numericValue(metrics, "raw_count_high") ?? numericValue(item, "countHigh", "count_high", "high", "weightedCountHigh"),
  };
}

function ComparisonSummaryCard({ item, unit, index }: { item: DataRecord; unit: string; index: number }) {
  const interval = comparisonInterval(item);
  const id = identifier(item) ?? `${unit}-${index}`;
  const normalized = comparisonMetricNumber(item, "normalized_count_score", "normalizedCountScore", "normalized_count_score");
  const confidenceScore = comparisonMetricNumber(item, "confidence_score", "confidenceScore", "confidence_score");
  const confidenceGrade = comparisonMetricText(item, "confidence_grade", "confidenceGrade", "confidence_grade");
  const validationGapCount = comparisonMetricNumber(item, "validation_gap_count", "validationGapCount", "validation_gap_count");

  return (
    <article className="comparison-summary-card">
      <header>
        <span>후보 {String(index + 1).padStart(2, "0")}</span>
        <EntityUnitBadge unit={unit} />
      </header>
      <h3>{label(item)}</h3>
      <small className="comparison-summary-id">{id}</small>
      <dl>
        <div>
          <dt>Raw Base</dt>
          <dd><ComparisonValue item={item} metric="raw_count" value={interval.base} render={(entry) => comparisonCount(entry, unit)} /></dd>
        </div>
        <div>
          <dt>Same-unit Base</dt>
          <dd><ComparisonValue item={item} metric="normalized_count_score" value={normalized} render={comparisonScore} /></dd>
        </div>
        <div>
          <dt>신뢰도</dt>
          <dd>
            <ComparisonValue
              item={item}
              metric="confidence_score"
              value={confidenceGrade ?? confidenceScore}
              render={() => confidenceGrade ? `등급 ${confidenceGrade}` : confidenceScore === null ? "점수 미등록" : `${Math.round(confidenceScore)} / 100`}
            />
          </dd>
        </div>
        <div>
          <dt>검증 gap</dt>
          <dd><ComparisonValue item={item} metric="validation_gap_count" value={validationGapCount} render={(entry) => `${Number(entry).toLocaleString("ko-KR")}개`} /></dd>
        </div>
      </dl>
    </article>
  );
}

export function ComparisonView({ value, comparisonId, selectedIds = [] }: { value: unknown; comparisonId?: string; selectedIds?: string[] }) {
  const comparison = asRecord(value);
  const items = records(value, ["items", "segments", "results", "comparisonItems", "comparison_items"]);
  const grouped = new Map<string, DataRecord[]>();
  for (const item of items) {
    const unit = entityUnit(item) ?? "unknown";
    grouped.set(unit, [...(grouped.get(unit) ?? []), item]);
  }
  const ids = items.flatMap((item) => {
    const id = identifier(item);
    return id ? [id] : [];
  });
  const resolvedSelection = items.flatMap((item) => {
    const id = identifier(item);
    return id ? [{ id, label: label(item), kind: entityUnit(item) ?? undefined }] : [];
  });
  const canPersist = Boolean(comparisonId)
    || (items.length >= 2 && items.every((item) => text(item, "sourceKind", "source_kind") === "query_result"));
  return (
    <div className="page-stack">
      <PageHeading eyebrow="SEGMENT COMPARISON" title={text(comparison, "name", "title") ?? "후보 시장 비교"} description="서로 다른 단위는 원값으로 직접 순위를 매기지 않습니다. 원값과 정규화 점수를 구분합니다." actions={canPersist ? <div className="inline-actions"><SaveComparisonForm segmentIds={ids} comparisonId={comparisonId} />{comparisonId ? <ExportButtons snapshotId={comparisonId} kind="comparison" /> : null}</div> : undefined} />
      {!comparisonId ? <ComparisonSelection selectedIds={selectedIds} resolvedItems={resolvedSelection} /> : null}
      {!comparisonId && items.length >= 2 && !canPersist ? <div className="notice-banner warning"><TriangleAlert aria-hidden="true" /><div><strong>미리보기 비교입니다</strong><p>Catalog 원본은 그대로 비교할 수 있지만, 비교 workspace로 저장하려면 빌더에서 각 후보를 저장하고 계산 snapshot을 생성하세요.</p></div></div> : null}
      {items.length >= 2 ? <div className="notice-banner"><Scale aria-hidden="true" /><div><strong>정규화 범위</strong><p>정규화 Base는 이 비교에 포함된 같은 entity unit 후보끼리만 계산한 0–100 점수입니다. 단위가 다른 원수량과 근거가 없는 변수는 순위에 사용하지 않습니다.</p></div></div> : null}
      {items.length >= 2 ? [...grouped.entries()].map(([unit, unitItems]) => (
        <section key={unit} className="comparison-group">
          <SectionHeading eyebrow="UNIT-SAFE COMPARISON" title={`${unitLabel(unit)} 단위`} description={`${unitItems.length.toLocaleString("ko-KR")}개 세그먼트 · raw entity count와 same-unit normalized Base를 분리합니다.`} />
          <section className="comparison-summary-grid" aria-label={`${unitLabel(unit)} 비교 요약`}>
            {unitItems.map((item, index) => <ComparisonSummaryCard item={item} unit={unit} index={index} key={identifier(item) ?? `${unit}-${index}`} />)}
          </section>
          <div className="comparison-table-stack">
            <div className="data-table-wrap"><table className="data-table comparison-table comparison-table-primary"><caption>{unitLabel(unit)} 원수량, 정규화, 근거 품질 비교</caption><thead><tr><th>세그먼트</th><th>Raw Low</th><th>Raw Base</th><th>Raw High</th><th>Same-unit normalized Base</th><th>신뢰도</th><th>검증 gap</th><th>직접 관측 비중</th><th>Freshness</th></tr></thead><tbody>{unitItems.map((item, index) => {
              const interval = comparisonInterval(item);
              const id = identifier(item) ?? `${unit}-${index}`;
              const normalized = comparisonMetricNumber(item, "normalized_count_score", "normalizedCountScore", "normalized_count_score");
              const confidenceScore = comparisonMetricNumber(item, "confidence_score", "confidenceScore", "confidence_score");
              const confidenceGrade = comparisonMetricText(item, "confidence_grade", "confidenceGrade", "confidence_grade");
              const validationGapCount = comparisonMetricNumber(item, "validation_gap_count", "validationGapCount", "validation_gap_count");
              const directObservationShare = comparisonMetricNumber(item, "direct_observation_share", "directObservationShare", "direct_observation_share");
              const estimateUpdatedAt = comparisonMetricText(item, "estimate_updated_at", "estimateUpdatedAt", "estimate_updated_at");
              return <tr key={id}><td><strong>{label(item)}</strong><small>{id}</small></td><td className="numeric"><ComparisonValue item={item} metric="raw_count" value={interval.low} render={(entry) => comparisonCount(entry, unit)} /></td><td className="numeric emphasized"><ComparisonValue item={item} metric="raw_count" value={interval.base} render={(entry) => comparisonCount(entry, unit)} /></td><td className="numeric"><ComparisonValue item={item} metric="raw_count" value={interval.high} render={(entry) => comparisonCount(entry, unit)} /></td><td className="numeric emphasized"><ComparisonValue item={item} metric="normalized_count_score" value={normalized} render={comparisonScore} /></td><td><ComparisonValue item={item} metric="confidence_score" value={confidenceGrade ?? confidenceScore} render={() => <span><strong>{confidenceGrade ? `등급 ${confidenceGrade}` : "등급 미등록"}</strong><small>{confidenceScore === null ? "점수 미등록" : `점수 ${Math.round(confidenceScore)} / 100`}</small></span>} /></td><td className="numeric"><ComparisonValue item={item} metric="validation_gap_count" value={validationGapCount} render={(entry) => `${Number(entry).toLocaleString("ko-KR")}개`} /></td><td className="numeric"><ComparisonValue item={item} metric="direct_observation_share" value={directObservationShare} render={(entry) => formatPercent(Number(entry))} /></td><td><ComparisonValue item={item} metric="estimate_updated_at" value={estimateUpdatedAt} render={comparisonDate} /></td></tr>;
            })}</tbody></table></div>
            <div className="data-table-wrap"><table className="data-table comparison-table comparison-table-market"><caption>{unitLabel(unit)} TAM/SAM/SOM 및 연간 지출 비교</caption><thead><tr><th>세그먼트</th><th>선택 시나리오</th><th>TAM · entity</th><th>SAM · entity</th><th>SOM · entity</th><th>TAM · revenue</th><th>SAM · revenue</th><th>SOM · revenue</th><th>연간 지출 override / entity·year</th></tr></thead><tbody>{unitItems.map((item, index) => {
              const id = identifier(item) ?? `${unit}-${index}`;
              const currency = comparisonMetricText(item, "currency", "marketCurrency", "market_currency", "currency");
              const scenarioId = comparisonMetricText(item, "market_scenario_id", "marketScenarioId", "market_scenario_id");
              const scenarioName = comparisonMetricText(item, "market_scenario_name", "marketScenarioName", "market_scenario_name");
              const scenarioVersion = comparisonMetricText(item, "market_scenario_version", "marketScenarioVersion", "market_scenario_version");
              const horizonMonths = comparisonMetricNumber(item, "market_horizon_months", "marketHorizonMonths", "market_horizon_months");
              const tamEntities = comparisonMetricValue(item, "tam_entities_base", "tamEntitiesBase", "tam_entities_base");
              const samEntities = comparisonMetricValue(item, "sam_entities_base", "samEntitiesBase", "sam_entities_base");
              const somEntities = comparisonMetricValue(item, "som_entities_base", "somEntitiesBase", "som_entities_base");
              const tamRevenue = comparisonMetricValue(item, "tam_revenue_base", "tamRevenueBase", "tam_revenue_base");
              const samRevenue = comparisonMetricValue(item, "sam_revenue_base", "samRevenueBase", "sam_revenue_base");
              const somRevenue = comparisonMetricValue(item, "som_revenue_base", "somRevenueBase", "som_revenue_base");
              const annualSpend = comparisonMetricValue(item, "annual_spend_per_entity", "annualSpendPerEntity", "annual_spend_per_entity");
              const annualSpendUnit = comparisonMetricText(item, "annual_spend_per_entity_unit", "annualSpendPerEntityUnit", "annual_spend_per_entity_unit");
              return <tr key={id}><td><strong>{label(item)}</strong><small>{id}</small></td><td><ComparisonValue item={item} metric="market_scenario_id" value={scenarioId} render={() => <span><strong>{scenarioName ?? "이름 미등록"}</strong><small>{scenarioVersion ? `버전 ${scenarioVersion}` : "버전 미등록"} · {horizonMonths === null ? "기간 미등록" : `${horizonMonths.toLocaleString("ko-KR")}개월`}</small><small>{scenarioId}</small></span>} /></td><td className="numeric"><ComparisonValue item={item} metric="tam_entities_base" value={tamEntities} render={(entry) => comparisonCount(entry, unit)} /></td><td className="numeric"><ComparisonValue item={item} metric="sam_entities_base" value={samEntities} render={(entry) => comparisonCount(entry, unit)} /></td><td className="numeric"><ComparisonValue item={item} metric="som_entities_base" value={somEntities} render={(entry) => comparisonCount(entry, unit)} /></td><td className="numeric"><ComparisonValue item={item} metric="tam_revenue_base" value={tamRevenue} render={(entry) => comparisonMoney(entry, currency)} /></td><td className="numeric"><ComparisonValue item={item} metric="sam_revenue_base" value={samRevenue} render={(entry) => comparisonMoney(entry, currency)} /></td><td className="numeric"><ComparisonValue item={item} metric="som_revenue_base" value={somRevenue} render={(entry) => comparisonMoney(entry, currency)} /></td><td className="numeric"><ComparisonValue item={item} metric="annual_spend_per_entity" value={annualSpend} render={(entry) => <span><strong>{comparisonMoney(entry, currency)}</strong>{annualSpendUnit ? <small>{annualSpendUnit}</small> : null}</span>} /></td></tr>;
            })}</tbody></table></div>
            <div className="data-table-wrap"><table className="data-table comparison-table comparison-table-evidence"><caption>{unitLabel(unit)} 추가 비교 변수와 결측 사유</caption><thead><tr><th>세그먼트</th><th>성장률</th><th>타깃 접근성</th><th>디지털 도달성</th><th>경쟁 강도</th><th>구매 빈도</th><th>지불의사</th></tr></thead><tbody>{unitItems.map((item, index) => {
              const id = identifier(item) ?? `${unit}-${index}`;
              const currency = comparisonMetricText(item, "currency", "marketCurrency", "market_currency", "currency");
              const growthRate = comparisonMetricNumber(item, "growth_rate", "growthRate", "growth_rate");
              const targetAccessibility = comparisonMetricNumber(item, "target_accessibility", "targetAccessibility", "target_accessibility");
              const digitalReachability = comparisonMetricNumber(item, "digital_reachability", "digitalReachability", "digital_reachability");
              const competitionIntensity = comparisonMetricNumber(item, "competition_intensity", "competitionIntensity", "competition_intensity");
              const purchaseFrequency = comparisonMetricNumber(item, "purchase_frequency", "purchaseFrequency", "purchase_frequency");
              const willingnessToPay = comparisonMetricNumber(item, "willingness_to_pay", "willingnessToPay", "willingness_to_pay");
              return <tr key={id}><td><strong>{label(item)}</strong><small>{id}</small></td><td className="numeric"><ComparisonValue item={item} metric="growth_rate" value={growthRate} render={(entry) => formatPercent(Number(entry))} /></td><td className="numeric"><ComparisonValue item={item} metric="target_accessibility" value={targetAccessibility} render={comparisonScore} /></td><td className="numeric"><ComparisonValue item={item} metric="digital_reachability" value={digitalReachability} render={comparisonScore} /></td><td className="numeric"><ComparisonValue item={item} metric="competition_intensity" value={competitionIntensity} render={comparisonScore} /></td><td className="numeric"><ComparisonValue item={item} metric="purchase_frequency" value={purchaseFrequency} render={(entry) => `${formatCompact(Number(entry))}회 / 년`} /></td><td className="numeric"><ComparisonValue item={item} metric="willingness_to_pay" value={willingnessToPay} render={(entry) => comparisonMoney(entry, currency)} /></td></tr>;
            })}</tbody></table></div>
          </div>
        </section>
      )) : <EmptyState title="비교할 세그먼트를 2개 이상 선택하세요" description="Subtype 또는 estimate 상세에서 최대 5개까지 비교 목록에 추가할 수 있습니다." action={<Link href="/explore" className="button button-primary">세그먼트 탐색</Link>} />}
    </div>
  );
}

export function OpportunityBoardView({ boardValue, opportunityValue, segmentId }: { boardValue: unknown; opportunityValue: unknown; segmentId?: string }) {
  const boards = records(boardValue, ["boards"]);
  const opportunities = records(opportunityValue, ["opportunities"]);
  const statusOrder = [...new Set(opportunities.map((item) => status(item) ?? "상태 미확인"))];
  return (
    <div className="page-stack">
      <PageHeading eyebrow="OPPORTUNITY BOARD" title="시장 관찰을 사업 가설로 전환합니다" description="생성 당시 estimate snapshot을 보존하고 현재 계산 결과와의 차이를 별도로 표시합니다." />
      <div className="board-toolbar">
        <span>Board {boards.length ? `${boards.length.toLocaleString("ko-KR")}개` : "미등록"}</span>
        <details><summary className="button button-primary"><PlusIcon /> Opportunity 생성</summary><OpportunityCreateForm segmentId={segmentId} /></details>
      </div>
      {opportunities.length ? (
        <div className="opportunity-board">
          {statusOrder.map((columnStatus) => {
            const items = opportunities.filter((item) => (status(item) ?? "상태 미확인") === columnStatus);
            return <section className="board-column" key={columnStatus}><header><strong>{statusDisplayLabel(columnStatus)}</strong><span>{items.length}</span></header><div>{items.map((item) => { const id = hrefId(item, ["opportunityId", "opportunity_id"]); return id ? <Link href={`/opportunities/${encodeURIComponent(id)}`} className="opportunity-card" key={id}><span>{opportunitySegmentName(item) ?? "연결 세그먼트 미확인"}</span><h2>{label(item)}</h2><p>{text(item, "problem", "problemStatement", "problem_statement", "hypothesis") ?? "문제 정의 없음"}</p><footer><StatusBadge value={status(item)} /><ArrowRight aria-hidden="true" /></footer></Link> : null; })}</div></section>;
          })}
        </div>
      ) : <EmptyState title="저장된 Opportunity가 없습니다" description="탐색 또는 계산 결과를 snapshot과 함께 사업기회로 저장하세요." />}
    </div>
  );
}

function PlusIcon() {
  return <span aria-hidden="true">＋</span>;
}

export function OpportunityDetail({ value }: { value: unknown }) {
  const opportunity = asRecord(value);
  const id = text(opportunity, "opportunityId", "opportunity_id", "id") ?? "";
  const snapshot = nested(opportunity, "estimateSnapshot", "estimate_snapshot", "snapshot");
  const current = nested(opportunity, "currentEstimate", "current_estimate");
  const scoreComponents = recordList(opportunity, "scoreComponents", "score_components", "scores");
  const experiments = recordList(opportunity, "experiments");
  const statusHistory = recordList(opportunity, "statusHistory", "status_history");
  const currentContent = recordList(opportunity, "currentContent", "current_content");
  const aiIdeaContent = currentContent.find((item) =>
    text(item, "contentType", "content_type") === "idea_brief"
      && text(item, "sourceKind", "source_kind") === "ai_hypothesis",
  );
  const aiIdeaEnvelope = nested(aiIdeaContent ?? {}, "content");
  const aiIdeaBrief = nested(aiIdeaEnvelope, "ideaBrief", "idea_brief");
  const aiIdeaProvenance = nested(aiIdeaEnvelope, "provenance");
  const aiIdeaExperiment = nested(aiIdeaBrief, "experimentPlan", "experiment_plan");
  const segmentId = text(snapshot, "savedSegmentId", "saved_segment_id");
  const segmentName = opportunitySegmentName(opportunity);
  const noteRecord = nested(opportunity, "notes");
  const noteContent = nested(noteRecord, "content");
  const formValue: OpportunityFormValue = {
    id,
    lockVersion: text(opportunity, "optimisticLockVersion", "optimistic_lock_version") ?? "",
    name: label(opportunity),
    problem: text(opportunity, "problem") ?? "",
    hypothesis: text(opportunity, "hypothesis") ?? "",
    idea: text(opportunity, "idea", "productIdea", "product_idea") ?? "",
    revenueModel: text(opportunity, "revenueModel", "revenue_model") ?? "",
    price: text(opportunity, "price", "expectedPrice", "expected_price", "expectedPriceBase", "expected_price_base") ?? "",
    channels: stringList(opportunity, "channels", "accessChannels", "access_channels").join(", "),
    competingAlternatives: stringList(opportunity, "competingAlternatives", "competing_alternatives").join("\n"),
    assumptions: stringList(opportunity, "assumptions", "assumptionsToValidate", "assumptions_to_validate").join("\n"),
    nextExperiment: text(opportunity, "nextExperiment", "next_experiment", "nextExperimentSummary", "next_experiment_summary") ?? "",
    status: status(opportunity) ?? "draft",
    notes: text(opportunity, "notes") ?? text(noteContent, "text") ?? text(noteRecord, "text") ?? "",
    scores: Object.fromEntries(scoreComponents.map((item) => [
      text(item, "metricCode", "metric_code") ?? "unknown",
      String(number(item, "rawValue", "raw_value", "normalizedScore", "normalized_score") ?? ""),
    ])),
    weights: Object.fromEntries(scoreComponents.map((item) => [
      text(item, "metricCode", "metric_code") ?? "unknown",
      String((number(item, "weight") ?? 0) * 100),
    ])),
  };
  return (
    <div className="page-stack">
      <PageHeading eyebrow="OPPORTUNITY DETAIL" title={label(opportunity)} description={description(opportunity)} actions={<div className="inline-actions"><StatusBadge value={status(opportunity)} /><ExportButtons snapshotId={id} kind="opportunity" /></div>} />
      <div className="snapshot-comparison">
        <OpportunitySnapshotCard
          heading="생성 당시 snapshot"
          record={snapshot}
          footer={`${text(snapshot, "dataVersion", "data_version", "version", "modelVersion", "model_version") ?? "버전 미확인"} · ${text(snapshot, "queryResultId", "query_result_id") ?? "result 미확인"}`}
        />
        <ArrowRight aria-hidden="true" />
        <OpportunitySnapshotCard
          heading="현재 계산 결과"
          record={current}
          comparedWith={snapshot}
          footer={`${text(current, "resolvedVersionNo", "resolved_version_no") ? `세그먼트 v${text(current, "resolvedVersionNo", "resolved_version_no")}` : "버전 미확인"} · ${text(current, "resultId", "result_id") ?? "result 미확인"}`}
        />
      </div>
      <div className="detail-grid">
        <article className="panel"><SectionHeading eyebrow="OPPORTUNITY BRIEF" title="사업기회 편집" /><OpportunityEditor value={formValue} /></article>
        <article className="panel">
          <SectionHeading eyebrow="TRANSPARENT SCORE" title="평가 구성요소" description="입력 원점수와 방향 보정 후 정규화 점수를 함께 표시합니다." />
          {scoreComponents.length ? <div className="score-components">{scoreComponents.map((item, index) => {
            const metricCode = text(item, "metricCode", "metric_code") ?? "unknown";
            const rawValue = number(item, "rawValue", "raw_value");
            const normalizedScore = number(item, "normalizedScore", "normalized_score", "score", "value");
            const sourceKind = text(item, "sourceKind", "source_kind");
            const sourceRecordKey = text(item, "sourceRecordKey", "source_record_key");
            return <div key={`${metricCode}-${index}`}><span>{OPPORTUNITY_SCORE_LABELS[metricCode] ?? "평가 항목"}</span><strong>{normalizedScore?.toFixed(1) ?? "미산정"}<small>정규화</small></strong><small>원점수 {rawValue?.toFixed(1) ?? "미산정"} · {text(item, "formula") ?? "방향 공식 미확인"} · 가중치 {formatPercent(number(item, "weight"))}</small><small>근거 유형 {OPPORTUNITY_SCORE_SOURCE_LABELS[sourceKind ?? ""] ?? "미확인"} · source record {sourceRecordKey ?? "미연결"}</small></div>;
          })}</div> : <DataUnavailable message="Opportunity score 구성요소가 없습니다." />}
        </article>
      </div>
      <div className="detail-grid opportunity-evidence-split">
        <article className="panel"><SectionHeading eyebrow="FACTS" title="고정된 사실" description="생성 당시 estimate snapshot에서만 가져옵니다." /><KeyValueList rows={[
          { label: "연결 세그먼트", value: segmentId ? <Link className="text-link" href={`/builder/${encodeURIComponent(segmentId)}`}>{segmentName ?? segmentId}</Link> : "미연결" },
          { label: "Estimate snapshot", value: text(snapshot, "estimateId", "estimate_id") ? <Link className="text-link" href={`/sizing/${encodeURIComponent(text(snapshot, "estimateId", "estimate_id") ?? "")}`}>{text(snapshot, "estimateId", "estimate_id")}</Link> : "미연결" },
          { label: "Entity unit", value: entityUnit(snapshot) ?? "미확인" },
          { label: "Low / Base / High", value: `${formatCompact(number(snapshot, "countLow", "count_low"))} / ${formatCompact(number(snapshot, "countBase", "count_base"))} / ${formatCompact(number(snapshot, "countHigh", "count_high"))}` },
          { label: "추정 상태", value: statusDisplayLabel(text(snapshot, "estimateStatus", "estimate_status")) },
          { label: "Data version", value: text(snapshot, "dataVersion", "data_version") ?? "미확인" },
        ]} /></article>
        <article className="panel"><SectionHeading eyebrow="HYPOTHESES" title="검증할 가설" description="사용자 또는 AI가 제안한 내용이며 사실로 취급하지 않습니다." /><KeyValueList rows={[
          { label: "문제 가설", value: formValue.problem },
          { label: "핵심 가설", value: formValue.hypothesis },
          { label: "아이디어", value: formValue.idea },
        ]} /></article>
      </div>
      <article className="panel">
        <SectionHeading eyebrow="APPROVED AI HYPOTHESIS" title="승인된 AI 아이디어 초안" description="사람이 승인한 가설 버전이지만 Production 사실로 취급하지 않습니다." />
        {Object.keys(aiIdeaBrief).length ? <>
          <KeyValueList rows={[
            { label: "문제 가설", value: text(aiIdeaBrief, "problemHypothesis", "problem_hypothesis") ?? "근거 부족 · null" },
            { label: "해결 아이디어", value: text(aiIdeaBrief, "solutionIdea", "solution_idea") ?? "근거 부족 · null" },
            { label: "가치 제안", value: text(aiIdeaBrief, "valueProposition", "value_proposition") ?? "근거 부족 · null" },
            { label: "상품 패키지", value: text(aiIdeaBrief, "productPackage", "product_package") ?? "근거 부족 · null" },
            { label: "가격 가설", value: text(aiIdeaBrief, "pricingHypothesis", "pricing_hypothesis") ?? "근거 부족 · null" },
            { label: "채널", value: stringList(aiIdeaBrief, "channels").join(", ") || "근거 부족 · null" },
            { label: "메시지", value: text(aiIdeaBrief, "messageDraft", "message_draft") ?? "근거 부족 · null" },
            { label: "랜딩 페이지", value: text(aiIdeaBrief, "landingPageOutline", "landing_page_outline") ?? "근거 부족 · null" },
            { label: "인터뷰 질문", value: stringList(aiIdeaBrief, "interviewGuide", "interview_guide").join(" · ") || "근거 부족 · null" },
            { label: "저비용 수요검증 실험", value: <OpportunityIdeaExperiment value={aiIdeaExperiment} /> },
            { label: "위험", value: stringList(aiIdeaBrief, "risks").join(" · ") || "근거 부족 · null" },
          ]} />
          <p className="muted">Model {text(aiIdeaProvenance, "providerModel", "provider_model") ?? text(aiIdeaContent ?? {}, "providerModel", "provider_model") ?? "미확인"}</p>
          <OpportunityIdeaProvenance content={aiIdeaContent ?? {}} brief={aiIdeaBrief} provenance={aiIdeaProvenance} snapshot={snapshot} segmentName={segmentName} />
        </> : <DataUnavailable message="승인되어 버전 고정된 AI 아이디어 초안이 없습니다." />}
      </article>
      <div className="detail-grid">
        <article className="panel"><SectionHeading eyebrow="EXPERIMENTS" title="검증 실험" description={`${experiments.length.toLocaleString("ko-KR")}건`} />{experiments.length ? <div className="experiment-list">{experiments.map((experiment, index) => <div key={identifier(experiment) ?? index}><strong>{label(experiment)}</strong><span>{text(experiment, "hypothesis") ?? "가설 미확인"}</span><small>{text(experiment, "method") ?? "방법 미확인"} · {text(experiment, "primaryMetric", "primary_metric") ?? "지표 미확인"}</small><StatusBadge value={status(experiment)} /></div>)}</div> : <DataUnavailable message="등록된 검증 실험이 없습니다. 편집 폼에서 새 실험을 추가할 수 있습니다." />}<SectionHeading eyebrow="EDIT HISTORY" title="생성·수정 이력" /><OpportunityEditHistory entries={statusHistory} /></article>
        <article className="panel"><SectionHeading eyebrow="AI HYPOTHESIS DRAFT" title="AI 아이디어 초안 요청" description="결과는 Proposed Revision으로만 저장되고 사람의 검토 전에는 사실이나 Opportunity 본문이 되지 않습니다." />{segmentId ? <ResearchCreateForm segmentId={segmentId} defaultQuestion={`${label(opportunity)}의 snapshot 근거와 명시된 가설을 분리해 사업기회·가치제안·검증 실험 초안을 제안하라.`} defaultTargetSegment={text(current, "title", "name") ?? label(opportunity)} defaultTargetVariable={`opportunity_idea_brief:${id}`} buttonLabel="AI 가설 초안 Queue 등록" /> : <DataUnavailable message="AI 초안을 요청하려면 저장된 세그먼트 snapshot을 연결하세요." />}</article>
      </div>
      <EvidencePanel record={snapshot} />
    </div>
  );
}

export function ResearchQueueView({ jobValue, reviewValue }: { jobValue: unknown; reviewValue: unknown }) {
  const jobs = records(jobValue, ["jobs"]);
  const reviews = records(reviewValue, ["reviews", "reviewItems", "review_items"]);
  return (
    <div className="page-stack">
      <PageHeading eyebrow="AI RESEARCH SYSTEM" title="리서치 작업과 검토 Queue" description="기존 데이터로 계산할 수 없는 변수만 조사하며, 결과는 승인 전까지 Baseline과 분리됩니다." />
      <div className="research-layout">
        <section className="research-list-section">
          <SectionHeading eyebrow="JOBS" title="Research Jobs" description={`${jobs.length.toLocaleString("ko-KR")}건`} />
          {jobs.length ? <div className="research-job-list">{jobs.map((job) => {
            const id = hrefId(job, ["jobId", "job_id"]);
            if (!id) return null;
            return <Link href={`/research/jobs/${encodeURIComponent(id)}`} key={id}><span className="job-status-marker" data-status={status(job) ?? "unknown"} /><div><strong>{label(job)}</strong><small>{text(job, "targetVariable", "target_variable", "researchQuestion", "research_question") ?? "대상 변수 미확인"}</small></div><StatusBadge value={status(job)} /><ArrowRight aria-hidden="true" /></Link>;
          })}</div> : <EmptyState title="등록된 Research Job이 없습니다" description="검증이 필요한 변수를 등록하면 진행상태와 구조화 결과가 여기에 표시됩니다." />}
        </section>
        <aside className="research-side-panel">
          <section className="panel"><SectionHeading eyebrow="NEW JOB" title="추가 조사 등록" /><ResearchCreateForm /></section>
          <section className="panel"><SectionHeading eyebrow="REVIEW QUEUE" title="검토 대기" description={`${reviews.length.toLocaleString("ko-KR")}건`} />{reviews.length ? <div className="review-link-list">{reviews.slice(0, 8).map((review) => { const id = hrefId(review, ["reviewId", "review_id"]); return id ? <Link href={`/research/reviews/${encodeURIComponent(id)}`} key={id}><span>{label(review)}</span><StatusBadge value={status(review)} /></Link> : null; })}</div> : <p className="muted">검토 대기 항목이 없습니다.</p>}</section>
        </aside>
      </div>
    </div>
  );
}

export function ResearchJobDetail({ value }: { value: unknown }) {
  const job = asRecord(value);
  const id = text(job, "jobId", "job_id", "id") ?? "";
  const steps = recordList(job, "steps", "jobSteps", "job_steps");
  const events = recordList(job, "events", "jobEvents", "job_events");
  const artifacts = recordList(job, "artifacts");
  const structuredArtifact = [...artifacts].reverse().find((artifact) => text(artifact, "artifactKind", "artifact_kind") === "structured_result");
  const errorArtifact = [...artifacts].reverse().find((artifact) => text(artifact, "artifactKind", "artifact_kind") === "error");
  const structuredPayload = nested(structuredArtifact ?? {}, "structuredPayload", "structured_payload");
  const result = nested(structuredPayload, "result");
  const validation = nested(structuredPayload, "validation");
  const errorPayload = nested(errorArtifact ?? {}, "structuredPayload", "structured_payload");
  const interval = nested(result, "lowBaseHigh", "low_base_high");
  const sources = recordList(result, "sources");
  const citations = recordList(result, "citations");
  const limitations = stringList(result, "limitations");
  const confidence = nested(result, "confidenceComponents", "confidence_components");
  const ideaBrief = nested(result, "opportunityIdeaBrief", "opportunity_idea_brief");
  const revision = nested(job, "revision");
  const jobStatus = status(job);
  const cancellable = ["draft", "queued", "running", "configuration_required"].includes(jobStatus ?? "");
  const retryable = ["configuration_required", "failed"].includes(jobStatus ?? "");
  const baselineEchoMismatch = validation.baselineEchoMatchesCanonical === false
    || validation.baseline_echo_matches_canonical === false;
  const identityEchoMismatch = validation.providerIdentityMatchesCanonical === false
    || validation.provider_identity_matches_canonical === false;
  const jobErrorCode = text(job, "errorCode", "error_code") ?? text(errorPayload, "code");
  const jobErrorMessage = text(job, "errorMessage", "error_message") ?? text(errorPayload, "message");
  return (
    <div className="page-stack">
      <PageHeading eyebrow="RESEARCH JOB" title={label(job)} description={text(job, "researchQuestion", "research_question") ?? description(job)} actions={retryable || cancellable ? <div className="inline-actions">{retryable ? <RetryResearchButton jobId={id} /> : null}{cancellable ? <CancelResearchButton jobId={id} /> : null}</div> : <StatusBadge value={jobStatus} />} />
      <div className="metric-strip">
        <Metric label="상태" value={statusDisplayLabel(jobStatus)} />
        <Metric label="대상 변수" value={text(job, "targetVariable", "target_variable") ?? "미확인"} />
        <Metric label="생성 시각" value={text(job, "createdAt", "created_at") ?? "미확인"} />
        <Metric label="최근 갱신" value={text(job, "updatedAt", "updated_at") ?? "미확인"} />
      </div>
      {jobStatus === "configuration_required" ? <div className="notice-banner warning"><TriangleAlert aria-hidden="true" /><div><strong>외부 Credential 설정 필요</strong><p>가상 조사 결과를 생성하지 않았습니다. 설정 후 이 작업을 재실행하세요.</p></div></div> : null}
      {jobErrorCode || jobErrorMessage ? <div className="notice-banner warning" role="alert"><TriangleAlert aria-hidden="true" /><div><strong>{researchErrorLabel(jobErrorCode)}</strong><p>{researchErrorMessage(jobErrorMessage)}</p></div></div> : null}
      <div className="research-detail-grid">
        <article className="panel">
          <SectionHeading eyebrow="PROGRESS" title="작업 단계" />
          {steps.length ? <ol className="job-timeline">{steps.map((step, index) => { const stepStatus = text(step, "status", "stepStatus", "step_status"); const stepCode = text(step, "stepName", "step_name") ?? ""; const stepError = text(step, "errorMessage", "error_message", "message"); const stepDetail = stepError ? researchErrorMessage(stepError) : stepStatus === "skipped" ? "외부 AI 설정 대기" : text(step, "updatedAt", "updated_at") ?? "상세 기록 없음"; return <li key={text(step, "researchJobStepId", "research_job_step_id", "stepId", "step_id", "id") ?? index} data-status={stepStatus ?? "unknown"}><span>{index + 1}</span><div><strong>{RESEARCH_STEP_LABELS[stepCode] ?? "리서치 처리 단계"}</strong><small>{stepDetail}</small></div><StatusBadge value={stepStatus} /></li>; })}</ol> : <DataUnavailable message="기록된 작업 단계가 없습니다." />}
        </article>
        <article className="panel">
          <SectionHeading eyebrow="EVENT LOG" title="이벤트" />
          <ResearchJobEventStream
            key={`${id}:${text(job, "updatedAt", "updated_at") ?? "unknown"}:${events.length}`}
            jobId={id}
            initialStatus={jobStatus}
            initialUpdatedAt={text(job, "updatedAt", "updated_at")}
            initialErrorCode={jobErrorCode}
            initialErrorMessage={jobErrorMessage}
            initialEvents={events}
          />
        </article>
      </div>
      <article className="panel structured-result">
        <SectionHeading eyebrow="STRUCTURED OUTPUT" title="검증 가능한 조사 결과" />
        {Object.keys(result).length ? <>
          {baselineEchoMismatch || identityEchoMismatch ? <div className="notice-banner warning"><TriangleAlert aria-hidden="true" /><div><strong>Provider canonical echo 불일치</strong><p>제안의 Baseline·대상·질문은 모델 echo가 아니라 생성 시 고정한 canonical job input을 사용했습니다.</p></div></div> : null}
          <KeyValueList rows={[
            { label: "대상 세그먼트", value: text(result, "targetSegment", "target_segment") ?? "미확인" },
            { label: "대상 변수", value: text(result, "targetVariable", "target_variable") ?? "미확인" },
            { label: "Low / Base / High", value: `${formatCompact(number(interval, "low"))} / ${formatCompact(number(interval, "base"))} / ${formatCompact(number(interval, "high"))}` },
            { label: "분모", value: text(result, "denominator") ?? "미확인" },
            { label: "지역", value: text(result, "geography") ?? "미확인" },
            { label: "기준연도", value: text(result, "referenceYear", "reference_year") ?? "미확인" },
            { label: "추론 방법", value: text(result, "inferenceMethod", "inference_method") ?? "미확인" },
            { label: "권장 조치", value: text(result, "recommendedAction", "recommended_action") ?? "미확인" },
            { label: "Provider / model", value: `${text(structuredPayload, "provider") ?? "미확인"} / ${text(structuredPayload, "model") ?? "미확인"}` },
            { label: "Revision", value: text(revision, "proposedRevisionId", "proposed_revision_id") ?? "미생성" },
          ]} />
          <div className="detail-grid">
            <section><SectionHeading eyebrow="SOURCES" title={`원문 출처 ${sources.length}건`} />{sources.length ? <ol className="report-sources">{sources.map((source, index) => <li key={`${text(source, "url")}-${index}`}><strong>{text(source, "title") ?? "제목 미확인"}</strong><span>{text(source, "institution") ?? "기관 미확인"} · {text(source, "referenceYear", "reference_year") ?? "기준연도 미확인"}</span><small>{text(source, "locator") ?? "사용 위치 미확인"} · tier {text(source, "sourceTier", "source_tier") ?? "?"}</small>{text(source, "url") ? <a className="text-link" href={text(source, "url") ?? "#"} target="_blank" rel="noreferrer">원문</a> : null}</li>)}</ol> : <DataUnavailable message="검증 가능한 원문 출처가 없습니다." />}</section>
            <section><SectionHeading eyebrow="CITATIONS" title="주장 연결" />{citations.length ? <ul className="caveat-list">{citations.map((citation, index) => <li key={`${number(citation, "sourceIndex", "source_index")}-${index}`}>[{number(citation, "sourceIndex", "source_index") ?? "?"}] {text(citation, "claim") ?? "주장 미확인"}</li>)}</ul> : <DataUnavailable message="출처에 연결된 주장이 없습니다." />}</section>
          </div>
          <div className="detail-grid">
            <section><SectionHeading eyebrow="LIMITATIONS" title="한계와 확인 변수" />{limitations.length ? <ul className="caveat-list">{limitations.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="muted">등록된 한계가 없습니다.</p>}</section>
            <section><SectionHeading eyebrow="CONFIDENCE" title="신뢰도 구성요소" /><KeyValueList rows={Object.entries(confidence).map(([key, value]) => ({ label: key, value: typeof value === "number" ? value.toFixed(1) : String(value ?? "미산정") }))} /></section>
          </div>
          {Object.keys(ideaBrief).length ? <section><SectionHeading eyebrow="AI HYPOTHESIS" title="Opportunity 아이디어 초안" description="승인 전 가설이며 사실이 아닙니다." /><pre className="structured-json">{prettyJson(ideaBrief)}</pre></section> : null}
        </> : <NotEstimable compact title="구조화 결과가 아직 없습니다" description="작업이 완료되고 Schema 검증을 통과해야 검토 Queue로 이동합니다." />}
      </article>
    </div>
  );
}

export function ReviewDetail({ value }: { value: unknown }) {
  const review = asRecord(value);
  const id = text(review, "reviewId", "review_id", "id") ?? "";
  const revision = nested(review, "proposedRevision", "proposed_revision");
  const researchJob = nested(review, "researchJob", "research_job");
  const baseline = nested(revision, "baselinePayload", "baseline_payload");
  const proposal = nested(revision, "proposedPayload", "proposed_payload");
  const delta = nested(revision, "deltaSummary", "delta_summary");
  const comparison = nested(delta, "comparison");
  const denominatorComparison = nested(comparison, "denominator");
  const valueComparison = nested(comparison, "value");
  const intervalComparison = nested(comparison, "interval");
  const intervalChange = nested(intervalComparison, "absoluteChange", "absolute_change");
  const confidenceComparison = nested(delta, "confidence");
  const baselineConfidence = nested(confidenceComparison, "baseline");
  const proposedConfidence = nested(confidenceComparison, "proposed");
  const sources = recordList(proposal, "sources");
  const sourceFreshness = recordList(delta, "sourceFreshness", "source_freshness");
  const citations = recordList(proposal, "citations");
  const limitations = stringList(proposal, "limitations");
  const factors = recordList(proposal, "factors", "proposedFactors", "proposed_factors");
  const proposedInterval = nested(proposal, "lowBaseHigh", "low_base_high");
  const baselineInterval = nested(baseline, "lowBaseHigh", "low_base_high");
  const expectedRecalculation = nested(revision, "expectedRecalculation", "expected_recalculation");
  const affectedValue = revision.affectedSegments ?? revision.affected_segments;
  const affected = Array.isArray(affectedValue) ? affectedValue : [];
  const reviewable = ["pending", "in_review", "changes_requested"].includes(status(review) ?? "");
  const reviewScalar = (record: DataRecord, ...keys: string[]) => {
    const numeric = number(record, ...keys);
    if (numeric !== null) return new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 6 }).format(numeric);
    return text(record, ...keys) ?? "미산정";
  };
  const reviewInterval = (record: DataRecord) => {
    const values = ["low", "base", "high"].map((key) => reviewScalar(record, key));
    return values.every((item) => item === "미산정") ? "미산정" : values.join(" / ");
  };
  const signedScalar = (record: DataRecord, ...keys: string[]) => {
    const numeric = number(record, ...keys);
    if (numeric === null) return "비교 불가";
    const formatted = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 6 }).format(numeric);
    return numeric > 0 ? `+${formatted}` : formatted;
  };
  const comparisonLabels: Record<string, string> = {
    comparable: "비교 가능",
    baseline_unavailable: "Baseline 값 없음",
    proposed_unavailable: "제안 값 없음",
    baseline_non_numeric: "Baseline 비수치",
    proposed_non_numeric: "제안 비수치",
    denominator_unavailable: "분모 미확인",
    denominator_mismatch: "분모 불일치",
    matching: "분모 일치",
    mismatch: "분모 불일치",
    unavailable: "분모 미확인",
  };
  const freshnessLabels: Record<string, string> = {
    current: "최신",
    aging: "경과",
    stale: "오래됨",
    future_dated: "미래 날짜 확인 필요",
    unavailable: "신선도 미산정",
  };
  const baselineValue = reviewScalar(valueComparison, "baseline") !== "미산정"
    ? reviewScalar(valueComparison, "baseline")
    : reviewScalar(baseline, "value", "base");
  const proposedValue = reviewScalar(valueComparison, "proposed") !== "미산정"
    ? reviewScalar(valueComparison, "proposed")
    : reviewScalar(proposedInterval, "base");
  const confidenceText = (record: DataRecord) => {
    const score = number(record, "score");
    const grade = text(record, "grade");
    if (score === null && !grade) return "미산정";
    return `${score === null ? "점수 미산정" : `${score.toFixed(2)} / 100`}${grade ? ` · ${grade}` : ""}`;
  };
  return (
    <div className="page-stack">
      <PageHeading eyebrow="HUMAN REVIEW" title={text(researchJob, "researchQuestion", "research_question") ?? text(revision, "targetRecordKey", "target_record_key") ?? label(review)} description="승인 전 Proposed Revision은 Production Baseline에 반영되지 않습니다." actions={<StatusBadge value={status(review)} />} />
      <div className="revision-diff">
        <article><header><span>CANONICAL BASELINE</span><StatusBadge value={text(baseline, "status") ?? "input_locked"} /></header><strong>{baselineValue}</strong><p>{text(baseline, "definition", "sourceTitle", "source_title", "segmentTitle", "segment_title") ?? "생성 시점 input payload"}</p><small>Low / Base / High · {reviewInterval(baselineInterval)}</small><small>{text(revision, "baselineDataVersion", "baseline_data_version") ?? text(baseline, "version", "dataVersion", "data_version") ?? "버전 미확인"}</small></article>
        <Scale aria-hidden="true" />
        <article className="proposal"><header><span>PROPOSED REVISION</span><StatusBadge value={status(revision)} /></header><strong>{proposedValue}</strong><p>{text(proposal, "inferenceMethod", "inference_method", "rationale") ?? "추론 방법 미확인"}</p><small>Low / Base / High · {reviewInterval(proposedInterval)}</small><small>{text(proposal, "referenceYear", "reference_year") ?? "기준연도 미확인"} · {text(proposal, "denominator") ?? "분모 미확인"}</small></article>
      </div>
      <div className="detail-grid">
        <article className="panel"><SectionHeading eyebrow="BASELINE & PROPOSAL" title="비교 기준과 산출 방법" /><KeyValueList rows={[
          { label: "Canonical Baseline 값", value: baselineValue },
          { label: "Canonical Low / Base / High", value: reviewInterval(baselineInterval) },
          { label: "Proposed 값", value: proposedValue },
          { label: "Proposed Low / Base / High", value: reviewInterval(proposedInterval) },
          { label: "Baseline 분모", value: text(denominatorComparison, "baseline") ?? text(baseline, "denominator") ?? "미확인" },
          { label: "Proposed 분모", value: text(denominatorComparison, "proposed") ?? text(proposal, "denominator") ?? "미확인" },
          { label: "분모 비교", value: comparisonLabels[text(denominatorComparison, "status") ?? ""] ?? "미확인" },
          { label: "단위", value: text(baseline, "unit") ?? "미확인" },
          { label: "산식 / 추론 방법", value: text(proposal, "formula", "inferenceMethod", "inference_method") ?? "미등록" },
        ]} />{factors.length ? <div className="impact-list">{factors.map((factor, index) => <div key={`${text(factor, "name")}-${index}`}><span>{text(factor, "name") ?? `Factor ${index + 1}`}</span><strong>{reviewInterval(nested(factor, "interval"))} · {text(factor, "observationClass", "observation_class") ?? "관측 유형 미확인"}</strong></div>)}</div> : null}</article>
        <article className="panel"><SectionHeading eyebrow="ACTUAL DELTA" title="변경량" /><KeyValueList rows={[
          { label: "값 비교 상태", value: comparisonLabels[text(valueComparison, "status") ?? ""] ?? "미확인" },
          { label: "절대 변화", value: signedScalar(valueComparison, "absoluteChange", "absolute_change") },
          { label: "상대 변화율", value: number(valueComparison, "relativeChangePercent", "relative_change_percent") === null ? "비교 불가" : `${signedScalar(valueComparison, "relativeChangePercent", "relative_change_percent")}%` },
          { label: "구간 비교 상태", value: comparisonLabels[text(intervalComparison, "status") ?? ""] ?? "미확인" },
          { label: "Low 변화", value: signedScalar(intervalChange, "low") },
          { label: "Base 변화", value: signedScalar(intervalChange, "base") },
          { label: "High 변화", value: signedScalar(intervalChange, "high") },
        ]} /><SectionHeading eyebrow="CONFIDENCE" title="신뢰도 전후 변화" /><KeyValueList rows={[
          { label: "Baseline", value: confidenceText(baselineConfidence) },
          { label: "Proposed", value: confidenceText(proposedConfidence) },
          { label: "점수 변화", value: signedScalar(confidenceComparison, "scoreChange", "score_change") },
          { label: "등급 변경", value: boolean(confidenceComparison, "gradeChanged", "grade_changed") === null ? "비교 불가" : boolean(confidenceComparison, "gradeChanged", "grade_changed") ? "변경됨" : "변경 없음" },
        ]} /></article>
      </div>
      <div className="detail-grid">
        <article className="panel"><SectionHeading eyebrow="IMPACT" title="영향 세그먼트와 예상 재계산" /><KeyValueList rows={[
          { label: "제안 영향 세그먼트 수", value: number(expectedRecalculation, "affectedSegmentCount", "affected_segment_count")?.toLocaleString("ko-KR") ?? affected.length.toLocaleString("ko-KR") },
          { label: "재계산 자격", value: text(expectedRecalculation, "eligibilityStatus", "eligibility_status") === "eligible" ? "계산 의존성 확인됨" : text(expectedRecalculation, "eligibilityStatus", "eligibility_status") === "no_affected_segments" ? "영향 세그먼트 없음" : "materialized 계산 의존성 미확인" },
          { label: "Invalidation 필요", value: boolean(expectedRecalculation, "invalidationRequired", "invalidation_required") === null ? "미확인" : boolean(expectedRecalculation, "invalidationRequired", "invalidation_required") ? "필요" : "불필요" },
          { label: "재계산 필요", value: boolean(expectedRecalculation, "recalculationRequired", "recalculation_required") === null ? "미확인" : boolean(expectedRecalculation, "recalculationRequired", "recalculation_required") ? "필요" : "불필요" },
          { label: "승인 후 Trigger", value: text(expectedRecalculation, "trigger") ?? "없음" },
          { label: "예상 작업", value: text(expectedRecalculation, "expectedAction", "expected_action") ?? "없음" },
        ]} /><SectionHeading eyebrow="AFFECTED" title="영향받는 세그먼트 ID" />{affected.length ? <div className="impact-list">{affected.map((item, index) => { const record = asRecord(item); const name = typeof item === "string" ? item : label(record); return <div key={typeof item === "string" ? item : identifier(record) ?? index}><span>{name}</span><strong>{typeof item === "string" ? "재계산 대상" : text(record, "change", "delta", "impact") ?? "재계산 대상"}</strong></div>; })}</div> : <DataUnavailable message="영향받는 세그먼트가 없어 invalidation과 재계산이 필요하지 않습니다." />}</article>
        <article className="panel"><SectionHeading eyebrow="LIMITATIONS" title="한계" />{limitations.length ? <ul className="caveat-list">{limitations.map((item) => <li key={item}>{item}</li>)}</ul> : <DataUnavailable message="명시된 한계가 없습니다." />}</article>
      </div>
      <article className="panel"><SectionHeading eyebrow="SOURCE CLAIMS" title={`출처 ${sources.length}건 · 주장 ${citations.length}건`} />{sources.length ? <ol className="report-sources">{sources.map((source, index) => { const freshness = sourceFreshness.find((item) => number(item, "sourceIndex", "source_index") === index) ?? {}; const freshnessStatus = text(freshness, "status"); const sourceUrl = text(source, "url"); return <li key={`${sourceUrl}-${index}`}><strong>[{index}] {text(source, "title") ?? "제목 미확인"}</strong><span>{text(source, "institution") ?? "기관 미확인"} · 기준연도 {text(source, "referenceYear", "reference_year") ?? "미확인"} · {freshnessLabels[freshnessStatus ?? ""] ?? "신선도 미산정"}</span><small>발행 {text(freshness, "publicationDate", "publication_date") ?? text(source, "publicationDate", "publication_date") ?? "미확인"} · 접근 {text(freshness, "accessedAt", "accessed_at") ?? text(source, "accessedAt", "accessed_at") ?? "미확인"}</small><small>발행 후 {number(freshness, "daysSincePublication", "days_since_publication")?.toLocaleString("ko-KR") ?? "?"}일 · 기준연도 후 {number(freshness, "yearsSinceReference", "years_since_reference")?.toLocaleString("ko-KR") ?? "?"}년 · 접근 후 {number(freshness, "daysSinceAccess", "days_since_access")?.toLocaleString("ko-KR") ?? "?"}일</small><small>{text(source, "locator") ?? "locator 미확인"}</small>{sourceUrl ? <a className="text-link" href={sourceUrl} target="_blank" rel="noreferrer">원문</a> : null}</li>; })}</ol> : <DataUnavailable message="출처가 없습니다." />}{citations.length ? <ul className="caveat-list">{citations.map((citation, index) => <li key={index}>[{number(citation, "sourceIndex", "source_index") ?? "?"}] {text(citation, "claim") ?? "주장 미확인"}</li>)}</ul> : null}</article>
      <article className="panel"><SectionHeading eyebrow="DECISION" title="검토 결정" />{reviewable ? <ReviewActions reviewId={id} defaultModificationJson={prettyJson(proposal)} /> : <DataUnavailable message="이미 종료된 검토 항목입니다." />}</article>
    </div>
  );
}

export function GovernanceOverviewView({ overviewValue, sourceValue, modelValue, versionValue }: { overviewValue: unknown; sourceValue: unknown; modelValue: unknown; versionValue: unknown }) {
  const overview = asRecord(overviewValue);
  const sources = records(sourceValue, ["sources"]);
  const models = records(modelValue, ["models"]);
  const versions = records(versionValue, ["versions"]);
  return (
    <div className="page-stack">
      <PageHeading eyebrow="DATA GOVERNANCE" title="데이터·출처·신뢰도·버전 관리" description="Baseline 상태와 Proposed Revision, 승인 이력 및 validation gap을 한곳에서 검토합니다." actions={<Link href="/governance/audit" className="button"><History aria-hidden="true" /> 감사 로그</Link>} />
      <div className="metric-strip governance-metrics">
        <Metric label="현재 버전" value={text(overview, "currentVersion", "current_version", "version") ?? "미확인"} />
        <Metric label="등록 출처" value={(number(overview, "sourceCount", "source_count") ?? sources.length).toLocaleString("ko-KR")} />
        <Metric label="Segmentation model" value={(number(overview, "modelCount", "model_count") ?? models.length).toLocaleString("ko-KR")} />
        <Metric label="Validation gap" value={number(overview, "validationGapCount", "validation_gap_count")?.toLocaleString("ko-KR") ?? "미확인"} state={number(overview, "validationGapCount", "validation_gap_count") ? "warning" : "default"} />
      </div>
      <div className="governance-directory-grid">
        <GovernanceDirectory title="출처와 자료" eyebrow="SOURCE CATALOG" items={sources} hrefBase="/governance/sources" icon={<BookOpenText aria-hidden="true" />} maxItems={6} />
        <GovernanceDirectory title="모델 Registry" eyebrow="MODEL REGISTRY" items={models} hrefBase="/governance/models" icon={<BarChart3 aria-hidden="true" />} maxItems={50} />
        <GovernanceDirectory title="승인 버전" eyebrow="VERSION HISTORY" items={versions} hrefBase="/governance/versions" icon={<FileClock aria-hidden="true" />} maxItems={6} />
      </div>
      <article className="panel"><SectionHeading eyebrow="VALIDATION" title="현재 데이터 상태" /><KeyValueList rows={[
        { label: "기준시점", value: text(overview, "dataAsOf", "data_as_of") ?? "미확인" },
        { label: "마지막 검증", value: text(overview, "lastValidatedAt", "last_validated_at") ?? "미확인" },
        { label: "Migration", value: text(overview, "migrationStatus", "migration_status") === "ready" ? "적용 완료" : "점검 필요" },
        { label: "Checksum", value: text(overview, "checksumStatus", "checksum_status") === "verified" ? "검증 완료" : text(overview, "checksumStatus", "checksum_status") === "not_available" ? "검증 자료 없음" : "점검 필요" },
      ]} /></article>
    </div>
  );
}

const AUDIT_ACTION_LABELS: Record<string, string> = {
  create: "생성",
  update: "수정",
  calculate: "시장규모 계산",
  pin_result_version: "결과 Snapshot 고정",
  new_version: "새 버전 저장",
  approve: "승인",
  approve_modified: "수정 후 승인",
  reject: "반려",
  keep_baseline: "기존 값 유지",
  request_more_research: "추가 조사 요청",
  append_ai_hypothesis: "AI 가설 버전 추가",
};

const AUDIT_TARGET_LABELS: Record<string, string> = {
  opportunity: "Opportunity",
  opportunity_content_version: "Opportunity 가설 버전",
  segment_query_result: "시장규모 결과",
  saved_segment: "저장 세그먼트",
  market_scenario: "시장 시나리오",
  research_job: "리서치 작업",
  review_item: "검토 항목",
  comparison_workspace: "비교 Workspace",
};

function GovernanceDirectory({ title: directoryTitle, eyebrow, items, hrefBase, icon, maxItems }: { title: string; eyebrow: string; items: DataRecord[]; hrefBase: string; icon: ReactNode; maxItems: number }) {
  return (
    <section className="panel governance-directory">
      <SectionHeading eyebrow={eyebrow} title={directoryTitle} />
      <div className="governance-directory-icon">{icon}</div>
      {items.length ? <div>{items.slice(0, maxItems).map((item, index) => { const id = identifier(item) ?? text(item, "code") ?? String(index); const itemStatus = status(item); return <Link href={`${hrefBase}/${encodeURIComponent(id)}`} key={id}><span><strong>{label(item)}</strong><small>{itemStatus ? statusDisplayLabel(itemStatus) : text(item, "institution", "version") ?? "상태 미확인"}</small></span><ArrowRight aria-hidden="true" /></Link>; })}</div> : <p className="muted">등록된 항목이 없습니다.</p>}
      {items.length > maxItems ? <p className="muted">전체 {items.length.toLocaleString("ko-KR")}건 중 최근 {maxItems.toLocaleString("ko-KR")}건을 표시합니다.</p> : null}
    </section>
  );
}

export function GovernanceRecordDetail({ value, kind }: { value: unknown; kind: "source" | "model" | "version" }) {
  const record = asRecord(value);
  const headings = { source: ["SOURCE RECORD", "출처 상세"], model: ["MODEL RECORD", "모델 상세"], version: ["APPROVED VERSION", "버전 상세"] } as const;
  const gaps = stringList(record, "gaps", "validationGaps", "validation_gaps", "limitations");
  return (
    <div className="page-stack">
      <PageHeading eyebrow={headings[kind][0]} title={label(record) || headings[kind][1]} description={description(record)} actions={<StatusBadge value={status(record)} />} />
      <div className="detail-grid">
        <article className="panel"><SectionHeading eyebrow="IDENTITY" title="레코드 정보" /><KeyValueList rows={[
          { label: "식별자", value: identifier(record) ?? "미확인" },
          { label: "기관", value: text(record, "institution", "organization") ?? "미확인" },
          { label: "기준연도", value: text(record, "referenceYear", "reference_year", "period") ?? "미확인" },
          { label: "공표일", value: text(record, "publishedAt", "published_at") ?? "미확인" },
          { label: "접근일", value: text(record, "accessedAt", "accessed_at") ?? "미확인" },
          { label: "버전", value: text(record, "version", "modelVersion", "model_version") ?? "미확인" },
        ]} /></article>
        <article className="panel"><SectionHeading eyebrow="INTEGRITY" title="무결성과 재검토" /><KeyValueList rows={[
          { label: "Checksum", value: text(record, "checksum", "sha256", "artifactSha256", "artifact_sha256") ?? "미확인" },
          { label: "신뢰도", value: <ConfidenceBadge record={record} /> },
          { label: "재검토 예정", value: text(record, "reviewDueAt", "review_due_at", "expiresAt", "expires_at") ?? "미확인" },
          { label: "사용 위치", value: text(record, "usedBy", "used_by", "usage") ?? "미확인" },
        ]} /></article>
      </div>
      {gaps.length ? <article className="panel"><SectionHeading eyebrow="VALIDATION GAPS" title="추가 검증 항목" /><ul className="caveat-list">{gaps.map((gap) => <li key={gap}>{gap}</li>)}</ul></article> : null}
      <EvidencePanel record={record} />
    </div>
  );
}

export function AuditLogView({ value }: { value: unknown }) {
  const logs = records(value, ["logs", "auditLogs", "audit_logs"]);
  return (
    <div className="page-stack">
      <PageHeading eyebrow="AUDIT LOG" title="변경·승인·반려 이력" description="사용자 mutation과 데이터 버전 변경을 시간순으로 확인합니다." />
      {logs.length ? <div className="data-table-wrap"><table className="data-table"><caption className="sr-only">Governance 감사 로그</caption><thead><tr><th>시각</th><th>행위</th><th>대상</th><th>이전 상태</th><th>새 상태</th><th>수행자</th></tr></thead><tbody>{logs.map((log, index) => { const previous = text(log, "previousStatus", "previous_status"); const next = text(log, "newStatus", "new_status"); const action = text(log, "action", "eventType", "event_type"); const targetType = text(log, "targetType", "target_type"); return <tr key={identifier(log) ?? index}><td>{text(log, "createdAt", "created_at") ?? "미확인"}</td><td><strong>{AUDIT_ACTION_LABELS[action ?? ""] ?? "변경"}</strong></td><td>{AUDIT_TARGET_LABELS[targetType ?? ""] ?? "데이터 객체"}<small>{text(log, "targetId", "target_id") ?? ""}</small></td><td>{previous ? statusDisplayLabel(previous) : "—"}</td><td>{next ? statusDisplayLabel(next) : "—"}</td><td>{text(log, "actor", "reviewer") ? "워크벤치 운영자" : "시스템"}</td></tr>; })}</tbody></table></div> : <EmptyState title="감사 로그가 없습니다" description="변경 이력이 없는 경우 빈 상태를 그대로 표시합니다." />}
    </div>
  );
}

export function PrintableReport({ value }: { value: unknown }) {
  const snapshot = asRecord(value);
  const sources = recordList(snapshot, "sources", "sourcesJson", "sources_json", "citations");
  const factors = factorRows(snapshot);
  return (
    <main className="print-report">
      <header className="print-report-header"><div><p>MARKET ATLAS · ESTIMATE SNAPSHOT</p><h1>{label(snapshot)}</h1><span>{text(snapshot, "generatedAt", "generated_at", "createdAt", "created_at") ?? "생성시각 미확인"}</span></div><div><strong>{text(snapshot, "version", "modelVersion", "model_version") ?? "버전 미확인"}</strong><StatusBadge value={status(snapshot)} /></div></header>
      <section><SectionHeading title="시장규모" /><EstimateMetrics record={snapshot} /></section>
      <section><SectionHeading title="정의와 산식" /><KeyValueList rows={[
        { label: "대상 단위", value: unitLabel(entityUnit(snapshot)) },
        { label: "지역", value: text(snapshot, "geography", "geographyCode", "geography_code") ?? "미확인" },
        { label: "기준기간", value: text(snapshot, "referencePeriod", "reference_period", "referenceYear", "reference_year", "period") ?? "미확인" },
        { label: "시장 시나리오 선택", value: scenarioSelectionLabel(text(snapshot, "marketScenarioSelectionMode", "market_scenario_selection_mode")) },
        { label: "선택 시나리오 ID", value: text(snapshot, "selectedMarketScenarioId", "selected_market_scenario_id") ?? "미선택" },
        { label: "선택 시나리오 버전", value: text(snapshot, "selectedMarketScenarioVersion", "selected_market_scenario_version") ?? "미선택" },
        { label: "산식", value: text(snapshot, "formula") ?? "미등록" },
        { label: "방법", value: methodDisplayLabel(text(snapshot, "method", "methodCode", "method_code", "inferenceMethod", "inference_method")) },
      ]} /></section>
      <section><SectionHeading title="Factor" />{factors.length ? <div className="data-table-wrap"><table className="data-table"><caption className="sr-only">인쇄 보고서 Factor와 provenance</caption><thead><tr><th>Factor</th><th>Low</th><th>Base</th><th>High</th><th>Evidence ID</th><th>직접성</th><th>기준기간</th><th>조정 사유</th></tr></thead><tbody>{factors.map((factor, index) => <tr key={identifier(factor) ?? index}><td>{factorDisplayLabel(factor)}<small>{label(factor)} · {factorOperationLabel(factor)}</small></td><td>{factorValue(factor, "low", "value_low")}</td><td>{factorValue(factor, "base", "value_base")}</td><td>{factorValue(factor, "high", "value_high")}</td><td>{text(factor, "evidenceId", "evidence_id") ?? "미연결"}</td><td>{statusDisplayLabel(text(factor, "directnessClass", "directness_class", "observationType", "observation_type"))}</td><td>{factorReferencePeriod(factor)}</td><td>{factorAdjustmentReason(factor)}</td></tr>)}</tbody></table></div> : <NotEstimable compact title="Factor 없음" description="산식에 연결된 Factor가 없습니다." />}</section>
      <section><SectionHeading title="출처" />{sources.length ? <ol className="report-sources">{sources.map((source, index) => {
        const sourceUrl = text(source, "url", "officialUrl", "official_url");
        const referenceStart = text(source, "referencePeriodStart", "reference_period_start");
        const referenceEnd = text(source, "referencePeriodEnd", "reference_period_end");
        const referencePeriod = referenceStart && referenceEnd
          ? `${referenceStart}–${referenceEnd}`
          : referenceEnd ?? referenceStart ?? text(source, "referencePeriod", "reference_period", "referenceYear", "reference_year") ?? "기준기간 미확인";
        return <li key={identifier(source) ?? index}><strong>{text(source, "title", "datasetTitle", "dataset_title", "sourceTitle", "source_title") ?? label(source)}</strong><span>{text(source, "institution", "publisher") ?? "기관 미확인"} · {referencePeriod}</span><small>Release {text(source, "releaseId", "release_id") ?? "미확인"} · {text(source, "versionLabel", "version_label") ?? "버전 미확인"} · checksum {text(source, "checksum") ?? "미확인"}</small>{sourceUrl ? <a className="text-link" href={sourceUrl}>원문 출처</a> : null}</li>;
      })}</ol> : <DataUnavailable message="연결된 출처가 없습니다." />}</section>
      <footer><p>이 보고서는 저장된 estimate snapshot을 기준으로 생성되었습니다. Baseline 이후 변경과 사용자 시나리오는 별도로 확인하세요.</p><span>{identifier(snapshot) ?? "snapshot id 미확인"}</span></footer>
    </main>
  );
}
