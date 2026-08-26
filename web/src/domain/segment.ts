import { z } from "zod";

import { entityUnitSchema, type EntityUnit } from "@/domain/entity-units";

export const conditionOperatorSchema = z.enum([
  "eq",
  "neq",
  "in",
  "not_in",
  "between",
  "gt",
  "gte",
  "lt",
  "lte",
  "contains",
  "exists",
]);

export const matchStatusSchema = z.enum([
  "exact",
  "similar",
  "proxy",
  "ambiguous",
  "missing",
  "research_required",
]);

export const conditionReferenceSchema = z.enum([
  "domain",
  "axis",
  "feature",
  "behavior",
  "subtype",
  "archetype",
  "geography",
  "age",
  "household",
  "occupation",
  "income",
  "business_attribute",
  "consumption_attribute",
]);

type ConditionScalar = string | number | boolean;

function isConditionScalar(value: unknown): value is ConditionScalar {
  return (typeof value === "string" && value.trim().length > 0)
    || (typeof value === "number" && Number.isFinite(value))
    || typeof value === "boolean";
}

function numericValue(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value.trim()) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

export const segmentConditionSchema = z.object({
  kind: z.literal("condition"),
  id: z.string().min(1),
  referenceType: conditionReferenceSchema,
  referenceId: z.string().min(1).nullable().default(null),
  featureCode: z.string().min(1),
  operator: conditionOperatorSchema,
  value: z.unknown(),
  entityUnit: entityUnitSchema,
  matchStatus: matchStatusSchema,
  enabled: z.boolean().default(true),
  referenceYear: z.number().int().min(1900).max(2200).nullable().default(null),
  dependencyGroup: z.string().nullable().default(null),
  evidenceId: z.coerce.number().int().positive().nullable().default(null),
}).superRefine((condition, context) => {
  // Disabled conditions are preserved as editable drafts but never enter the
  // effective calculation tree. Their value can therefore remain incomplete
  // until the user enables and confirms the condition.
  if (!condition.enabled) return;
  const issue = (message: string) => context.addIssue({ code: "custom", path: ["value"], message });
  if (condition.operator === "eq" || condition.operator === "neq") {
    if (!isConditionScalar(condition.value)) issue(`${condition.operator} requires a non-empty scalar value.`);
    return;
  }
  if (condition.operator === "in" || condition.operator === "not_in") {
    if (!Array.isArray(condition.value) || condition.value.length === 0
        || !condition.value.every(isConditionScalar)) {
      issue(`${condition.operator} requires a non-empty scalar array.`);
    }
    return;
  }
  if (condition.operator === "between") {
    if (!Array.isArray(condition.value) || condition.value.length !== 2) {
      issue("between requires exactly two finite numeric bounds.");
      return;
    }
    const low = numericValue(condition.value[0]);
    const high = numericValue(condition.value[1]);
    if (low === null || high === null || low > high) {
      issue("between requires ordered finite numeric bounds.");
    }
    return;
  }
  if (["gt", "gte", "lt", "lte"].includes(condition.operator)) {
    if (numericValue(condition.value) === null) issue(`${condition.operator} requires one finite numeric value.`);
    return;
  }
  if (condition.operator === "contains") {
    if (typeof condition.value !== "string" || !condition.value.trim()) issue("contains requires non-empty text.");
    return;
  }
  if (condition.operator === "exists" && typeof condition.value !== "boolean") {
    issue("exists requires a Boolean value.");
  }
});

export type SegmentCondition = z.infer<typeof segmentConditionSchema>;

export type SegmentGroup = {
  kind: "group";
  id: string;
  logic: "and" | "or" | "not";
  enabled: boolean;
  children: SegmentNode[];
};

export type SegmentNode = SegmentCondition | SegmentGroup;

export const segmentNodeSchema: z.ZodType<SegmentNode> = z.lazy(() =>
  z.union([
    segmentConditionSchema,
    z.object({
      kind: z.literal("group"),
      id: z.string().min(1),
      logic: z.enum(["and", "or", "not"]),
      enabled: z.boolean().default(true),
      children: z.array(segmentNodeSchema),
    }),
  ]),
);

export const segmentDefinitionSchema = z.object({
  name: z.string().min(1).max(200),
  naturalLanguage: z.string().max(4000).nullable().default(null),
  entityUnit: entityUnitSchema,
  geography: z
    .object({ level: z.string().min(1), codes: z.array(z.string().min(1)).min(1) })
    .nullable()
    .default(null),
  asOf: z.string().nullable().default(null),
  where: segmentNodeSchema,
});

