import "server-only";

import Decimal from "decimal.js";
import type { PoolClient } from "pg";

import type { MarketScenarioSelection } from "@/domain/market-scenario-selection";
import { withWorkspaceTransaction } from "@/server/db";

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface SavedSegmentRow {
  id?: string;
  segment_id?: string;
  name?: string;
  saved_segment_id: string;
  workspace_id: string | null;
  title: string;
  description: string | null;
  status: string;
  current_version_no: number;
  resolved_version_no: number;
  optimistic_lock_version: string | number;
  pinned_result_id: string | null;
  query_id: string | null;
  natural_language_text: string | null;
  filter_json: JsonValue | null;
  primary_entity_unit: string | null;
  geography_scope: JsonValue | null;
  as_of_date: string | null;
  result_id: string | null;
  cache_status: string | null;
  result_summary: JsonValue | null;
  estimate_id: string | null;
  estimate_status: string | null;
  count_low: string | null;
  count_base: string | null;
  count_high: string | null;
  share_low: string | null;
  share_base: string | null;
  share_high: string | null;
  data_layer: string | null;
  approval_status: string | null;
  created_at: string;
  updated_at: string;
}

export interface EstimateLineageRow {
  estimate_id: string;
  workspace_id: string | null;
  subject_type: string;
  subject_id: string;
  entity_unit: string;
  status: string;
  data_layer: string;
  approval_status: string;
  count_low: string | null;
  count_base: string | null;
  count_high: string | null;
  share_low: string | null;
  share_base: string | null;
  share_high: string | null;
  denominator_definition: string;
  method_code: string;
  formula: string;
  geography_code: string;
  geography_name_ko: string;
  reference_period: string;
  model_version: string;
  confidence_json: JsonValue | null;
  components_json: JsonValue[];
  assumptions_json: JsonValue[];
  validation_gaps_json: JsonValue[];
  dependencies_json: JsonValue[];
  sources_json: JsonValue[];
  related_spend_json?: JsonValue | null;
  data_version: string;
  created_at: string;
  updated_at: string;
  selected_market_scenario_id?: string | null;
  selected_market_scenario_name?: string | null;
  selected_market_scenario_version?: string | null;
  market_scenario_selection_mode?: "explicit" | "unique_active" | "none";
}

export interface ResearchJobRow {
  id?: string;
  job_id?: string;
  name?: string;
  status?: string;
  research_job_id: string;
  workspace_id: string;
  saved_segment_id: string | null;
  query_id: string | null;
  condition_id: string | null;
  validation_gap_id: string | number | null;
  research_question: string;
  target_segment: string;
  target_variable: string;
  provider: string | null;
  provider_model: string | null;
  research_status: string;
  research_priority: number;
  attempt_count: number;
  max_attempts: number;
  error_code: string | null;
  error_message: string | null;
  proposed_revision_id: string | null;
  revision_status: string | null;
  review_item_id: string | null;
  review_status: string | null;
  created_at: string;
  updated_at: string;
}

export interface OpportunityRow {
  opportunity_id: string;
  opportunity_board_id: string;
  workspace_id: string;
  board_name: string;
  name: string;
  problem_statement: string;
  hypothesis_summary: string;
  solution_idea: string;
  status: string;
  optimistic_lock_version: string | number;
  segment_name?: string | null;
  segment_snapshots: JsonValue[];
  current_content: JsonValue[];
  score_components?: JsonValue[];
  experiments?: JsonValue[];
  estimate_snapshot?: JsonValue | null;
  current_estimate?: JsonValue | null;
  status_history?: JsonValue[];
  score_version_no?: number | null;
  weight_config?: JsonValue | null;
  overall_score: string | null;
  updated_at: string;
}

type PageOptions = { limit?: number; offset?: number };

function page(options: PageOptions = {}): { limit: number; offset: number } {
  return {
    limit: Math.min(Math.max(options.limit ?? 50, 1), 200),
    offset: Math.max(options.offset ?? 0, 0),
  };
}

async function workspaceRows<T extends object>(
  sql: string,
  values: readonly unknown[] = [],
): Promise<T[]> {
  return withWorkspaceTransaction(async (client: PoolClient) => {
    const result = await client.query<T>(sql, [...values]);
    return result.rows;
  });
}

async function workspaceOne<T extends object>(
  sql: string,
  values: readonly unknown[] = [],
): Promise<T | null> {
  const rows = await workspaceRows<T>(sql, values);
  return rows[0] ?? null;
}

export async function listSavedSegments(options: PageOptions = {}): Promise<SavedSegmentRow[]> {
  const { limit, offset } = page(options);
  const rows = await workspaceRows<SavedSegmentRow>(
    `SELECT
       saved_segment_id,
       workspace_id,
       title,
       description,
       status,
       current_version_no,
       resolved_version_no,
       optimistic_lock_version,
       pinned_result_id,
       query_id,
       natural_language_text,
       filter_json,
       primary_entity_unit,
       geography_scope,
       as_of_date,
       result_id,
       cache_status,
       result_summary,
       estimate_id,
       estimate_status,
       count_low,
       count_base,
       count_high,
       share_low,
       share_base,
       share_high,
       data_layer,
       approval_status,
       created_at,
       updated_at
     FROM production.v_workbench_saved_segment
      ORDER BY updated_at DESC, saved_segment_id
      LIMIT $1 OFFSET $2`,
    [limit, offset],
  );
  return rows.map((row) => ({
    ...row,
    id: row.saved_segment_id,
    segment_id: row.saved_segment_id,
    name: row.title,
  })) as SavedSegmentRow[];
}

export async function getSegment(savedSegmentId: string): Promise<(SavedSegmentRow & {
  conditions: JsonValue[];
  versions: JsonValue[];
}) | null> {
  const row = await workspaceOne<SavedSegmentRow & {
    conditions: JsonValue[];
    versions: JsonValue[];
  }>(
    `SELECT latest.*,
       COALESCE((
         SELECT jsonb_agg(jsonb_build_object(
           'group_id', scg.group_id,
           'parent_group_id', scg.parent_group_id,
           'logic', scg.logical_operator,
           'enabled', scg.enabled,
           'conditions', COALESCE((
             SELECT jsonb_agg(jsonb_build_object(
               'condition_id', sc.condition_id,
               'source_id', sc.source_code,
               'source_code', sc.source_code,
               'label', coalesce(catalog.label_ko, sc.source_text, sc.source_code),
               'group', sc.condition_namespace,
               'condition_namespace', sc.condition_namespace,
               'operator', sc.operator,
               'value', sc.value_json,
               'unit', sc.entity_unit,
               'entity_unit', sc.entity_unit,
               'match_status', sc.resolution_status,
               'resolution_status', sc.resolution_status,
               'dependency_group', sc.dependency_group,
               'reference_year', sc.reference_year,
               'evidence_id', sc.evidence_id,
               'ordinal', sc.ordinal,
               'enabled', sc.enabled
             ) ORDER BY sc.ordinal)
             FROM segment_condition sc
             LEFT JOIN production.v_workbench_condition_catalog catalog ON catalog.catalog_id = sc.source_code
             WHERE sc.group_id=scg.group_id
           ), '[]'::jsonb)
         ) ORDER BY (scg.parent_group_id IS NOT NULL), scg.created_at, scg.ordinal)
         FROM segment_condition_group scg
         WHERE scg.query_id=latest.query_id
       ), '[]'::jsonb) AS conditions,
       COALESCE((
         SELECT jsonb_agg(jsonb_build_object(
           'version_no', ssv.version_no,
           'query_id', ssv.query_id,
           'natural_language_text', ssv.natural_language_text,
           'parser_version', ssv.parser_version,
           'definition_hash', ssv.definition_hash,
           'pinned_result_id', ssv.pinned_result_id,
           'change_reason', ssv.change_reason,
           'created_at', ssv.created_at
         ) ORDER BY ssv.version_no DESC)
         FROM saved_segment_version ssv
         WHERE ssv.saved_segment_id = latest.saved_segment_id
       ), '[]'::jsonb) AS versions
     FROM v_saved_segment_latest latest
     WHERE latest.saved_segment_id = $1`,
    [savedSegmentId],
  );
  return row ? {
    ...row,
    id: row.saved_segment_id,
    segment_id: row.saved_segment_id,
    name: row.title,
  } : null;
}

