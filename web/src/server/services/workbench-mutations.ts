import "server-only";

import Decimal from "decimal.js";
import type { PoolClient } from "pg";

import { calculateMarketSizing, marketScenarioInputSchema } from "@/domain/market-sizing";
import { assertNoHighConfidencePersonalData } from "@/domain/privacy";
import { getRuntimeContext, withWorkspaceTransaction } from "@/server/db";
import { contentHash } from "@/server/services/segment-workflow";

type PlainObject = Record<string, unknown>;

function object(value: unknown): PlainObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as PlainObject : {};
}

function string(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function decimal(value: string | null): Decimal | null {
  if (value === null) return null;
  try {
    const parsed = new Decimal(value);
    return parsed.isFinite() ? parsed : null;
  } catch {
    return null;
  }
}

function requiredActorId(): string {
  const actorId = getRuntimeContext().actorId;
  if (!actorId) throw new Error("actor_context_required");
  return actorId;
}

async function audit(
  client: PoolClient,
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
    [context.workspaceId, requiredActorId(), aggregateType, aggregateId, action,
      before === null ? null : JSON.stringify(before),
      after === null ? null : JSON.stringify(after),
      JSON.stringify({ after_hash: contentHash(after) })],
  );
}

function intervalFrom(value: unknown, name: string, nullable = false): unknown {
  if (value === null || value === undefined) {
    if (nullable) return null;
    throw new Error(`${name}_required`);
  }
  if (typeof value === "number" || typeof value === "string") {
    return { low: value, base: value, high: value };
  }
  return value;
}