export type SegmentDefinition = z.infer<typeof segmentDefinitionSchema>;

export interface SegmentValidationIssue {
  code:
    | "entity_unit_mismatch"
    | "duplicate_condition"
    | "mutually_exclusive_condition"
    | "overlapping_age_range"
    | "reference_year_gap"
    | "unresolved_condition"
    | "invalid_business_person_combination"
    | "empty_enabled_group"
    | "not_group_requires_exactly_one_enabled_child"
    | "invalid_condition_value";
  severity: "error" | "warning";
  message: string;
  conditionIds: string[];
}

function enabledConditions(node: SegmentNode): SegmentCondition[] {
  if (!node.enabled) return [];
  return node.kind === "condition" ? [node] : node.children.flatMap(enabledConditions);
}

function stableValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableValue).sort().join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => `${key}:${stableValue(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function andGroups(node: SegmentNode, coveredByAncestorAnd = false): SegmentGroup[] {
  if (node.kind === "condition" || !node.enabled) return [];
  const includeCurrent = node.logic === "and" && !coveredByAncestorAnd;
  return [
    ...(includeCurrent ? [node] : []),
    ...node.children.flatMap((child) => andGroups(child, node.logic === "and")),
  ];
}

function conjunctiveConditions(group: SegmentGroup): SegmentCondition[] {
  return group.children.flatMap((child) => {
    if (!child.enabled) return [];
    if (child.kind === "condition") return [child];
    return child.logic === "and" ? conjunctiveConditions(child) : [];
  });
}

function emptyEnabledGroups(node: SegmentNode, parentEnabled = true): SegmentGroup[] {
  if (node.kind === "condition") return [];
  const effectivelyEnabled = parentEnabled && node.enabled;
  return [
    ...(effectivelyEnabled && node.children.every((child) => !child.enabled) ? [node] : []),
    ...node.children.flatMap((child) => emptyEnabledGroups(child, effectivelyEnabled)),
  ];
}

function invalidEnabledNotGroups(node: SegmentNode, parentEnabled = true): SegmentGroup[] {
  if (node.kind === "condition") return [];
  const effectivelyEnabled = parentEnabled && node.enabled;
  const enabledChildCount = node.children.filter((child) => child.enabled).length;
  return [
    ...(effectivelyEnabled && node.logic === "not" && enabledChildCount !== 1 ? [node] : []),
    ...node.children.flatMap((child) => invalidEnabledNotGroups(child, effectivelyEnabled)),
  ];
}

function ageRange(condition: SegmentCondition): {
  low: number;
  high: number;
  lowInclusive: boolean;
  highInclusive: boolean;
  explicitRange: boolean;
} | null {
  const feature = condition.featureCode.toLowerCase();
  if (condition.referenceType !== "age"
    && feature !== "age"
    && !feature.endsWith(".age")
    && !feature.endsWith("_age")
    && !feature.includes("age_band")) return null;
  if (condition.operator === "between") {
    const values = Array.isArray(condition.value)
      ? condition.value
      : typeof condition.value === "string" ? condition.value.split(/\s*(?:,|\.\.)\s*/u) : [];
    if (values.length !== 2) return null;
    const low = numericValue(values[0]);
    const high = numericValue(values[1]);
    return low === null || high === null ? null : {
      low: Math.min(low, high),
      high: Math.max(low, high),
      lowInclusive: true,
      highInclusive: true,
      explicitRange: true,
    };
  }
  const value = numericValue(condition.value);
  if (value === null) return null;
  if (condition.operator === "eq") return {
    low: value, high: value, lowInclusive: true, highInclusive: true, explicitRange: false,
  };
  if (condition.operator === "gt") return {
    low: value, high: 130, lowInclusive: false, highInclusive: true, explicitRange: false,
  };
  if (condition.operator === "gte") return {
    low: value, high: 130, lowInclusive: true, highInclusive: true, explicitRange: false,
  };
  if (condition.operator === "lt") return {
    low: 0, high: value, lowInclusive: true, highInclusive: false, explicitRange: false,
  };
  if (condition.operator === "lte") return {
    low: 0, high: value, lowInclusive: true, highInclusive: true, explicitRange: false,
  };
  return null;
}

function setValues(condition: SegmentCondition, operators: readonly SegmentCondition["operator"][]): Set<string> | null {
  if (!operators.includes(condition.operator)) return null;
  const values = condition.operator === "eq" || condition.operator === "neq"
    ? [condition.value]
    : condition.value;
  if (!Array.isArray(values)) return null;
  return new Set(values.map(stableValue));
}

function genericNumericRange(condition: SegmentCondition): {
  low: number;
  high: number;
  lowInclusive: boolean;
  highInclusive: boolean;
} | null {
  if (condition.operator === "between") {
    if (!Array.isArray(condition.value) || condition.value.length !== 2) return null;
    const low = numericValue(condition.value[0]);
    const high = numericValue(condition.value[1]);
    return low === null || high === null ? null : {
      low, high, lowInclusive: true, highInclusive: true,
    };
  }
  const value = numericValue(condition.value);
  if (value === null) return null;
  if (condition.operator === "eq") return {
    low: value, high: value, lowInclusive: true, highInclusive: true,
  };
  if (condition.operator === "gt") return {
    low: value, high: Number.POSITIVE_INFINITY, lowInclusive: false, highInclusive: false,
  };
  if (condition.operator === "gte") return {
    low: value, high: Number.POSITIVE_INFINITY, lowInclusive: true, highInclusive: false,
  };
  if (condition.operator === "lt") return {
    low: Number.NEGATIVE_INFINITY, high: value, lowInclusive: false, highInclusive: false,
  };
  if (condition.operator === "lte") return {
    low: Number.NEGATIVE_INFINITY, high: value, lowInclusive: false, highInclusive: true,
  };
  return null;
}

function rangesAreDisjoint(
  left: NonNullable<ReturnType<typeof genericNumericRange>>,
  right: NonNullable<ReturnType<typeof genericNumericRange>>,
): boolean {
  const low = Math.max(left.low, right.low);
  const high = Math.min(left.high, right.high);
  if (low > high) return true;
  if (low < high) return false;
  const lowIncluded = (left.low !== low || left.lowInclusive) && (right.low !== low || right.lowInclusive);
  const highIncluded = (left.high !== high || left.highInclusive) && (right.high !== high || right.highInclusive);
  return !lowIncluded || !highIncluded;
}

function predicatesAreMutuallyExclusive(left: SegmentCondition, right: SegmentCondition): boolean {
  const leftPositive = setValues(left, ["eq", "in"]);
  const rightPositive = setValues(right, ["eq", "in"]);
  const leftExcluded = setValues(left, ["neq", "not_in"]);
  const rightExcluded = setValues(right, ["neq", "not_in"]);
  if (leftPositive && rightPositive
      && ![...leftPositive].some((value) => rightPositive.has(value))) return true;
  if (leftPositive && rightExcluded
      && [...leftPositive].every((value) => rightExcluded.has(value))) return true;
  if (rightPositive && leftExcluded
      && [...rightPositive].every((value) => leftExcluded.has(value))) return true;
  const leftRange = genericNumericRange(left);
  const rightRange = genericNumericRange(right);
  return Boolean(leftRange && rightRange && rangesAreDisjoint(leftRange, rightRange));
}

export function validateSegmentDefinition(definition: SegmentDefinition): SegmentValidationIssue[] {
  const value = segmentDefinitionSchema.parse(definition);
  const conditions = enabledConditions(value.where);
  const issues: SegmentValidationIssue[] = [];

  for (const group of emptyEnabledGroups(value.where)) {
    issues.push({
      code: "empty_enabled_group",
      severity: "error",
      message: "활성 조건 그룹에는 활성 조건 또는 하위 그룹이 하나 이상 필요합니다.",
      conditionIds: [group.id],
    });
  }

  for (const group of invalidEnabledNotGroups(value.where)) {
    issues.push({
      code: "not_group_requires_exactly_one_enabled_child",
      severity: "error",
      message: "활성 NOT 그룹에는 활성 조건 또는 하위 그룹이 정확히 하나 필요합니다.",
      conditionIds: [group.id],
    });
  }

  const mismatched = conditions.filter((condition) => condition.entityUnit !== value.entityUnit);
  if (mismatched.length) {
    issues.push({
      code: "entity_unit_mismatch",
      severity: "error",
      message: `대상 단위 ${value.entityUnit}와 다른 조건이 포함되어 있습니다.`,
      conditionIds: mismatched.map((condition) => condition.id),
    });
  }

  for (const condition of conditions) {
    if (["ambiguous", "missing", "research_required"].includes(condition.matchStatus)) {
      issues.push({
        code: "unresolved_condition",
        severity: "error",
        message: `${condition.featureCode} 조건은 확정 또는 추가 조사가 필요합니다.`,
        conditionIds: [condition.id],
      });
    }
  }

  for (const group of andGroups(value.where)) {
    const direct = conjunctiveConditions(group);
    const seen = new Map<string, string>();
    for (const condition of direct) {
      const key = [condition.featureCode, condition.operator, stableValue(condition.value)].join("|");
      const previous = seen.get(key);
      if (previous) {
        issues.push({
          code: "duplicate_condition",
          severity: "error",
          message: "동일한 AND 조건 문맥에 같은 조건이 중복되었습니다.",
          conditionIds: [previous, condition.id],
        });
      } else {
        seen.set(key, condition.id);
      }
    }
    const byFeature = new Map<string, SegmentCondition[]>();
    for (const condition of direct) {
      byFeature.set(condition.featureCode, [...(byFeature.get(condition.featureCode) ?? []), condition]);
    }
    for (const [featureCode, peers] of byFeature) {
      for (let leftIndex = 0; leftIndex < peers.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < peers.length; rightIndex += 1) {
          const left = peers[leftIndex];
          const right = peers[rightIndex];
          if (ageRange(left) && ageRange(right)) continue;
          if (predicatesAreMutuallyExclusive(left, right)) {
            issues.push({
              code: "mutually_exclusive_condition",
              severity: "error",
              message: `${featureCode}에 동시에 성립할 수 없는 값 또는 범위가 지정되었습니다.`,
              conditionIds: [left.id, right.id],
            });
          }
        }
      }
    }

    const ageConditions = direct.flatMap((condition) => {
      const range = ageRange(condition);
      return range ? [{ condition, range }] : [];
    });
    if (ageConditions.length > 1) {
      const intersectionLow = Math.max(...ageConditions.map(({ range }) => range.low));
      const intersectionHigh = Math.min(...ageConditions.map(({ range }) => range.high));
      const boundaryExcluded = intersectionLow === intersectionHigh && ageConditions.some(({ range }) =>
        (range.low === intersectionLow && !range.lowInclusive)
        || (range.high === intersectionHigh && !range.highInclusive));
      if (intersectionLow > intersectionHigh || boundaryExcluded) {
        issues.push({
          code: "mutually_exclusive_condition",
          severity: "error",
          message: "동시에 성립할 수 없는 연령 조건이 지정되었습니다.",
          conditionIds: ageConditions.map(({ condition }) => condition.id),
        });
      } else if (ageConditions.filter(({ range }) => range.explicitRange).length > 1) {
        issues.push({
          code: "overlapping_age_range",
          severity: "warning",
          message: "중복되는 연령 범위는 교집합으로 해석됩니다. 의도한 범위인지 확인하세요.",
          conditionIds: ageConditions.map(({ condition }) => condition.id),
        });
      }
    }

    const businessConditions = direct.filter((condition) => condition.referenceType === "business_attribute");
    const personalOccupations = direct.filter((condition) => condition.referenceType === "occupation");
    if (businessConditions.length && personalOccupations.length) {
      issues.push({
        code: "invalid_business_person_combination",
        severity: "error",
        message: "사업체 속성과 개인 직업 조건은 명시적인 단위 변환 없이 결합할 수 없습니다.",
        conditionIds: [...businessConditions, ...personalOccupations].map((condition) => condition.id),
      });
    }
  }

  const years = conditions.map((condition) => condition.referenceYear).filter((year): year is number => year !== null);
  if (years.length && Math.max(...years) - Math.min(...years) > 3) {
    issues.push({
      code: "reference_year_gap",
      severity: "warning",
      message: "조건의 기준연도 차이가 3년을 초과합니다.",
      conditionIds: conditions.filter((condition) => condition.referenceYear !== null).map((condition) => condition.id),
    });
  }
  return issues;
}

export function segmentEntityUnits(definition: SegmentDefinition): EntityUnit[] {
  return [...new Set(enabledConditions(definition.where).map((condition) => condition.entityUnit))];
}
