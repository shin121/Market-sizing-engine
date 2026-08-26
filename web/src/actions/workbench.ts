"use server";

import { revalidatePath } from "next/cache";

import { parseMarketScenarioSelection } from "@/domain/market-scenario-selection";
import {
  calculateEstimate,
  interpretNaturalLanguage,
  saveSegment,
  type InterpretationResult,
} from "@/server/services/segment-workflow";
import { saveComparison, saveMarketScenario, saveOpportunity } from "@/server/services/workbench-mutations";
import {
  cancelResearchJob,
  createResearchJob,
  requeueResearchJob,
  reviewRevision,
  type ReviewAction,
} from "@/server/services/research-workflow";

export interface WorkbenchActionResult {
  ok: boolean;
  id?: string;
  error?: string;
  configurationRequired?: boolean;
  interpretation?: InterpretationResult;
}

function value(formData: FormData, key: string): string | null {
  const raw = formData.get(key);
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

function required(formData: FormData, key: string): string {
  const found = value(formData, key);
  if (!found) throw new Error(`${key}_required`);
  return found;
}

function json(formData: FormData, key: string, fallback: unknown = null): unknown {
  const raw = value(formData, key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new Error(`${key}_invalid_json`);
  }
}

function selectionField(formData: FormData, key: string): unknown {
  const values = formData.getAll(key);
  if (values.length === 0) return undefined;
  if (values.length === 1) return values[0];
  return values;
}

function errorResult(error: unknown): WorkbenchActionResult {
  if (error instanceof Error) {
    if (Array.isArray((error as Error & { issues?: unknown[] }).issues)) {
      return { ok: false, error: "조건 값 또는 논리 구조를 다시 확인하세요." };
    }
    const safe = error.message.replace(/[\r\n]+/g, " ").slice(0, 500);
    if (safe.startsWith("segment_validation_failed:")) {
      const messages: Record<string, string> = {
        entity_unit_mismatch: "대상 단위와 다른 단위의 조건이 포함되어 있습니다.",
        duplicate_condition: "동일한 조건이 중복되었습니다.",
        mutually_exclusive_condition: "동시에 성립할 수 없는 조건이 포함되어 있습니다.",
        unresolved_condition: "확정되지 않은 조건은 추가 조사 또는 명시적 선택이 필요합니다.",
        invalid_business_person_combination: "사업체 속성과 개인 직업 조건은 단위 변환 근거 없이 결합할 수 없습니다.",
        empty_enabled_group: "활성 조건 그룹에는 활성 조건 또는 하위 그룹이 하나 이상 필요합니다.",
        not_group_requires_exactly_one_enabled_child: "활성 NOT 그룹에는 활성 조건 또는 하위 그룹이 정확히 하나 필요합니다.",
      };
      const details = safe.slice("segment_validation_failed:".length)
        .split(",")
        .map((code) => messages[code] ?? code)
        .filter((message, index, all) => all.indexOf(message) === index);
      return { ok: false, error: details.join(" ") || "세그먼트 조건을 다시 확인하세요." };
    }
    if (safe === "research_variable_already_calculable_from_existing_data") {
      return {
        ok: false,
        error: "이미 산정된 대상 변수입니다. 기존 계산을 사용하거나 Baseline을 unavailable/not_estimable로 확인하세요.",
      };
    }
    if (safe === "baseline_status_value_conflict") {
      return {
        ok: false,
        error: "Baseline 상태가 미산정/사용 불가인데 값이 함께 제공되었습니다. 상태와 값을 일치시켜 주세요.",
      };
    }
    if (safe === "opportunity_edit_conflict") {
      return {
        ok: false,
        error: "다른 편집자가 먼저 저장했습니다. 최신 내용을 새로고침한 뒤 변경사항을 다시 적용하세요.",
      };
    }
    if (safe === "opportunity_expected_version_required") {
      return {
        ok: false,
        error: "편집 기준 버전을 확인할 수 없습니다. 페이지를 새로고침한 뒤 다시 저장하세요.",
      };
    }
    if (safe.startsWith("OPENAI_RESEARCH_ENABLED=true")) {
      return {
        ok: false,
        error: "외부 AI Research가 아직 활성화되지 않았습니다. 서버 설정과 외부 전송 승인을 먼저 확인하세요.",
      };
    }
    return { ok: false, error: safe || "workbench_action_failed" };
  }
  return { ok: false, error: "workbench_action_failed" };
}

export async function interpretSegmentAction(formData: FormData): Promise<WorkbenchActionResult> {
  try {
    const interpretation = await interpretNaturalLanguage(required(formData, "natural_language"));
    return { ok: true, interpretation };
  } catch (error) {
    return errorResult(error);
  }
}

export async function saveSegmentAction(formData: FormData): Promise<WorkbenchActionResult> {
  try {
    const id = await saveSegment({
      segmentId: value(formData, "segment_id"),
      name: required(formData, "name"),
      entityUnit: required(formData, "entity_unit"),
      naturalLanguage: value(formData, "natural_language"),
      conditions: json(formData, "conditions_json", []),
    });
    revalidatePath("/builder");
    return { ok: true, id };
  } catch (error) {
    return errorResult(error);
  }
}

export async function calculateEstimateAction(formData: FormData): Promise<WorkbenchActionResult> {
  try {
    const id = await calculateEstimate({
      segmentId: value(formData, "segment_id"),
      name: required(formData, "name"),
      entityUnit: required(formData, "entity_unit"),
      conditions: json(formData, "conditions_json", []),
    });
    revalidatePath("/sizing");
    revalidatePath("/builder");
    return { ok: true, id };
  } catch (error) {
    return errorResult(error);
  }
}

export async function saveScenarioAction(formData: FormData): Promise<WorkbenchActionResult> {
  try {
    const id = await saveMarketScenario({
      scenarioId: value(formData, "scenario_id"),
      estimateId: required(formData, "estimate_id"),
      queryResultId: value(formData, "query_result_id"),
      name: required(formData, "name"),
      factors: json(formData, "factors_json", {}),
    });
    revalidatePath("/sizing");
    return { ok: true, id };
  } catch (error) {
    return errorResult(error);
  }
}

export async function saveComparisonAction(formData: FormData): Promise<WorkbenchActionResult> {
  try {
    const rawIds = json(formData, "segment_ids_json", []);
    if (!Array.isArray(rawIds) || !rawIds.every((item) => typeof item === "string")) {
      throw new Error("segment_ids_json_must_be_string_array");
    }
    const id = await saveComparison({
      comparisonId: value(formData, "comparison_id"),
      name: required(formData, "name"),
      segmentIds: rawIds,
    });
    revalidatePath("/compare");
    return { ok: true, id };
  } catch (error) {
    return errorResult(error);
  }
}

function opportunityInput(formData: FormData) {
  return {
    opportunityId: value(formData, "opportunity_id"),
    expectedLockVersion: value(formData, "expected_lock_version"),
    boardId: value(formData, "board_id"),
    segmentId: value(formData, "segment_id"),
    estimateSnapshotId: value(formData, "estimate_snapshot_id"),
    name: required(formData, "name"),
    problem: required(formData, "problem"),
    hypothesis: required(formData, "hypothesis"),
    idea: required(formData, "idea"),
    revenueModel: value(formData, "revenue_model"),
    price: value(formData, "price"),
    channels: value(formData, "channels") ?? [],
    competingAlternatives: value(formData, "competing_alternatives") ?? [],
    assumptions: value(formData, "assumptions") ?? [],
    nextExperiment: value(formData, "next_experiment"),
    status: value(formData, "status") ?? "discovered",
    notes: value(formData, "notes"),
    score: json(formData, "score_json", null),
    experiment: json(formData, "experiment_json", null),
  };
}

export async function createOpportunityAction(formData: FormData): Promise<WorkbenchActionResult> {
  try {
    const input = opportunityInput(formData);
    input.opportunityId = null;
    const id = await saveOpportunity(input);
    revalidatePath("/opportunities");
    return { ok: true, id };
  } catch (error) {
    return errorResult(error);
  }
}

export async function updateOpportunityAction(formData: FormData): Promise<WorkbenchActionResult> {
  try {
    const input = opportunityInput(formData);
    input.opportunityId = required(formData, "opportunity_id");
    const id = await saveOpportunity(input);
    revalidatePath("/opportunities");
    return { ok: true, id };
  } catch (error) {
    return errorResult(error);
  }
}

export async function createResearchJobAction(formData: FormData): Promise<WorkbenchActionResult> {
  try {
    const result = await createResearchJob({
      segmentId: value(formData, "segment_id"),
      targetSegment: required(formData, "target_segment"),
      targetVariable: required(formData, "target_variable"),
      researchQuestion: required(formData, "research_question"),
      baseline: json(formData, "baseline_json", undefined),
    });
    revalidatePath("/research");
    return { ok: true, id: result.id, configurationRequired: result.configurationRequired };
  } catch (error) {
    return errorResult(error);
  }
}

export async function cancelResearchJobAction(formData: FormData): Promise<WorkbenchActionResult> {
  try {
    const id = required(formData, "job_id");
    await cancelResearchJob(id);
    revalidatePath("/research");
    return { ok: true, id };
  } catch (error) {
    return errorResult(error);
  }
}

export async function requeueResearchJobAction(formData: FormData): Promise<WorkbenchActionResult> {
  try {
    const id = required(formData, "job_id");
    await requeueResearchJob(id);
    revalidatePath("/research");
    revalidatePath(`/research/jobs/${id}`);
    return { ok: true, id };
  } catch (error) {
    return errorResult(error);
  }
}

const REVIEW_ACTIONS = new Set<ReviewAction>([
  "approve",
  "approve_modified",
  "reject",
  "request_more_research",
  "keep_baseline",
]);

export async function reviewRevisionAction(formData: FormData): Promise<WorkbenchActionResult> {
  try {
    const decision = required(formData, "decision") as ReviewAction;
    if (!REVIEW_ACTIONS.has(decision)) throw new Error("invalid_review_decision");
    const id = await reviewRevision({
      reviewId: required(formData, "review_id"),
      decision,
      modification: decision === "approve_modified" ? json(formData, "modification_json", null) : undefined,
      note: required(formData, "note"),
    });
    revalidatePath("/research");
    revalidatePath("/governance");
    return { ok: true, id };
  } catch (error) {
    return errorResult(error);
  }
}

export async function exportSnapshotAction(formData: FormData): Promise<WorkbenchActionResult> {
  try {
    const snapshotId = required(formData, "snapshot_id");
    const format = required(formData, "format");
    if (!["csv", "json", "print"].includes(format)) throw new Error("unsupported_export_format");
    const kind = value(formData, "snapshot_kind") ?? "estimate";
    const parsedSelection = parseMarketScenarioSelection({
      scenarioId: selectionField(formData, "scenario_id"),
      scenarioVersion: selectionField(formData, "scenario_version"),
      scenarioSelectionMode: selectionField(formData, "scenario_selection_mode"),
    });
    if (!parsedSelection.ok) throw new Error("invalid_market_scenario_selection");
    if (kind !== "estimate" && parsedSelection.selection) {
      throw new Error("market_scenario_selection_only_supported_for_estimate");
    }
    const query = new URLSearchParams({ kind, format });
    if (parsedSelection.selection) {
      query.set("scenarioId", parsedSelection.selection.scenarioId);
      query.set("scenarioVersion", parsedSelection.selection.scenarioVersion);
      query.set("scenarioSelectionMode", parsedSelection.selection.selectionMode ?? "explicit");
    }
    const id = `/api/exports/${encodeURIComponent(snapshotId)}?${query.toString()}`;
    return { ok: true, id };
  } catch (error) {
    return errorResult(error);
  }
}
