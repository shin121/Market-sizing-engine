export interface CatalogConditionCandidate {
  namespace: string;
  sourceCode: string;
  operator: string;
  value: unknown;
  entityUnit: string;
  enabled: boolean;
}

export interface CatalogConditionRecord {
  catalogId: string;
  sourceKind: string;
  entityUnit: string;
  dataType: string;
  allowedValues: unknown;
  sensitiveClass: string;
  queryable: boolean;
}

const SOURCE_NAMESPACE: Readonly<Record<string, string>> = {
  core_feature: "core_feature",
  domain_feature: "domain_feature",
  dimension_value: "dimension",
  calibration_dimension: "dimension",
  behavior: "domain_feature",
  tag: "domain_feature",
  subtype: "subtype",
  archetype: "archetype",
  geography: "geography",
  gold_query: "custom",
};

const OPERATORS_BY_DATA_TYPE: Readonly<Record<string, ReadonlySet<string>>> = {
  boolean: new Set(["eq", "neq", "exists"]),
  integer: new Set(["eq", "neq", "in", "not_in", "between", "gt", "gte", "lt", "lte", "exists"]),
  number: new Set(["eq", "neq", "in", "not_in", "between", "gt", "gte", "lt", "lte", "exists"]),
  date: new Set(["eq", "neq", "in", "not_in", "gt", "gte", "lt", "lte", "exists"]),
  category: new Set(["eq", "neq", "in", "not_in", "exists"]),
  string: new Set(["eq", "neq", "in", "not_in", "contains", "exists"]),
  json: new Set(["exists"]),
};

const BLOCKED_SENSITIVE_CLASSES = new Set(["minor_protected", "restricted_targeting"]);

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`)
    .join(",")}}`;
}

function valuesForValidation(candidate: CatalogConditionCandidate): unknown[] {
  if (candidate.operator === "exists") return [];
  return ["in", "not_in", "between"].includes(candidate.operator)
    ? Array.isArray(candidate.value) ? candidate.value : []
    : [candidate.value];
}

function assertValueType(candidate: CatalogConditionCandidate, record: CatalogConditionRecord): void {
  const values = valuesForValidation(candidate);
  if (record.dataType === "boolean" && values.some((value) => typeof value !== "boolean")) {
    throw new Error("condition_catalog_value_type_mismatch");
  }
  if (["number", "integer"].includes(record.dataType)) {
    const numbers = values.map((value) => typeof value === "number" ? value : typeof value === "string" ? Number(value.trim()) : Number.NaN);
    if (numbers.some((value) => !Number.isFinite(value))) throw new Error("condition_catalog_value_type_mismatch");
    if (record.dataType === "integer" && numbers.some((value) => !Number.isInteger(value))) {
      throw new Error("condition_catalog_value_type_mismatch");
    }
  }
  if (["date", "category", "string"].includes(record.dataType)
      && values.some((value) => typeof value !== "string" || !value.trim())) {
    throw new Error("condition_catalog_value_type_mismatch");
  }
  if (record.dataType === "date" && values.some((value) => {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return true;
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value;
  })) {
    throw new Error("condition_catalog_value_type_mismatch");
  }
}

export function assertCatalogConditionPolicy(
  candidates: readonly CatalogConditionCandidate[],
  catalogRecords: readonly CatalogConditionRecord[],
  targetEntityUnit: string,
): void {
  const active = candidates.filter((candidate) => candidate.enabled);
  const byId = new Map(catalogRecords.map((record) => [record.catalogId, record]));
  if (active.some((candidate) => !byId.has(candidate.sourceCode))) {
    throw new Error("condition_catalog_entry_not_found");
  }

  for (const candidate of active) {
    const record = byId.get(candidate.sourceCode);
    if (!record) throw new Error("condition_catalog_entry_not_found");
    if (!record.queryable) throw new Error("condition_catalog_entry_not_queryable");
    if (BLOCKED_SENSITIVE_CLASSES.has(record.sensitiveClass)) {
      throw new Error("condition_catalog_sensitive_class_not_allowed");
    }
    if (SOURCE_NAMESPACE[record.sourceKind] !== candidate.namespace) {
      throw new Error("condition_catalog_namespace_mismatch");
    }
    if (record.entityUnit !== "all" && record.entityUnit !== targetEntityUnit) {
      throw new Error("condition_catalog_entity_unit_mismatch");
    }
    const operators = OPERATORS_BY_DATA_TYPE[record.dataType];
    if (!operators?.has(candidate.operator)) throw new Error("condition_catalog_operator_not_allowed");
    assertValueType(candidate, record);

    const allowedValues = Array.isArray(record.allowedValues) ? record.allowedValues : [];
    if (allowedValues.length && candidate.operator !== "exists") {
      const allowed = new Set(allowedValues.map(stable));
      if (valuesForValidation(candidate).some((value) => !allowed.has(stable(value)))) {
        throw new Error("condition_catalog_value_not_allowed");
      }
    }
  }
}