export async function listEstimates(options: PageOptions & { status?: string; estimateId?: string } = {}): Promise<EstimateLineageRow[]> {
  const { limit, offset } = page(options);
  const requestedEstimateId = options.estimateId?.startsWith("domain-universe:")
    ? options.estimateId.replace("domain-universe:", "domain-market:")
    : options.estimateId ?? null;
  const rows = await workspaceRows<EstimateLineageRow & { display_name: string }>(
    `WITH candidates AS (
       SELECT
         directory.estimate_id,
         NULL::text AS workspace_id,
         directory.subject_type,
         directory.subject_id,
         directory.entity_unit,
         directory.status,
         'baseline'::text AS data_layer,
         'approved'::text AS approval_status,
         directory.count_low,
         directory.count_base,
         directory.count_high,
         directory.share_low,
         directory.share_base,
         directory.share_high,
         directory.description_ko AS denominator_definition,
         directory.method_code,
         directory.formula,
         'KR'::text AS geography_code,
         directory.geography_scope AS geography_name_ko,
         directory.reference_year::text AS reference_period,
         directory.model_version,
         jsonb_build_object('grade', directory.estimate_grade, 'total_score', directory.confidence_score) AS confidence_json,
         COALESCE(factors.components_json, '[]'::jsonb) AS components_json,
         jsonb_build_array(jsonb_build_object('uncertainty_method', directory.uncertainty_method)) AS assumptions_json,
         '[]'::jsonb AS validation_gaps_json,
         '[]'::jsonb AS dependencies_json,
         COALESCE(sources.sources_json, '[]'::jsonb) AS sources_json,
         related_spend.related_spend_json,
         directory.model_version AS data_version,
         directory.updated_at AS created_at,
         directory.updated_at,
         directory.display_name_ko AS display_name,
         false AS is_operational
       FROM production.v_workbench_market_sizing_directory directory
       LEFT JOIN LATERAL (
         SELECT jsonb_agg(jsonb_build_object(
           'component_id', factor.factor_id,
           'component_code', factor.factor_label,
           'component_type', CASE WHEN factor.factor_order = 1 THEN 'parent_population' ELSE 'conditional_probability' END,
           'operation', factor.formula,
           'value_low', factor.value_low,
           'value_base', factor.value_base,
           'value_high', factor.value_high,
           'unit', factor.factor_unit,
           'directness_class', factor.directness,
           'reference_period', directory.reference_year::text,
           'evidence_id', factor.source_release_id
         ) ORDER BY factor.factor_order) AS components_json
         FROM production.v_estimate_factor_lineage factor
         WHERE factor.subject_type = directory.subject_type
           AND factor.subject_id = directory.subject_id
       ) factors ON true
       LEFT JOIN LATERAL (
         SELECT jsonb_agg(jsonb_build_object(
           'release_id', source_value.release_id,
           'publisher', source.publisher,
           'title', source.dataset_title,
           'reference_year', directory.reference_year
         ) ORDER BY source_value.release_id) AS sources_json
         FROM jsonb_array_elements_text(directory.source_release_ids) AS source_value(release_id)
         LEFT JOIN production.v_source_summary source ON source.release_id = source_value.release_id
       ) sources ON true
       LEFT JOIN LATERAL (
         SELECT jsonb_build_object(
           'metric_code', spend.metric_code,
           'display_name', spend.display_name_ko,
           'value_low', spend.value_low,
           'value_base', spend.value_base,
           'value_high', spend.value_high,
           'unit', spend.metric_unit,
           'reference_year', spend.reference_year,
           'method_code', spend.method_code,
           'source_release_ids', spend.source_release_ids,
           'confidence_score', spend.confidence_score
         ) AS related_spend_json
         FROM production.v_trend_spend_summary spend
         WHERE spend.subject_type = directory.subject_type
           AND spend.subject_id = directory.subject_id
           AND spend.metric_unit = 'KRW'
         ORDER BY spend.reference_year DESC, spend.metric_code
         LIMIT 1
       ) related_spend ON true

       UNION ALL

       SELECT
         lineage.estimate_id::text,
         lineage.workspace_id::text,
         lineage.subject_type,
         lineage.subject_id,
         lineage.entity_unit,
         lineage.status,
         lineage.data_layer,
         lineage.approval_status,
         lineage.count_low,
         lineage.count_base,
         lineage.count_high,
         lineage.share_low,
         lineage.share_base,
         lineage.share_high,
         lineage.denominator_definition,
         lineage.method_code,
         lineage.formula,
         lineage.geography_code,
         lineage.geography_name_ko,
         lineage.reference_period,
         lineage.model_version,
         lineage.confidence_json,
         COALESCE(lineage.components_json, '[]'::jsonb),
         COALESCE(lineage.assumptions_json, '[]'::jsonb),
         COALESCE(lineage.validation_gaps_json, '[]'::jsonb),
         COALESCE(lineage.dependencies_json, '[]'::jsonb),
         COALESCE(lineage.sources_json, '[]'::jsonb),
         NULL::jsonb AS related_spend_json,
         lineage.data_version,
         lineage.created_at,
         lineage.updated_at,
         COALESCE(archetype.name_ko, query.name, lineage.subject_id) AS display_name,
         true AS is_operational
       FROM v_estimate_lineage lineage
       LEFT JOIN archetype
         ON lineage.subject_type = 'archetype'
        AND archetype.archetype_id = lineage.subject_id
       LEFT JOIN segment_query query
         ON lineage.subject_type = 'query'
        AND query.query_id::text = lineage.subject_id
       WHERE (
           lineage.workspace_id = current_setting('market_engine.workspace_id', true)::uuid
           OR (
             $2::text IS NOT NULL
             AND lineage.workspace_id IS NULL
             AND lineage.estimate_id::text = $2
           )
         )
         AND NOT production.is_fixture_text(COALESCE(query.name, archetype.name_ko, lineage.subject_id))
     )
     SELECT *
     FROM candidates
     WHERE ($1::text IS NULL OR status = $1 OR ($1 = 'estimated' AND status = 'bounded_estimate'))
       AND ($2::text IS NULL OR estimate_id = $2)
     ORDER BY is_operational DESC, updated_at DESC, subject_type, display_name, estimate_id
     LIMIT $3 OFFSET $4`,
    [options.status ?? null, requestedEstimateId, limit, offset],
  );
  return rows.map((row) => {
    const confidence = row.confidence_json && typeof row.confidence_json === "object" && !Array.isArray(row.confidence_json)
      ? row.confidence_json as Record<string, JsonValue>
      : {};
    return {
      ...row,
      id: row.estimate_id,
      name: row.display_name,
      description: row.denominator_definition,
      factors: Array.isArray(row.components_json) && row.components_json.length
        ? row.components_json
        : [{
          id: `calibrated-market:${row.subject_id}`,
          name: row.display_name,
          component_type: "parent_population",
          operation: row.formula,
          value_low: row.count_low,
          value_base: row.count_base,
          value_high: row.count_high,
          unit: row.entity_unit,
          reference_period: row.reference_period,
          observation_type: "calibrated_baseline",
        }],
      sensitivity: [],
      market_scenarios: [],
      confidence_grade: confidence.grade ?? null,
      confidence_score: confidence.total_score ?? null,
    } as EstimateLineageRow;
  });
}

