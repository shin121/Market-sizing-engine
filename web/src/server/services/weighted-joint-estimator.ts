import "server-only";

import { createHash } from "node:crypto";

import type { PoolClient } from "pg";


type PlainObject = Record<string, unknown>;

export interface CalculationConditionRow {
  condition_namespace: string;
  source_code: string;
  operator: "eq" | "neq" | "in" | "not_in" | "between" | "lt" | "lte" | "gt" | "gte" | "contains" | "exists";
  value_json: unknown;
  resolution_status: string;
  group_id: string;
  logical_operator: "AND" | "OR" | "NOT";
  parent_group_id: string | null;
  logical_path: Array<"AND" | "OR" | "NOT">;
  reference_year: number | null;
  catalog_source_kind: string | null;
  catalog_source_record_id: string | null;
  catalog_source_code: string | null;
  catalog_domain_id: string | null;
  catalog_dimension_id: string | null;
  catalog_allowed_values: unknown;
  catalog_label: string | null;
  calibration_dimension_code: string | null;
  calibration_dimension_value: string | null;
  calibration_selected_as_control: boolean | null;
  calibration_directness_class: string | null;
  calibration_mapping_confidence: string | null;
  calibration_version: string | null;
  calibration_reference_year: number | null;
  calibration_source_release_id: string | null;
}

export interface EstimateMaterializationInput {
  queryId: string;
  queryHash: string;
  entityUnit: string;
  workspaceId: string;
  actorId: string;
  modelVersionId: string;
  modelVersion: string;
}

