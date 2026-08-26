import { describe, expect, it } from "vitest";

import {
  segmentConditionSchema,
  validateSegmentDefinition,
  type SegmentCondition,
  type SegmentDefinition,
} from "@/domain/segment";
import { assertRuntimeConditionGroups } from "@/server/services/segment-runtime-validation";

const base: SegmentDefinition = {
  name: "검증용 가구 세그먼트",
  naturalLanguage: null,
  entityUnit: "household",
  geography: null,
  asOf: "latest",
  where: {
    kind: "group",
    id: "root",
    logic: "and",
    enabled: true,
    children: [
      {
        kind: "condition",
        id: "c1",
        referenceType: "feature",
        referenceId: "DOM-01-FEAT-01",
        featureCode: "household_type",
        operator: "eq",
        value: "맞벌이",
        entityUnit: "household",
        matchStatus: "exact",
        enabled: true,
        referenceYear: 2024,
        dependencyGroup: null,
        evidenceId: null,
      },
    ],
  },
};

describe("validateSegmentDefinition", () => {
  it("accepts a unit-consistent exact condition", () => {
    expect(validateSegmentDefinition(base)).toEqual([]);
  });

  it("rejects mixed entity units and unresolved conditions", () => {
    const mixed = structuredClone(base);
    if (mixed.where.kind !== "group") throw new Error("invalid fixture");
    mixed.where.children.push({
      kind: "condition",
      id: "c2",
      referenceType: "feature",
      referenceId: null,
      featureCode: "industry_code",
      operator: "eq",
      value: "I561",
      entityUnit: "enterprise",
      matchStatus: "research_required",
      enabled: true,
      referenceYear: 2020,
      dependencyGroup: null,
      evidenceId: null,
    });
    expect(validateSegmentDefinition(mixed).map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["entity_unit_mismatch", "unresolved_condition", "reference_year_gap"]),
    );
  });

  it("detects mutually exclusive equality conditions", () => {
    const invalid = structuredClone(base);
    if (invalid.where.kind !== "group" || invalid.where.children[0]?.kind !== "condition") throw new Error("invalid fixture");
    invalid.where.children.push({ ...invalid.where.children[0], id: "c2", value: "1인 가구" });
    expect(validateSegmentDefinition(invalid).some((issue) => issue.code === "mutually_exclusive_condition")).toBe(true);
  });

  it.each([
    ["eq", []],
    ["neq", { nested: true }],
    ["in", "A,B"],
    ["in", []],
    ["not_in", ["A", { nested: true }]],
    ["between", [10]],
    ["between", [20, 10]],
    ["between", ["not-numeric", 20]],
    ["gt", "not-numeric"],
    ["gte", [10]],
    ["lt", null],
    ["lte", Number.POSITIVE_INFINITY],
    ["contains", 42],
    ["exists", "true"],
  ] as const)("rejects an invalid %s condition value shape", (operator, conditionValue) => {
    const condition = (base.where.kind === "group" ? base.where.children[0] : null) as SegmentCondition;
    expect(segmentConditionSchema.safeParse({ ...condition, operator, value: conditionValue }).success).toBe(false);
  });

  it("accepts valid operator-specific scalar, set, range, text, and presence values", () => {
    const condition = (base.where.kind === "group" ? base.where.children[0] : null) as SegmentCondition;
    const cases = [
      ["eq", "A"], ["neq", true], ["in", ["A", "B"]], ["not_in", [1, 2]],
      ["between", ["10", 20]], ["gt", "10"], ["gte", 10], ["lt", -1],
      ["lte", "1.5"], ["contains", "needle"], ["exists", true],
    ] as const;
    for (const [operator, conditionValue] of cases) {
      expect(segmentConditionSchema.safeParse({ ...condition, operator, value: conditionValue }).success).toBe(true);
    }
  });

  it.each([
    [
      { operator: "eq", value: "A" },
      { operator: "neq", value: "A" },
    ],
    [
      { operator: "in", value: ["A", "B"] },
      { operator: "in", value: ["C"] },
    ],
    [
      { operator: "eq", value: "A" },
      { operator: "not_in", value: ["A", "B"] },
    ],
    [
      { operator: "gt", value: 100 },
      { operator: "lte", value: 100 },
    ],
    [
      { operator: "between", value: [1, 5] },
      { operator: "gte", value: 6 },
    ],
  ] as const)("detects generic mutually exclusive predicates %#", (left, right) => {
    const invalid = structuredClone(base);
    if (invalid.where.kind !== "group" || invalid.where.children[0]?.kind !== "condition") {
      throw new Error("invalid fixture");
    }
    const seed = invalid.where.children[0];
    invalid.where.children = [
      { ...seed, id: "left", featureCode: "generic_feature", ...left },
      { ...seed, id: "right", featureCode: "generic_feature", ...right },
    ];
    expect(validateSegmentDefinition(invalid)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "mutually_exclusive_condition",
        severity: "error",
        conditionIds: ["left", "right"],
      }),
    ]));
  });

  it("allows the same predicate in separate OR branches while retaining conjunctive duplicate checks", () => {
    const branched = structuredClone(base);
    if (branched.where.kind !== "group" || branched.where.children[0]?.kind !== "condition") {
      throw new Error("invalid fixture");
    }
    const shared = branched.where.children[0];
    branched.where.logic = "or";
    branched.where.children = [
      {
        kind: "group",
        id: "branch-a",
        logic: "and",
        enabled: true,
        children: [
          { ...shared, id: "shared-a" },
          { ...shared, id: "branch-a-only", featureCode: "region", value: "서울" },
        ],
      },
      {
        kind: "group",
        id: "branch-b",
        logic: "and",
        enabled: true,
        children: [
          { ...shared, id: "shared-b" },
          { ...shared, id: "branch-b-only", featureCode: "region", value: "부산" },
        ],
      },
    ];

    expect(validateSegmentDefinition(branched).filter((issue) => issue.code === "duplicate_condition"))
      .toEqual([]);

    const duplicate = structuredClone(branched);
    if (duplicate.where.kind !== "group" || duplicate.where.children[0]?.kind !== "group") {
      throw new Error("invalid fixture");
    }
    duplicate.where.children[0].children.push({ ...shared, id: "shared-a-duplicate" });
    expect(validateSegmentDefinition(duplicate)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "duplicate_condition",
        conditionIds: ["shared-a", "shared-a-duplicate"],
      }),
    ]));
  });

  it("detects disjoint and overlapping explicit age ranges", () => {
    const age = structuredClone(base);
    if (age.where.kind !== "group") throw new Error("invalid fixture");
    age.where.children = [
      {
        kind: "condition", id: "age-1", referenceType: "age", referenceId: null,
        featureCode: "age", operator: "between", value: [20, 39], entityUnit: "household",
        matchStatus: "exact", enabled: true, referenceYear: 2024, dependencyGroup: null, evidenceId: null,
      },
      {
        kind: "condition", id: "age-2", referenceType: "age", referenceId: null,
        featureCode: "age", operator: "between", value: [30, 49], entityUnit: "household",
        matchStatus: "exact", enabled: true, referenceYear: 2024, dependencyGroup: null, evidenceId: null,
      },
    ];
    expect(validateSegmentDefinition(age)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "overlapping_age_range", severity: "warning" }),
    ]));
    if (age.where.children[1]?.kind !== "condition") throw new Error("invalid fixture");
    age.where.children[1].value = [50, 69];
    expect(validateSegmentDefinition(age)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "mutually_exclusive_condition", severity: "error" }),
    ]));
  });

  it("detects contradictory strict age boundaries at the same value", () => {
    for (const [leftOperator, rightOperator] of [["gt", "lte"], ["gte", "lt"]] as const) {
      const age = structuredClone(base);
      if (age.where.kind !== "group") throw new Error("invalid fixture");
      age.where.children = [
        {
          kind: "condition", id: "age-left", referenceType: "age", referenceId: null,
          featureCode: "age", operator: leftOperator, value: 30, entityUnit: "household",
          matchStatus: "exact", enabled: true, referenceYear: 2024, dependencyGroup: null, evidenceId: null,
        },
        {
          kind: "condition", id: "age-right", referenceType: "age", referenceId: null,
          featureCode: "age", operator: rightOperator, value: 30, entityUnit: "household",
          matchStatus: "exact", enabled: true, referenceYear: 2024, dependencyGroup: null, evidenceId: null,
        },
      ];
      expect(validateSegmentDefinition(age)).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "mutually_exclusive_condition", severity: "error" }),
      ]));
    }
  });

  it("detects contradictions across nested conjunctive groups using real age feature codes", () => {
    expect(() => assertRuntimeConditionGroups({
      name: "nested actual age contradiction",
      entityUnit: "household",
      groups: [{
        logic: "AND",
        enabled: true,
        conditions: [],
        groups: [
          {
            logic: "AND",
            enabled: true,
            conditions: [{
              id: "age-young", namespace: "core_feature", sourceCode: "core_feature:householder_age",
              operator: "between", value: [20, 29], entityUnit: "household", resolution: "exact",
              dependencyGroup: null, enabled: true,
            }],
          },
          {
            logic: "AND",
            enabled: true,
            conditions: [{
              id: "age-old", namespace: "core_feature", sourceCode: "core_feature:householder_age",
              operator: "between", value: [50, 59], entityUnit: "household", resolution: "exact",
              dependencyGroup: null, enabled: true,
            }],
          },
        ],
      }],
    })).toThrow("segment_validation_failed:mutually_exclusive_condition");

    expect(() => assertRuntimeConditionGroups({
      name: "actual child age strict contradiction",
      entityUnit: "household",
      groups: [{
        logic: "AND",
        enabled: true,
        conditions: [
          {
            id: "age-lower", namespace: "core_feature", sourceCode: "core_feature:children_age",
            operator: "gt", value: 60, entityUnit: "household", resolution: "exact",
            dependencyGroup: null, enabled: true,
          },
          {
            id: "age-upper", namespace: "core_feature", sourceCode: "core_feature:children_age",
            operator: "lte", value: 30, entityUnit: "household", resolution: "exact",
            dependencyGroup: null, enabled: true,
          },
        ],
      }],
    })).toThrow("segment_validation_failed:mutually_exclusive_condition");
  });

  it("rejects business attributes mixed with personal occupation conditions", () => {
    const invalid = structuredClone(base);
    if (invalid.where.kind !== "group") throw new Error("invalid fixture");
    invalid.where.children = [
      {
        kind: "condition", id: "industry", referenceType: "business_attribute", referenceId: null,
        featureCode: "industry_code", operator: "eq", value: "I561", entityUnit: "household",
        matchStatus: "exact", enabled: true, referenceYear: 2024, dependencyGroup: null, evidenceId: null,
      },
      {
        kind: "condition", id: "occupation", referenceType: "occupation", referenceId: null,
        featureCode: "occupation", operator: "eq", value: "manager", entityUnit: "household",
        matchStatus: "exact", enabled: true, referenceYear: 2024, dependencyGroup: null, evidenceId: null,
      },
    ];
    expect(validateSegmentDefinition(invalid)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "invalid_business_person_combination", severity: "error" }),
    ]));
  });

  it("applies the same validator to persisted runtime condition groups", () => {
    expect(() => assertRuntimeConditionGroups({
      name: "runtime duplicate",
      entityUnit: "household",
      groups: [{
        logic: "AND",
        enabled: true,
        conditions: [
          { id: "c1", namespace: "core_feature", sourceCode: "dual_income", operator: "eq", value: true, entityUnit: "household", resolution: "exact", dependencyGroup: null, enabled: true },
          { id: "c2", namespace: "core_feature", sourceCode: "dual_income", operator: "eq", value: true, entityUnit: "household", resolution: "exact", dependencyGroup: null, enabled: true },
        ],
      }],
    })).toThrow("segment_validation_failed:duplicate_condition");
  });

  it.each([
    ["eq", { nested: true }],
    ["in", []],
    ["between", [10]],
    ["gt", "not-numeric"],
    ["contains", 42],
  ] as const)("rejects an invalid runtime %s value before persistence", (operator, value) => {
    expect(() => assertRuntimeConditionGroups({
      name: "runtime invalid operator value",
      entityUnit: "household",
      groups: [{
        logic: "AND",
        enabled: true,
        conditions: [{
          id: "invalid-value", namespace: "core_feature", sourceCode: "generic_feature",
          operator, value, entityUnit: "household", resolution: "exact",
          dependencyGroup: null, enabled: true,
        }],
      }],
    })).toThrow("segment_validation_failed:invalid_condition_value");
  });

  it("ignores invalid values on effectively disabled runtime conditions", () => {
    expect(() => assertRuntimeConditionGroups({
      name: "runtime disabled draft",
      entityUnit: "household",
      groups: [{
        logic: "AND",
        enabled: true,
        conditions: [
          { id: "active", namespace: "archetype", sourceCode: "ARC-16-021", operator: "eq", value: "ARC-16-021", entityUnit: "household", resolution: "similar", dependencyGroup: null, enabled: true },
          { id: "disabled-invalid", namespace: "core_feature", sourceCode: "dual_income", operator: "eq", value: "", entityUnit: "household", resolution: "ambiguous", dependencyGroup: null, enabled: false },
        ],
      }],
    })).not.toThrow();
  });

  it("rejects an enabled empty nested group in the shared client/server validator", () => {
    expect(() => assertRuntimeConditionGroups({
      name: "runtime empty nested group",
      entityUnit: "household",
      groups: [{
        logic: "AND",
        enabled: true,
        conditions: [{
          id: "c1", namespace: "core_feature", sourceCode: "dual_income",
          operator: "eq", value: true, entityUnit: "household", resolution: "exact",
          dependencyGroup: null, enabled: true,
        }],
        groups: [{ logic: "OR", enabled: true, conditions: [] }],
      }],
    })).toThrow("segment_validation_failed:empty_enabled_group");
  });

  it("ignores an empty NOT group when its subtree is disabled", () => {
    expect(() => assertRuntimeConditionGroups({
      name: "runtime disabled NOT",
      entityUnit: "household",
      groups: [{
        logic: "AND",
        enabled: true,
        conditions: [{
          id: "c1", namespace: "core_feature", sourceCode: "dual_income",
          operator: "eq", value: true, entityUnit: "household", resolution: "exact",
          dependencyGroup: null, enabled: true,
        }],
        groups: [{ logic: "NOT", enabled: false, conditions: [] }],
      }],
    })).not.toThrow();
  });

  it("ignores a locally enabled empty NOT group below a disabled parent", () => {
    expect(() => assertRuntimeConditionGroups({
      name: "runtime disabled ancestor",
      entityUnit: "household",
      groups: [{
        logic: "AND",
        enabled: true,
        conditions: [{
          id: "c1", namespace: "core_feature", sourceCode: "dual_income",
          operator: "eq", value: true, entityUnit: "household", resolution: "exact",
          dependencyGroup: null, enabled: true,
        }],
        groups: [{
          logic: "AND",
          enabled: false,
          conditions: [],
          groups: [{ logic: "NOT", enabled: true, conditions: [] }],
        }],
      }],
    })).not.toThrow();
  });

  it("rejects an effectively enabled NOT group without exactly one enabled child", () => {
    expect(() => assertRuntimeConditionGroups({
      name: "runtime invalid NOT",
      entityUnit: "household",
      groups: [{
        logic: "AND",
        enabled: true,
        conditions: [{
          id: "c1", namespace: "core_feature", sourceCode: "dual_income",
          operator: "eq", value: true, entityUnit: "household", resolution: "exact",
          dependencyGroup: null, enabled: true,
        }],
        groups: [{ logic: "NOT", enabled: true, conditions: [] }],
      }],
    })).toThrow("segment_validation_failed:empty_enabled_group,not_group_requires_exactly_one_enabled_child");
  });
});