type EstimateDetailRow = EstimateLineageRow & {
  display_name: string | null;
  display_components_json: JsonValue[];
  sensitivity_results: JsonValue[];
  market_scenarios: JsonValue[];
  tam_entities_low: string | null;
  tam_entities_base: string | null;
  tam_entities_high: string | null;
  sam_entities_low: string | null;
  sam_entities_base: string | null;
  sam_entities_high: string | null;
  som_entities_low: string | null;
  som_entities_base: string | null;
  som_entities_high: string | null;
  tam_revenue_low: string | null;
  tam_revenue_base: string | null;
  tam_revenue_high: string | null;
  sam_revenue_low: string | null;
  sam_revenue_base: string | null;
  sam_revenue_high: string | null;
  som_revenue_low: string | null;
  som_revenue_base: string | null;
  som_revenue_high: string | null;
  market_currency: string | null;
  active_market_scenario_count: number;
  active_market_scenario_name: string | null;
  active_market_scenario_version: string | null;
  selected_market_scenario_id: string | null;
  market_scenario_selection_mode: "explicit" | "unique_active" | "none";
};

function estimateDetail(row: EstimateDetailRow): EstimateLineageRow {
  const factors = (Array.isArray(row.display_components_json) ? row.display_components_json : []).map((entry) => {
    const item = entry && typeof entry === "object" && !Array.isArray(entry) ? entry as Record<string, JsonValue> : {};
    return {
      ...item,
      id: item.component_id ?? null,
      name: item.component_code ?? item.component_type ?? "factor",
      low: item.value_low ?? null,
      base: item.value_base ?? null,
      high: item.value_high ?? null,
      observation_type: item.directness_class ?? null,
    } as JsonValue;
  });
  const confidence = row.confidence_json && typeof row.confidence_json === "object" && !Array.isArray(row.confidence_json)
    ? row.confidence_json as Record<string, JsonValue>
    : {};
  return {
    ...row,
    id: row.estimate_id,
    name: row.display_name ?? row.subject_id,
    factors,
    sensitivity: row.sensitivity_results,
    market_scenarios: row.market_scenarios,
    tam_low: row.tam_entities_low,
    tam: row.tam_entities_base,
    tam_high: row.tam_entities_high,
    sam_low: row.sam_entities_low,
    sam: row.sam_entities_base,
    sam_high: row.sam_entities_high,
    som_low: row.som_entities_low,
    som: row.som_entities_base,
    som_high: row.som_entities_high,
    tam_revenue_low: row.tam_revenue_low,
    tam_revenue: row.tam_revenue_base,
    tam_revenue_high: row.tam_revenue_high,
    sam_revenue_low: row.sam_revenue_low,
    sam_revenue: row.sam_revenue_base,
    sam_revenue_high: row.sam_revenue_high,
    som_revenue_low: row.som_revenue_low,
    som_revenue: row.som_revenue_base,
    som_revenue_high: row.som_revenue_high,
    currency: row.market_currency,
    active_market_scenario_count: row.active_market_scenario_count,
    active_market_scenario_name: row.active_market_scenario_name,
    active_market_scenario_version: row.active_market_scenario_version,
    selected_market_scenario_id: row.selected_market_scenario_id,
    selected_market_scenario_name: row.active_market_scenario_name,
    selected_market_scenario_version: row.active_market_scenario_version,
    market_scenario_selection_mode: row.market_scenario_selection_mode,
    market_metric_unavailable_reason: row.status === "suppressed"
      ? "rare_output_below_release_threshold"
      : row.market_scenario_selection_mode === "none" && row.active_market_scenario_count > 1
        ? "multiple_active_market_scenarios_require_explicit_selection"
        : row.active_market_scenario_count === 0
          ? "active_market_scenario_not_available"
          : row.tam_entities_base === null
            ? "active_market_estimate_not_available"
            : null,
    confidence_grade: confidence.grade ?? null,
    confidence_score: confidence.total_score ?? null,
  } as EstimateLineageRow;
}

