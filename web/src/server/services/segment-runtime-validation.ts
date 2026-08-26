import type { SegmentCondition, SegmentGroup, SegmentValidationIssue } from "@/domain/segment";
import { segmentConditionSchema, validateSegmentDefinition } from "@/domain/segment";

export interface RuntimeCondition {
  id: string;
  namespace: string;
  sourceCode: string;
  operator: SegmentCondition["operator"];
  value: unknown;
  entityUnit: string;
  resolution: string;
  dependencyGroup: string | null;
  referenceYear?: number | null;
  evidenceId?: number | null;
  enabled: boolean;
}

export interface RuntimeConditionGroup {
  logic: "AND" | "OR" | "NOT";
  enabled: boolean;
  conditions: RuntimeCondition[];
  groups?: RuntimeConditionGroup[];
}

function referenceType(condition: RuntimeCondition): SegmentCondition["referenceType"] {
  if (condition.namespace === "core_feature") {
    const code = condition.sourceCode.toLowerCase();
    if (code === "age" || code.includes("age_band") || code.endsWith("_age") || code.endsWith(".age")) return "age";
    if (code.includes("occupation")) return "occupation";
    if (code.includes("income")) return "income";
    if (code.includes("household") || code.includes("child")) return "household";
    if (code.includes("industry") || code.includes("employee") || code.includes("business")) return "business_attribute";
    return "feature";
  }
  if (condition.namespace === "domain_feature") return "behavior";
  if (condition.namespace === "dimension") return "axis";
  if (condition.namespace === "subtype") return "subtype";
  if (condition.namespace === "archetype") return "archetype";
  if (condition.namespace === "geography") return "geography";
  return "consumption_attribute";
}

function conditionNode(condition: RuntimeCondition, targetEntityUnit: string): SegmentCondition {
  const value = condition.operator === "exists"
    ? true
    : typeof condition.value === "string" && ["in", "not_in", "between"].includes(condition.operator)
      ? condition.value.split(/\s*(?:,|\.\.)\s*/u).map((item) => item.trim()).filter(Boolean)
      : condition.value;
  return {
    kind: "condition",
    id: condition.id,
    referenceType: referenceType(condition),
    referenceId: condition.sourceCode,
    featureCode: condition.sourceCode,
    operator: condition.operator,
    value,
    entityUnit: (condition.entityUnit === "all" ? targetEntityUnit : condition.entityUnit) as SegmentCondition["entityUnit"],
    matchStatus: (condition.resolution === "matched" ? "exact" : condition.resolution) as SegmentCondition["matchStatus"],
    enabled: condition.enabled,
    referenceYear: condition.referenceYear ?? null,
    dependencyGroup: condition.dependencyGroup,
    evidenceId: condition.evidenceId ?? null,
  };
}

export function validateRuntimeConditionGroups(input: {
  name: string;
  entityUnit: string;
  naturalLanguage?: string | null;
  groups: RuntimeConditionGroup[];
}): SegmentValidationIssue[] {
  let groupSequence = 0;
  const invalidConditionIssues: SegmentValidationIssue[] = [];
  function groupNode(group: RuntimeConditionGroup, parentEnabled = true): SegmentGroup {
    groupSequence += 1;
    const effectivelyEnabled = parentEnabled && group.enabled;
    const conditionNodes = group.conditions.map((condition) => conditionNode(condition, input.entityUnit));
    for (const condition of conditionNodes.filter((candidate) => effectivelyEnabled && candidate.enabled)) {
      const parsed = segmentConditionSchema.safeParse(condition);
      if (!parsed.success) {
        invalidConditionIssues.push({
          code: "invalid_condition_value",
          severity: "error",
          message: `${condition.featureCode} 조건의 ${condition.operator} 연산자 값 형식이 올바르지 않습니다.`,
          conditionIds: [condition.id],
        });
      }
    }
    return {
      kind: "group",
      id: `runtime-group-${groupSequence}`,
      logic: group.logic.toLowerCase() as SegmentGroup["logic"],
      enabled: group.enabled,
      children: [
        ...conditionNodes,
        ...(group.groups ?? []).map((child) => groupNode(child, effectivelyEnabled)),
      ],
    };
  }
  const children: SegmentGroup[] = input.groups.map((group) => groupNode(group));
  const where: SegmentGroup = children.length === 1 ? children[0] : {
    kind: "group",
    id: "runtime-root",
    logic: "and",
    enabled: true,
    children,
  };
  if (invalidConditionIssues.length) return invalidConditionIssues;
  return validateSegmentDefinition({
    name: input.name,
    naturalLanguage: input.naturalLanguage ?? null,
    entityUnit: input.entityUnit as SegmentCondition["entityUnit"],
    geography: { level: "country", codes: ["KR"] },
    asOf: null,
    where,
  });
}

export function assertRuntimeConditionGroups(input: Parameters<typeof validateRuntimeConditionGroups>[0]): SegmentValidationIssue[] {
  const issues = validateRuntimeConditionGroups(input);
  const errors = issues.filter((issue) => issue.severity === "error");
  if (errors.length) {
    throw new Error(`segment_validation_failed:${errors.map((issue) => issue.code).join(",")}`);
  }
  return issues;
}