export interface MaterializedEstimate {
  estimateId: string;
  resultSummary: PlainObject;
}

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.entries(value as PlainObject)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
    .join(",")}}`;
}

function contentHash(value: unknown): string {
  return createHash("sha256").update(stable(value)).digest("hex");
}

function finite(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

function legacyConfidenceBuckets(score: number) {
  const sourceQuality = Math.round(score * 0.30);
  const recency = Math.round(score * 0.15);
  const directness = Math.round(score * 0.20);
  const jointObservation = Math.round(score * 0.20);
  const modelReliance = score - sourceQuality - recency - directness - jointObservation;
  return { sourceQuality, recency, directness, jointObservation, modelReliance };
}

async function requiredPipelineRun(client: PoolClient, modelVersionId: string): Promise<string> {
  const result = await client.query<{ run_id: string }>(
    `SELECT run_id FROM pipeline_run
      WHERE model_version_id=$1 AND status='success'
      ORDER BY finished_at DESC NULLS LAST, started_at DESC
      LIMIT 1`,
    [modelVersionId],
  );
  if (!result.rows[0]?.run_id) throw new Error("successful_pipeline_run_not_found");
  return result.rows[0].run_id;
}

function isCanonicalGoldCondition(condition: CalculationConditionRow): boolean {
  if (condition.catalog_source_kind !== "gold_query" || condition.resolution_status !== "exact") return false;
  if (!condition.logical_path.every((operator) => operator === "AND")) return false;
  if (condition.operator !== "eq" && condition.operator !== "in") return false;
  const goldId = condition.source_code.replace(/^gold_query:/u, "");
  const supplied = condition.operator === "eq"
    ? [condition.value_json]
    : Array.isArray(condition.value_json) ? condition.value_json : [];
  return supplied.length === 1 && supplied[0] === goldId;
}

export async function tryMaterializeGoldQueryEstimate(
  client: PoolClient,
  input: EstimateMaterializationInput,
  conditions: readonly CalculationConditionRow[],
): Promise<MaterializedEstimate | null> {
  if (conditions.length !== 1 || !isCanonicalGoldCondition(conditions[0])) return null;
  const goldId = conditions[0].source_code.replace(/^gold_query:/u, "");
  const gold = await client.query<{
    query_id: string;
    entity_unit: string;
    parent_universe_id: string;
    count_low: string;
    count_base: string;
    count_high: string;
    share_low: string;
    share_base: string;
    share_high: string;
    formula: string;
    source_release_ids: unknown;
    estimate_grade: string;
    confidence_score: number;
    confidence_components: unknown;
    validation_items: unknown;
    dependency_method: string;
    uncertainty_method: string;
    snapshot_hash: string;
    reference_year: number;
    geography_scope: string;
  }>(
    `SELECT query_id,entity_unit,parent_universe_id,count_low,count_base,count_high,
            share_low,share_base,share_high,formula,source_release_ids,
            estimate_grade,confidence_score,confidence_components,validation_items,
            dependency_method,uncertainty_method,snapshot_hash,reference_year,geography_scope
       FROM production.v_gold_query_result
      WHERE query_id=$1 AND status='estimated'`,
    [goldId],
  );
  const row = gold.rows[0];
  if (!row || row.entity_unit !== input.entityUnit) return null;

  const parent = await client.query<{
    geography_id: string;
    period_id: string;
    denominator_definition: string;
    source_release_id: string;
    version: string;
  }>(
    `SELECT geography_id,period_id,denominator_definition,source_release_id,version
       FROM production.universe WHERE universe_id=$1`,
    [row.parent_universe_id],
  );
  if (!parent.rows[0]) throw new Error("gold_query_parent_universe_not_found");
  const runId = await requiredPipelineRun(client, input.modelVersionId);
  const dependencyFingerprint = contentHash({
    snapshotHash: row.snapshot_hash,
    parentUniverse: row.parent_universe_id,
    sources: row.source_release_ids,
  });
  const calculationHash = contentHash({
    queryHash: input.queryHash,
    modelVersion: input.modelVersion,
    dependencyFingerprint,
  });
  const externalKey = `query:${input.workspaceId}:${input.queryHash}:${input.modelVersionId}:${calculationHash}`;
  const inserted = await client.query<{ estimate_id: string }>(
    `INSERT INTO estimate (
       external_estimate_key,workspace_id,subject_type,subject_id,entity_unit,
       geography_id,period_id,denominator_definition,
       count_low,count_base,count_high,share_low,share_base,share_high,
       method_code,formula,precision_rule,model_version_id,run_id,status,
       data_version,data_layer,approval_status,calculation_input_hash,
       dependency_fingerprint,created_by_actor_id
     ) VALUES (
       $1,$2,'query',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,
       'registered_gold_query_snapshot',$14,$15,$16,$17,'estimated',
       $18,'derived_estimate','not_required',$19,$20,$21
     )
     ON CONFLICT (external_estimate_key) WHERE external_estimate_key IS NOT NULL
     DO NOTHING RETURNING estimate_id`,
    [
      externalKey, input.workspaceId, input.queryId, input.entityUnit,
      parent.rows[0].geography_id, parent.rows[0].period_id,
      `${parent.rows[0].denominator_definition}; registered Gold Query ${goldId}`,
      row.count_low, row.count_base, row.count_high,
      row.share_low, row.share_base, row.share_high,
      row.formula, row.uncertainty_method, input.modelVersionId, runId,
      `phase2r-b:${row.snapshot_hash}`, calculationHash, dependencyFingerprint, input.actorId,
    ],
  );
  const estimateId = inserted.rows[0]?.estimate_id ?? (await client.query<{ estimate_id: string }>(
    "SELECT estimate_id FROM estimate WHERE external_estimate_key=$1 AND workspace_id=$2",
    [externalKey, input.workspaceId],
  )).rows[0]?.estimate_id;
  if (!estimateId) throw new Error("gold_query_estimate_conflict_not_visible");

  const factors = await client.query<{
    factor_id: string;
    factor_order: number;
    factor_label: string;
    value_low: string;
    value_base: string;
    value_high: string;
    factor_unit: string;
    source_release_id: string | null;
    citation_locator: string | null;
    directness: string;
    dependency_assumption: string | null;
    confidence_penalty: string;
  }>(
    `SELECT factor_id,factor_order,factor_label,value_low,value_base,value_high,
            factor_unit,source_release_id,citation_locator,directness,
            dependency_assumption,confidence_penalty
       FROM production.v_estimate_factor_lineage
      WHERE subject_type='gold_query' AND subject_id=$1
      ORDER BY factor_order`,
    [goldId],
  );
  for (const factor of factors.rows) {
    await client.query(
      `INSERT INTO estimate_component (
         estimate_id,component_code,component_type,value_low,value_base,value_high,
         unit,operation,sequence,data_version,denominator_definition,
         reference_period_id,directness_class,dependency_group,model_version_id,
         adjustment_reason,metadata_json
       ) VALUES ($1,$2,'registered_factor',$3,$4,$5,$6,'conditional_multiply',$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb)
       ON CONFLICT DO NOTHING`,
      [
        estimateId, factor.factor_id, factor.value_low, factor.value_base, factor.value_high,
        factor.factor_unit, factor.factor_order, `phase2r-b:${row.snapshot_hash}`,
        parent.rows[0].denominator_definition, parent.rows[0].period_id,
        factor.directness === "direct" ? "direct_observation" : factor.directness === "proxy" ? "proxy" : "inference",
        factor.dependency_assumption, input.modelVersionId,
        factor.citation_locator,
        JSON.stringify({
          sourceReleaseId: factor.source_release_id,
          directness: factor.directness,
          confidencePenalty: finite(factor.confidence_penalty),
        }),
      ],
    );
  }

  const sourceIds = Array.isArray(row.source_release_ids)
    ? row.source_release_ids.filter((value): value is string => typeof value === "string") : [];
  for (const sourceId of sourceIds) {
    const source = await client.query<{ version_label: string; source_id: string }>(
      "SELECT version_label,source_id FROM source_release WHERE release_id=$1",
      [sourceId],
    );
    const version = source.rows[0]?.version_label ?? "registered";
    await client.query(
      `INSERT INTO estimate_dependency (
         estimate_id,dependency_kind,dependency_record_key,dependency_version,
         dependency_content_hash,dependency_role,model_version_id
       ) VALUES ($1,'source_release',$2,$3,$4,'factor',$5)
       ON CONFLICT DO NOTHING`,
      [estimateId, sourceId, version, contentHash({ sourceId, version, source: source.rows[0] }), input.modelVersionId],
    );
  }

  const buckets = legacyConfidenceBuckets(row.confidence_score);
  await client.query(
    `INSERT INTO confidence_assessment (
       estimate_id,source_quality_score,recency_score,directness_score,
       joint_observation_score,model_reliance_score,total_score,grade,rationale,
       data_version,rule_version,components_json,penalties_json,
       validation_gap_reviewed_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'phase2r-b-confidence-v1',$11::jsonb,$12::jsonb,now())
     ON CONFLICT (estimate_id) DO NOTHING`,
    [
      estimateId, buckets.sourceQuality, buckets.recency, buckets.directness,
      buckets.jointObservation, buckets.modelReliance, row.confidence_score, row.estimate_grade,
      "Registered Phase 2R-B Gold Query confidence; detailed components_json is authoritative.",
      `phase2r-b:${row.snapshot_hash}`, JSON.stringify(row.confidence_components),
      JSON.stringify([{ code: "registered_dependency_correction", method: row.dependency_method }]),
    ],
  );
  const validationItems = Array.isArray(row.validation_items)
    ? row.validation_items.filter((value): value is string => typeof value === "string") : [];
  for (const [index, item] of validationItems.entries()) {
    await client.query(
      `INSERT INTO validation_gap (
         estimate_id,gap_type,description,impact,verification_question,
         recommended_source,expected_improvement,priority,status,data_version
       ) SELECT $1,'other',$2,'medium',$3,$4,$5,$6,'open',$7
       WHERE NOT EXISTS (
         SELECT 1 FROM validation_gap WHERE estimate_id=$1 AND gap_type='other' AND description=$2
       )`,
      [estimateId, item, `Can authoritative evidence validate ${item}?`, item,
        "Raises directness and narrows the registered interval.", Math.min(5, index + 1),
        `phase2r-b:${row.snapshot_hash}`],
    );
  }

  return {
    estimateId,
    resultSummary: {
      status: "estimated",
      calculation: "registered_gold_query_snapshot",
      gold_query_id: goldId,
      count_low: row.count_low,
      count_base: row.count_base,
      count_high: row.count_high,
      share_low: row.share_low,
      share_base: row.share_base,
      share_high: row.share_high,
      formula: row.formula,
      dependency_method: row.dependency_method,
    },
  };
}

function conditionValues(condition: CalculationConditionRow): string[] {
  const raw = ["in", "not_in", "between"].includes(condition.operator)
    ? Array.isArray(condition.value_json) ? condition.value_json : []
    : [condition.value_json];
  return raw.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim());
}

interface SqlPredicate {
  sql: string;
  params: unknown[];
}

function conditionPredicate(condition: CalculationConditionRow): SqlPredicate | null {
  let dimensionCode: string | null = null;
  let canonicalValue: string | null = null;
  if (condition.catalog_source_kind === "calibration_dimension") {
    dimensionCode = condition.calibration_dimension_code;
    canonicalValue = condition.calibration_dimension_value;
  } else if (condition.catalog_source_kind === "geography") {
    const values = Array.isArray(condition.catalog_allowed_values)
      ? condition.catalog_allowed_values.filter((value): value is string => typeof value === "string") : [];
    if (values.length !== 1) return null;
    if (values[0] === "KR") return { sql: "TRUE", params: [] };
    dimensionCode = "region_code";
    canonicalValue = values[0];
  }
  if (!dimensionCode || !canonicalValue) return null;
  const values = conditionValues(condition);
  if (condition.operator !== "exists" && !values.length) return null;
  if (condition.catalog_source_kind === "calibration_dimension"
      && condition.operator !== "exists" && values.some((value) => value !== canonicalValue)) return null;
  switch (condition.operator) {
    case "eq":
      return { sql: "cell.dimension_values ->> ? = ?", params: [dimensionCode, values[0]] };
    case "neq":
      return { sql: "cell.dimension_values ->> ? <> ?", params: [dimensionCode, values[0]] };
    case "in":
      return { sql: "cell.dimension_values ->> ? = ANY(?::text[])", params: [dimensionCode, values] };
    case "not_in":
      return { sql: "NOT (cell.dimension_values ->> ? = ANY(?::text[]))", params: [dimensionCode, values] };
    case "exists":
      return { sql: "jsonb_exists(cell.dimension_values, ?)", params: [dimensionCode] };
    default:
      return null;
  }
}

function numberedPredicate(predicate: SqlPredicate, parameters: unknown[]): string {
  let index = 0;
  return predicate.sql.replaceAll("?", () => {
    parameters.push(predicate.params[index]);
    index += 1;
    return `$${parameters.length}`;
  });
}

function groupedPredicate(conditions: readonly CalculationConditionRow[], parameters: unknown[]): string | null {
  const groupById = new Map<string, {
    id: string;
    parentId: string | null;
    logic: "AND" | "OR" | "NOT";
    conditions: CalculationConditionRow[];
    children: string[];
  }>();
  for (const condition of conditions) {
    const group = groupById.get(condition.group_id) ?? {
      id: condition.group_id,
      parentId: condition.parent_group_id,
      logic: condition.logical_operator,
      conditions: [],
      children: [],
    };
    group.conditions.push(condition);
    groupById.set(group.id, group);
  }
  for (const group of [...groupById.values()]) {
    if (!group.parentId) continue;
    const parent = groupById.get(group.parentId);
    if (parent) parent.children.push(group.id);
  }
  const roots = [...groupById.values()].filter((group) => !group.parentId || !groupById.has(group.parentId));
  if (roots.length !== 1) return null;

  const render = (groupId: string): string | null => {
    const group = groupById.get(groupId);
    if (!group) return null;
    const pieces: string[] = [];
    for (const condition of group.conditions) {
      const predicate = conditionPredicate(condition);
      if (!predicate) return null;
      pieces.push(numberedPredicate(predicate, parameters));
    }
    for (const childId of group.children) {
      const child = render(childId);
      if (!child) return null;
      pieces.push(child);
    }
    if (!pieces.length) return null;
    if (group.logic === "NOT") return pieces.length === 1 ? `(NOT (${pieces[0]}))` : null;
    return `(${pieces.join(group.logic === "OR" ? " OR " : " AND ")})`;
  };
  return render(roots[0].id);
}

function detailedConfidence(options: {
  grade: "D" | "E";
  mappingConfidence: number;
  ess: number;
  totalEss: number;
  hasProxy: boolean;
}) {
  const values = {
    sourceQuality: options.hasProxy ? 64 : 72,
    recency: 91,
    definitionMatch: Math.round(options.mappingConfidence * 100),
    geographyMatch: 98,
    directObservation: options.hasProxy ? 28 : 45,
    calibrationFit: 99,
    mappingCoverage: Math.round(options.mappingConfidence * 100),
    effectiveSampleSize: Math.round(100 * Math.min(1, Math.sqrt(options.ess / Math.max(options.totalEss, 1)))),
    dependencyRisk: options.hasProxy ? 42 : 68,
    proxyRetention: options.hasProxy ? 38 : 72,
    modelStability: options.hasProxy ? 62 : 86,
  };
  const raw = values.sourceQuality * 0.14 + values.recency * 0.07
    + values.definitionMatch * 0.12 + values.geographyMatch * 0.07
    + values.directObservation * 0.13 + values.calibrationFit * 0.12
    + values.mappingCoverage * 0.10 + values.effectiveSampleSize * 0.08
    + values.dependencyRisk * 0.07 + values.proxyRetention * 0.05
    + values.modelStability * 0.05;
  const score = Math.round(Math.min(raw, options.grade === "D" ? 65 : 50));
  return { ...values, confidenceScore: score, estimateGrade: options.grade, formulaVersion: "phase2r-b-confidence-v1" };
}

interface ConditionalFactor {
  catalogId: string;
  label: string;
  low: number;
  base: number;
  high: number;
  entityUnit: string;
  estimateGrade: string;
  confidenceScore: number;
  sourceReleaseIds: string[];
  domainId: string | null;
  directness: string;
}

function complementedInterval(low: number, base: number, high: number) {
  return { low: clamp(1 - high, 0, 1), base: clamp(1 - base, 0, 1), high: clamp(1 - low, 0, 1) };
}

async function loadConditionalFactor(
  client: PoolClient,
  condition: CalculationConditionRow,
): Promise<ConditionalFactor | null> {
  if (!["eq", "in", "neq", "not_in", "exists"].includes(condition.operator)) return null;
  const values = conditionValues(condition);
  if (condition.operator !== "exists" && values.length !== 1) return null;

  let factor: ConditionalFactor | null = null;
  if (condition.catalog_source_kind === "domain_feature" && condition.catalog_source_record_id) {
    const result = await client.query<{
      display_name_ko: string;
      prevalence_low: string;
      prevalence_base: string;
      prevalence_high: string;
      entity_unit: string;
      estimate_grade: string;
      confidence_score: number;
      source_release_ids: unknown;
      domain_id: string;
      coverage_status: string;
      selected_value: string;
    }>(
      `SELECT display_name_ko,prevalence_low,prevalence_base,prevalence_high,
              entity_unit,estimate_grade,confidence_score,source_release_ids,
              domain_id,coverage_status,selected_value
         FROM production.v_feature_prevalence WHERE domain_feature_id=$1`,
      [condition.catalog_source_record_id],
    );
    const row = result.rows[0];
    if (row && values[0] !== row.selected_value) return null;
    if (row) factor = {
      catalogId: condition.source_code,
      label: row.display_name_ko,
      low: finite(row.prevalence_low), base: finite(row.prevalence_base), high: finite(row.prevalence_high),
      entityUnit: row.entity_unit, estimateGrade: row.estimate_grade,
      confidenceScore: row.confidence_score,
      sourceReleaseIds: Array.isArray(row.source_release_ids)
        ? row.source_release_ids.filter((value): value is string => typeof value === "string") : [],
      domainId: row.domain_id,
      directness: row.coverage_status,
    };
  } else if (condition.catalog_source_kind === "behavior" && condition.catalog_source_record_id) {
    if (condition.operator !== "exists") return null;
    const result = await client.query<{
      display_name_ko: string;
      prevalence_low: string;
      prevalence_base: string;
      prevalence_high: string;
      entity_unit: string;
      estimate_grade: string;
      confidence_score: number;
      source_release_ids: unknown;
      domain_id: string;
      coverage_status: string;
    }>(
      `SELECT display_name_ko,prevalence_low,prevalence_base,prevalence_high,
              entity_unit,estimate_grade,confidence_score,source_release_ids,
              domain_id,coverage_status
         FROM production.v_behavior_prevalence WHERE behavior_template_id=$1`,
      [condition.catalog_source_record_id],
    );
    const row = result.rows[0];
    if (row) factor = {
      catalogId: condition.source_code,
      label: row.display_name_ko,
      low: finite(row.prevalence_low), base: finite(row.prevalence_base), high: finite(row.prevalence_high),
      entityUnit: row.entity_unit, estimateGrade: row.estimate_grade,
      confidenceScore: row.confidence_score,
      sourceReleaseIds: Array.isArray(row.source_release_ids)
        ? row.source_release_ids.filter((value): value is string => typeof value === "string") : [],
      domainId: row.domain_id,
      directness: row.coverage_status,
    };
  } else if (condition.catalog_source_kind === "dimension_value" && condition.catalog_dimension_id) {
    const canonical = Array.isArray(condition.catalog_allowed_values)
      ? condition.catalog_allowed_values.filter((value): value is string => typeof value === "string") : [];
    if (canonical.length !== 1 || canonical[0] !== values[0]) return null;
    const result = await client.query<{
      display_name_ko: string;
      share_low: string;
      share_base: string;
      share_high: string;
      entity_unit: string;
      estimate_grade: string;
      confidence_score: number;
      source_release_ids: unknown;
      domain_id: string;
      distribution_status: string;
    }>(
      `SELECT display_name_ko,share_low,share_base,share_high,entity_unit,
              estimate_grade,confidence_score,source_release_ids,domain_id,
              distribution_status
         FROM production.v_axis_distribution
        WHERE dimension_id=$1 AND value_code=$2`,
      [condition.catalog_dimension_id, values[0]],
    );
    const row = result.rows[0];
    if (row) factor = {
      catalogId: condition.source_code,
      label: row.display_name_ko,
      low: finite(row.share_low), base: finite(row.share_base), high: finite(row.share_high),
      entityUnit: row.entity_unit, estimateGrade: row.estimate_grade,
      confidenceScore: row.confidence_score,
      sourceReleaseIds: Array.isArray(row.source_release_ids)
        ? row.source_release_ids.filter((value): value is string => typeof value === "string") : [],
      domainId: row.domain_id,
      directness: row.distribution_status,
    };
  }
  if (!factor) return null;
  if (condition.operator === "neq" || condition.operator === "not_in") {
    return { ...factor, ...complementedInterval(factor.low, factor.base, factor.high), label: `${factor.label} 제외` };
  }
  return factor;
}

export async function tryMaterializeWeightedJointEstimate(
  client: PoolClient,
  input: EstimateMaterializationInput,
  conditions: readonly CalculationConditionRow[],
): Promise<MaterializedEstimate | null> {
  if (!["person", "household", "establishment", "enterprise"].includes(input.entityUnit)) return null;
  if (!conditions.length || conditions.some((condition) => condition.resolution_status !== "exact"
    || (condition.reference_year !== null && condition.reference_year !== 2024))) return null;
  const jointKinds = new Set(["calibration_dimension", "geography"]);
  const conditionalKinds = new Set(["dimension_value", "domain_feature", "behavior"]);
  if (conditions.some((condition) => !jointKinds.has(condition.catalog_source_kind ?? "")
    && !conditionalKinds.has(condition.catalog_source_kind ?? ""))) return null;
  const jointConditions = conditions.filter((condition) => jointKinds.has(condition.catalog_source_kind ?? ""));
  const conditionalConditions = conditions.filter((condition) => conditionalKinds.has(condition.catalog_source_kind ?? ""));
  if (conditionalConditions.length && conditions.some((condition) =>
    !condition.logical_path.every((operator) => operator === "AND"))) return null;
  const conditionalFactors: ConditionalFactor[] = [];
  for (const condition of conditionalConditions) {
    const factor = await loadConditionalFactor(client, condition);
    if (!factor || factor.entityUnit !== input.entityUnit || factor.base <= 0) return null;
    conditionalFactors.push(factor);
  }

  const calibration = await client.query<{
    calibration_run_id: string;
    calibration_version: string;
    total_weight: string;
    effective_sample_size: string;
    weight_cv: string;
    max_control_relative_error: string;
    artifact_checksum: string;
    geography_id: string;
    period_id: string;
    denominator_definition: string;
    source_release_id: string;
  }>(
    `SELECT run.calibration_run_id,run.calibration_version,run.total_weight,
            run.effective_sample_size,run.weight_cv,run.max_control_relative_error,
            run.artifact_checksum,universe.geography_id,universe.period_id,
            universe.denominator_definition,universe.source_release_id
       FROM production.calibration_run run
       JOIN production.universe universe USING (universe_id)
      WHERE run.target_unit=$1 AND run.status='passed'
      ORDER BY run.created_at DESC LIMIT 1`,
    [input.entityUnit],
  );
  const run = calibration.rows[0];
  if (!run) return null;
  const parameters: unknown[] = [input.entityUnit, run.calibration_version];
  let predicate = "TRUE";
  if (jointConditions.length) {
    if (conditionalConditions.length) {
      const pieces = jointConditions.map((condition) => conditionPredicate(condition));
      if (pieces.some((piece) => piece === null)) return null;
      predicate = pieces.map((piece) => numberedPredicate(piece!, parameters)).join(" AND ");
    } else {
      const grouped = groupedPredicate(jointConditions, parameters);
      if (!grouped) return null;
      predicate = grouped;
    }
  }

  const aggregate = await client.query<{
    sample_rows: string;
    weighted_count: string | null;
    weight_square_sum: string | null;
  }>(
    `SELECT coalesce(sum(cell.sample_rows),0)::text AS sample_rows,
            sum(cell.weighted_count)::text AS weighted_count,
            sum(cell.weight_square_sum)::text AS weight_square_sum
       FROM production.v_weighted_joint_cell cell
      WHERE cell.target_unit=$1 AND cell.calibration_version=$2
        AND ${predicate}`,
    parameters,
  );
  const sampleRows = finite(aggregate.rows[0]?.sample_rows);
  const jointWeightedCount = finite(aggregate.rows[0]?.weighted_count);
  const weightSquareSum = finite(aggregate.rows[0]?.weight_square_sum);
  if (sampleRows <= 0 || jointWeightedCount <= 0 || weightSquareSum <= 0) return null;

  const total = finite(run.total_weight);
  const totalEss = finite(run.effective_sample_size, 1);
  const matchedEss = jointWeightedCount * jointWeightedCount / weightSquareSum;
  const jointBaseShare = clamp(jointWeightedCount / total, 0, 1);
  const calibrationConditions = jointConditions.filter((condition) => condition.catalog_source_kind === "calibration_dimension");
  const hasProxy = conditionalFactors.length > 0
    || calibrationConditions.some((condition) => !condition.calibration_selected_as_control);
  const mappingScores = [
    ...calibrationConditions.map((condition) => finite(condition.calibration_mapping_confidence, 0)),
    ...conditionalFactors.map((factor) => clamp(factor.confidenceScore / 100, 0, 1)),
  ];
  const mappingConfidence = mappingScores.length ? Math.min(...mappingScores) : 1;
  const grade = hasProxy ? "E" as const : "D" as const;
  const samplingError = jointConditions.length
    ? 1.96 * Math.sqrt(Math.max(jointBaseShare * (1 - jointBaseShare), 1e-12) / Math.max(totalEss, 1)) : 0;
  const gradeFloor = grade === "D" ? 0.13 : 0.24;
  const calibrationError = finite(run.max_control_relative_error);
  const mappingError = 1 - mappingConfidence;
  const dependencyError = hasProxy ? 0.12 : 0.04;
  const stabilityError = Math.min(0.15, finite(run.weight_cv) * 0.05);
  const structural = Math.sqrt(calibrationError ** 2 + mappingError ** 2 + dependencyError ** 2 + stabilityError ** 2);
  const relativeError = Math.min(0.90, gradeFloor + structural);
  const absoluteError = samplingError + jointBaseShare * relativeError;
  let shareLow = jointConditions.length ? clamp(jointBaseShare - absoluteError, 0, 1) : 1;
  let baseShare = jointBaseShare;
  let shareHigh = jointConditions.length ? clamp(jointBaseShare + absoluteError, 0, 1) : 1;
  const conditionalLineage: Array<ConditionalFactor & { dependencyLow: number; dependencyBase: number; dependencyHigh: number }> = [];
  for (const factor of conditionalFactors) {
    const sameDomainFactorCount = conditionalFactors.filter((candidate) => candidate.domainId === factor.domainId).length;
    const dependencyLow = sameDomainFactorCount > 1 ? 0.85 : 0.80;
    const dependencyBase = 1.0;
    const dependencyHigh = sameDomainFactorCount > 1 ? 1.15 : 1.20;
    shareLow = clamp(shareLow * clamp(factor.low * dependencyLow, 0, 1), 0, 1);
    baseShare = clamp(baseShare * factor.base * dependencyBase, 0, 1);
    shareHigh = clamp(shareHigh * clamp(factor.high * dependencyHigh, 0, 1), 0, 1);
    conditionalLineage.push({ ...factor, dependencyLow, dependencyBase, dependencyHigh });
  }
  if (shareLow > baseShare) shareLow = baseShare;
  if (shareHigh < baseShare) shareHigh = baseShare;
  const weightedCount = total * baseShare;
  const countLow = total * shareLow;
  const countHigh = total * shareHigh;
  const releaseSuppressed = ["person", "household"].includes(input.entityUnit) && weightedCount < 10;
  const confidence = detailedConfidence({ grade, mappingConfidence, ess: matchedEss, totalEss, hasProxy });
  const formula = conditionalFactors.length
    ? "calibrated_parent_total × weighted_synthetic_joint_share × registered conditional prevalence factors × explicit bounded dependency corrections"
    : "calibrated_parent_total × weighted_synthetic_joint_share; interval=Phase2R-B grade floor + sampling/calibration/mapping/dependency/stability propagation";
  const dependencyFingerprint = contentHash({
    artifactChecksum: run.artifact_checksum,
    calibrationVersion: run.calibration_version,
    conditions: conditions.map((condition) => ({
      sourceCode: condition.source_code,
      operator: condition.operator,
      value: condition.value_json,
      groupId: condition.group_id,
      parentGroupId: condition.parent_group_id,
      logic: condition.logical_operator,
    })),
    conditionalFactors: conditionalLineage,
    interval: { countLow, weightedCount, countHigh, shareLow, baseShare, shareHigh },
  });
  const calculationHash = contentHash({ queryHash: input.queryHash, modelVersion: input.modelVersion, dependencyFingerprint });
  const externalKey = `query:${input.workspaceId}:${input.queryHash}:${input.modelVersionId}:${calculationHash}`;
  const pipelineRunId = await requiredPipelineRun(client, input.modelVersionId);
  const methodCode = conditionalFactors.length
    ? "weighted_synthetic_joint_with_conditional_proxy"
    : hasProxy ? "weighted_synthetic_joint_with_proxy_fields" : "weighted_synthetic_joint";
  const inserted = await client.query<{ estimate_id: string }>(
    `INSERT INTO estimate (
       external_estimate_key,workspace_id,subject_type,subject_id,entity_unit,
       geography_id,period_id,denominator_definition,
       count_low,count_base,count_high,share_low,share_base,share_high,
       method_code,formula,precision_rule,model_version_id,run_id,status,
       data_version,data_layer,approval_status,calculation_input_hash,
       dependency_fingerprint,created_by_actor_id
     ) VALUES (
       $1,$2,'query',$3,$4,$5,$6,$7,
       $8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,
       $20,'derived_estimate','not_required',$21,$22,$23
     )
     ON CONFLICT (external_estimate_key) WHERE external_estimate_key IS NOT NULL
     DO NOTHING RETURNING estimate_id`,
    [
      externalKey, input.workspaceId, input.queryId, input.entityUnit,
      run.geography_id, run.period_id,
      `${run.denominator_definition}; weighted synthetic joint over ${sampleRows} synthetic records${conditionalFactors.length ? "; registered prevalence factors applied conditionally" : ""}`,
      releaseSuppressed ? null : countLow,
      releaseSuppressed ? null : weightedCount,
      releaseSuppressed ? null : countHigh,
      releaseSuppressed ? null : shareLow,
      releaseSuppressed ? null : baseShare,
      releaseSuppressed ? null : shareHigh,
      releaseSuppressed ? "rare_output_suppression" : methodCode,
      releaseSuppressed ? "runtime_release_policy(weighted_base_count < 10)" : formula,
      releaseSuppressed ? "suppressed_below_10_weighted_entities" : "whole_entity_round_half_up",
      input.modelVersionId, pipelineRunId, releaseSuppressed ? "suppressed" : "estimated",
      run.calibration_version, calculationHash, dependencyFingerprint, input.actorId,
    ],
  );
  const estimateId = inserted.rows[0]?.estimate_id ?? (await client.query<{ estimate_id: string }>(
    "SELECT estimate_id FROM estimate WHERE external_estimate_key=$1 AND workspace_id=$2",
    [externalKey, input.workspaceId],
  )).rows[0]?.estimate_id;
  if (!estimateId) throw new Error("weighted_joint_estimate_conflict_not_visible");

  await client.query(
    `INSERT INTO estimate_dependency (
       estimate_id,dependency_kind,dependency_record_key,dependency_version,
       dependency_content_hash,dependency_role,model_version_id
     ) VALUES ($1,'other',$2,$3,$4,'model',$5)
     ON CONFLICT DO NOTHING`,
    [estimateId, run.calibration_run_id, run.calibration_version, run.artifact_checksum, input.modelVersionId],
  );
  await client.query(
    `INSERT INTO estimate_dependency (
       estimate_id,dependency_kind,dependency_record_key,dependency_version,
       dependency_content_hash,dependency_role,model_version_id
     ) VALUES ($1,'source_release',$2,$3,$4,'denominator',$5)
     ON CONFLICT DO NOTHING`,
    [estimateId, run.source_release_id, run.calibration_version,
      contentHash({ sourceReleaseId: run.source_release_id, calibrationVersion: run.calibration_version }),
      input.modelVersionId],
  );
  for (const factor of conditionalFactors) {
    for (const sourceId of factor.sourceReleaseIds) {
      const source = await client.query<{ version_label: string }>(
        "SELECT version_label FROM source_release WHERE release_id=$1",
        [sourceId],
      );
      const version = source.rows[0]?.version_label ?? run.calibration_version;
      await client.query(
        `INSERT INTO estimate_dependency (
           estimate_id,dependency_kind,dependency_record_key,dependency_version,
           dependency_content_hash,dependency_role,model_version_id
         ) VALUES ($1,'source_release',$2,$3,$4,'factor',$5)
         ON CONFLICT DO NOTHING`,
        [estimateId, sourceId, version, contentHash({ sourceId, version, factor: factor.catalogId }), input.modelVersionId],
      );
    }
  }

  if (!releaseSuppressed) {
    await client.query(
      `INSERT INTO estimate_component (
         estimate_id,component_code,component_type,value_low,value_base,value_high,
         unit,operation,sequence,data_version,denominator_definition,
         reference_period_id,directness_class,model_version_id,adjustment_reason,metadata_json
       ) VALUES (
         $1,'weighted_joint_share','weighted_joint',$2,$3,$4,'share','weighted_intersection',1,
         $5,$6,$7,'inference',$8,$9,$10::jsonb
       ) ON CONFLICT DO NOTHING`,
      [estimateId,
        jointConditions.length ? clamp(jointBaseShare - absoluteError, 0, 1) : 1,
        jointBaseShare,
        jointConditions.length ? clamp(jointBaseShare + absoluteError, 0, 1) : 1,
        run.calibration_version,
        run.denominator_definition, run.period_id, input.modelVersionId,
        hasProxy
          ? "Synthetic proxy dimensions are jointly queried and retain an E-grade mapping/dependency penalty."
          : "Selected calibration-control dimensions are queried jointly; no marginal independence multiplication is used.",
        JSON.stringify({
          sampleRows, effectiveSampleSize: matchedEss, totalEffectiveSampleSize: totalEss,
          artifactChecksum: run.artifact_checksum, calibrationRunId: run.calibration_run_id,
          intervalComponents: { samplingError, gradeFloor, calibrationError, mappingError, dependencyError, stabilityError },
        })],
    );
    for (const [index, condition] of jointConditions.entries()) {
      await client.query(
        `INSERT INTO estimate_component (
           estimate_id,component_code,component_type,unit,operation,sequence,
           data_version,denominator_definition,reference_period_id,directness_class,
           dependency_group,model_version_id,adjustment_reason,metadata_json
         ) VALUES ($1,$2,'condition_predicate',$3,'joint_filter',$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)
         ON CONFLICT DO NOTHING`,
        [estimateId, `condition:${index + 1}`, input.entityUnit, index + 2,
          run.calibration_version, run.denominator_definition, run.period_id,
          condition.calibration_directness_class === "synthetic_proxy" ? "proxy" : "inference",
          condition.group_id, input.modelVersionId,
          condition.catalog_label ?? condition.source_code,
          JSON.stringify({
            catalogId: condition.source_code,
            sourceKind: condition.catalog_source_kind,
            dimensionCode: condition.calibration_dimension_code ?? (condition.catalog_source_kind === "geography" ? "region_code" : null),
            value: condition.value_json,
            operator: condition.operator,
            selectedAsControl: condition.calibration_selected_as_control,
            mappingConfidence: condition.calibration_mapping_confidence,
          })],
      );
    }
    for (const [index, factor] of conditionalLineage.entries()) {
      await client.query(
        `INSERT INTO estimate_component (
           estimate_id,component_code,component_type,value_low,value_base,value_high,
           unit,operation,sequence,data_version,denominator_definition,
           reference_period_id,directness_class,dependency_group,model_version_id,
           adjustment_reason,metadata_json
         ) VALUES ($1,$2,'conditional_prevalence',$3,$4,$5,'share','conditional_multiply',$6,
           $7,$8,$9,'proxy',$10,$11,$12,$13::jsonb)
         ON CONFLICT DO NOTHING`,
        [estimateId, `conditional:${index + 1}:${factor.catalogId}`,
          clamp(factor.low * factor.dependencyLow, 0, 1), factor.base,
          clamp(factor.high * factor.dependencyHigh, 0, 1),
          jointConditions.length + index + 2, run.calibration_version,
          run.denominator_definition, run.period_id, factor.domainId,
          input.modelVersionId, factor.label,
          JSON.stringify({
            catalogId: factor.catalogId,
            registeredPrevalence: { low: factor.low, base: factor.base, high: factor.high },
            dependencyCorrection: {
              low: factor.dependencyLow, base: factor.dependencyBase, high: factor.dependencyHigh,
              assumption: "No direct joint table; Base uses the registered marginal conditionally and Low/High carry bounded dependency risk.",
            },
            sourceReleaseIds: factor.sourceReleaseIds,
            sourceEstimateGrade: factor.estimateGrade,
            sourceConfidence: factor.confidenceScore,
            directness: factor.directness,
          })],
      );
    }
  }

  const buckets = legacyConfidenceBuckets(confidence.confidenceScore);
  await client.query(
    `INSERT INTO confidence_assessment (
       estimate_id,source_quality_score,recency_score,directness_score,
       joint_observation_score,model_reliance_score,total_score,grade,rationale,
       data_version,rule_version,components_json,penalties_json,
       validation_gap_reviewed_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'phase2r-b-confidence-v1',$11::jsonb,$12::jsonb,now())
     ON CONFLICT (estimate_id) DO NOTHING`,
    [estimateId, buckets.sourceQuality, buckets.recency, buckets.directness,
      buckets.jointObservation, buckets.modelReliance, confidence.confidenceScore, grade,
      releaseSuppressed
        ? "Result withheld by the below-10 weighted-entity release policy."
        : "Weighted synthetic joint estimate; detailed Phase 2R-B confidence components are authoritative.",
      run.calibration_version, JSON.stringify(confidence),
      JSON.stringify([
        { code: "synthetic_joint_not_authoritative_microdata", points: hasProxy ? 18 : 10 },
        ...(hasProxy ? [{ code: "proxy_dimension_mapping", points: Math.round((1 - mappingConfidence) * 100) }] : []),
      ])],
  );
  const gapType = releaseSuppressed ? "small_sample" : hasProxy ? "weak_proxy" : "missing_joint_distribution";
  await client.query(
    `INSERT INTO validation_gap (
       estimate_id,gap_type,description,impact,verification_question,
       recommended_source,expected_improvement,priority,status,data_version
     ) SELECT $1,$2,$3,$4,$5,$6,$7,1,'open',$8
     WHERE NOT EXISTS (SELECT 1 FROM validation_gap WHERE estimate_id=$1 AND gap_type=$2)`,
    [estimateId, gapType,
      releaseSuppressed
        ? "Computed weighted output is below the human release threshold."
        : hasProxy
          ? conditionalFactors.length
            ? "Registered prevalence factors are applied conditionally because the authoritative joint distribution is unavailable; bounded dependency corrections are explicit."
            : "One or more joint dimensions are synthetic Proxy fields rather than selected Calibration controls."
          : "The dependency is observed in the calibrated synthetic frame, not in authoritative joint microdata.",
      releaseSuppressed || hasProxy ? "high" : "medium",
      "Can same-denominator authoritative microdata validate the selected joint conditions?",
      "Official cross-tabulation or probability microdata matching the parent universe and definitions.",
      "Replaces synthetic dependency evidence and narrows the Low/Base/High interval.",
      run.calibration_version],
  );

  return {
    estimateId,
    resultSummary: releaseSuppressed ? {
      status: "suppressed",
      reason: "rare_output_below_release_threshold",
      threshold: 10,
      calculation: methodCode,
      formula: "runtime_release_policy(weighted_base_count < 10)",
    } : {
      status: "estimated",
      calculation: methodCode,
      count_low: countLow,
      count_base: weightedCount,
      count_high: countHigh,
      share_low: shareLow,
      share_base: baseShare,
      share_high: shareHigh,
      effective_sample_size: matchedEss,
      sample_rows: sampleRows,
      formula,
      estimate_grade: grade,
      confidence: confidence.confidenceScore,
      conditional_factor_count: conditionalFactors.length,
    },
  };
}
