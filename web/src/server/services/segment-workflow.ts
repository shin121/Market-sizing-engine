import "server-only";

import { createHash, randomUUID } from "node:crypto";

import type { PoolClient } from "pg";

import {
  assertCatalogConditionPolicy,
  type CatalogConditionRecord,
} from "@/domain/condition-catalog-policy";
import { assertNoHighConfidencePersonalData } from "@/domain/privacy";
import { BASELINE_MODEL_VERSION } from "@/lib/constants";
import { assertSegmentConditionPayloadLimits } from "@/domain/segment-limits";
import { getRuntimeContext, withWorkspaceTransaction } from "@/server/db";
import {
  interpretNaturalLanguageWithClient,
  type InterpretationResult,
} from "@/server/services/natural-language-interpreter";
import {
  assertRuntimeConditionGroups,
  type RuntimeCondition,
} from "@/server/services/segment-runtime-validation";
import {
  tryMaterializeGoldQueryEstimate,
  tryMaterializeWeightedJointEstimate,
  type CalculationConditionRow,
} from "@/server/services/weighted-joint-estimator";

export type {
  InterpretedCondition,
  InterpretationResult,
} from "@/server/services/natural-language-interpreter";

type PlainObject = Record<string, unknown>;

export interface SaveSegmentInput {
  segmentId?: string | null;
  name: string;
  entityUnit: string;
  naturalLanguage?: string | null;
  conditions: unknown;
}

export interface CalculateEstimateInput {
  segmentId?: string | null;
  name: string;
  entityUnit: string;
  conditions: unknown;
}

const UNITS = new Set(["person", "child_person", "household", "establishment", "enterprise"]);
const CONDITION_NAMESPACES = new Set([
  "core_feature",
  "domain_feature",
  "dimension",
  "subtype",
  "archetype",
  "geography",
  "custom",
]);
const OPERATORS = new Set(["eq", "neq", "in", "not_in", "between", "lt", "lte", "gt", "gte", "contains", "exists"]);
const RESOLUTIONS = new Set(["exact", "similar", "proxy", "ambiguous", "missing", "research_required"]);
const VALIDATION_GAP_TYPES = new Set([
  "missing_joint_distribution",
  "outdated_reference_period",
  "weak_proxy",
  "unknown_unit_conversion",
  "geographic_granularity_gap",
  "small_sample",
  "business_web_presence_unobserved",
  "owner_attribute_unobserved",
  "purchase_intent_unobserved",
  "spend_per_entity_unobserved",
  "overlap_unknown",
  "other",
]);
export const RARE_OUTPUT_THRESHOLD = 10;
const RARE_OUTPUT_UNITS = new Set(["person", "child_person", "household"]);

interface RuntimeReleaseInterval {
  low: number | string;
  base: number | string;
  high: number | string;
  shareLow?: number | string | null;
  shareBase?: number | string | null;
  shareHigh?: number | string | null;
}

export function runtimeReleaseEnvelope(entityUnit: string, interval: RuntimeReleaseInterval) {
  const base = Number(interval.base);
  const suppressed = RARE_OUTPUT_UNITS.has(entityUnit)
    && Number.isFinite(base)
    && base < RARE_OUTPUT_THRESHOLD;
  return {
    suppressed,
    status: suppressed ? "suppressed" as const : "estimated" as const,
    countLow: suppressed ? null : interval.low,
    countBase: suppressed ? null : interval.base,
    countHigh: suppressed ? null : interval.high,
    shareLow: suppressed ? null : interval.shareLow ?? null,
    shareBase: suppressed ? null : interval.shareBase ?? null,
    shareHigh: suppressed ? null : interval.shareHigh ?? null,
    precisionRule: suppressed
      ? "suppressed_below_10_weighted_entities"
      : "whole_entity_round_half_up",
  };
}

function plainObject(value: unknown): PlainObject | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as PlainObject : null;
}

function readString(row: PlainObject, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function readTokenOrDefault(
  row: PlainObject,
  keys: string[],
  fallback: string,
  invalidError: string,
): string {
  const key = keys.find((candidate) => Object.prototype.hasOwnProperty.call(row, candidate));
  if (!key) return fallback;
  const value = row[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(invalidError);
  return value.trim();
}

function readBooleanOrDefault(
  row: PlainObject,
  key: string,
  fallback: boolean,
  invalidError: string,
): boolean {
  if (!Object.prototype.hasOwnProperty.call(row, key)) return fallback;
  const value = row[key];
  if (typeof value !== "boolean") throw new Error(invalidError);
  return value;
}

function readObjectArray(row: PlainObject, key: string): PlainObject[] {
  if (!Object.prototype.hasOwnProperty.call(row, key)) return [];
  const value = row[key];
  if (!Array.isArray(value)) throw new Error(`${key}_must_be_an_array`);
  return value.map((item, index) => {
    const parsed = plainObject(item);
    if (!parsed || !Object.keys(parsed).length) throw new Error(`${key}_${index + 1}_must_be_an_object`);
    return parsed;
  });
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === "string")
    .map((item) => item.trim()).filter(Boolean))];
}

function readOptionalInteger(value: unknown, field: string, minimum: number, maximum: number): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value.trim()) : Number.NaN;
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) throw new Error(`${field}_invalid`);
  return parsed;
}