export async function saveMarketScenario(input: {
  scenarioId?: string | null;
  estimateId: string;
  queryResultId?: string | null;
  name: string;
  factors: unknown;
}): Promise<string> {
  assertNoHighConfidencePersonalData({
    name: input.name,
    factors: input.factors,
  });
  const actorId = requiredActorId();
  const rawFactors = object(input.factors);

  return withWorkspaceTransaction(async (client: PoolClient) => {
    const context = getRuntimeContext();
    const baselineResult = await client.query<{
      estimate_id: string;
      entity_unit: "person" | "child_person" | "household" | "establishment" | "enterprise";
      count_low: string | null;
      count_base: string | null;
      count_high: string | null;
      run_id: string;
      data_version: string;
      query_id: string | null;
      result_id: string | null;
      saved_segment_id: string | null;
      saved_segment_version_no: number | null;
      confidence_score: number | null;
      release_suppressed: boolean;
    }>(
      `SELECT e.estimate_id, e.entity_unit, e.count_low, e.count_base, e.count_high,
              e.run_id, e.data_version, sqr.query_id, sqr.result_id,
              segment.saved_segment_id, segment.saved_segment_version_no,
              e.release_suppressed,
              ca.total_score AS confidence_score
       FROM v_estimate_release_boundary e
       LEFT JOIN LATERAL (
         SELECT r.query_id, r.result_id FROM v_segment_query_result_release_boundary r
         WHERE r.estimate_id = e.estimate_id AND r.cache_status='valid'
           AND ($3::uuid IS NULL OR r.result_id=$3)
         ORDER BY r.executed_at DESC LIMIT 1
       ) sqr ON true
       LEFT JOIN LATERAL (
         WITH per_segment AS (
           SELECT DISTINCT ON (ss.saved_segment_id)
                  ssv.saved_segment_id,ssv.version_no AS saved_segment_version_no
             FROM saved_segment_version ssv
             JOIN saved_segment ss USING (saved_segment_id)
            WHERE ssv.pinned_result_id=sqr.result_id
              AND ss.workspace_id=$2
            ORDER BY ss.saved_segment_id,
                     (ss.current_version_no=ssv.version_no) DESC,ssv.version_no DESC
         ), uniquely_resolved AS (
           SELECT per_segment.*,count(*) OVER () AS segment_count
             FROM per_segment
         )
         SELECT saved_segment_id,saved_segment_version_no
           FROM uniquely_resolved
          WHERE segment_count=1
       ) segment ON true
       LEFT JOIN confidence_assessment ca USING (estimate_id)
       WHERE e.estimate_id = $1`,
      [input.estimateId, context.workspaceId, input.queryResultId ?? null],
    );
    const baseline = baselineResult.rows[0];
    if (!baseline) throw new Error("estimate_not_found");
    if (!baseline.query_id || !baseline.result_id) throw new Error("estimate_query_snapshot_required");
    if (baseline.release_suppressed) throw new Error("suppressed_estimate_cannot_size_market");
    if (baseline.count_low === null || baseline.count_base === null || baseline.count_high === null) {
      throw new Error("not_estimable_estimate_cannot_size_market");
    }

    const scenarioInput = marketScenarioInputSchema.parse({
      entityUnit: baseline.entity_unit,
      currency: string(rawFactors.currency) ?? "KRW",
      horizonMonths: Number(rawFactors.horizonMonths ?? rawFactors.horizon_months ?? 12),
      eligibleEntities: {
        low: baseline.count_low,
        base: baseline.count_base,
        high: baseline.count_high,
      },
      annualSpendPerEntity: intervalFrom(
        rawFactors.annualSpendPerEntity ?? rawFactors.annual_spend_per_entity,
        "annual_spend_per_entity",
        true,
      ),
      serviceabilityRate: intervalFrom(
        rawFactors.serviceabilityRate ?? rawFactors.serviceability_rate,
        "serviceability_rate",
      ),
      attainableShare: intervalFrom(
        rawFactors.attainableShare ?? rawFactors.attainable_share,
        "attainable_share",
      ),
      operationalCapacity: intervalFrom(
        rawFactors.operationalCapacity ?? rawFactors.operational_capacity,
        "operational_capacity",
        true,
      ),
      realizedArpu: intervalFrom(
        rawFactors.realizedArpu ?? rawFactors.realized_arpu,
        "realized_arpu",
        true,
      ),
    });
    const sizing = calculateMarketSizing(scenarioInput);
    const scenarioHash = contentHash({
      estimate: baseline.estimate_id,
      baseQueryResultId: baseline.result_id,
      savedSegmentId: baseline.saved_segment_id,
      savedSegmentVersionNo: baseline.saved_segment_version_no,
      name: input.name,
      factors: scenarioInput,
      supersedesScenarioId: input.scenarioId ?? null,
    });
    const version = `user-${scenarioHash.slice(0, 12)}`;
    let previousScenario: Record<string, unknown> | null = null;
    if (input.scenarioId) {
      const previous = await client.query<Record<string, unknown>>(
        `SELECT * FROM market_scenario
          WHERE scenario_id=$1 AND workspace_id=$2
          FOR UPDATE`,
        [input.scenarioId, context.workspaceId],
      );
      previousScenario = previous.rows[0] ?? null;
      if (!previousScenario) throw new Error("market_scenario_not_found");
      if (previousScenario.status === "archived") throw new Error("archived_market_scenario_cannot_be_revised");
      const previousSavedSegmentId = string(previousScenario.saved_segment_id);
      if (previousSavedSegmentId && previousSavedSegmentId !== baseline.saved_segment_id) {
        throw new Error("market_scenario_segment_lineage_mismatch");
      }
      const existingChild = await client.query<{ scenario_id: string; scenario_hash: string | null }>(
        `SELECT scenario_id,scenario_hash FROM market_scenario
          WHERE supersedes_scenario_id=$1
          ORDER BY created_at,scenario_id
          LIMIT 1`,
        [input.scenarioId],
      );
      if (existingChild.rows[0] && existingChild.rows[0].scenario_hash !== scenarioHash) {
        throw new Error("market_scenario_revision_conflict");
      }
      if (previousScenario.status === "superseded" && !existingChild.rows[0]) {
        throw new Error("superseded_market_scenario_revision_missing");
      }
    }
    const inserted = await client.query<{ scenario_id: string }>(
      `INSERT INTO market_scenario (
         name, query_id, product_definition, market_unit, currency,
         horizon_months, assumptions, version, data_version, workspace_id,
         base_query_result_id, saved_segment_id, saved_segment_version_no,
         scenario_hash, status, created_by_actor_id, supersedes_scenario_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,$13,$14,'active',$15,$16)
       ON CONFLICT (workspace_id, scenario_hash) WHERE scenario_hash IS NOT NULL
       DO NOTHING
       RETURNING scenario_id`,
      [input.name, baseline.query_id, string(rawFactors.productDefinition) ?? input.name,
        baseline.entity_unit, sizing.currency, sizing.horizonMonths,
        JSON.stringify(scenarioInput), version, baseline.data_version,
        context.workspaceId, baseline.result_id, baseline.saved_segment_id,
        baseline.saved_segment_version_no, scenarioHash, actorId, input.scenarioId ?? null],
    );
    const scenarioId = inserted.rows[0]?.scenario_id ?? (await client.query<{ scenario_id: string }>(
      `SELECT scenario_id FROM market_scenario
        WHERE workspace_id=$1 AND scenario_hash=$2`,
      [context.workspaceId, scenarioHash],
    )).rows[0]?.scenario_id;
    if (!scenarioId) throw new Error("market_scenario_conflict_not_visible");

    if (input.scenarioId) {
      const child = await client.query<{ supersedes_scenario_id: string | null }>(
        "SELECT supersedes_scenario_id FROM market_scenario WHERE scenario_id=$1",
        [scenarioId],
      );
      if (child.rows[0]?.supersedes_scenario_id !== input.scenarioId) {
        throw new Error("market_scenario_revision_lineage_conflict");
      }
      await client.query(
        `UPDATE market_scenario SET status='superseded',updated_at=now()
          WHERE scenario_id=$1 AND status IN ('draft','active')`,
        [input.scenarioId],
      );
    }

    const factorRows: Array<[string, unknown, string]> = [
      ["serviceability_rate", scenarioInput.serviceabilityRate, "ratio"],
      ["attainable_share", scenarioInput.attainableShare, "ratio"],
    ];
    if (scenarioInput.annualSpendPerEntity) {
      factorRows.unshift(["annual_spend_per_entity", scenarioInput.annualSpendPerEntity, `${sizing.currency}/entity/year`]);
    }
    if (scenarioInput.operationalCapacity) factorRows.push(["operational_capacity", scenarioInput.operationalCapacity, baseline.entity_unit]);
    if (scenarioInput.realizedArpu) factorRows.push(["realized_arpu", scenarioInput.realizedArpu, `${sizing.currency}/entity/year`]);
    for (const [code, intervalValue, unit] of factorRows) {
      const interval = object(intervalValue);
      await client.query(
        `INSERT INTO scenario_factor_override (
           scenario_id, factor_code, value_low, value_base, value_high, unit,
           directness_class, rationale
         ) VALUES ($1,$2,$3,$4,$5,$6,'user_input',$7)
         ON CONFLICT (scenario_id, factor_code) DO NOTHING`,
        [scenarioId, code, interval.low, interval.base, interval.high, unit,
          "User scenario input; does not modify the production baseline."],
      );
    }

    const confidence = Math.max(0, Math.min(100, Number(baseline.confidence_score ?? 0) - 10));
    await client.query(
      `INSERT INTO market_estimate (
         scenario_id,
         tam_entities_low,tam_entities_base,tam_entities_high,
         sam_entities_low,sam_entities_base,sam_entities_high,
         som_entities_low,som_entities_base,som_entities_high,
         tam_revenue_low,tam_revenue_base,tam_revenue_high,
         sam_revenue_low,sam_revenue_base,sam_revenue_high,
         som_revenue_low,som_revenue_base,som_revenue_high,
         formula, confidence_score, run_id, data_version
       ) SELECT
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
         $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23
       WHERE NOT EXISTS (SELECT 1 FROM market_estimate WHERE scenario_id = $1)`,
      [scenarioId,
        sizing.entities.tam.low, sizing.entities.tam.base, sizing.entities.tam.high,
        sizing.entities.sam.low, sizing.entities.sam.base, sizing.entities.sam.high,
        sizing.entities.som.low, sizing.entities.som.base, sizing.entities.som.high,
        sizing.revenue?.tam.low ?? null, sizing.revenue?.tam.base ?? null, sizing.revenue?.tam.high ?? null,
        sizing.revenue?.sam.low ?? null, sizing.revenue?.sam.base ?? null, sizing.revenue?.sam.high ?? null,
        sizing.revenue?.som.low ?? null, sizing.revenue?.som.base ?? null, sizing.revenue?.som.high ?? null,
        sizing.formula, confidence, baseline.run_id, baseline.data_version],
    );
    await audit(client, "market_scenario", scenarioId, input.scenarioId ? "new_revision" : "create",
      previousScenario, { sizing, factors: scenarioInput, supersedesScenarioId: input.scenarioId ?? null,
        savedSegmentId: baseline.saved_segment_id, savedSegmentVersionNo: baseline.saved_segment_version_no });
    return scenarioId;
  });
}

