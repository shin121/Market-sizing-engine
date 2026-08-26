import { describe, expect, it } from "vitest";

import {
  assertCatalogConditionPolicy,
  type CatalogConditionCandidate,
  type CatalogConditionRecord,
} from "@/domain/condition-catalog-policy";

const candidate: CatalogConditionCandidate = {
  namespace: "archetype",
  sourceCode: "archetype:ARC-06-001",
  operator: "eq",
  value: "ARC-06-001",
  entityUnit: "enterprise",
  enabled: true,
};

const record: CatalogConditionRecord = {
  catalogId: "archetype:ARC-06-001",
  sourceKind: "archetype",
  entityUnit: "enterprise",
  dataType: "category",
  allowedValues: ["ARC-06-001"],
  sensitiveClass: "non_sensitive",
  queryable: true,
};

describe("condition catalog policy", () => {
  it("accepts an exact queryable catalog condition", () => {
    expect(() => assertCatalogConditionPolicy([candidate], [record], "enterprise")).not.toThrow();
  });

  it.each([
    ["missing record", [], "condition_catalog_entry_not_found"],
    ["non-queryable", [{ ...record, queryable: false }], "condition_catalog_entry_not_queryable"],
    ["protected minor", [{ ...record, sensitiveClass: "minor_protected" }], "condition_catalog_sensitive_class_not_allowed"],
    ["restricted targeting", [{ ...record, sensitiveClass: "restricted_targeting" }], "condition_catalog_sensitive_class_not_allowed"],
    ["wrong namespace", [{ ...record, sourceKind: "subtype" }], "condition_catalog_namespace_mismatch"],
    ["wrong unit", [{ ...record, entityUnit: "person" }], "condition_catalog_entity_unit_mismatch"],
  ])("rejects %s", (_label, catalog, error) => {
    expect(() => assertCatalogConditionPolicy([candidate], catalog as CatalogConditionRecord[], "enterprise"))
      .toThrow(error);
  });

  it("rejects operators and values outside the registered category contract", () => {
    expect(() => assertCatalogConditionPolicy([{ ...candidate, operator: "gt" }], [record], "enterprise"))
      .toThrow("condition_catalog_operator_not_allowed");
    expect(() => assertCatalogConditionPolicy([{ ...candidate, value: "ARC-06-999" }], [record], "enterprise"))
      .toThrow("condition_catalog_value_not_allowed");
  });

  it("ignores disabled client-only placeholders", () => {
    expect(() => assertCatalogConditionPolicy([
      candidate,
      { ...candidate, sourceCode: "custom:not-registered", enabled: false },
    ], [record], "enterprise")).not.toThrow();
  });

  it("enforces registered numeric types and whole integers", () => {
    const numericRecord: CatalogConditionRecord = {
      ...record,
      catalogId: "core_feature:age",
      sourceKind: "core_feature",
      entityUnit: "person",
      dataType: "integer",
      allowedValues: [],
    };
    const numericCandidate: CatalogConditionCandidate = {
      ...candidate,
      namespace: "core_feature",
      sourceCode: numericRecord.catalogId,
      entityUnit: "person",
      operator: "between",
      value: [20, 39],
    };
    expect(() => assertCatalogConditionPolicy([numericCandidate], [numericRecord], "person")).not.toThrow();
    expect(() => assertCatalogConditionPolicy([{ ...numericCandidate, value: [20.5, 39] }], [numericRecord], "person"))
      .toThrow("condition_catalog_value_type_mismatch");
  });
});