export async function getEstimates(
  estimateIds: string[],
  scenarioSelection: MarketScenarioSelection | null = null,
): Promise<EstimateLineageRow[]> {
  const uniqueIds = [...new Set(estimateIds)];
  if (!uniqueIds.length) return [];
  if (scenarioSelection && uniqueIds.length !== 1) {
    throw new Error("explicit_market_scenario_selection_requires_one_estimate");
  }
  const rows = await workspaceRows<EstimateDetailRow>(
    `WITH requested AS (
       SELECT estimate_id, ordinality
         FROM unnest($1::uuid[]) WITH ORDINALITY AS input(estimate_id, ordinality)
     )
     SELECT lineage.*,
       coalesce(archetype.name_ko, query.name, lineage.subject_id) AS display_name,
       COALESCE((
         SELECT jsonb_agg(
           to_jsonb(ec) || jsonb_build_object(
             'reference_period', component_period.label,
             'evidence_id', ev.evidence_id,
             'release_id', sr.release_id,
             'source_id', sr.source_id,
             'locator', CASE WHEN lineage.status='suppressed' THEN NULL ELSE ev.locator END
           ) ORDER BY ec.sequence
         )
         FROM v_estimate_component_release_boundary ec
         LEFT JOIN time_period component_period ON component_period.period_id=ec.reference_period_id
         LEFT JOIN evidence ev USING (evidence_id)
         LEFT JOIN source_release sr USING (release_id)
         WHERE ec.estimate_id=lineage.estimate_id
       ), '[]'::jsonb) AS display_components_json,
       COALESCE((SELECT jsonb_agg(to_jsonb(esr) ORDER BY esr.impact_rank)
                 FROM v_estimate_sensitivity_release_boundary esr
                 WHERE esr.estimate_id=lineage.estimate_id), '[]'::jsonb) AS sensitivity_results,
       CASE WHEN lineage.status='suppressed' THEN '[]'::jsonb ELSE COALESCE((
         SELECT jsonb_agg(
           COALESCE(to_jsonb(me), '{}'::jsonb) || jsonb_build_object(
             'scenario_id',ms.scenario_id,
             'scenario_name',ms.name,
             'scenario_version',ms.version,
             'scenario_status',ms.status,
             'scenario_assumptions',ms.assumptions,
             'scenario_currency',ms.currency,
             'scenario_created_at',ms.created_at
           ) ORDER BY ms.created_at DESC, ms.scenario_id
         )
           FROM segment_query_result scenario_result
           JOIN market_scenario ms ON ms.base_query_result_id=scenario_result.result_id
           JOIN segment_query scenario_query ON scenario_query.query_id=scenario_result.query_id
           LEFT JOIN LATERAL (
             SELECT candidate.*
               FROM market_estimate candidate
              WHERE candidate.scenario_id=ms.scenario_id
              ORDER BY candidate.created_at DESC, candidate.market_estimate_id
              LIMIT 1
           ) me ON true
          WHERE scenario_result.estimate_id=lineage.estimate_id
            AND ms.workspace_id=scenario_query.workspace_id
            AND ms.workspace_id=current_setting('market_engine.workspace_id', true)::uuid
       ), '[]'::jsonb) END AS market_scenarios,
       market.tam_entities_low, market.tam_entities_base, market.tam_entities_high,
       market.sam_entities_low, market.sam_entities_base, market.sam_entities_high,
       market.som_entities_low, market.som_entities_base, market.som_entities_high,
       market.tam_revenue_low, market.tam_revenue_base, market.tam_revenue_high,
       market.sam_revenue_low, market.sam_revenue_base, market.sam_revenue_high,
       market.som_revenue_low, market.som_revenue_base, market.som_revenue_high,
       selected_scenario.currency AS market_currency,
       CASE WHEN lineage.status='suppressed' THEN 0
            ELSE market_state.active_market_scenario_count END AS active_market_scenario_count,
       selected_scenario.scenario_name AS active_market_scenario_name,
       selected_scenario.scenario_version AS active_market_scenario_version,
       selected_scenario.scenario_id::text AS selected_market_scenario_id,
       CASE WHEN selected_scenario.scenario_id IS NULL THEN 'none'
            WHEN $2::uuid IS NOT NULL THEN $4::text
            ELSE 'unique_active' END AS market_scenario_selection_mode
     FROM v_estimate_lineage lineage
     LEFT JOIN archetype ON lineage.subject_type='archetype' AND archetype.archetype_id=lineage.subject_id
     LEFT JOIN segment_query query ON lineage.subject_type='query' AND query.query_id::text=lineage.subject_id
     LEFT JOIN LATERAL (
       SELECT count(*)::integer AS active_market_scenario_count
       FROM segment_query_result result
       JOIN market_scenario ms ON ms.base_query_result_id=result.result_id
       JOIN segment_query scenario_query ON scenario_query.query_id=result.query_id
       WHERE result.estimate_id=lineage.estimate_id
         AND lineage.status<>'suppressed'
         AND ms.workspace_id=scenario_query.workspace_id
         AND ms.workspace_id=current_setting('market_engine.workspace_id', true)::uuid
         AND ms.status='active'
     ) market_state ON true
     LEFT JOIN LATERAL (
       SELECT ms.scenario_id, ms.currency,
              ms.name AS scenario_name, ms.version AS scenario_version
       FROM segment_query_result result
       JOIN market_scenario ms ON ms.base_query_result_id=result.result_id
       JOIN segment_query scenario_query ON scenario_query.query_id=result.query_id
       WHERE result.estimate_id=lineage.estimate_id
         AND lineage.status<>'suppressed'
         AND ms.workspace_id=scenario_query.workspace_id
         AND ms.workspace_id=current_setting('market_engine.workspace_id', true)::uuid
         AND ms.status='active'
         AND (($2::uuid IS NULL AND market_state.active_market_scenario_count=1)
           OR ($2::uuid IS NOT NULL AND ms.scenario_id=$2 AND ms.version=$3))
         AND ($4::text IS DISTINCT FROM 'unique_active'
           OR market_state.active_market_scenario_count=1)
       ORDER BY ms.created_at DESC, ms.scenario_id
       LIMIT 1
     ) selected_scenario ON true
     LEFT JOIN LATERAL (
       SELECT me.*
         FROM market_estimate me
        WHERE me.scenario_id=selected_scenario.scenario_id
        ORDER BY me.created_at DESC, me.market_estimate_id
        LIMIT 1
     ) market ON true
     JOIN requested ON requested.estimate_id=lineage.estimate_id
     WHERE ($2::uuid IS NULL OR selected_scenario.scenario_id IS NOT NULL)
     ORDER BY requested.ordinality`,
    [
      uniqueIds,
      scenarioSelection?.scenarioId ?? null,
      scenarioSelection?.scenarioVersion ?? null,
      scenarioSelection?.selectionMode ?? (scenarioSelection ? "explicit" : null),
    ],
  );
  return rows.map(estimateDetail);
}

export async function getEstimate(
  estimateId: string,
  scenarioSelection: MarketScenarioSelection | null = null,
): Promise<EstimateLineageRow | null> {
  let resolvedEstimateId: string;
  try {
    resolvedEstimateId = decodeURIComponent(estimateId);
  } catch {
    return null;
  }
  if (resolvedEstimateId.startsWith("domain-universe:") || resolvedEstimateId.startsWith("domain-market:") || resolvedEstimateId.startsWith("gold-query:")) {
    if (scenarioSelection) return null;
    return (await listEstimates({ estimateId: resolvedEstimateId, limit: 1 }))[0] ?? null;
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(resolvedEstimateId)) {
    return null;
  }
  return (await getEstimates([resolvedEstimateId], scenarioSelection))[0] ?? null;
}

export interface ComparisonMemberRow {
  comparison_id: string;
  workspace_id: string;
  comparison_name: string;
  comparison_status: string;
  position: number;
  display_label: string | null;
  query_result_id: string;
  segment_name: string;
  primary_entity_unit: string;
  estimate_id: string;
  estimate_status?: string | null;
  count_low: string | null;
  count_base: string | null;
  count_high: string | null;
  share_base: string | null;
  normalized_metrics: JsonValue;
  source_kind?: "query_result" | "archetype" | "subtype";
  normalized_count_score?: number | null;
  annual_spend?: number | string | null;
  spend_unit?: string | null;
  growth_rate?: number | null;
  confidence_score?: number | null;
  confidence_grade?: string | null;
  validation_gap_count?: number | null;
  direct_observation_share?: number | null;
  estimate_updated_at?: string | null;
  active_market_scenario_count?: number | null;
  market_scenario_id?: string | null;
  market_scenario_name?: string | null;
  market_scenario_version?: string | null;
  market_horizon_months?: number | null;
  market_estimate_id?: string | null;
  tam_entities_base?: number | string | null;
  sam_entities_base?: number | string | null;
  som_entities_base?: number | string | null;
  tam_revenue_base?: number | string | null;
  sam_revenue_base?: number | string | null;
  som_revenue_base?: number | string | null;
  market_currency?: string | null;
  annual_spend_per_entity?: number | string | null;
  annual_spend_per_entity_unit?: string | null;
}

export async function getComparison(comparisonId: string): Promise<{
  comparison_id: string;
  name: string;
  status: string;
  members: ComparisonMemberRow[];
  items: Array<ComparisonMemberRow & { id: string; name: string }>;
} | null> {
  const members = await workspaceRows<ComparisonMemberRow>(
    `SELECT * FROM v_comparison_detail
     WHERE comparison_id = $1
     ORDER BY position`,
    [comparisonId],
  );
  if (!members.length) return null;
  return {
    comparison_id: members[0].comparison_id,
    name: members[0].comparison_name,
    status: members[0].comparison_status,
    members,
    items: members.map((member) => ({ ...member, id: member.query_result_id, name: member.display_label ?? member.segment_name })),
  };
}