async function resolveSegmentResults(client: PoolClient, ids: string[]): Promise<Array<{
  requested_id: string;
  segment_id: string;
  saved_segment_version_no: number;
  result_id: string;
  estimate_id: string;
  estimate_status: string;
  entity_unit: string;
  count_low: string | null;
  count_base: string | null;
  count_high: string | null;
  share_base: string | null;
  confidence_score: string | null;
  confidence_grade: string | null;
  validation_gap_count: string;
  direct_observation_share: string | null;
  estimate_updated_at: string;
  active_market_scenario_count: number;
  market_scenario_id: string | null;
  market_scenario_name: string | null;
  market_scenario_version: string | null;
  market_horizon_months: number | null;
  market_estimate_id: string | null;
  tam_entities_base: string | null;
  sam_entities_base: string | null;
  som_entities_base: string | null;
  tam_revenue_base: string | null;
  sam_revenue_base: string | null;
  som_revenue_base: string | null;
  market_currency: string | null;
  annual_spend_per_entity: string | null;
  annual_spend_per_entity_unit: string | null;
  label: string;
}>> {
  const result = await client.query<{
    requested_id: string;
    segment_id: string;
    saved_segment_version_no: number;
    result_id: string;
    estimate_id: string;
    estimate_status: string;
    entity_unit: string;
    count_low: string | null;
    count_base: string | null;
    count_high: string | null;
    share_base: string | null;
    confidence_score: string | null;
    confidence_grade: string | null;
    validation_gap_count: string;
    direct_observation_share: string | null;
    estimate_updated_at: string;
    active_market_scenario_count: number;
    market_scenario_id: string | null;
    market_scenario_name: string | null;
    market_scenario_version: string | null;
    market_horizon_months: number | null;
    market_estimate_id: string | null;
    tam_entities_base: string | null;
    sam_entities_base: string | null;
    som_entities_base: string | null;
    tam_revenue_base: string | null;
    sam_revenue_base: string | null;
    som_revenue_base: string | null;
    market_currency: string | null;
    annual_spend_per_entity: string | null;
    annual_spend_per_entity_unit: string | null;
    label: string;
  }>(
    `WITH requested AS (
       SELECT requested_id, ordinality
         FROM unnest($1::text[]) WITH ORDINALITY AS input(requested_id, ordinality)
     )
     SELECT requested.requested_id,
            matched.segment_id, matched.saved_segment_version_no,
            matched.result_id, matched.estimate_id, matched.estimate_status,
            matched.entity_unit, matched.count_low, matched.count_base,
            matched.count_high, matched.share_base, matched.confidence_score,
            matched.confidence_grade, matched.validation_gap_count,
            matched.direct_observation_share, matched.estimate_updated_at,
            matched.active_market_scenario_count,
            matched.market_scenario_id, matched.market_scenario_name,
            matched.market_scenario_version, matched.market_horizon_months,
            matched.market_estimate_id, matched.tam_entities_base,
            matched.sam_entities_base, matched.som_entities_base,
            matched.tam_revenue_base, matched.sam_revenue_base,
            matched.som_revenue_base, matched.market_currency,
            matched.annual_spend_per_entity,
            matched.annual_spend_per_entity_unit, matched.label
       FROM requested
       JOIN LATERAL (
        SELECT ss.saved_segment_id::text AS segment_id,
              latest.resolved_version_no AS saved_segment_version_no,
              latest.result_id, latest.estimate_id, latest.estimate_status,
              latest.primary_entity_unit AS entity_unit,
              latest.count_low, latest.count_base, latest.count_high, latest.share_base,
              CASE WHEN latest.estimate_status='suppressed' THEN NULL::text
                   ELSE ca.total_score::text END AS confidence_score,
              CASE WHEN latest.estimate_status='suppressed' THEN NULL::text
                   ELSE ca.grade::text END AS confidence_grade,
              CASE WHEN latest.estimate_status='suppressed' THEN NULL::text
                   ELSE (SELECT count(*)::text FROM validation_gap vg
                          WHERE vg.estimate_id=latest.estimate_id
                            AND vg.status IN ('open','in_progress')) END AS validation_gap_count,
              (SELECT CASE WHEN latest.estimate_status='suppressed' OR count(*)=0 THEN NULL
                           ELSE count(*) FILTER (WHERE ec.directness_class='direct_observation')::numeric / count(*) END
                 FROM v_estimate_component_release_boundary ec
                WHERE ec.estimate_id=latest.estimate_id)::text AS direct_observation_share,
              CASE WHEN latest.estimate_status='suppressed' THEN NULL::text
                   ELSE e.updated_at::text END AS estimate_updated_at,
              market_state.active_market_scenario_count,
              market.market_scenario_id, market.market_scenario_name,
              market.market_scenario_version, market.market_horizon_months,
              market.market_estimate_id,
              market.tam_entities_base, market.sam_entities_base, market.som_entities_base,
              market.tam_revenue_base, market.sam_revenue_base, market.som_revenue_base,
              market.market_currency,
              market.annual_spend_per_entity,
              market.annual_spend_per_entity_unit,
              latest.title AS label
       FROM v_saved_segment_latest latest
       JOIN saved_segment ss USING (saved_segment_id)
       JOIN v_estimate_release_boundary e ON e.estimate_id=latest.estimate_id
       LEFT JOIN confidence_assessment ca ON ca.estimate_id=latest.estimate_id
       LEFT JOIN LATERAL (
         SELECT count(*)::integer AS active_market_scenario_count
           FROM market_scenario ms
          WHERE ms.base_query_result_id=latest.result_id AND ms.status='active'
            AND latest.estimate_status<>'suppressed'
       ) market_state ON true
       LEFT JOIN LATERAL (
         SELECT ms.scenario_id AS market_scenario_id,
                ms.name AS market_scenario_name,
                ms.version AS market_scenario_version,
                ms.horizon_months AS market_horizon_months,
                me.market_estimate_id, me.tam_entities_base, me.sam_entities_base,
                me.som_entities_base, me.tam_revenue_base, me.sam_revenue_base,
                me.som_revenue_base, ms.currency::text AS market_currency,
                spend.value_base::text AS annual_spend_per_entity,
                spend.unit AS annual_spend_per_entity_unit
           FROM market_scenario ms
           LEFT JOIN market_estimate me USING (scenario_id)
           LEFT JOIN scenario_factor_override spend
             ON spend.scenario_id=ms.scenario_id
            AND spend.factor_code='annual_spend_per_entity'
          WHERE ms.base_query_result_id=latest.result_id AND ms.status='active'
            AND latest.estimate_status<>'suppressed'
            AND market_state.active_market_scenario_count=1
       ) market ON true
         WHERE latest.saved_segment_id::text = requested.requested_id
            OR latest.result_id::text = requested.requested_id
         ORDER BY (latest.saved_segment_id::text = requested.requested_id) DESC,
                  latest.saved_segment_id
         LIMIT 1
       ) matched ON true
      ORDER BY requested.ordinality`,
    [ids],
  );
  if (result.rows.length !== ids.length) {
    const found = new Set(result.rows.map((row) => row.requested_id));
    const missingId = ids.find((id) => !found.has(id)) ?? "unknown";
    throw new Error(`comparison_segment_not_found:${missingId}`);
  }
  return result.rows;
}

