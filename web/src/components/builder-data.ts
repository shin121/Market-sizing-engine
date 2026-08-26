import type {
  BuilderCondition,
  BuilderConditionOption,
  BuilderGroup,
  BuilderInitialState,
} from "@/components/builder";
import {
  asRecord,
  entityUnit,
  identifier,
  label,
  records,
  status,
  stringList,
  text,
} from "@/components/record";

const legacySourceKinds: Record<string, string> = {
  domains: "custom",
  axes: "dimension_value",
  features: "core_feature",
  behaviors: "behavior",
  subtypes: "subtype",
  archetypes: "archetype",
  geographies: "geography",
};

function options(value: unknown, key: string, group: string): BuilderConditionOption[] {
  return records(asRecord(value)[key]).flatMap((record) => {
    const id =
      text(
        record,
        "catalogId",
        "catalog_id",
        "id",
        "featureCode",
        "feature_code",
        "behaviorCode",
        "behavior_code",
        "axisCode",
        "axis_code",
        "domainCode",
        "domain_code",
        "code",
      ) ?? identifier(record);
    if (!id) return [];
    return [{
      id,
      sourceKind: text(record, "sourceKind", "source_kind") ?? legacySourceKinds[key] ?? null,
      label: label(record),
      group,
      unit: entityUnit(record),
      values: stringList(record, "allowedValues", "allowed_values", "allowedValuesJson", "allowed_values_json", "values"),
      status: status(record),
    }];
  });
}

const sourceGroups: Record<string, string> = {
  core_feature: "Feature",
  domain_feature: "Feature",
  dimension_value: "Axis",
  calibration_dimension: "Calibration",
  behavior: "Behavior",
  tag: "Behavior",
  subtype: "Subtype",
  archetype: "Archetype",
  gold_query: "검증 질의",
  geography: "Geography",
};

function flatOptions(value: unknown): BuilderConditionOption[] {
  return records(value).flatMap((record) => {
    const id = text(record, "catalogId", "catalog_id", "id");
    if (!id) return [];
    const kind = text(record, "sourceKind", "source_kind") ?? "custom";
    return [{
      id,
      sourceKind: kind,
      label: label(record),
      group: sourceGroups[kind] ?? "기타",
      unit: entityUnit(record),
      values: stringList(record, "allowedValues", "allowed_values"),
      status: record.queryable === false ? "disabled" : "exact",
    }];
  });
}

export function normalizeConditionLibrary(value: unknown): BuilderConditionOption[] {
  if (Array.isArray(value)) return flatOptions(value);
  const combined = [
    ...options(value, "domains", "Domain"),
    ...options(value, "axes", "Axis"),
    ...options(value, "features", "Feature"),
    ...options(value, "behaviors", "Behavior"),
    ...options(value, "subtypes", "Subtype"),
    ...options(value, "archetypes", "Archetype"),
    ...options(value, "geographies", "Geography"),
  ];
  return [...new Map(combined.map((item) => [`${item.group}:${item.id}`, item])).values()];
}

function parseJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function normalizeCondition(value: unknown, index: number): BuilderCondition | null {
  const record = asRecord(value);
  const sourceId = text(record, "sourceId", "source_id", "featureCode", "feature_code", "code") ?? identifier(record);
  const conditionLabel = text(record, "label", "labelKo", "label_ko", "name", "value") ?? sourceId;
  if (!sourceId || !conditionLabel) return null;
  const operatorValue = text(record, "operator", "op");
  const allowedOperators = new Set<BuilderCondition["operator"]>(["eq", "neq", "in", "not_in", "between", "gt", "gte", "lt", "lte", "contains", "exists"]);
  const parsedValue = parseJson(record.value);
  const rawReferenceYear = record.referenceYear ?? record.reference_year;
  const parsedReferenceYear = typeof rawReferenceYear === "number"
    ? rawReferenceYear
    : typeof rawReferenceYear === "string" && rawReferenceYear.trim() ? Number(rawReferenceYear) : null;
  return {
    id: text(record, "conditionId", "condition_id", "id") ?? `stored-condition-${index}`,
    sourceId,
    sourceKind: text(record, "sourceKind", "source_kind", "conditionNamespace", "condition_namespace"),
    label: conditionLabel,
    group: text(record, "group", "conditionType", "condition_type", "type") ?? "저장 조건",
    unit: entityUnit(record),
    operator: operatorValue && allowedOperators.has(operatorValue as BuilderCondition["operator"])
      ? operatorValue as BuilderCondition["operator"] : "eq",
    value: Array.isArray(parsedValue) ? parsedValue.join(", ") : text(record, "value") ?? "",
    matchStatus: text(record, "matchStatus", "match_status") ?? "matched",
    referenceYear: Number.isInteger(parsedReferenceYear) ? parsedReferenceYear : null,
    enabled: record.enabled !== false,
  };
}

function normalizeGroups(record: Record<string, unknown>): BuilderGroup[] {
  const raw = parseJson(record.conditionGroups ?? record.condition_groups ?? record.conditionsJson ?? record.conditions_json ?? record.conditions);
  const rawGroups = Array.isArray(raw) ? raw : [];
  if (!rawGroups.length) return [];

  const looksGrouped = rawGroups.some((item) => {
    const candidate = asRecord(item);
    return Array.isArray(candidate.conditions) || Array.isArray(candidate.groups) || candidate.kind === "group";
  });
  if (!looksGrouped) {
    return [{
      id: "stored-group-root",
      logic: "AND",
      enabled: true,
      conditions: rawGroups.flatMap((item, index) => {
        const condition = normalizeCondition(item, index);
        return condition ? [condition] : [];
      }),
      groups: [],
    }];
  }

  function normalizedGroup(value: unknown, groupIndex: number): BuilderGroup {
    const group = asRecord(value);
    const logic = text(group, "logic", "operator");
    return {
      id: text(group, "id", "groupId", "group_id") ?? `stored-group-${groupIndex}`,
      logic: logic === "OR" || logic === "NOT" ? logic : "AND",
      enabled: group.enabled !== false,
      conditions: records(group.conditions).flatMap((item, conditionIndex) => {
        const condition = normalizeCondition(item, conditionIndex);
        return condition ? [condition] : [];
      }),
      groups: records(group.groups).map((child, childIndex) => normalizedGroup(child, childIndex)),
    };
  }

  const nodes = rawGroups.map(normalizedGroup);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const hasParentMetadata = rawGroups.some((value) => {
    const group = asRecord(value);
    return "parentGroupId" in group || "parent_group_id" in group;
  });
  if (!hasParentMetadata) return nodes;

  const roots: BuilderGroup[] = [];
  rawGroups.forEach((value, index) => {
    const parentId = text(asRecord(value), "parentGroupId", "parent_group_id");
    const node = nodes[index];
    const parent = parentId ? nodeById.get(parentId) : null;
    if (parent) parent.groups.push(node);
    else roots.push(node);
  });
  return roots;
}

export function normalizeBuilderInitial(value?: unknown): BuilderInitialState {
  const record = asRecord(value);
  return {
    id: text(record, "segmentId", "segment_id", "id"),
    name: text(record, "name", "title") ?? "",
    entityUnit: entityUnit(record) ?? "person",
    naturalLanguage: text(record, "naturalLanguage", "natural_language", "originalQuery", "original_query") ?? "",
    groups: normalizeGroups(record),
  };
}