function phase2DerivedConfidence(parentGrade: string) {
  if (parentGrade === "E") {
    return {
      sourceQuality: 9,
      recency: 6,
      directness: 3,
      jointObservation: 1,
      modelReliance: 6,
      total: 25,
      grade: "E" as const,
    };
  }
  return {
    sourceQuality: 18,
    recency: 10,
    directness: 7,
    jointObservation: 3,
    modelReliance: 10,
    total: 48,
    grade: "D" as const,
  };
}

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.entries(value as PlainObject)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
    .join(",")}}`;
}

export function contentHash(value: unknown): string {
  return createHash("sha256").update(stable(value)).digest("hex");
}

function parseRawConditions(raw: unknown): unknown {
  let value = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value) as unknown;
    } catch {
      throw new Error("conditions_json_invalid");
    }
  }
  return value;
}

interface ParsedConditionGroup {
  logic: "AND" | "OR" | "NOT";
  enabled: boolean;
  conditions: PlainObject[];
  groups: ParsedConditionGroup[];
}

function isGroupRow(row: PlainObject): boolean {
  return row.kind === "group"
    || Object.prototype.hasOwnProperty.call(row, "conditions")
    || Object.prototype.hasOwnProperty.call(row, "groups")
    || Object.prototype.hasOwnProperty.call(row, "children");
}

function parseGroup(row: PlainObject): ParsedConditionGroup {
  const rawLogic = readTokenOrDefault(
    row,
    ["logic", "logical_operator", "operator"],
    "AND",
    "invalid_condition_group_logic_token",
  ).toUpperCase();
  if (rawLogic !== "AND" && rawLogic !== "OR" && rawLogic !== "NOT") {
    throw new Error(`invalid_condition_group_logic:${rawLogic}`);
  }
  const logic = rawLogic;
  const directConditions = readObjectArray(row, "conditions");
  const explicitGroups = readObjectArray(row, "groups");
  const children = readObjectArray(row, "children");
  const childGroups = children.filter(isGroupRow);
  const childConditions = children.filter((child) => !isGroupRow(child));
  return {
    logic,
    enabled: readBooleanOrDefault(row, "enabled", true, "invalid_condition_group_enabled_token"),
    conditions: [...directConditions, ...childConditions],
    groups: [...explicitGroups, ...childGroups].map(parseGroup),
  };
}

function parseConditionGroups(raw: unknown): ParsedConditionGroup[] {
  const value = parseRawConditions(raw);
  assertSegmentConditionPayloadLimits(value);
  if (value === null || value === undefined) return [];
  const rawRows = Array.isArray(value) ? value : [value];
  const rows = rawRows.map((item, index) => {
    const parsed = plainObject(item);
    if (!parsed || !Object.keys(parsed).length) throw new Error(`condition_row_${index + 1}_must_be_an_object`);
    return parsed;
  });
  if (!rows.length) return [];
  const groupRows = rows.filter(isGroupRow);
  const conditionRows = rows.filter((row) => !isGroupRow(row));
  return [
    ...(conditionRows.length ? [{ logic: "AND" as const, enabled: true, conditions: conditionRows, groups: [] }] : []),
    ...groupRows.map(parseGroup),
  ];
}

function normalizedValue(operator: string, value: unknown): unknown {
  if (operator === "exists") return true;
  if (typeof value !== "string") return value;
  const text = value.trim();
  if (["in", "not_in", "between"].includes(operator)) {
    return text.split(/\s*(?:,|\.\.)\s*/u).map((item) => item.trim()).filter(Boolean);
  }
  return text;
}

function normalizedCondition(raw: PlainObject, ordinal: number, entityUnit: string) {
  const rawKind = readString(raw, "condition_namespace", "sourceKind", "source_kind", "referenceType", "kind", "group") ?? "custom";
  const kind = rawKind.toLowerCase();
  const namespace = kind === "dimension_value" || kind === "calibration_dimension" || kind === "axis" ? "dimension"
    : kind === "behavior" || kind === "tag" ? "domain_feature"
      : kind === "feature" ? "core_feature"
        : kind === "domain" ? "custom"
          : CONDITION_NAMESPACES.has(kind) ? kind : "custom";
  const sourceCode = readString(raw, "source_code", "sourceCode", "source_id", "sourceId", "featureCode", "feature", "catalogId", "catalog_id");
  if (!sourceCode) throw new Error(`condition_${ordinal + 1}_missing_source_code`);
  const rawOperator = readTokenOrDefault(
    raw,
    ["operator", "op"],
    "eq",
    `condition_${ordinal + 1}_invalid_operator_token`,
  );
  const normalizedOperator = rawOperator.toLowerCase();
  if (!OPERATORS.has(normalizedOperator)) {
    throw new Error(`condition_${ordinal + 1}_invalid_operator:${rawOperator}`);
  }
  const operator = normalizedOperator as RuntimeCondition["operator"];
  const rawResolution = readString(raw, "resolution_status", "matchStatus", "match_status") ?? "exact";
  const resolution = rawResolution === "matched" ? "exact" : RESOLUTIONS.has(rawResolution) ? rawResolution : "ambiguous";
  const conditionUnit = readString(raw, "entity_unit", "entityUnit", "unit") ?? entityUnit;
  if (conditionUnit !== "all" && !UNITS.has(conditionUnit)) throw new Error(`condition_${ordinal + 1}_invalid_entity_unit`);

  return {
    id: readString(raw, "condition_id", "conditionId", "id") ?? randomUUID(),
    namespace,
    sourceCode,
    operator,
    value: normalizedValue(operator, raw.value_json ?? raw.value ?? null),
    entityUnit: conditionUnit,
    resolution,
    sourceText: readString(raw, "source_text", "sourceText", "label", "label_ko"),
    dependencyGroup: readString(raw, "dependency_group", "dependencyGroup"),
    referenceYear: readOptionalInteger(raw.reference_year ?? raw.referenceYear, "reference_year", 1900, 2200),
    evidenceId: readOptionalInteger(raw.evidence_id ?? raw.evidenceId, "evidence_id", 1, Number.MAX_SAFE_INTEGER),
    enabled: readBooleanOrDefault(
      raw,
      "enabled",
      true,
      `condition_${ordinal + 1}_invalid_enabled_token`,
    ),
    ordinal,
  };
}

function validateEntityUnit(entityUnit: string): void {
  if (!UNITS.has(entityUnit)) throw new Error("invalid_entity_unit");
}

function requiredActorId(): string {
  const actorId = getRuntimeContext().actorId;
  if (!actorId) throw new Error("actor_context_required");
  return actorId;
}

function configuredModelVersion(): string {
  return process.env.MARKET_ENGINE_MODEL_VERSION?.trim() || BASELINE_MODEL_VERSION;
}

async function currentModelVersion(client: PoolClient): Promise<{ model_version_id: string; version: string }> {
  const result = await client.query<{ model_version_id: string; version: string }>(
    "SELECT model_version_id,version FROM model_version WHERE version=$1",
    [configuredModelVersion()],
  );
  if (!result.rows[0]) throw new Error("configured_model_version_not_loaded");
  return result.rows[0];
}

export async function interpretNaturalLanguage(naturalLanguage: string): Promise<InterpretationResult> {
  assertNoHighConfidencePersonalData(naturalLanguage);
  return withWorkspaceTransaction((client: PoolClient) =>
    interpretNaturalLanguageWithClient(client, naturalLanguage));
}

type NormalizedCondition = ReturnType<typeof normalizedCondition>;

async function assertConditionsMatchCatalog(
  client: PoolClient,
  conditions: readonly NormalizedCondition[],
  targetEntityUnit: string,
): Promise<void> {
  const catalogIds = [...new Set(conditions
    .filter((condition) => condition.enabled)
    .map((condition) => condition.sourceCode))];
  const records: CatalogConditionRecord[] = [];
  if (catalogIds.length) {
    const rows = await client.query<{
      catalog_id: string;
      source_kind: string;
      entity_unit: string;
      data_type: string;
      allowed_values: unknown;
      sensitive_class: string;
      queryable: boolean;
    }>(
      `SELECT catalog_id,source_kind,entity_unit,data_type,allowed_values,sensitive_class,queryable
         FROM production.v_workbench_condition_catalog
        WHERE catalog_id=ANY($1::text[])`,
      [catalogIds],
    );
    records.push(...rows.rows.map((row) => ({
      catalogId: row.catalog_id,
      sourceKind: row.source_kind,
      entityUnit: row.entity_unit,
      dataType: row.data_type,
      allowedValues: row.allowed_values,
      sensitiveClass: row.sensitive_class,
      queryable: row.queryable,
    })));
  }
  assertCatalogConditionPolicy(conditions, records, targetEntityUnit);
}

interface NormalizedConditionGroup {
  logic: "AND" | "OR" | "NOT";
  enabled: boolean;
  conditions: NormalizedCondition[];
  groups: NormalizedConditionGroup[];
}

function normalizeGroup(group: ParsedConditionGroup, entityUnit: string): NormalizedConditionGroup {
  return {
    logic: group.logic,
    enabled: group.enabled,
    conditions: group.conditions.map((row, index) => normalizedCondition(row, index, entityUnit)),
    groups: group.groups.map((child) => normalizeGroup(child, entityUnit)),
  };
}

function assertNotGroupShape(groups: NormalizedConditionGroup[], parentEnabled = true): void {
  for (const group of groups) {
    const effectivelyEnabled = parentEnabled && group.enabled;
    const enabledChildren = group.conditions.filter((condition) => condition.enabled).length
      + group.groups.filter((child) => child.enabled).length;
    if (effectivelyEnabled && group.logic === "NOT" && enabledChildren !== 1) {
      throw new Error("not_group_requires_exactly_one_enabled_child");
    }
    assertNotGroupShape(group.groups, effectivelyEnabled);
  }
}

function effectiveConditions(groups: NormalizedConditionGroup[], parentEnabled = true): NormalizedCondition[] {
  return groups.flatMap((group) => {
    const groupEnabled = parentEnabled && group.enabled;
    return [
      ...group.conditions.map((condition) => ({ ...condition, enabled: groupEnabled && condition.enabled })),
      ...effectiveConditions(group.groups, groupEnabled),
    ];
  });
}

function groupDefinition(group: NormalizedConditionGroup): PlainObject {
  const definition: PlainObject = {
    logic: group.logic,
    enabled: group.enabled,
    conditions: group.conditions.map((condition) => ({
      feature: condition.sourceCode,
      op: condition.operator,
      value: condition.value,
      enabled: condition.enabled,
      resolution_status: condition.resolution,
      reference_year: condition.referenceYear,
      evidence_id: condition.evidenceId,
    })),
  };
  if (group.groups.length) definition.groups = group.groups.map(groupDefinition);
  return definition;
}

async function ensureQuery(
  client: PoolClient,
  input: { name: string; entityUnit: string; naturalLanguage?: string | null; conditions: unknown },
): Promise<{ queryId: string; queryHash: string; normalized: ReturnType<typeof normalizedCondition>[] }> {
  assertNoHighConfidencePersonalData({
    name: input.name,
    naturalLanguage: input.naturalLanguage,
    conditions: input.conditions,
  });
  validateEntityUnit(input.entityUnit);
  const conditionGroups = parseConditionGroups(input.conditions);
  const normalizedGroups = conditionGroups.map((group) => normalizeGroup(group, input.entityUnit));
  assertNotGroupShape(normalizedGroups);
  const normalized = effectiveConditions(normalizedGroups);
  if (!normalized.length) throw new Error("at_least_one_condition_required");
  const validationIssues = assertRuntimeConditionGroups({
    name: input.name,
    entityUnit: input.entityUnit,
    naturalLanguage: input.naturalLanguage,
    groups: normalizedGroups,
  });
  const invalidUnits = normalized.filter((condition) => condition.enabled && condition.entityUnit !== "all" && condition.entityUnit !== input.entityUnit);
  if (invalidUnits.length) throw new Error(`entity_unit_mismatch:${invalidUnits.map((item) => item.sourceCode).join(",")}`);
  await assertConditionsMatchCatalog(client, normalized, input.entityUnit);

  const definition = {
    entity_unit: input.entityUnit,
    geography_scope: { level: "country", codes: ["KR"] },
    natural_language: input.naturalLanguage ?? null,
    where: normalizedGroups.map(groupDefinition),
    validation_issues: validationIssues,
  };
  const queryHash = contentHash(definition);
  const version = await currentModelVersion(client);
  const context = getRuntimeContext();
  if (!context.workspaceId || !context.actorId) throw new Error("query_workspace_actor_context_required");
  const queryResult = await client.query<{ query_id: string }>(
    `INSERT INTO segment_query (
       workspace_id,created_by_actor_id,name,filter_json,primary_entity_unit,
       geography_scope,as_of_date,query_hash,data_version
     ) VALUES ($1,$2,$3,$4::jsonb,$5,$6::jsonb,current_date,$7,$8)
     ON CONFLICT (workspace_id,query_hash) DO NOTHING
     RETURNING query_id`,
    [context.workspaceId, context.actorId, input.name, JSON.stringify(definition), input.entityUnit,
      JSON.stringify(definition.geography_scope), queryHash, version.version],
  );
  const queryId = queryResult.rows[0]?.query_id ?? (await client.query<{ query_id: string }>(
    "SELECT query_id FROM segment_query WHERE workspace_id=$1 AND query_hash=$2",
    [context.workspaceId, queryHash],
  )).rows[0]?.query_id;
  if (!queryId) throw new Error("segment_query_conflict_not_visible");

  const existing = await client.query<{ count: string }>("SELECT count(*)::text AS count FROM segment_condition_group WHERE query_id = $1", [queryId]);
  if (Number(existing.rows[0].count) === 0) {
    async function insertGroup(group: NormalizedConditionGroup, parentGroupId: string | null, ordinal: number): Promise<void> {
      const inserted = await client.query<{ group_id: string }>(
        `INSERT INTO segment_condition_group (
           query_id,parent_group_id,logical_operator,ordinal,enabled
         ) VALUES ($1,$2,$3,$4,$5) RETURNING group_id`,
        [queryId, parentGroupId, group.logic, ordinal, group.enabled],
      );
      const targetGroupId = inserted.rows[0].group_id;
      for (const condition of group.conditions) {
        await client.query(
          `INSERT INTO segment_condition (
             condition_id, query_id, group_id, condition_namespace, source_code,
             operator, value_json, entity_unit, resolution_status, source_text,
             dependency_group, reference_year, evidence_id, ordinal, enabled
           ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,$13,$14,$15)`,
          [condition.id, queryId, targetGroupId, condition.namespace, condition.sourceCode,
            condition.operator, JSON.stringify(condition.value), condition.entityUnit,
            condition.resolution, condition.sourceText, condition.dependencyGroup,
            condition.referenceYear, condition.evidenceId, condition.ordinal, condition.enabled],
        );
      }
      for (let childIndex = 0; childIndex < group.groups.length; childIndex += 1) {
        await insertGroup(group.groups[childIndex], targetGroupId, childIndex);
      }
    }

    const rootGroup: NormalizedConditionGroup = normalizedGroups.length === 1 ? normalizedGroups[0] : {
      logic: "AND",
      enabled: true,
      conditions: [],
      groups: normalizedGroups,
    };
    await insertGroup(rootGroup, null, 0);
  }
  return { queryId, queryHash, normalized };
}

async function appendAudit(
  client: PoolClient,
  actorId: string,
  aggregateType: string,
  aggregateId: string,
  action: string,
  before: unknown,
  after: unknown,
): Promise<void> {
  const context = getRuntimeContext();
  await client.query(
    `INSERT INTO audit_event (
       workspace_id, actor_id, aggregate_type, aggregate_id, action,
       before_json, after_json, diff_json
     ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb)`,
    [context.workspaceId, actorId, aggregateType, aggregateId, action,
      before === null ? null : JSON.stringify(before),
      after === null ? null : JSON.stringify(after),
      JSON.stringify({ content_hash: contentHash(after) })],
  );
}

async function pinCalculatedResultToSegmentVersion(
  client: PoolClient,
  actorId: string,
  savedSegmentId: string,
  queryId: string,
  resultId: string,
): Promise<number> {
  const locked = await client.query<{
    current_version_no: number;
    query_id: string;
    pinned_result_id: string | null;
    natural_language_text: string | null;
    parser_version: string | null;
    definition_hash: string;
  }>(
    `SELECT ss.current_version_no, ssv.query_id, ssv.pinned_result_id,
            ssv.natural_language_text, ssv.parser_version, ssv.definition_hash
       FROM saved_segment ss
       JOIN saved_segment_version ssv
         ON ssv.saved_segment_id=ss.saved_segment_id
        AND ssv.version_no=ss.current_version_no
      WHERE ss.saved_segment_id=$1
      FOR UPDATE OF ss`,
    [savedSegmentId],
  );
  const current = locked.rows[0];
  if (!current) throw new Error("saved_segment_not_found");
  if (current.query_id !== queryId) throw new Error("saved_segment_changed_during_calculation");
  if (current.pinned_result_id === resultId) return current.current_version_no;

  const nextVersion = current.current_version_no + 1;
  await client.query(
    `INSERT INTO saved_segment_version (
       saved_segment_id, version_no, query_id, pinned_result_id,
       natural_language_text, parser_version, definition_hash,
       change_reason, created_by_actor_id
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [savedSegmentId, nextVersion, queryId, resultId,
      current.natural_language_text, current.parser_version, current.definition_hash,
      current.pinned_result_id === null ? "calculation_snapshot_pinned" : "recalculation_snapshot_pinned",
      actorId],
  );
  await client.query(
    `UPDATE saved_segment
        SET current_version_no=$2,
            optimistic_lock_version=optimistic_lock_version+1,
            updated_at=now()
      WHERE saved_segment_id=$1`,
    [savedSegmentId, nextVersion],
  );
  await appendAudit(client, actorId, "saved_segment", savedSegmentId, "pin_result_version", {
    version_no: current.current_version_no,
    pinned_result_id: current.pinned_result_id,
  }, {
    version_no: nextVersion,
    pinned_result_id: resultId,
  });
  return nextVersion;
}