export async function saveComparison(input: {
  comparisonId?: string | null;
  name: string;
  segmentIds: string[];
}): Promise<string> {
  assertNoHighConfidencePersonalData(input);
  if (input.segmentIds.length < 2 || input.segmentIds.length > 5) throw new Error("comparison_requires_two_to_five_segments");
  if (new Set(input.segmentIds).size !== input.segmentIds.length) throw new Error("comparison_contains_duplicate_segment");
  const actorId = requiredActorId();
  return withWorkspaceTransaction(async (client: PoolClient) => {
    const context = getRuntimeContext();
    const members = await resolveSegmentResults(client, input.segmentIds);
    let comparisonId = input.comparisonId ?? null;
    let before: unknown = null;
    if (comparisonId) {
      const locked = await client.query("SELECT * FROM comparison_workspace WHERE comparison_id = $1 FOR UPDATE", [comparisonId]);
      if (!locked.rows[0]) throw new Error("comparison_not_found");
      before = locked.rows[0];
      await client.query(
        "UPDATE comparison_workspace SET name=$2, status='saved', version_no=version_no+1, updated_at=now() WHERE comparison_id=$1",
        [comparisonId, input.name],
      );
      await client.query("DELETE FROM comparison_member WHERE comparison_id = $1", [comparisonId]);
    } else {
      const inserted = await client.query<{ comparison_id: string }>(
        `INSERT INTO comparison_workspace (workspace_id, name, status, created_by_actor_id)
         VALUES ($1,$2,'saved',$3) RETURNING comparison_id`,
        [context.workspaceId, input.name, actorId],
      );
      comparisonId = inserted.rows[0].comparison_id;
    }

    const groups = new Map<string, Decimal[]>();
    members.forEach((member) => {
      const value = decimal(member.count_base);
      if (value) (groups.get(member.entity_unit) ?? groups.set(member.entity_unit, []).get(member.entity_unit)!).push(value);
    });
    for (let index = 0; index < members.length; index += 1) {
      const member = members[index];
      const group = groups.get(member.entity_unit) ?? [];
      const raw = member.count_base;
      const rawDecimal = decimal(raw);
      const min = group.length ? Decimal.min(...group) : null;
      const max = group.length ? Decimal.max(...group) : null;
      const normalized = rawDecimal === null || group.length < 2 || min === null || max === null
        ? null
        : max.eq(min)
          ? 100
          : rawDecimal.minus(min).div(max.minus(min)).mul(100).toNumber();
      const tamRevenue = member.tam_revenue_base;
      const samRevenue = member.sam_revenue_base;
      const somRevenue = member.som_revenue_base;
      const annualSpend = member.annual_spend_per_entity;
      const releaseSuppressed = member.estimate_status === "suppressed";
      const marketScenarioUnavailable = releaseSuppressed
        ? "rare_output_below_release_threshold"
        : member.active_market_scenario_count > 1
          ? "multiple_active_market_scenarios_require_explicit_selection"
          : member.active_market_scenario_count === 0
            ? "active_market_scenario_not_available"
            : member.market_estimate_id === null
              ? "active_market_estimate_not_available"
              : null;
      const revenueUnavailable = (value: string | null) => marketScenarioUnavailable
        ?? (value === null ? "annual_spend_evidence_not_available" : null);
      await client.query(
        `INSERT INTO comparison_member (
           comparison_id, position, query_result_id, market_estimate_id,
           display_label, normalized_metrics
        ) VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
        [comparisonId, index + 1, member.result_id, member.market_estimate_id, member.label, JSON.stringify({
          raw_count_low: member.count_low,
          raw_count_base: raw,
          raw_count_high: member.count_high,
          raw_entity_unit: member.entity_unit,
          normalized_count_score: normalized,
          normalization_scope: releaseSuppressed
            ? "withheld_by_release_policy"
            : `within_${member.entity_unit}_members_only`,
          count_status: releaseSuppressed ? "suppressed" : raw === null ? "unavailable" : "available",
          confidence_score: member.confidence_score,
          confidence_grade: member.confidence_grade,
          validation_gap_count: member.validation_gap_count,
          direct_observation_share: member.direct_observation_share,
          estimate_updated_at: member.estimate_updated_at,
          active_market_scenario_count: member.active_market_scenario_count,
          market_scenario_id: member.market_scenario_id,
          market_scenario_name: member.market_scenario_name,
          market_scenario_version: member.market_scenario_version,
          market_horizon_months: member.market_horizon_months,
          tam_entities_base: member.tam_entities_base,
          sam_entities_base: member.sam_entities_base,
          som_entities_base: member.som_entities_base,
          tam_revenue_base: tamRevenue,
          sam_revenue_base: samRevenue,
          som_revenue_base: somRevenue,
          currency: member.market_currency,
          annual_spend_per_entity: annualSpend,
          annual_spend_per_entity_unit: member.annual_spend_per_entity_unit,
          growth_rate: null,
          target_accessibility: null,
          digital_reachability: null,
          competition_intensity: null,
          purchase_frequency: null,
          willingness_to_pay: null,
          unavailable_reason: releaseSuppressed
            ? "rare_output_below_release_threshold"
            : raw === null ? "registered_estimate_not_available" : null,
          metric_unavailable_reasons: {
            raw_count: releaseSuppressed
              ? "rare_output_below_release_threshold"
              : raw === null ? "registered_estimate_not_available" : null,
            normalized_count_score: releaseSuppressed
              ? "rare_output_below_release_threshold"
              : raw === null
                ? "registered_estimate_not_available"
                : group.length < 2 ? "same_unit_comparator_required" : null,
            confidence_score: releaseSuppressed
              ? "rare_output_below_release_threshold"
              : member.confidence_score === null ? "confidence_assessment_not_available" : null,
            validation_gap_count: releaseSuppressed
              ? "rare_output_below_release_threshold"
              : member.validation_gap_count === null ? "validation_gap_review_not_available" : null,
            direct_observation_share: releaseSuppressed
              ? "rare_output_below_release_threshold"
              : member.direct_observation_share === null ? "estimate_component_evidence_not_available" : null,
            estimate_updated_at: releaseSuppressed
              ? "rare_output_below_release_threshold"
              : member.estimate_updated_at ? null : "estimate_timestamp_not_available",
            market_scenario_id: member.market_scenario_id === null ? marketScenarioUnavailable : null,
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
        })],
      );
    }
    await audit(client, "comparison_workspace", comparisonId, input.comparisonId ? "new_version" : "create", before, { name: input.name, members });
    return comparisonId;
  });
}

export interface OpportunityMutationInput {
  opportunityId?: string | null;
  expectedLockVersion?: string | number | null;
  boardId?: string | null;
  segmentId?: string | null;
  estimateSnapshotId?: string | null;
  name: string;
  problem: string;
  hypothesis: string;
  idea: string;
  revenueModel?: string | null;
  price?: string | null;
  channels?: unknown;
  competingAlternatives?: unknown;
  assumptions?: unknown;
  nextExperiment?: string | null;
  status: string;
  notes?: string | null;
  score?: unknown;
  experiment?: unknown;
}

function opportunityLockVersion(input: OpportunityMutationInput): string | null {
  if (!input.opportunityId) return null;
  const raw = input.expectedLockVersion;
  const value = typeof raw === "number"
    ? Number.isSafeInteger(raw) && raw > 0 ? String(raw) : null
    : typeof raw === "string" && /^[1-9][0-9]*$/u.test(raw.trim()) ? raw.trim() : null;
  if (value === null) throw new Error("opportunity_expected_version_required");
  return value;
}

function jsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return value.split(",").map((item) => item.trim()).filter(Boolean);
    }
  }
  return [];
}

const OPPORTUNITY_STATUSES = new Set(["discovered", "researching", "validating", "planned", "paused", "rejected", "archived"]);
export const OPPORTUNITY_SCORE_CODES = [
  "market_size",
  "growth",
  "willingness_to_pay",
  "problem_intensity",
  "target_accessibility",
  "competition_intensity",
  "data_confidence",
  "implementation_difficulty",
  "capability_fit",
] as const;
const OPPORTUNITY_NEGATIVE_DIRECTION_CODES = new Set<(typeof OPPORTUNITY_SCORE_CODES)[number]>([
  "competition_intensity",
  "implementation_difficulty",
]);
const EXPERIMENT_STATUSES = new Set(["draft", "planned", "running", "completed", "cancelled"]);

function normalizedOpportunityScore(code: (typeof OPPORTUNITY_SCORE_CODES)[number], rawValue: number): number {
  return OPPORTUNITY_NEGATIVE_DIRECTION_CODES.has(code) ? 100 - rawValue : rawValue;
}

function opportunityScore(value: unknown): { values: Record<string, number>; weights: Record<string, number> } | null {
  const config = object(value);
  const rawValues = object(config.values);
  const rawWeights = object(config.weights);
  if (!OPPORTUNITY_SCORE_CODES.some((code) => rawValues[code] !== undefined && rawValues[code] !== null && rawValues[code] !== "")) return null;
  const values: Record<string, number> = {};
  const weights: Record<string, number> = {};
  for (const code of OPPORTUNITY_SCORE_CODES) {
    if (rawValues[code] === undefined || rawValues[code] === null || rawValues[code] === "") {
      throw new Error(`opportunity_score_${code}_required`);
    }
    if (rawWeights[code] === undefined || rawWeights[code] === null || rawWeights[code] === "") {
      throw new Error(`opportunity_weight_${code}_required`);
    }
    const score = Number(rawValues[code]);
    const weightInput = Number(rawWeights[code]);
    const weight = weightInput > 1 ? weightInput / 100 : weightInput;
    if (!Number.isFinite(score) || score < 0 || score > 100) throw new Error(`opportunity_score_${code}_out_of_range`);
    if (!Number.isFinite(weight) || weight < 0 || weight > 1) throw new Error(`opportunity_weight_${code}_out_of_range`);
    values[code] = score;
    weights[code] = weight;
  }
  const totalWeight = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
  if (Math.abs(totalWeight - 1) > 0.0001) throw new Error("opportunity_score_weights_must_sum_to_100_percent");
  return { values, weights };
}

function opportunityExperiment(value: unknown): {
  name: string;
  hypothesis: string;
  method: string;
  primaryMetric: string;
  successCriteria: string;
  status: string;
} | null {
  const row = object(value);
  const name = string(row.name);
  if (!name) return null;
  const hypothesis = string(row.hypothesis);
  const method = string(row.method);
  const primaryMetric = string(row.primaryMetric ?? row.primary_metric);
  const successCriteria = string(row.successCriteria ?? row.success_criteria);
  const status = string(row.status) ?? "draft";
  if (!hypothesis || !method || !primaryMetric || !successCriteria) throw new Error("opportunity_experiment_fields_required");
  if (!EXPERIMENT_STATUSES.has(status)) throw new Error("invalid_opportunity_experiment_status");
  return { name, hypothesis, method, primaryMetric, successCriteria, status };
}

export async function saveOpportunity(input: OpportunityMutationInput): Promise<string> {
  assertNoHighConfidencePersonalData(input);
  if (!OPPORTUNITY_STATUSES.has(input.status)) throw new Error("invalid_opportunity_status");
  if (!input.opportunityId && !input.segmentId) throw new Error("opportunity_requires_saved_segment_snapshot");
  const expectedLockVersion = opportunityLockVersion(input);
  const score = opportunityScore(input.score);
  const experiment = opportunityExperiment(input.experiment);
  const actorId = requiredActorId();
  return withWorkspaceTransaction(async (client: PoolClient) => {
    const context = getRuntimeContext();
    let boardId = input.boardId ?? null;
    if (!boardId && !input.opportunityId) {
      const board = await client.query<{ opportunity_board_id: string }>(
        `INSERT INTO opportunity_board (workspace_id, name, description, created_by_actor_id)
         SELECT $1, '기본 아이디어 보드', '세그먼트 탐색에서 저장한 사업기회', $2
         WHERE NOT EXISTS (SELECT 1 FROM opportunity_board WHERE workspace_id=$1 AND status='active')
         RETURNING opportunity_board_id`,
        [context.workspaceId, actorId],
      );
      boardId = board.rows[0]?.opportunity_board_id ?? (await client.query<{ opportunity_board_id: string }>(
        "SELECT opportunity_board_id FROM opportunity_board WHERE workspace_id=$1 AND status='active' ORDER BY created_at LIMIT 1",
        [context.workspaceId],
      )).rows[0].opportunity_board_id;
    }

    const numericPrice = input.price && Number.isFinite(Number(input.price)) ? Number(input.price) : null;
    const values = [input.name, input.problem, input.hypothesis, input.idea, input.revenueModel ?? null,
      numericPrice, JSON.stringify(jsonArray(input.channels)), JSON.stringify(jsonArray(input.competingAlternatives)),
      JSON.stringify(jsonArray(input.assumptions)), input.nextExperiment ?? null, input.status];
    let opportunityId = input.opportunityId ?? null;
    let before: unknown = null;
    if (opportunityId) {
      const locked = await client.query("SELECT * FROM opportunity WHERE opportunity_id=$1 FOR UPDATE", [opportunityId]);
      if (!locked.rows[0]) throw new Error("opportunity_not_found");
      before = locked.rows[0];
      if (String(locked.rows[0].optimistic_lock_version) !== expectedLockVersion) {
        throw new Error("opportunity_edit_conflict");
      }
      const updated = await client.query(
        `UPDATE opportunity SET
           name=$2, problem_statement=$3, hypothesis_summary=$4, solution_idea=$5,
           revenue_model=$6, expected_price_low=$7, expected_price_base=$7,
           expected_price_high=$7, currency=CASE WHEN $7::numeric IS NULL THEN NULL ELSE 'KRW' END,
           access_channels=$8::jsonb, competing_alternatives=$9::jsonb,
           assumptions_to_validate=$10::jsonb,
           next_experiment_summary=$11, status=$12,
           optimistic_lock_version=optimistic_lock_version+1, updated_at=now()
         WHERE opportunity_id=$1 AND optimistic_lock_version=$13::bigint
         RETURNING optimistic_lock_version::text`,
        [opportunityId, ...values, expectedLockVersion],
      );
      if (!updated.rows[0]) throw new Error("opportunity_edit_conflict");
    } else {
      if (!boardId) throw new Error("opportunity_board_required");
      const inserted = await client.query<{ opportunity_id: string }>(
        `INSERT INTO opportunity (
           opportunity_board_id, name, problem_statement, hypothesis_summary,
           solution_idea, revenue_model, expected_price_low, expected_price_base,
           expected_price_high, currency, access_channels, competing_alternatives,
           assumptions_to_validate,
           next_experiment_summary, status, created_by_actor_id
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$7,$7,
           CASE WHEN $7::numeric IS NULL THEN NULL ELSE 'KRW' END,$8::jsonb,$9::jsonb,$10::jsonb,$11,$12,$13)
         RETURNING opportunity_id`,
        [boardId, ...values, actorId],
      );
      opportunityId = inserted.rows[0].opportunity_id;
    }

    if (input.segmentId) {
      const existingTargets = await client.query<{
        saved_segment_id: string | null;
        query_result_id: string;
        estimate_id: string;
      }>(
        `SELECT link.saved_segment_id::text,link.query_result_id::text,result.estimate_id::text
           FROM opportunity_segment_link link
           JOIN v_segment_query_result_release_boundary result ON result.result_id=link.query_result_id
          WHERE link.opportunity_id=$1 AND link.link_role='primary_target'
          ORDER BY link.pinned_at,link.opportunity_segment_link_id
          FOR UPDATE OF link`,
        [opportunityId],
      );
      if (existingTargets.rows.length > 1) throw new Error("opportunity_primary_snapshot_ambiguous");
      const existingTarget = existingTargets.rows[0];
      if (existingTarget) {
        const sameSegment = existingTarget.saved_segment_id === input.segmentId;
        const sameEstimate = !input.estimateSnapshotId || existingTarget.estimate_id === input.estimateSnapshotId;
        if (!sameSegment || !sameEstimate) throw new Error("opportunity_primary_snapshot_is_immutable");
      } else {
        const resolved = (await resolveSegmentResults(client, [input.segmentId]))[0];
        if (input.estimateSnapshotId && resolved.estimate_id !== input.estimateSnapshotId) {
          throw new Error("estimate_snapshot_does_not_match_segment");
        }
        await client.query(
          `INSERT INTO opportunity_segment_link (
             opportunity_id, saved_segment_id, saved_segment_version_no,
             query_result_id, market_estimate_id, link_role
           ) SELECT $1, ss.saved_segment_id, $5, $2, $4, 'primary_target'
             FROM saved_segment ss WHERE ss.saved_segment_id=$3
           ON CONFLICT (opportunity_id, query_result_id, link_role) DO NOTHING`,
          [opportunityId, resolved.result_id, resolved.segment_id, resolved.market_estimate_id,
            resolved.saved_segment_version_no],
        );
      }
    }
    if (input.notes) {
      const next = await client.query<{ version_no: number }>(
        `SELECT coalesce(max(version_no),0)+1 AS version_no
         FROM opportunity_content_version WHERE opportunity_id=$1 AND content_key='notes'`,
        [opportunityId],
      );
      await client.query(
        `INSERT INTO opportunity_content_version (
           opportunity_id, content_key, content_type, version_no, content,
           source_kind, created_by_actor_id
         ) VALUES ($1,'notes','note',$2,$3::jsonb,'user',$4)`,
        [opportunityId, next.rows[0].version_no, JSON.stringify({ text: input.notes }), actorId],
      );
    }
    if (score) {
      const next = await client.query<{ version_no: number }>(
        `SELECT coalesce(max(version_no),0)+1 AS version_no
           FROM opportunity_score_version WHERE opportunity_id=$1`,
        [opportunityId],
      );
      const overall = OPPORTUNITY_SCORE_CODES.reduce(
        (sum, code) => sum + normalizedOpportunityScore(code, score.values[code]) * score.weights[code],
        0,
      );
      await client.query(
        `INSERT INTO opportunity_score_version (
           opportunity_id,version_no,overall_score,formula_version,weight_config,created_by_actor_id
         ) VALUES ($1,$2,$3,'weighted-transparent-score-v2',$4::jsonb,$5)`,
        [opportunityId, next.rows[0].version_no, overall, JSON.stringify(score.weights), actorId],
      );
      for (const code of OPPORTUNITY_SCORE_CODES) {
        const rawValue = score.values[code];
        const normalizedScore = normalizedOpportunityScore(code, rawValue);
        const formula = OPPORTUNITY_NEGATIVE_DIRECTION_CODES.has(code)
          ? "(100 - raw_value) × weight"
          : "raw_value × weight";
        await client.query(
          `INSERT INTO opportunity_score_component (
             opportunity_id,score_version_no,metric_code,raw_value,raw_unit,
             normalized_score,weight,weighted_score,source_kind,source_record_key,formula
           ) VALUES ($1::uuid,$2,$3,$4,'score_0_100',$5,$6,$7,'user_input',($1::uuid)::text,$8)`,
          [opportunityId, next.rows[0].version_no, code, rawValue, normalizedScore,
            score.weights[code], normalizedScore * score.weights[code], formula],
        );
      }
    }
    if (experiment) {
      await client.query(
        `INSERT INTO opportunity_experiment (
           opportunity_id,name,hypothesis,method,primary_metric,success_criteria,status,created_by_actor_id
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [opportunityId, experiment.name, experiment.hypothesis, experiment.method,
          experiment.primaryMetric, experiment.successCriteria, experiment.status, actorId],
      );
    }
    await audit(client, "opportunity", opportunityId, input.opportunityId ? "update" : "create", before, input);
    return opportunityId;
  });
}