export async function compareSegments(queryResultIds: string[]): Promise<{
  members: ComparisonMemberRow[];
  items: Array<ComparisonMemberRow & { id: string; name: string }>;
  unit_groups: Record<string, ComparisonMemberRow[]>;
}> {
  if (!queryResultIds.length) return { members: [], items: [], unit_groups: {} };
  if (queryResultIds.length > 5) throw new Error("comparison_member_limit_exceeded");

  const members = await workspaceRows<ComparisonMemberRow>(
    `WITH requested AS (
       SELECT value AS requested_id, ordinality::smallint AS position
       FROM unnest($1::text[]) WITH ORDINALITY AS input(value, ordinality)
     )
     SELECT
       NULL::uuid AS comparison_id,
       NULL::uuid AS workspace_id,
       'Unsaved comparison'::text AS comparison_name,
       'draft'::text AS comparison_status,
       requested.position,
       matched.segment_name AS display_label,
       matched.object_id AS query_result_id,
       matched.segment_name,
       matched.primary_entity_unit,
       matched.estimate_id,
       matched.estimate_status,
       matched.count_low,
       matched.count_base,
       matched.count_high,
       matched.share_base,
       matched.source_kind,
       matched.confidence_score,
       matched.confidence_grade,
       matched.validation_gap_count,
       matched.direct_observation_share,
       matched.estimate_updated_at,
       matched.active_market_scenario_count,
       matched.market_scenario_id,
       matched.market_scenario_name,
       matched.market_scenario_version,
       matched.market_horizon_months,
       matched.market_estimate_id,
       matched.tam_entities_base,
       matched.sam_entities_base,
       matched.som_entities_base,
       matched.tam_revenue_base,
       matched.sam_revenue_base,
       matched.som_revenue_base,
       matched.market_currency,
       matched.annual_spend_per_entity,
       matched.annual_spend_per_entity_unit,
       '{}'::jsonb AS normalized_metrics
     FROM requested
     JOIN LATERAL (
       SELECT * FROM (
         SELECT sqr.result_id::text AS object_id, sq.name AS segment_name,
                sq.primary_entity_unit, e.estimate_id::text AS estimate_id,
                e.status AS estimate_status,
                e.count_low,e.count_base,e.count_high,e.share_base,
                CASE WHEN e.release_suppressed THEN NULL::double precision
                     ELSE ca.total_score::double precision END AS confidence_score,
                CASE WHEN e.release_suppressed THEN NULL::text
                     ELSE ca.grade::text END AS confidence_grade,
                CASE WHEN e.release_suppressed THEN NULL::integer
                     ELSE (SELECT count(*)::integer FROM validation_gap gap
                            WHERE gap.estimate_id=e.estimate_id) END AS validation_gap_count,
                (SELECT CASE WHEN e.release_suppressed OR count(*)=0 THEN NULL
                             ELSE count(*) FILTER (WHERE ec.directness_class='direct_observation')::numeric / count(*) END
                   FROM v_estimate_component_release_boundary ec
                  WHERE ec.estimate_id=e.estimate_id)::double precision AS direct_observation_share,
                CASE WHEN e.release_suppressed THEN NULL::text
                     ELSE e.updated_at::text END AS estimate_updated_at,
                market_state.active_market_scenario_count,
                market.market_scenario_id,
                market.market_scenario_name,
                market.market_scenario_version,
                market.market_horizon_months,
                market.market_estimate_id::text,
                market.tam_entities_base, market.sam_entities_base, market.som_entities_base,
                market.tam_revenue_base, market.sam_revenue_base, market.som_revenue_base,
                market.market_currency,
                market.annual_spend_per_entity,
                market.annual_spend_per_entity_unit,
                'query_result'::text AS source_kind,0 AS rank
         FROM v_segment_query_result_release_boundary sqr
         JOIN segment_query sq USING (query_id)
         JOIN v_estimate_release_boundary e USING (estimate_id)
         LEFT JOIN confidence_assessment ca USING (estimate_id)
         LEFT JOIN v_saved_segment_latest saved ON saved.result_id=sqr.result_id
         LEFT JOIN LATERAL (
           SELECT count(*)::integer AS active_market_scenario_count
             FROM market_scenario ms
            WHERE ms.base_query_result_id=sqr.result_id AND ms.status='active'
              AND NOT e.release_suppressed
         ) market_state ON true
         LEFT JOIN LATERAL (
           SELECT ms.scenario_id::text AS market_scenario_id,
                  ms.name AS market_scenario_name,
                  ms.version AS market_scenario_version,
                  ms.horizon_months AS market_horizon_months,
                  me.market_estimate_id, me.tam_entities_base, me.sam_entities_base,
                  me.som_entities_base, me.tam_revenue_base, me.sam_revenue_base,
                  me.som_revenue_base, ms.currency::text AS market_currency,
                  spend.value_base AS annual_spend_per_entity,
                  spend.unit AS annual_spend_per_entity_unit
             FROM market_scenario ms
             LEFT JOIN market_estimate me USING (scenario_id)
             LEFT JOIN scenario_factor_override spend
               ON spend.scenario_id=ms.scenario_id
              AND spend.factor_code='annual_spend_per_entity'
            WHERE ms.base_query_result_id=sqr.result_id AND ms.status='active'
              AND NOT e.release_suppressed
              AND market_state.active_market_scenario_count=1
            ORDER BY me.created_at DESC NULLS LAST
            LIMIT 1
         ) market ON true
         WHERE sqr.result_id::text=requested.requested_id
            OR e.estimate_id::text=requested.requested_id
            OR saved.saved_segment_id::text=requested.requested_id

         UNION ALL

         SELECT archetype.archetype_id, archetype.display_name_ko,
                archetype.entity_unit, bridge_estimate.estimate_id::text,
                archetype.status,
                archetype.estimated_count_low,archetype.estimated_count_base,archetype.estimated_count_high,
                archetype.estimated_share_base,archetype.confidence_score,archetype.estimate_grade,
                0::integer,
                bridge_directness.direct_observation_share,
                bridge_estimate.updated_at::text,
                0::integer,NULL::text,NULL::text,NULL::text,NULL::integer,
                NULL::text,NULL::numeric,NULL::numeric,NULL::numeric,
                NULL::numeric,NULL::numeric,NULL::numeric,NULL::text,
                NULL::numeric,NULL::text,
                'archetype'::text,1
         FROM production.v_workbench_archetype_primary_context archetype
         JOIN estimate bridge_estimate
           ON bridge_estimate.external_estimate_key = 'phase2r-b:archetype-primary:' || archetype.archetype_id
         LEFT JOIN LATERAL (
           SELECT CASE WHEN count(*) = 0 THEN NULL::double precision
                       ELSE count(*) FILTER (WHERE component.directness_class='direct_observation')::numeric / count(*) END::double precision
             AS direct_observation_share
           FROM v_estimate_component_release_boundary component
           WHERE component.estimate_id = bridge_estimate.estimate_id
         ) bridge_directness ON true
         WHERE archetype.archetype_id=requested.requested_id

         UNION ALL

         SELECT subtype.subtype_id, subtype.display_name_ko,
                subtype.entity_unit, ('subtype-market:' || subtype.subtype_id),
                subtype.status,
                subtype.count_low,subtype.count_base,subtype.count_high,
                subtype.share_base,subtype.confidence_score,subtype.estimate_grade,
                0::integer,
                NULL::double precision,subtype.updated_at::text,
                0::integer,NULL::text,NULL::text,NULL::text,NULL::integer,
                NULL::text,NULL::numeric,NULL::numeric,NULL::numeric,
                NULL::numeric,NULL::numeric,NULL::numeric,NULL::text,
                NULL::numeric,NULL::text,
                'subtype'::text,2
         FROM production.v_subtype_market_summary subtype
         WHERE subtype.subtype_id=requested.requested_id
       ) candidates ORDER BY rank LIMIT 1
     ) matched ON true
     ORDER BY requested.position`,
    [queryResultIds],
  );

  const finiteNumber = (value: string | number | null | undefined): number | null => {
    if (value === null || value === undefined) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const decimalValue = (value: string | number | null | undefined): Decimal | null => {
    if (value === null || value === undefined) return null;
    try {
      const parsed = new Decimal(value);
      return parsed.isFinite() ? parsed : null;
    } catch {
      return null;
    }
  };
  const exactNumeric = (value: string | number | null | undefined): string | number | null =>
    decimalValue(value) === null ? null : value ?? null;
  const countsByUnit = new Map<string, Decimal[]>();
  for (const member of members) {
    const count = decimalValue(member.count_base);
    if (count === null) continue;
    const counts = countsByUnit.get(member.primary_entity_unit) ?? [];
    counts.push(count);
    countsByUnit.set(member.primary_entity_unit, counts);
  }
  const normalizedMembers = members.map((member) => {
    const group = countsByUnit.get(member.primary_entity_unit) ?? [];
    const rawBaseDecimal = decimalValue(member.count_base);
    const rawBase = exactNumeric(member.count_base);
    const minimum = group.length ? Decimal.min(...group) : null;
    const maximum = group.length ? Decimal.max(...group) : null;
    const normalizedCountScore = rawBase === null || group.length < 2 || minimum === null || maximum === null
      ? null
      : maximum.eq(minimum) ? 100 : rawBaseDecimal!.minus(minimum).div(maximum.minus(minimum)).mul(100).toNumber();
    const tamEntities = exactNumeric(member.tam_entities_base);
    const samEntities = exactNumeric(member.sam_entities_base);
    const somEntities = exactNumeric(member.som_entities_base);
    const tamRevenue = exactNumeric(member.tam_revenue_base);
    const samRevenue = exactNumeric(member.sam_revenue_base);
    const somRevenue = exactNumeric(member.som_revenue_base);
    const annualSpend = exactNumeric(member.annual_spend_per_entity);
    const releaseSuppressed = member.estimate_status === "suppressed";
    const activeScenarioCount = member.active_market_scenario_count ?? 0;
    const marketScenarioUnavailable = releaseSuppressed
      ? "rare_output_below_release_threshold"
      : activeScenarioCount > 1
        ? "multiple_active_market_scenarios_require_explicit_selection"
        : activeScenarioCount === 0
          ? "active_market_scenario_not_available"
          : member.market_estimate_id === null || member.market_estimate_id === undefined
            ? "active_market_estimate_not_available"
            : null;
    const revenueUnavailable = (value: string | number | null) => marketScenarioUnavailable
      ?? (value === null ? "annual_spend_evidence_not_available" : null);
    const normalizedMetrics: JsonValue = {
      raw_count_low: exactNumeric(member.count_low),
      raw_count_base: rawBase,
      raw_count_high: exactNumeric(member.count_high),
      raw_entity_unit: member.primary_entity_unit,
      normalized_count_score: normalizedCountScore,
      normalization_scope: releaseSuppressed
        ? "withheld_by_release_policy"
        : `within_${member.primary_entity_unit}_members_only`,
      count_status: releaseSuppressed ? "suppressed" : rawBase === null ? "unavailable" : "available",
      confidence_score: finiteNumber(member.confidence_score),
      confidence_grade: member.confidence_grade ?? null,
      validation_gap_count: finiteNumber(member.validation_gap_count),
      direct_observation_share: finiteNumber(member.direct_observation_share),
      estimate_updated_at: member.estimate_updated_at ?? null,
      active_market_scenario_count: activeScenarioCount,
      market_scenario_id: member.market_scenario_id ?? null,
      market_scenario_name: member.market_scenario_name ?? null,
      market_scenario_version: member.market_scenario_version ?? null,
      market_horizon_months: member.market_horizon_months ?? null,
      tam_entities_base: tamEntities,
      sam_entities_base: samEntities,
      som_entities_base: somEntities,
      tam_revenue_base: tamRevenue,
      sam_revenue_base: samRevenue,
      som_revenue_base: somRevenue,
      currency: member.market_currency ?? null,
      annual_spend_per_entity: annualSpend,
      annual_spend_per_entity_unit: member.annual_spend_per_entity_unit ?? null,
      growth_rate: null,
      target_accessibility: null,
      digital_reachability: null,
      competition_intensity: null,
      purchase_frequency: null,
      willingness_to_pay: null,
      unavailable_reason: releaseSuppressed
        ? "rare_output_below_release_threshold"
        : rawBaseDecimal === null ? "registered_estimate_not_available" : null,
      metric_unavailable_reasons: {
        raw_count: releaseSuppressed
          ? "rare_output_below_release_threshold"
          : rawBaseDecimal === null ? "registered_estimate_not_available" : null,
        normalized_count_score: releaseSuppressed
          ? "rare_output_below_release_threshold"
          : rawBaseDecimal === null
            ? "registered_estimate_not_available"
            : group.length < 2 ? "same_unit_comparator_required" : null,
        confidence_score: releaseSuppressed
          ? "rare_output_below_release_threshold"
          : finiteNumber(member.confidence_score) === null ? "confidence_assessment_not_available" : null,
        validation_gap_count: releaseSuppressed
          ? "rare_output_below_release_threshold"
          : finiteNumber(member.validation_gap_count) === null ? "validation_gap_review_not_available" : null,
        direct_observation_share: releaseSuppressed
          ? "rare_output_below_release_threshold"
          : finiteNumber(member.direct_observation_share) === null ? "estimate_component_evidence_not_available" : null,
        estimate_updated_at: releaseSuppressed
          ? "rare_output_below_release_threshold"
          : member.estimate_updated_at ? null : "estimate_timestamp_not_available",
        market_scenario_id: member.market_scenario_id === null || member.market_scenario_id === undefined
          ? marketScenarioUnavailable
          : null,
        tam_entities_base: marketScenarioUnavailable,
        sam_entities_base: marketScenarioUnavailable,
        som_entities_base: marketScenarioUnavailable,
        tam_revenue_base: revenueUnavailable(tamRevenue),
        sam_revenue_base: revenueUnavailable(samRevenue),
        som_revenue_base: revenueUnavailable(somRevenue),
        annual_spend_per_entity: marketScenarioUnavailable
          ?? (annualSpend === null ? "annual_spend_evidence_not_available" : null),
        growth_rate: "time_series_evidence_not_available",
        target_accessibility: "target_accessibility_evidence_not_available",
        digital_reachability: "digital_reachability_evidence_not_available",
        competition_intensity: "competition_evidence_not_available",
        purchase_frequency: "purchase_frequency_evidence_not_available",
        willingness_to_pay: "willingness_to_pay_evidence_not_available",
      },
    };
    return {
      ...member,
      normalized_metrics: normalizedMetrics,
      normalized_count_score: normalizedCountScore,
      annual_spend: annualSpend,
      spend_unit: member.annual_spend_per_entity_unit ?? null,
      growth_rate: null,
    };
  });

  const unitGroups: Record<string, ComparisonMemberRow[]> = {};
  for (const member of normalizedMembers) {
    (unitGroups[member.primary_entity_unit] ??= []).push(member);
  }
  return {
    members: normalizedMembers,
    items: normalizedMembers.map((member) => ({ ...member, id: member.query_result_id, name: member.display_label ?? member.segment_name })),
    unit_groups: unitGroups,
  };
}

export async function listOpportunityBoards(options: PageOptions = {}): Promise<JsonValue[]> {
  const { limit, offset } = page(options);
  return workspaceRows(
    `SELECT *
     FROM production.v_workbench_opportunity_board
     ORDER BY updated_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset],
  ) as Promise<JsonValue[]>;
}

export async function listOpportunities(
  options: (PageOptions & { boardId?: string; status?: string }) | string = {},
): Promise<OpportunityRow[]> {
  const normalized = typeof options === "string" ? { boardId: options } : options;
  const { limit, offset } = page(normalized);
  const rows = await workspaceRows<OpportunityRow>(
    `SELECT snapshot.*,primary_target.segment_name
       FROM production.v_workbench_opportunity_snapshot snapshot
       LEFT JOIN LATERAL (
         SELECT segment.name AS segment_name
           FROM opportunity_segment_link link
           JOIN v_segment_query_result_release_boundary result ON result.result_id=link.query_result_id
           JOIN segment_query segment ON segment.query_id=result.query_id
          WHERE link.opportunity_id=snapshot.opportunity_id
            AND link.link_role='primary_target'
          ORDER BY link.pinned_at,link.opportunity_segment_link_id
          LIMIT 1
       ) primary_target ON true
     WHERE ($1::uuid IS NULL OR snapshot.opportunity_board_id = $1)
       AND ($2::text IS NULL OR snapshot.status = $2)
     ORDER BY snapshot.updated_at DESC
     LIMIT $3 OFFSET $4`,
    [normalized.boardId ?? null, normalized.status ?? null, limit, offset],
  );
  return rows.map((row) => ({
    ...row,
    segment_snapshots: row.segment_snapshots.map((snapshot) => (
      snapshot !== null
        && typeof snapshot === "object"
        && !Array.isArray(snapshot)
        && snapshot.link_role === "primary_target"
        && row.segment_name
        ? { ...snapshot, segment_name: row.segment_name }
        : snapshot
    )),
  }));
}

export async function getOpportunity(opportunityId: string): Promise<OpportunityRow | null> {
  const row = await workspaceOne<OpportunityRow>(
    `SELECT snapshot.*,
       COALESCE((
         SELECT jsonb_agg(to_jsonb(osc) ORDER BY osc.metric_code)
           FROM opportunity_score_component osc
          WHERE osc.opportunity_id=snapshot.opportunity_id
            AND osc.score_version_no=snapshot.score_version_no
       ), '[]'::jsonb) AS score_components,
       COALESCE((
         SELECT jsonb_agg(to_jsonb(oe) ORDER BY oe.created_at DESC)
           FROM opportunity_experiment oe
          WHERE oe.opportunity_id=snapshot.opportunity_id
       ), '[]'::jsonb) AS experiments,
       (
         SELECT jsonb_build_object(
           'saved_segment_id',ss.saved_segment_id,
           'title',ss.title,
           'resolved_version_no',ssv.version_no,
           'pinned_result_id',ssv.pinned_result_id,
           'result_id',sqr.result_id,
           'cache_status',sqr.cache_status,
           'result_summary',sqr.result_summary,
           'estimate_id',e.estimate_id,
           'estimate_status',e.status,
           'primary_entity_unit',e.entity_unit,
           'count_low',e.count_low,
           'count_base',e.count_base,
           'count_high',e.count_high,
           'share_low',e.share_low,
           'share_base',e.share_base,
           'share_high',e.share_high,
           'data_layer',e.data_layer,
           'approval_status',e.approval_status
         )
           FROM opportunity_segment_link osl
           JOIN saved_segment ss USING (saved_segment_id)
           JOIN saved_segment_version ssv
             ON ssv.saved_segment_id=osl.saved_segment_id
            AND ssv.version_no=ss.current_version_no
           JOIN LATERAL (
             SELECT current_result.*
               FROM v_segment_query_result_release_boundary current_result
              WHERE current_result.query_id=ssv.query_id
                AND current_result.cache_status='valid'
              ORDER BY (current_result.result_id=ssv.pinned_result_id) DESC,
                       current_result.executed_at DESC,
                       current_result.result_id DESC
              LIMIT 1
           ) sqr ON true
           JOIN v_estimate_release_boundary e ON e.estimate_id=sqr.estimate_id
          WHERE osl.opportunity_id=snapshot.opportunity_id
            AND osl.saved_segment_id IS NOT NULL
            AND osl.link_role='primary_target'
          ORDER BY osl.pinned_at
         LIMIT 1
       ) AS current_estimate,
     COALESCE((
         SELECT jsonb_agg(jsonb_build_object(
           'action',ae.action,
           'previous_status',ae.before_json->>'status',
           'new_status',ae.after_json->>'status',
           'before',ae.before_json,
           'after',ae.after_json,
           'diff',ae.diff_json,
           'actor_id',ae.actor_id,
           'occurred_at',ae.occurred_at
         ) ORDER BY ae.occurred_at DESC)
           FROM audit_event ae
          WHERE ae.workspace_id=snapshot.workspace_id
            AND ae.aggregate_type='opportunity'
            AND ae.aggregate_id=snapshot.opportunity_id::text
       ), '[]'::jsonb) AS status_history,
       (
         SELECT segment.name
           FROM opportunity_segment_link link
           JOIN v_segment_query_result_release_boundary result ON result.result_id=link.query_result_id
           JOIN segment_query segment ON segment.query_id=result.query_id
          WHERE link.opportunity_id=snapshot.opportunity_id
            AND link.link_role='primary_target'
          ORDER BY link.pinned_at,link.opportunity_segment_link_id
          LIMIT 1
       ) AS segment_name
     FROM v_opportunity_snapshot snapshot WHERE snapshot.opportunity_id = $1`,
    [opportunityId],
  );
  if (!row) return null;
  const snapshots = Array.isArray(row.segment_snapshots) ? row.segment_snapshots : [];
  const primarySnapshot = snapshots.find((entry) => (
    entry !== null
      && typeof entry === "object"
      && !Array.isArray(entry)
      && entry.link_role === "primary_target"
  )) ?? snapshots[0] ?? null;
  const content = Array.isArray(row.current_content) ? row.current_content : [];
  const note = content.find((entry) => entry && typeof entry === "object" && !Array.isArray(entry)
    && (entry as Record<string, JsonValue>).content_type === "note");
  return {
    ...row,
    id: row.opportunity_id,
    problem: row.problem_statement,
    hypothesis: row.hypothesis_summary,
    idea: row.solution_idea,
    estimate_snapshot: primarySnapshot,
    current_estimate: row.current_estimate ?? null,
    notes: note ?? null,
  } as OpportunityRow;
}

export async function listResearchJobs(
  options: PageOptions & { status?: string } = {},
): Promise<ResearchJobRow[]> {
  const { limit, offset } = page(options);
  const rows = await workspaceRows<ResearchJobRow>(
    `SELECT queue.*,
       queue.created_at::text AS created_at,
       queue.updated_at::text AS updated_at
     FROM production.v_workbench_research_review_queue queue
     WHERE ($1::text IS NULL OR research_status = $1)
     ORDER BY
       CASE research_status
         WHEN 'running' THEN 0 WHEN 'queued' THEN 1 WHEN 'needs_review' THEN 2 ELSE 3
       END,
       queue.updated_at DESC
     LIMIT $2 OFFSET $3`,
    [options.status ?? null, limit, offset],
  );
  return rows.map((row) => ({
    ...row,
    id: row.research_job_id,
    job_id: row.research_job_id,
    name: row.research_question,
    status: row.research_status,
  })) as ResearchJobRow[];
}

export async function getResearchJob(researchJobId: string): Promise<(ResearchJobRow & {
  steps: JsonValue[];
  events: JsonValue[];
  artifacts: JsonValue[];
  revision: JsonValue | null;
}) | null> {
  const row = await workspaceOne<ResearchJobRow & {
    steps: JsonValue[];
    events: JsonValue[];
    artifacts: JsonValue[];
    revision: JsonValue | null;
  }>(
    `SELECT queue.*,
       queue.created_at::text AS created_at,
       queue.updated_at::text AS updated_at,
       COALESCE((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.step_no) FROM research_job_step s
                 WHERE s.research_job_id = queue.research_job_id), '[]'::jsonb) AS steps,
       COALESCE((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.sequence_no) FROM research_job_event e
                 WHERE e.research_job_id = queue.research_job_id), '[]'::jsonb) AS events,
       COALESCE((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.created_at) FROM research_job_artifact a
                 WHERE a.research_job_id = queue.research_job_id), '[]'::jsonb) AS artifacts,
       (SELECT to_jsonb(pr) FROM proposed_revision pr
         WHERE pr.research_job_id = queue.research_job_id
         ORDER BY pr.created_at DESC LIMIT 1) AS revision
     FROM v_research_review_queue queue
     WHERE queue.research_job_id = $1`,
    [researchJobId],
  );
  return row ? {
    ...row,
    id: row.research_job_id,
    job_id: row.research_job_id,
    name: row.research_question,
    status: row.research_status,
  } : null;
}

export async function listReviewItems(
  options: PageOptions & { status?: string } = {},
): Promise<JsonValue[]> {
  const { limit, offset } = page(options);
  const rows = await workspaceRows<Record<string, JsonValue>>(
    `SELECT ri.*,
       pr.target_kind,
       pr.target_record_key,
       pr.baseline_payload,
       pr.proposed_payload,
       pr.delta_summary,
       pr.affected_segments,
       pr.expected_recalculation,
       pr.recommended_action,
       rj.research_question,
       rj.target_segment,
       rj.target_variable
     FROM review_item ri
     LEFT JOIN proposed_revision pr USING (proposed_revision_id)
     LEFT JOIN research_job rj USING (research_job_id)
     WHERE ($1::text IS NULL OR ri.status = $1)
       AND NOT production.is_fixture_text(pr.target_record_key)
       AND NOT production.is_fixture_text(rj.research_question)
       AND NOT production.is_fixture_text(rj.target_segment)
       AND NOT production.is_fixture_text(rj.target_variable)
     ORDER BY ri.priority, ri.created_at
     LIMIT $2 OFFSET $3`,
    [options.status ?? null, limit, offset],
  );
  return rows.map((row) => ({
    ...row,
    id: row.review_item_id,
    review_id: row.review_item_id,
    name: row.research_question ?? row.target_record_key ?? "Review item",
  }));
}

export async function getReviewItem(reviewItemId: string): Promise<JsonValue | null> {
  const row = await workspaceOne<Record<string, JsonValue>>(
    `SELECT ri.*,
       to_jsonb(pr) AS proposed_revision,
       to_jsonb(rj) AS research_job,
       COALESCE((SELECT jsonb_agg(to_jsonb(rd) ORDER BY rd.sequence_no)
                 FROM review_decision rd WHERE rd.review_item_id = ri.review_item_id), '[]'::jsonb) AS decisions
     FROM review_item ri
     LEFT JOIN proposed_revision pr USING (proposed_revision_id)
     LEFT JOIN research_job rj USING (research_job_id)
     WHERE ri.review_item_id = $1
       AND NOT production.is_fixture_text(pr.target_record_key)
       AND NOT production.is_fixture_text(rj.research_question)
       AND NOT production.is_fixture_text(rj.target_segment)
       AND NOT production.is_fixture_text(rj.target_variable)`,
    [reviewItemId],
  );
  return row ? {
    ...row,
    id: row.review_item_id,
    review_id: row.review_item_id,
    name: row.review_item_id,
  } : null;
}

export async function getReportSnapshot(id: string): Promise<JsonValue | null>;
export async function getReportSnapshot(kind: string, id: string): Promise<JsonValue | null>;
export async function getReportSnapshot(
  kind: string,
  id: string,
  scenarioSelection: MarketScenarioSelection | null,
): Promise<JsonValue | null>;
export async function getReportSnapshot(
  kindOrId: string,
  maybeId?: string,
  scenarioSelection: MarketScenarioSelection | null = null,
): Promise<JsonValue | null> {
  if (maybeId === undefined) {
    const id = kindOrId;
    return await getEstimate(id) as unknown as JsonValue | null
      ?? await getSegment(id) as unknown as JsonValue | null
      ?? await getComparison(id) as unknown as JsonValue | null
      ?? await getOpportunity(id) as unknown as JsonValue | null;
  }
  const kind = kindOrId;
  const id = maybeId;
  if (kind === "estimate") return getEstimate(id, scenarioSelection) as Promise<JsonValue | null>;
  if (scenarioSelection) throw new Error("market_scenario_selection_only_supported_for_estimate");
  if (kind === "segment") {
    const segment = await getSegment(id);
    if (!segment) return null;
    const estimate = segment.estimate_id ? await getEstimate(segment.estimate_id) : null;
    return { ...segment, estimate_snapshot: estimate } as unknown as JsonValue;
  }
  if (kind === "comparison") {
    const comparison = await getComparison(id);
    if (!comparison) return null;
    const estimateIds = [...new Set(comparison.members.map((member) => member.estimate_id).filter(Boolean))];
    const estimates = await getEstimates(estimateIds);
    return { ...comparison, estimate_snapshots: estimates } as unknown as JsonValue;
  }
  if (kind === "opportunity") {
    const opportunity = await getOpportunity(id);
    if (!opportunity) return null;
    const snapshots = Array.isArray(opportunity.segment_snapshots) ? opportunity.segment_snapshots : [];
    const estimateIds = [...new Set(snapshots.flatMap((snapshot) => {
      const row = snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)
        ? snapshot as Record<string, JsonValue> : {};
      return typeof row.estimate_id === "string" ? [row.estimate_id] : [];
    }))];
    const estimates = await getEstimates(estimateIds);
    return { ...opportunity, estimate_snapshots: estimates } as unknown as JsonValue;
  }
  throw new Error("unsupported_report_snapshot_kind");
}