export async function saveSegment(input: SaveSegmentInput): Promise<string> {
  const actorId = requiredActorId();
  return withWorkspaceTransaction(async (client: PoolClient) => {
    const context = getRuntimeContext();
    const query = await ensureQuery(client, input);
    const definitionHash = contentHash({ query_id: query.queryId, query_hash: query.queryHash });

    if (!input.segmentId) {
      const inserted = await client.query<{ saved_segment_id: string }>(
        `INSERT INTO saved_segment (
           workspace_id, title, description, created_by_actor_id
         ) VALUES ($1,$2,$3,$4)
         RETURNING saved_segment_id`,
        [context.workspaceId, input.name, input.naturalLanguage ?? null, actorId],
      );
      const segmentId = inserted.rows[0].saved_segment_id;
      await client.query(
        `INSERT INTO saved_segment_version (
           saved_segment_id, version_no, query_id, pinned_result_id, natural_language_text,
           parser_version, definition_hash, change_reason, created_by_actor_id
         ) VALUES ($1,1,$2,(
             SELECT result_id FROM segment_query_result
              WHERE query_id=$2 AND cache_status='valid'
              ORDER BY executed_at DESC LIMIT 1
           ),$3,'catalog-trigram-v1',$4,'initial',$5)`,
        [segmentId, query.queryId, input.naturalLanguage ?? null, definitionHash, actorId],
      );
      await appendAudit(client, actorId, "saved_segment", segmentId, "create", null, input);
      return segmentId;
    }

    const locked = await client.query<{
      saved_segment_id: string;
      title: string;
      description: string | null;
      current_version_no: number;
      optimistic_lock_version: string;
    }>("SELECT * FROM saved_segment WHERE saved_segment_id = $1 FOR UPDATE", [input.segmentId]);
    if (!locked.rows[0]) throw new Error("saved_segment_not_found");
    const before = locked.rows[0];
    const nextVersion = before.current_version_no + 1;
    await client.query(
      `UPDATE saved_segment SET
         title = $2, description = $3, current_version_no = $4,
         optimistic_lock_version = optimistic_lock_version + 1, updated_at = now()
       WHERE saved_segment_id = $1`,
      [input.segmentId, input.name, input.naturalLanguage ?? null, nextVersion],
    );
    await client.query(
      `INSERT INTO saved_segment_version (
         saved_segment_id, version_no, query_id, pinned_result_id, natural_language_text,
         parser_version, definition_hash, change_reason, created_by_actor_id
       ) VALUES ($1,$2,$3,(
           SELECT result_id FROM segment_query_result
            WHERE query_id=$3 AND cache_status='valid'
            ORDER BY executed_at DESC LIMIT 1
         ),$4,'catalog-trigram-v1',$5,'user_edit',$6)`,
      [input.segmentId, nextVersion, query.queryId, input.naturalLanguage ?? null, definitionHash, actorId],
    );
    await appendAudit(client, actorId, "saved_segment", input.segmentId, "new_version", before, { ...input, version: nextVersion });
    return input.segmentId;
  });
}

async function resolveQueryForCalculation(
  client: PoolClient,
  input: CalculateEstimateInput,
): Promise<{ queryId: string; queryHash: string; normalized: ReturnType<typeof normalizedCondition>[] }> {
  if (!input.segmentId) return ensureQuery(client, input);
  const row = await client.query<{ query_id: string; query_hash: string; primary_entity_unit: string }>(
    `SELECT sq.query_id, sq.query_hash, sq.primary_entity_unit
     FROM saved_segment ss
     JOIN saved_segment_version ssv
       ON ssv.saved_segment_id = ss.saved_segment_id AND ssv.version_no = ss.current_version_no
     JOIN segment_query sq USING (query_id)
     WHERE ss.saved_segment_id = $1`,
    [input.segmentId],
  );
  if (!row.rows[0]) throw new Error("saved_segment_not_found");
  if (row.rows[0].primary_entity_unit !== input.entityUnit) {
    throw new Error(
      `saved_segment_entity_unit_mismatch:${row.rows[0].primary_entity_unit}:${input.entityUnit}`,
    );
  }
  const conditions = await client.query<PlainObject>(
    `WITH RECURSIVE group_state AS (
       SELECT scg.*, scg.enabled AS effectively_enabled
         FROM segment_condition_group scg
        WHERE scg.query_id=$1 AND scg.parent_group_id IS NULL
       UNION ALL
       SELECT child.*, parent.effectively_enabled AND child.enabled
         FROM segment_condition_group child
         JOIN group_state parent
           ON parent.query_id=child.query_id AND parent.group_id=child.parent_group_id
     )
     SELECT sc.* FROM segment_condition sc
       JOIN group_state scg USING (query_id,group_id)
      WHERE sc.query_id=$1 AND scg.effectively_enabled AND sc.enabled
      ORDER BY scg.ordinal,sc.ordinal`,
    [row.rows[0].query_id],
  );
  return {
    queryId: row.rows[0].query_id,
    queryHash: row.rows[0].query_hash,
    normalized: conditions.rows.map((condition, index) => normalizedCondition(condition, index, input.entityUnit)),
  };
}

