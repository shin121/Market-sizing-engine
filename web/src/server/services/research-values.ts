import {
  researchBaselineSchema,
  researchResultSchema,
  type ResearchResult,
} from "@/contracts/research";
import { confidenceComponentsSchema } from "@/domain/confidence";

export type PlainObject = Record<string, unknown>;

const OPPORTUNITY_IDEA_TARGET = /^opportunity_idea_brief:([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;

export function plainObject(value: unknown): PlainObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as PlainObject
    : null;
}

export function requireBaselineObject(value: unknown): PlainObject {
  const baseline = plainObject(value);
  if (!baseline) throw new Error("baseline_json_must_be_an_object");
  return baseline;
}

function text(record: PlainObject, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function scalar(record: PlainObject, ...keys: string[]): string | number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function normalizedInterval(record: PlainObject): PlainObject | null {
  const supplied = plainObject(record.lowBaseHigh ?? record.low_base_high);
  const count = supplied ?? plainObject(record.count) ?? record;
  const low = scalar(count, "low", "countLow", "count_low");
  const base = scalar(count, "base", "countBase", "count_base");
  const high = scalar(count, "high", "countHigh", "count_high");
  return low === null || base === null || high === null ? null : { low, base, high };
}

export function normalizeResearchBaseline(value: unknown): {
  baseline: PlainObject;
  snapshotProvenance: PlainObject | null;
} {
  const source = requireBaselineObject(value);
  const interval = normalizedInterval(source);
  const directValue = scalar(source, "value", "base", "countBase", "count_base")
    ?? scalar(plainObject(source.count) ?? {}, "base");
  const requestedStatus = text(source, "status", "estimateStatus", "estimate_status");
  const status = ["estimated", "not_estimable", "unavailable", "unknown"].includes(requestedStatus ?? "")
    ? requestedStatus
    : directValue !== null || interval !== null ? "estimated" : "unavailable";
  if (status !== "estimated" && (directValue !== null || interval !== null)) {
    throw new Error("baseline_status_value_conflict");
  }
  const normalized = {
    estimateId: text(source, "estimateId", "estimate_id"),
    status,
    value: directValue,
    lowBaseHigh: interval,
    unit: text(source, "unit", "entityUnit", "entity_unit", "primaryEntityUnit", "primary_entity_unit"),
    denominator: text(source, "denominator", "denominatorDefinition", "denominator_definition"),
    definition: text(source, "definition", "description", "segmentTitle", "segment_title", "title")
      ?? (Object.keys(source).length
        ? "제공된 canonical baseline에 별도 정의가 없어 원본 snapshot provenance를 함께 검토해야 한다."
        : "연결되거나 입력된 Baseline이 없어 현재 값은 unavailable이다."),
    sourceTitle: text(source, "sourceTitle", "source_title"),
    version: text(source, "version", "dataVersion", "data_version"),
  };
  const parsed = researchBaselineSchema.safeParse(normalized);
  if (!parsed.success) throw new Error("baseline_json_invalid_for_research_schema");
  return {
    baseline: parsed.data,
    snapshotProvenance: Object.keys(source).length ? source : null,
  };
}

const EMPTY_PROVIDER_CONFIDENCE_COMPONENTS = {
  sourceQuality: 0,
  recency: 0,
  populationFit: 0,
  geographyMatch: 0,
  definitionMatch: 0,
  directObservation: 0,
  proxyStrength: 0,
  dependencySupport: 0,
  sourceConsistency: 0,
  inferenceDirectness: 0,
  modelStability: 0,
  allocationIntegrity: 0,
};

/**
 * Rebuilds the governed ResearchResult from reviewer-editable proposal fields.
 * Previously stored server scores/components are deliberately ignored so that
 * approval can always rerun the authoritative confidence rules.
 */
export function researchResultFromProposedReview(input: {
  proposed: PlainObject;
  baseline: unknown;
  affectedSegments?: unknown;
  researchQuestion?: string | null;
  targetSegment?: string | null;
  targetVariable?: string | null;
}): ResearchResult {
  const { baseline } = normalizeResearchBaseline(input.baseline);
  const providerComponents = confidenceComponentsSchema.safeParse(input.proposed.providerConfidenceComponents);
  const recommendedAction = ["approve", "modify", "research_more", "keep_baseline"].includes(
    String(input.proposed.recommendedAction ?? ""),
  ) ? input.proposed.recommendedAction : "approve";
  const candidate = {
    researchQuestion: input.researchQuestion?.trim() || text(input.proposed, "researchQuestion", "research_question") || "",
    targetSegment: input.targetSegment?.trim() || text(input.proposed, "targetSegment", "target_segment") || "",
    targetVariable: input.targetVariable?.trim() || text(input.proposed, "targetVariable", "target_variable") || "",
    existingBaseline: baseline,
    proposedFactors: input.proposed.factors ?? input.proposed.proposedFactors ?? [],
    lowBaseHigh: input.proposed.lowBaseHigh ?? input.proposed.low_base_high ?? null,
    denominator: input.proposed.denominator ?? "",
    geography: input.proposed.geography ?? "",
    referenceYear: input.proposed.referenceYear ?? input.proposed.reference_year ?? null,
    sources: input.proposed.sources ?? [],
    citations: input.proposed.citations ?? [],
    inferenceMethod: input.proposed.inferenceMethod ?? input.proposed.inference_method ?? "",
    limitations: input.proposed.limitations ?? [],
    confidenceComponents: providerComponents.success
      ? providerComponents.data
      : EMPTY_PROVIDER_CONFIDENCE_COMPONENTS,
    variablesToVerify: input.proposed.variablesToVerify ?? input.proposed.variables_to_verify ?? [],
    affectedSegments: input.affectedSegments ?? [],
    recommendedAction,
    opportunityIdeaBrief: input.proposed.opportunityIdeaBrief ?? input.proposed.opportunity_idea_brief ?? null,
  };
  const parsed = researchResultSchema.safeParse(candidate);
  if (!parsed.success) throw new Error("approved_research_proposal_invalid");
  return parsed.data;
}

export function buildCanonicalResearchPayload(input: {
  researchQuestion: string;
  targetSegment: string;
  targetVariable: string;
  explicitBaseline?: unknown;
  attachedBaseline?: PlainObject | null;
}): PlainObject {
  const hasExplicitBaseline = input.explicitBaseline !== undefined;
  const baselineInput = !hasExplicitBaseline
    ? input.attachedBaseline ?? {}
    : requireBaselineObject(input.explicitBaseline);
  const { baseline, snapshotProvenance: targetVariableProvenance } = normalizeResearchBaseline(baselineInput);
  const snapshotProvenance = hasExplicitBaseline && input.attachedBaseline
    ? {
        targetVariableBaseline: targetVariableProvenance,
        segmentContext: input.attachedBaseline,
      }
    : targetVariableProvenance;
  return {
    researchQuestion: input.researchQuestion,
    targetSegment: input.targetSegment,
    targetVariable: input.targetVariable,
    baseline,
    snapshotProvenance,
  };
}

export interface ResearchReviewFeedback {
  reviewId: string;
  note: string;
  requestedAt: string;
}

export function appendResearchReviewFeedback(
  payload: PlainObject,
  feedback: ResearchReviewFeedback,
): PlainObject {
  const current = Array.isArray(payload.reviewFeedback)
    ? payload.reviewFeedback.filter((item) => plainObject(item) !== null)
    : [];
  return {
    ...payload,
    reviewFeedback: [...current, feedback],
  };
}

export function researchPromptConstraints(payload: PlainObject): string[] {
  const constraints = [
    "Do not mutate the canonical baseline.",
    "Keep denominators and entity units explicit.",
    "Return a null interval when evidence is insufficient.",
  ];
  if (!Array.isArray(payload.reviewFeedback)) return constraints;
  for (const item of payload.reviewFeedback) {
    const feedback = plainObject(item);
    if (typeof feedback?.note === "string" && feedback.note.trim()) {
      constraints.push(`Human reviewer follow-up constraint: ${feedback.note.trim()}`);
    }
  }
  return constraints;
}

export function opportunityIdFromResearchTarget(targetVariable: string): string | null {
  return OPPORTUNITY_IDEA_TARGET.exec(targetVariable)?.[1]?.toLowerCase() ?? null;
}

/**
 * The Research Queue is a gap-resolution path, not a second calculator for a
 * value that the caller has already supplied as an estimated baseline.  A
 * saved-segment snapshot is deliberately not inspected here: it describes the
 * target segment and may be calculable even when the requested variable is
 * not.  Only an explicit baseline for the requested variable can make the job
 * ineligible.
 */
export function assertResearchQueueEligibility(input: {
  targetVariable: string;
  explicitBaseline?: unknown;
}): void {
  if (opportunityIdFromResearchTarget(input.targetVariable)) return;
  if (input.explicitBaseline === undefined) return;
  const { baseline } = normalizeResearchBaseline(input.explicitBaseline);
  if (baseline.status === "estimated") {
    throw new Error("research_variable_already_calculable_from_existing_data");
  }
}

export function collectBaselineSourceIds(baseline: unknown, prefix: "subtype" | "archetype"): string[] {
  const root = plainObject(baseline);
  const snapshot = plainObject(root?.segmentContext ?? root?.segment_context) ?? root;
  if (!snapshot) return [];
  const savedSegmentId = text(snapshot, "savedSegmentId", "saved_segment_id");
  const queryId = text(snapshot, "queryId", "query_id");
  if (!savedSegmentId || !queryId) return [];
  const classes = plainObject(
    snapshot.normalizedConditionClasses ?? snapshot.normalized_condition_classes,
  );
  const conditions = Array.isArray(classes?.[prefix]) ? classes[prefix] : [];
  const found = new Set<string>();
  for (const condition of conditions) {
    const record = plainObject(condition);
    if (!record || record.enabled !== true) continue;
    if ((record.groupEnabled ?? record.group_enabled) !== true) continue;
    if (text(record, "conditionClass", "condition_class")?.toLowerCase() !== prefix) continue;
    const sourceCode = text(record, "sourceCode", "source_code");
    if (!sourceCode?.toLowerCase().startsWith(`${prefix}:`)) continue;
    const id = sourceCode.slice(prefix.length + 1).trim();
    if (id) found.add(id);
  }
  return [...found].sort();
}