export async function calculateEstimate(input: CalculateEstimateInput): Promise<string> {
  const actorId = requiredActorId();
  return withWorkspaceTransaction(async (client: PoolClient) => {
    validateEntityUnit(input.entityUnit);
    const context = getRuntimeContext();
    const query = await resolveQueryForCalculation(client, input);
    if (input.segmentId) await assertConditionsMatchCatalog(client, query.normalized, input.entityUnit);
    const modelRow = await currentModelVersion(client);

    let estimateId: string | null = null;
    let resultSummary: PlainObject = {
      status: "not_estimable",
      reason: "registered_joint_distribution_not_available",
    };
    const activeConditions = query.normalized.filter((condition) => condition.enabled);
    const storedConditions = await client.query<{
      condition_namespace: string;
      source_code: string;
      operator: RuntimeCondition["operator"];
      value_json: unknown;
      resolution_status: string;
      group_id: string;
      logical_operator: "AND" | "OR" | "NOT";
      parent_group_id: string | null;
      logical_path: Array<"AND" | "OR" | "NOT">;
      canonical_allowed_values: unknown;
      reference_year: number | null;
      catalog_source_kind: string | null;
      catalog_source_record_id: string | null;
      catalog_source_code: string | null;
      catalog_domain_id: string | null;
      catalog_dimension_id: string | null;
      catalog_label: string | null;
      calibration_dimension_code: string | null;
      calibration_dimension_value: string | null;
      calibration_selected_as_control: boolean | null;
      calibration_directness_class: string | null;
      calibration_mapping_confidence: string | null;
      calibration_version: string | null;
      calibration_reference_year: number | null;
      calibration_source_release_id: string | null;
    } & CalculationConditionRow>(
      `WITH RECURSIVE group_state AS (
         SELECT scg.*, scg.enabled AS effectively_enabled,
                ARRAY[scg.logical_operator::text] AS logical_path
           FROM segment_condition_group scg
          WHERE scg.query_id=$1 AND scg.parent_group_id IS NULL
         UNION ALL
         SELECT child.*, parent.effectively_enabled AND child.enabled,
                parent.logical_path || child.logical_operator::text
           FROM segment_condition_group child
           JOIN group_state parent
             ON parent.query_id=child.query_id AND parent.group_id=child.parent_group_id
       )
       SELECT sc.condition_namespace, sc.source_code, sc.operator, sc.value_json, sc.resolution_status,
              sc.group_id, scg.logical_operator, scg.parent_group_id, scg.logical_path,
              catalog.allowed_values AS canonical_allowed_values, sc.reference_year,
              catalog.source_kind AS catalog_source_kind,
              catalog.source_record_id AS catalog_source_record_id,
              catalog.source_code AS catalog_source_code,
              catalog.domain_id AS catalog_domain_id,
              catalog.dimension_id AS catalog_dimension_id,
              catalog.label_ko AS catalog_label,
              calibration.dimension_code AS calibration_dimension_code,
              calibration.dimension_value AS calibration_dimension_value,
              calibration.selected_as_control AS calibration_selected_as_control,
              calibration.directness_class AS calibration_directness_class,
              calibration.mapping_confidence AS calibration_mapping_confidence,
              calibration.calibration_version,
              calibration.reference_year AS calibration_reference_year,
              calibration.source_release_id AS calibration_source_release_id
         FROM segment_condition sc
         JOIN group_state scg USING (query_id, group_id)
         LEFT JOIN production.v_workbench_condition_catalog catalog ON catalog.catalog_id=sc.source_code
         LEFT JOIN production.calibration_dimension_catalog calibration
           ON calibration.catalog_id=sc.source_code
        WHERE sc.query_id=$1 AND sc.enabled AND scg.effectively_enabled
        ORDER BY scg.ordinal, sc.ordinal`,
      [query.queryId],
    );
    const positiveOperators = new Set<RuntimeCondition["operator"]>(["eq", "in"]);
    const isPositiveConjunct = (condition: typeof storedConditions.rows[number]) =>
      positiveOperators.has(condition.operator)
      && condition.logical_path.every((operator) => operator === "AND");
    const canonicalReferenceValueMatches = (condition: typeof storedConditions.rows[number]) => {
      if (!["archetype", "subtype"].includes(condition.condition_namespace)) return true;
      const canonicalId = condition.source_code.replace(/^(?:archetype|subtype):/u, "");
      const supplied = condition.operator === "eq"
        ? [condition.value_json]
        : condition.operator === "in" && Array.isArray(condition.value_json)
          ? condition.value_json
          : [];
      const catalogValues = Array.isArray(condition.canonical_allowed_values)
        ? condition.canonical_allowed_values.filter((value): value is string => typeof value === "string")
        : [];
      const allowedValues = new Set([canonicalId, condition.source_code, ...catalogValues].map((value) => value.trim()));
      return supplied.length === 1
        && typeof supplied[0] === "string"
        && allowedValues.has(supplied[0].trim());
    };
    const isCanonicalPositiveConjunct = (condition: typeof storedConditions.rows[number]) =>
      isPositiveConjunct(condition) && canonicalReferenceValueMatches(condition);
    // Only an exact canonical match is allowed to reuse a registered estimate
    // or allocation. `similar` and `proxy` remain useful discovery states, but
    // they are not evidence that the referenced canonical record represents
    // the user's condition.
    const resolvedStored = storedConditions.rows.filter((condition) =>
      condition.resolution_status === "exact",
    );
    const materializationInput = {
      queryId: query.queryId,
      queryHash: query.queryHash,
      entityUnit: input.entityUnit,
      workspaceId: context.workspaceId,
      actorId,
      modelVersionId: modelRow.model_version_id,
      modelVersion: modelRow.version,
    };
    const goldMaterialized = await tryMaterializeGoldQueryEstimate(
      client,
      materializationInput,
      storedConditions.rows,
    );
    if (goldMaterialized) {
      estimateId = goldMaterialized.estimateId;
      resultSummary = goldMaterialized.resultSummary;
    }
    const archetypeCondition = !estimateId && storedConditions.rows.length === 1
      && resolvedStored.length === 1
      && resolvedStored[0].condition_namespace === "archetype"
      && isCanonicalPositiveConjunct(resolvedStored[0])
      ? resolvedStored[0] : null;
    if (archetypeCondition) {
      const archetypeId = archetypeCondition.source_code.replace(/^archetype:/, "");
      const estimate = await client.query<{
        estimate_id: string;
        entity_unit: string;
        geography_id: string;
        period_id: string;
        denominator_definition: string;
        count_low: string | null;
        count_base: string | null;
        count_high: string | null;
        share_low: string | null;
        share_base: string | null;
        share_high: string | null;
        method_code: string;
        model_version_id: string;
        run_id: string;
        status: string;
        data_version: string;
        dependency_fingerprint: string | null;
      }>(
        `SELECT e.estimate_id, e.entity_unit, e.geography_id, e.period_id,
                e.denominator_definition, e.count_low, e.count_base, e.count_high,
                e.share_low, e.share_base, e.share_high, e.method_code,
                e.model_version_id, e.run_id, e.status, e.data_version,
                e.dependency_fingerprint
           FROM estimate e
           JOIN time_period tp USING (period_id)
          WHERE e.subject_type = 'archetype' AND e.subject_id = $1
            AND e.approval_status IN ('approved','not_required')
            AND ($2::integer IS NULL OR $2::integer BETWEEN
                 extract(year FROM tp.start_date)::integer AND extract(year FROM tp.end_date)::integer)
            AND e.entity_unit = $3
          ORDER BY CASE e.data_layer WHEN 'approved_version' THEN 0 WHEN 'baseline' THEN 1 ELSE 2 END,
                   e.created_at DESC LIMIT 1`,
        [archetypeId, archetypeCondition.reference_year, input.entityUnit],
      );
      if (estimate.rows[0]) {
        const sourceEstimate = estimate.rows[0];
        const release = sourceEstimate.count_low === null
          || sourceEstimate.count_base === null
          || sourceEstimate.count_high === null
          ? null
          : runtimeReleaseEnvelope(input.entityUnit, {
              low: sourceEstimate.count_low,
              base: sourceEstimate.count_base,
              high: sourceEstimate.count_high,
              shareLow: sourceEstimate.share_low,
              shareBase: sourceEstimate.share_base,
              shareHigh: sourceEstimate.share_high,
            });
        if (release?.suppressed) {
          // The registered source estimate remains immutable. The runtime query
          // receives a separate, workspace-owned release snapshot with no
          // reconstructable count/share/component values.
          const sourceFingerprint = sourceEstimate.dependency_fingerprint
            ?? contentHash(sourceEstimate);
          const calculationHash = contentHash({
            query: query.queryHash,
            model: modelRow.version,
            sourceEstimateId: sourceEstimate.estimate_id,
            sourceFingerprint,
            releasePolicy: {
              version: "rare-output-v1",
              threshold: RARE_OUTPUT_THRESHOLD,
              entityUnit: input.entityUnit,
            },
          });
          const externalEstimateKey = `query:${context.workspaceId}:${query.queryHash}:${modelRow.model_version_id}:${calculationHash}`;
          const insertedSuppressed = await client.query<{ estimate_id: string }>(
            `INSERT INTO estimate (
               external_estimate_key, workspace_id, subject_type, subject_id, entity_unit,
               geography_id, period_id, denominator_definition,
               count_low, count_base, count_high, share_low, share_base, share_high,
               method_code, formula, precision_rule, model_version_id, run_id,
               status, data_version, data_layer, approval_status,
               calculation_input_hash, dependency_fingerprint, created_by_actor_id
             ) VALUES (
               $1,$2,'query',$3,$4,$5,$6,$7,
               NULL,NULL,NULL,NULL,NULL,NULL,
               'rare_output_suppression',$8,'suppressed_below_10_weighted_entities',$9,$10,
               'suppressed',$11,'derived_estimate','not_required',$12,$12,$13
             )
             ON CONFLICT (external_estimate_key) WHERE external_estimate_key IS NOT NULL
             DO NOTHING
             RETURNING estimate_id`,
            [
              externalEstimateKey,
              context.workspaceId,
              query.queryId,
              input.entityUnit,
              sourceEstimate.geography_id,
              sourceEstimate.period_id,
              sourceEstimate.denominator_definition,
              "runtime_release_policy(weighted_base_count < 10); source estimate retained only as a lineage dependency",
              sourceEstimate.model_version_id,
              sourceEstimate.run_id,
              sourceEstimate.data_version,
              calculationHash,
              actorId,
            ],
          );
          estimateId = insertedSuppressed.rows[0]?.estimate_id ?? (await client.query<{ estimate_id: string }>(
            `SELECT estimate_id FROM estimate
              WHERE external_estimate_key=$1 AND workspace_id=$2`,
            [externalEstimateKey, context.workspaceId],
          )).rows[0]?.estimate_id ?? null;
          if (!estimateId) throw new Error("suppressed_estimate_conflict_not_visible");
          await client.query(
            `INSERT INTO estimate_dependency (
               estimate_id,dependency_kind,dependency_record_key,dependency_version,
               dependency_content_hash,dependency_role,model_version_id
             ) VALUES ($1,'parent_estimate',$2,$3,$4,'output',$5)
             ON CONFLICT DO NOTHING`,
            [estimateId, sourceEstimate.estimate_id, sourceEstimate.data_version,
              sourceFingerprint, sourceEstimate.model_version_id],
          );
          await client.query(
            `INSERT INTO estimate_dependency (
               estimate_id,dependency_kind,dependency_record_key,dependency_version,
               dependency_content_hash,dependency_role,evidence_id,model_version_id
             )
             SELECT $1,dependency_kind,dependency_record_key,dependency_version,
                    dependency_content_hash,dependency_role,evidence_id,model_version_id
               FROM estimate_dependency
              WHERE estimate_id=$2
             ON CONFLICT DO NOTHING`,
            [estimateId, sourceEstimate.estimate_id],
          );
          await client.query(
            `INSERT INTO estimate_component (
               estimate_id,component_code,component_type,unit,operation,sequence,
               data_version,denominator_definition,reference_period_id,
               directness_class,model_version_id,adjustment_reason,metadata_json
             ) VALUES (
               $1,'runtime_source_estimate','source_estimate',$2,'input',1,
               $3,$4,$5,'inference',$6,$7,$8::jsonb
             ) ON CONFLICT DO NOTHING`,
            [estimateId, input.entityUnit, sourceEstimate.data_version,
              sourceEstimate.denominator_definition, sourceEstimate.period_id,
              sourceEstimate.model_version_id,
              "Source values withheld by the below-10 runtime release policy.",
              JSON.stringify({
                source_estimate_id: sourceEstimate.estimate_id,
                source_method_code: sourceEstimate.method_code,
                release_policy: "rare-output-v1",
                threshold: RARE_OUTPUT_THRESHOLD,
              })],
          );
          await client.query(
            `INSERT INTO estimate_component (
               estimate_id,component_code,component_type,evidence_id,operation,sequence,
               data_version,denominator_definition,reference_period_id,
               directness_class,model_version_id,adjustment_reason,metadata_json
             )
             SELECT $1,'source_evidence:' || source.component_id::text,'source_evidence',
                    source.evidence_id,'evidence',10 + row_number() OVER (ORDER BY source.component_id),
                    $3,$4,$5,source.directness_class,$6,
                    'Evidence link retained; numeric component values withheld by release policy.',
                    jsonb_build_object('source_estimate_id',$2::uuid,'source_component_id',source.component_id)
               FROM estimate_component source
              WHERE source.estimate_id=$2::uuid AND source.evidence_id IS NOT NULL
             ON CONFLICT DO NOTHING`,
            [estimateId, sourceEstimate.estimate_id, sourceEstimate.data_version,
              sourceEstimate.denominator_definition, sourceEstimate.period_id,
              sourceEstimate.model_version_id],
          );
          await client.query(
            `INSERT INTO confidence_assessment (
               estimate_id,source_quality_score,recency_score,directness_score,
               joint_observation_score,model_reliance_score,total_score,grade,
               rationale,data_version,rule_version,components_json,penalties_json,
               validation_gap_reviewed_at
             )
             SELECT $1,source_quality_score,recency_score,directness_score,
                    joint_observation_score,model_reliance_score,total_score,grade,
                    rationale || ' Runtime values withheld by the below-10 release policy.',
                    data_version,rule_version,components_json,penalties_json,now()
               FROM confidence_assessment WHERE estimate_id=$2
             ON CONFLICT (estimate_id) DO NOTHING`,
            [estimateId, sourceEstimate.estimate_id],
          );
          await client.query(
            `INSERT INTO confidence_assessment (
               estimate_id,source_quality_score,recency_score,directness_score,
               joint_observation_score,model_reliance_score,total_score,grade,
               rationale,data_version,rule_version,components_json,penalties_json,
               validation_gap_reviewed_at
             ) VALUES ($1,0,0,0,0,0,0,'E',$2,$3,'rare-output-v1',$4::jsonb,$5::jsonb,now())
             ON CONFLICT (estimate_id) DO NOTHING`,
            [estimateId,
              "Source confidence assessment unavailable; runtime values remain withheld by release policy.",
              sourceEstimate.data_version,
              JSON.stringify({ releasePolicy: "rare-output-v1", threshold: RARE_OUTPUT_THRESHOLD }),
              JSON.stringify([{ code: "small_sample_release_suppression", points: 0 }])],
          );
          await client.query(
            `INSERT INTO validation_gap (
               estimate_id,gap_type,description,impact,verification_question,
               recommended_source,expected_improvement,priority,status,data_version
             ) SELECT $1,'small_sample',$2,'high',$3,$4,$5,1,'open',$6
               WHERE NOT EXISTS (
                 SELECT 1 FROM validation_gap
                  WHERE estimate_id=$1 AND gap_type='small_sample'
               )`,
            [estimateId,
              "Computed human-related Base output is below the release threshold and is suppressed.",
              "Can a larger authoritative sample support release at or above the minimum cell threshold?",
              "Official cross-tabulation or probability sample with a larger effective cell.",
              "Permits a reviewed aggregate release without exposing a rare cell.",
              sourceEstimate.data_version],
          );
          resultSummary = {
            status: "suppressed",
            reason: "rare_output_below_release_threshold",
            threshold: RARE_OUTPUT_THRESHOLD,
            calculation: "exact_archetype_estimate_reuse_with_runtime_suppression",
            source_estimate_id: sourceEstimate.estimate_id,
            formula: "runtime_release_policy(weighted_base_count < threshold)",
          };
        } else {
          estimateId = sourceEstimate.estimate_id;
          resultSummary = {
            status: sourceEstimate.status,
            count_low: sourceEstimate.count_low,
            count_base: sourceEstimate.count_base,
            count_high: sourceEstimate.count_high,
            calculation: "exact_archetype_estimate_reuse",
          };
        }
      } else {
        resultSummary = {
          status: "not_estimable",
          reason: archetypeCondition.reference_year === null
            ? "matching_archetype_has_no_approved_estimate"
            : "matching_archetype_has_no_approved_estimate_for_reference_year",
          reference_year: archetypeCondition.reference_year,
        };
      }
    } else if (!estimateId) {
      resultSummary = {
        status: "not_estimable",
        reason: activeConditions.some((condition) => condition.resolution !== "exact")
          ? "non_exact_conditions_require_research"
          : storedConditions.rows.some((condition) => !canonicalReferenceValueMatches(condition))
            ? "condition_value_reference_mismatch"
          : storedConditions.rows.some((condition) => !positiveOperators.has(condition.operator))
            ? "unsupported_condition_operator_requires_joint_evidence"
            : storedConditions.rows.some((condition) => condition.logical_path.includes("NOT"))
              ? "unsupported_negation_requires_joint_evidence"
          : "registered_joint_distribution_not_available",
        condition_count: activeConditions.length,
      };
    }

    const hasUnresolvedStored = storedConditions.rows.some((condition) =>
      condition.resolution_status !== "exact",
    );
    const parentConditions = resolvedStored.filter((condition) => condition.condition_namespace === "archetype");
    const subtypeConditions = resolvedStored.filter((condition) => condition.condition_namespace === "subtype");
    const onlyParentAndSubtype = resolvedStored.length === parentConditions.length + subtypeConditions.length;
    const parentHasSupportedContext = parentConditions.length === 1 && isCanonicalPositiveConjunct(parentConditions[0]);
    const subtypeGroups = new Set(subtypeConditions.map((condition) => condition.group_id));
    const subtypeLogic = subtypeConditions[0]?.logical_operator;
    const subtypeOperatorsSupported = subtypeConditions.every((condition) =>
      positiveOperators.has(condition.operator) && canonicalReferenceValueMatches(condition));
    const subtypeAncestorsAreConjunctive = subtypeConditions.every((condition) =>
      condition.logical_path.slice(0, -1).every((operator) => operator === "AND"),
    );
    const subtypeShapeSupported = subtypeGroups.size === 1
      && subtypeOperatorsSupported
      && subtypeAncestorsAreConjunctive
      && (subtypeLogic === "OR"
        || (subtypeLogic === "AND" && subtypeConditions.length === 1)
        || (subtypeLogic === "NOT" && subtypeConditions.length === 1));
    const parentAndSubtypeShareSupportedContext = parentConditions[0]?.group_id !== subtypeConditions[0]?.group_id
      || parentConditions[0]?.logical_operator === "AND";
    const allocationReferencePeriodIsUnverified = [...parentConditions, ...subtypeConditions]
      .some((condition) => condition.reference_year !== null);
    const allocationShapeIsEligible = !estimateId && !hasUnresolvedStored && onlyParentAndSubtype
      && parentHasSupportedContext && subtypeConditions.length >= 1
      && subtypeShapeSupported && parentAndSubtypeShareSupportedContext;
    if (allocationShapeIsEligible && allocationReferencePeriodIsUnverified) {
      resultSummary = {
        status: "not_estimable",
        reason: "subtype_allocation_reference_period_provenance_unverified",
        reference_years: [...new Set([...parentConditions, ...subtypeConditions]
          .map((condition) => condition.reference_year).filter((year) => year !== null))],
      };
    } else if (allocationShapeIsEligible) {
      const parentArchetypeId = parentConditions[0].source_code.replace(/^archetype:/, "");
      const subtypeIds = subtypeConditions.map((condition) => condition.source_code.replace(/^subtype:/, ""));

      const allocationResult = await client.query<{
        subtype_id: string;
        count_low: string;
        count_base: string;
        count_high: string;
        share_low: string;
        share_base: string;
        share_high: string;
        allocation_formula: string;
        conditional_method: string;
        model_version_id: string;
        run_id: string;
        data_version: string;
        entity_unit: string;
        parent_count_low: string;
        parent_count_base: string;
        parent_count_high: string;
        denominator_definition: string;
        confidence_grade: string;
        source_release_ids: unknown;
        validation_gaps: unknown;
      }>(
        `SELECT sa.subtype_id, sa.count_low, sa.count_base, sa.count_high,
                sa.share_low, sa.share_base, sa.share_high,
                sa.allocation_formula, sa.conditional_method,
                sa.model_version_id, sa.run_id, sa.data_version,
                ppe.entity_unit, ppe.count_low AS parent_count_low,
                ppe.count_base AS parent_count_base, ppe.count_high AS parent_count_high,
                ppe.denominator_definition, ppe.confidence_grade,
                ppe.source_release_ids, ppe.validation_gaps
           FROM subtype_allocation sa
           JOIN phase2_parent_estimate ppe
             ON ppe.phase1_archetype_id=sa.phase1_archetype_id
            AND ppe.model_version_id=sa.model_version_id
          WHERE sa.phase1_archetype_id=$1 AND sa.subtype_id=ANY($2::text[])
            AND sa.model_version_id=$3
          ORDER BY sa.subtype_id`,
        [parentArchetypeId, subtypeIds, modelRow.model_version_id],
      );
      if (allocationResult.rows.length !== subtypeIds.length) {
        resultSummary = {
          status: "not_estimable",
          reason: "parent_subtype_allocation_not_registered",
          parent_archetype_id: parentArchetypeId,
          subtype_ids: subtypeIds,
        };
      } else {
        const contexts = new Set(allocationResult.rows.map((row) =>
          `${row.model_version_id}|${row.entity_unit}|${row.parent_count_base}`,
        ));
        if (contexts.size !== 1 || allocationResult.rows[0].entity_unit !== input.entityUnit) {
          throw new Error("entity_unit_mismatch");
        }
        const sum = (key: "count_low" | "count_base" | "count_high" | "share_low" | "share_base" | "share_high") =>
          allocationResult.rows.reduce((total, row) => total + Number(row[key]), 0);
        const first = allocationResult.rows[0];
        const interval = subtypeLogic === "NOT"
          ? {
              low: Math.max(0, Number(first.parent_count_low) - Number(first.count_high)),
              base: Math.max(0, Number(first.parent_count_base) - Number(first.count_base)),
              high: Math.max(0, Number(first.parent_count_high) - Number(first.count_low)),
              shareLow: Math.max(0, 1 - Number(first.share_high)),
              shareBase: Math.max(0, 1 - Number(first.share_base)),
              shareHigh: Math.max(0, 1 - Number(first.share_low)),
            }
          : {
              low: Math.min(Number(first.parent_count_low), sum("count_low")),
              base: Math.min(Number(first.parent_count_base), sum("count_base")),
              high: Math.min(Number(first.parent_count_high), sum("count_high")),
              shareLow: Math.min(1, sum("share_low")),
              shareBase: Math.min(1, sum("share_base")),
              shareHigh: Math.min(1, sum("share_high")),
            };
        const release = runtimeReleaseEnvelope(input.entityUnit, interval);
        const references = await client.query<{ geography_id: string; period_id: string }>(
          `SELECT
            (SELECT geography_id FROM geography WHERE code='KR' ORDER BY valid_from DESC LIMIT 1) AS geography_id,
            (SELECT period_id FROM time_period ORDER BY end_date DESC LIMIT 1) AS period_id`,
        );
        const reference = references.rows[0];
        if (!reference?.geography_id || !reference.period_id) throw new Error("baseline_reference_records_not_loaded");
        const formula = subtypeLogic === "NOT"
          ? "parent_interval - subtype_allocation_interval (conservative interval subtraction)"
          : subtypeIds.length === 1
            ? first.allocation_formula
            : "sum(mutually_exclusive_subtype_allocation_intervals)";
        const methodCode = subtypeLogic === "NOT" ? "phase2_parent_subtype_complement"
          : subtypeIds.length === 1 ? first.conditional_method : "phase2_exclusive_subtype_union";
        const sourceReleaseIds = readStringArray(first.source_release_ids);
        if (!sourceReleaseIds.length) throw new Error("phase2_parent_source_release_required");
        const validationGaps = readStringArray(first.validation_gaps);
        const evidenceResult = await client.query<{
          release_id: string;
          version_label: string;
          checksum: string | null;
          evidence_id: string;
          evidence_data_version: string;
        }>(
          `SELECT DISTINCT ON (sr.release_id)
                  sr.release_id, sr.version_label, sr.checksum,
                  ev.evidence_id::text, ev.data_version AS evidence_data_version
             FROM source_release sr
             JOIN evidence ev USING (release_id)
            WHERE sr.release_id=ANY($1::text[])
              AND ev.reviewer_status <> 'rejected'
            ORDER BY sr.release_id,
                     CASE ev.reviewer_status
                       WHEN 'human_reviewed' THEN 0
                       WHEN 'machine_checked' THEN 1
                       WHEN 'unreviewed' THEN 2
                       ELSE 3
                     END,
                     ev.evidence_id`,
          [sourceReleaseIds],
        );
        const evidenceByRelease = new Map(evidenceResult.rows.map((row) => [row.release_id, row]));
        const missingEvidence = sourceReleaseIds.filter((releaseId) => !evidenceByRelease.has(releaseId));
        if (missingEvidence.length) throw new Error(`phase2_source_evidence_not_loaded:${missingEvidence.join(",")}`);
        const primaryEvidence = evidenceByRelease.get(sourceReleaseIds[0]);
        if (!primaryEvidence) throw new Error("phase2_parent_evidence_required");

        const calculationHash = contentHash({
          query: query.queryHash,
          model: first.model_version_id,
          dataVersion: first.data_version,
          interval,
          sourceReleaseIds,
          validationGaps,
          allocations: allocationResult.rows,
          ...(release.suppressed ? {
            releasePolicy: {
              version: "rare-output-v1",
              threshold: RARE_OUTPUT_THRESHOLD,
              applied: true,
            },
          } : {}),
        });
        const externalEstimateKey = `query:${context.workspaceId}:${query.queryHash}:${first.model_version_id}:${calculationHash}`;
        const insertedEstimate = await client.query<{ estimate_id: string }>(
          `INSERT INTO estimate (
             external_estimate_key, workspace_id, subject_type, subject_id, entity_unit,
             geography_id, period_id, denominator_definition,
             count_low, count_base, count_high, share_low, share_base, share_high,
             method_code, formula, precision_rule, model_version_id, run_id,
             status, data_version, data_layer, approval_status,
             calculation_input_hash, dependency_fingerprint, created_by_actor_id
           ) VALUES (
             $1,$2,'query',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
             $16,$17,$18,$19,$20,
             'derived_estimate','not_required',$21,$21,$22
           )
           ON CONFLICT (external_estimate_key) WHERE external_estimate_key IS NOT NULL
           DO NOTHING
           RETURNING estimate_id`,
          [
            externalEstimateKey,
            context.workspaceId,
            query.queryId,
            input.entityUnit,
            reference.geography_id,
            reference.period_id,
            first.denominator_definition,
            release.countLow,
            release.countBase,
            release.countHigh,
            release.shareLow,
            release.shareBase,
            release.shareHigh,
            methodCode,
            formula,
            release.precisionRule,
            first.model_version_id,
            first.run_id,
            release.status,
            first.data_version,
            calculationHash,
            actorId,
          ],
        );
        estimateId = insertedEstimate.rows[0]?.estimate_id ?? (await client.query<{ estimate_id: string }>(
          `SELECT estimate_id FROM estimate
            WHERE external_estimate_key=$1 AND workspace_id=$2`,
          [externalEstimateKey, context.workspaceId],
        )).rows[0]?.estimate_id ?? null;
        if (!estimateId) throw new Error("derived_estimate_conflict_not_visible");
        const confidence = phase2DerivedConfidence(first.confidence_grade);
        await client.query(
          `INSERT INTO confidence_assessment (
             estimate_id,source_quality_score,recency_score,directness_score,
             joint_observation_score,model_reliance_score,total_score,grade,
             rationale,data_version,rule_version,components_json,penalties_json,
             validation_gap_reviewed_at
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'phase2-derived-confidence-v1',$11::jsonb,$12::jsonb,now())
           ON CONFLICT (estimate_id) DO NOTHING`,
          [estimateId, confidence.sourceQuality, confidence.recency, confidence.directness,
            confidence.jointObservation, confidence.modelReliance, confidence.total, confidence.grade,
            `Synthetic Phase 2 conditional allocation; capped at ${confidence.grade} from parent confidence ${first.confidence_grade} and not treated as a directly observed joint distribution.`,
            first.data_version,
            JSON.stringify({
              sourceQuality: confidence.sourceQuality,
              recency: confidence.recency,
              directness: confidence.directness,
              jointObservation: confidence.jointObservation,
              modelReliance: confidence.modelReliance,
              parentGrade: first.confidence_grade,
              assessmentKind: "synthetic_conditional_allocation",
            }),
            JSON.stringify([{ code: "synthetic_joint_distribution_not_observed", points: 52 }])],
        );
        await client.query(
          `INSERT INTO estimate_component (
             estimate_id,component_code,component_type,
             value_low,value_base,value_high,unit,evidence_id,
             operation,sequence,data_version,denominator_definition,
             reference_period_id,directness_class,model_version_id,
             adjustment_reason,metadata_json
           ) VALUES (
             $1,'parent_population','parent_population',$2,$3,$4,$5,$6,
             'input',1,$7,$8,$9,'proxy',$10,
             'Registered Phase 2 parent estimate; entity unit and denominator are preserved.',
             $11::jsonb
           ) ON CONFLICT DO NOTHING`,
          [estimateId,
            release.suppressed ? null : first.parent_count_low,
            release.suppressed ? null : first.parent_count_base,
            release.suppressed ? null : first.parent_count_high,
            first.entity_unit, primaryEvidence.evidence_id, first.data_version,
            first.denominator_definition, reference.period_id, first.model_version_id,
            JSON.stringify({
              phase1_archetype_id: parentArchetypeId,
              source_release_ids: sourceReleaseIds,
              validation_gaps: validationGaps,
              ...(release.suppressed ? {
                release_policy: "rare-output-v1",
                threshold: RARE_OUTPUT_THRESHOLD,
                values_withheld: true,
              } : {}),
            })],
        );
        for (const [sourceIndex, releaseId] of sourceReleaseIds.entries()) {
          const evidence = evidenceByRelease.get(releaseId);
          if (!evidence) throw new Error(`phase2_source_evidence_not_loaded:${releaseId}`);
          await client.query(
            `INSERT INTO estimate_component (
               estimate_id,component_code,component_type,evidence_id,operation,
               sequence,data_version,reference_period_id,directness_class,
               model_version_id,adjustment_reason,metadata_json
             ) VALUES (
               $1,$2,'source_evidence',$3,'evidence',$4,$5,$6,
               'proxy',$7,
               'Source release used by the registered Phase 2 parent estimate; this does not imply direct joint observation.',$8::jsonb
             ) ON CONFLICT DO NOTHING`,
            [estimateId, `source:${releaseId}`, evidence.evidence_id, 10 + sourceIndex,
              first.data_version, reference.period_id, first.model_version_id,
              JSON.stringify({ release_id: releaseId, version_label: evidence.version_label, checksum: evidence.checksum })],
          );
          await client.query(
            `INSERT INTO estimate_dependency (
               estimate_id,dependency_kind,dependency_record_key,dependency_version,
               dependency_content_hash,dependency_role,evidence_id,model_version_id
             ) VALUES ($1,'source_release',$2,$3,$4,'denominator',$5,$6)
             ON CONFLICT DO NOTHING`,
            [estimateId, releaseId, evidence.version_label, contentHash(evidence),
              evidence.evidence_id, first.model_version_id],
          );
          await client.query(
            `INSERT INTO estimate_dependency (
               estimate_id,dependency_kind,dependency_record_key,dependency_version,
               dependency_content_hash,dependency_role,evidence_id,model_version_id
             ) VALUES ($1,'evidence',$2::text,$3,$4,'validation',$2::bigint,$5)
             ON CONFLICT DO NOTHING`,
            [estimateId, evidence.evidence_id, evidence.evidence_data_version,
              contentHash({ evidenceId: evidence.evidence_id, releaseId }), first.model_version_id],
          );
        }
        for (const row of allocationResult.rows) {
          await client.query(
            `INSERT INTO estimate_dependency (
               estimate_id,dependency_kind,dependency_record_key,dependency_version,
               dependency_content_hash,dependency_role,model_version_id
             ) VALUES ($1,'subtype_allocation',$2,$3,$4,'factor',$5)
             ON CONFLICT DO NOTHING`,
            [estimateId, `${parentArchetypeId}:${row.subtype_id}`, row.data_version, contentHash(row), row.model_version_id],
          );
        }
        for (const [factorIndex, row] of allocationResult.rows.entries()) {
          const factorLow = subtypeLogic === "NOT" ? Math.max(0, 1 - Number(row.share_high)) : Number(row.share_low);
          const factorBase = subtypeLogic === "NOT" ? Math.max(0, 1 - Number(row.share_base)) : Number(row.share_base);
          const factorHigh = subtypeLogic === "NOT" ? Math.max(0, 1 - Number(row.share_low)) : Number(row.share_high);
          const operation = subtypeLogic === "NOT" ? "complement" : subtypeIds.length > 1 ? "sum" : "multiply";
          await client.query(
            `INSERT INTO estimate_component (
               estimate_id,component_code,component_type,
               value_low,value_base,value_high,unit,evidence_id,
               operation,sequence,data_version,denominator_definition,
               conditional_probability,reference_period_id,directness_class,
               dependency_group,model_version_id,adjustment_reason,metadata_json
             ) VALUES (
               $1,$2,'conditional_probability',$3,$4,$5,'ratio',$6,
               $7,$8,$9,'Share of the registered Phase 2 parent population.',
               $4,$10,'inference','phase2_parent_subtype',$11,
               'Registered conditional allocation; unsupported independent marginals are not multiplied.',
               $12::jsonb
             ) ON CONFLICT DO NOTHING`,
            [estimateId, `subtype_allocation:${row.subtype_id}`,
              release.suppressed ? null : factorLow,
              release.suppressed ? null : factorBase,
              release.suppressed ? null : factorHigh,
              primaryEvidence.evidence_id,
              operation, 100 + factorIndex, row.data_version, reference.period_id,
              row.model_version_id,
              JSON.stringify({
                phase1_archetype_id: parentArchetypeId,
                subtype_id: row.subtype_id,
                allocation_formula: row.allocation_formula,
                source_release_ids: sourceReleaseIds,
                ...(release.suppressed ? {
                  release_policy: "rare-output-v1",
                  threshold: RARE_OUTPUT_THRESHOLD,
                  values_withheld: true,
                } : {}),
              })],
          );
        }
        const releaseValidationGaps = release.suppressed
          ? [...new Set([...validationGaps, "small_sample"])]
          : validationGaps;
        for (const gapCode of releaseValidationGaps) {
          const gapType = VALIDATION_GAP_TYPES.has(gapCode) ? gapCode : "other";
          const description = gapCode === "small_sample"
            ? "Computed human-related Base output is below the release threshold and is suppressed."
            : `Inherited and reviewed Phase 2 validation gap: ${gapCode}`;
          await client.query(
            `INSERT INTO validation_gap (
               estimate_id,gap_type,description,impact,verification_question,
               recommended_source,expected_improvement,priority,status,data_version
             ) SELECT $1,$2,$3,'high',$4,$5,$6,1,'open',$7
               WHERE NOT EXISTS (
                 SELECT 1 FROM validation_gap
                  WHERE estimate_id=$1 AND description=$3
               )`,
            [estimateId, gapType, description,
              gapCode === "small_sample"
                ? "Can a larger authoritative sample support release at or above the minimum cell threshold?"
                : `What same-denominator authoritative evidence resolves ${gapCode}?`,
              gapCode === "small_sample"
                ? "Official cross-tabulation or probability sample with a larger effective cell."
                : "Authoritative joint distribution or probability sample matching the estimate denominator.",
              gapCode === "small_sample"
                ? "Permits a reviewed aggregate release without exposing a rare cell."
                : "Replaces the reviewed proxy/allocation limitation with direct evidence.",
              first.data_version],
          );
        }
        resultSummary = release.suppressed
          ? {
              status: "suppressed",
              reason: "rare_output_below_release_threshold",
              threshold: RARE_OUTPUT_THRESHOLD,
              calculation: methodCode,
              parent_archetype_id: parentArchetypeId,
              subtype_ids: subtypeIds,
              formula,
            }
          : {
              status: "estimated",
              calculation: methodCode,
              count_low: interval.low,
              count_base: interval.base,
              count_high: interval.high,
              share_low: interval.shareLow,
              share_base: interval.shareBase,
              share_high: interval.shareHigh,
              parent_archetype_id: parentArchetypeId,
              subtype_ids: subtypeIds,
              formula,
            };
      }
    }

    if (!estimateId) {
      const weightedJointMaterialized = await tryMaterializeWeightedJointEstimate(
        client,
        materializationInput,
        storedConditions.rows,
      );
      if (weightedJointMaterialized) {
        estimateId = weightedJointMaterialized.estimateId;
        resultSummary = weightedJointMaterialized.resultSummary;
      }
    }

    if (!estimateId) {
      const required = await client.query<{
        geography_id: string;
        period_id: string;
        run_id: string;
      }>(
        `SELECT
          (SELECT geography_id FROM geography WHERE code = 'KR' ORDER BY valid_from DESC LIMIT 1) AS geography_id,
          (SELECT period_id FROM time_period ORDER BY end_date DESC LIMIT 1) AS period_id,
          (SELECT run_id FROM pipeline_run WHERE status = 'success' ORDER BY finished_at DESC NULLS LAST LIMIT 1) AS run_id`,
      );
      const ids = required.rows[0];
      if (!ids?.geography_id || !ids.period_id || !ids.run_id) throw new Error("baseline_reference_records_not_loaded");
      const calculationHash = contentHash({ query: query.queryHash, model: modelRow.version, resultSummary });
      const externalEstimateKey = `query:${context.workspaceId}:${query.queryHash}:${modelRow.model_version_id}:${calculationHash}`;
      const inserted = await client.query<{ estimate_id: string }>(
        `INSERT INTO estimate (
           external_estimate_key, workspace_id, subject_type, subject_id, entity_unit,
           geography_id, period_id, denominator_definition,
           count_low, count_base, count_high, method_code, formula, precision_rule,
           model_version_id, run_id, status, data_version, data_layer,
           approval_status, calculation_input_hash, dependency_fingerprint,
           created_by_actor_id
         ) VALUES (
           $1,$2,'query',$3,$4,$5,$6,$7,
           NULL,NULL,NULL,'not_estimable_missing_joint_distribution',$8,'not_applicable',
           $9,$10,'not_estimable',$11,'derived_estimate','not_required',$12,$12,$13
         )
         ON CONFLICT (external_estimate_key) WHERE external_estimate_key IS NOT NULL
         DO NOTHING
         RETURNING estimate_id`,
        [
          externalEstimateKey,
          context.workspaceId,
          query.queryId,
          input.entityUnit,
          ids.geography_id,
          ids.period_id,
          "Compatible registered joint denominator unavailable; no independence assumption applied.",
          "not_estimable(missing_joint_distribution)",
          modelRow.model_version_id,
          ids.run_id,
          modelRow.version,
          calculationHash,
          actorId,
        ],
      );
      estimateId = inserted.rows[0]?.estimate_id ?? (await client.query<{ estimate_id: string }>(
        `SELECT estimate_id FROM estimate
          WHERE external_estimate_key=$1 AND workspace_id=$2`,
        [externalEstimateKey, context.workspaceId],
      )).rows[0]?.estimate_id ?? null;
      if (!estimateId) throw new Error("not_estimable_conflict_not_visible");
      await client.query(
        `INSERT INTO confidence_assessment (
           estimate_id, source_quality_score, recency_score, directness_score,
           joint_observation_score, model_reliance_score, total_score, grade,
           rationale, data_version, rule_version, components_json, penalties_json,
           validation_gap_reviewed_at
         ) VALUES ($1,0,0,0,0,0,0,'E',$2,$3,'confidence-v1',$4::jsonb,$5::jsonb,now())
         ON CONFLICT (estimate_id) DO NOTHING`,
        [estimateId, "No registered joint distribution; estimate intentionally withheld.", modelRow.version,
          JSON.stringify({ sourceQuality: 0, recency: 0, directness: 0, jointObservation: 0, modelReliance: 0 }),
          JSON.stringify([{ code: "missing_joint_distribution", points: 100 }])],
      );
      await client.query(
        `INSERT INTO validation_gap (
           estimate_id, gap_type, description, impact, verification_question,
           recommended_source, expected_improvement, priority, status, data_version
         ) SELECT $1,'missing_joint_distribution',$2,'high',$3,$4,$5,1,'open',$6
           WHERE NOT EXISTS (
             SELECT 1 FROM validation_gap
              WHERE estimate_id=$1 AND gap_type='missing_joint_distribution'
           )`,
        [estimateId,
          "The selected conditions are not jointly observed in an approved baseline record.",
          "Which authoritative joint distribution measures these conditions with the same denominator?",
          "Official microdata or a probability sample with the same population universe.",
          "Enables a bounded Low/Base/High estimate without assuming independence.",
          modelRow.version],
      );
    }

    const estimateDependency = await client.query<PlainObject>(
      `SELECT estimate_id,subject_type,subject_id,entity_unit,geography_id,period_id,
              count_low,count_base,count_high,share_low,share_base,share_high,
              method_code,formula,model_version_id,run_id,status,data_version,
              data_layer,approval_status,publication_version_id,
              calculation_input_hash,dependency_fingerprint,updated_at
         FROM estimate WHERE estimate_id=$1`,
      [estimateId],
    );
    if (!estimateDependency.rows[0]) throw new Error("estimate_dependency_snapshot_not_found");
    const dependencyFingerprint = typeof estimateDependency.rows[0].dependency_fingerprint === "string"
      && estimateDependency.rows[0].dependency_fingerprint
      ? estimateDependency.rows[0].dependency_fingerprint
      : contentHash(estimateDependency.rows[0]);
    const resultHash = contentHash({
      query: query.queryHash,
      model: modelRow.version,
      estimateId,
      dependencyFingerprint,
    });
    const insertedResult = await client.query<{ result_id: string }>(
      `INSERT INTO segment_query_result (
         query_id, estimate_id, model_version_id, executed_at, result_summary,
         data_version, result_hash, dependency_fingerprint, cache_status
       ) VALUES ($1,$2,$3,now(),$4::jsonb,$5,$6,$7,'valid')
       ON CONFLICT (query_id, model_version_id, result_hash)
         WHERE result_hash IS NOT NULL AND cache_status='valid'
       DO NOTHING
       RETURNING result_id`,
      [query.queryId, estimateId, modelRow.model_version_id, JSON.stringify(resultSummary), modelRow.version, resultHash, dependencyFingerprint],
    );
    const resultId = insertedResult.rows[0]?.result_id ?? (await client.query<{ result_id: string }>(
      `SELECT result_id FROM segment_query_result
        WHERE query_id=$1 AND model_version_id=$2 AND result_hash=$3
          AND cache_status='valid'
        ORDER BY executed_at DESC
        LIMIT 1`,
      [query.queryId, modelRow.model_version_id, resultHash],
    )).rows[0]?.result_id;
    if (!resultId) throw new Error("query_result_conflict_not_visible");
    if (input.segmentId) {
      await pinCalculatedResultToSegmentVersion(client, actorId, input.segmentId, query.queryId, resultId);
    }
    await appendAudit(client, actorId, "segment_query_result", resultId, "calculate", null, resultSummary);
    return estimateId;
  });
}
