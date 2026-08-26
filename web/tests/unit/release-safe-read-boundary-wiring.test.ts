import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  withWorkspaceTransaction: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/db", () => ({
  getRuntimeContext: () => ({ workspaceId: "workspace-1", actorId: "actor-1" }),
  withWorkspaceTransaction: mocks.withWorkspaceTransaction,
}));
vi.mock("@/server/ai/openai-research-adapter", () => ({
  isResearchProviderConfigured: () => false,
  ResearchConfigurationError: class ResearchConfigurationError extends Error {},
  ResearchSchemaError: class ResearchSchemaError extends Error {},
  runOpenAIResearch: vi.fn(),
}));
vi.mock("@/server/services/segment-workflow", () => ({
  contentHash: () => "release-boundary-test-hash",
}));

import {
  compareSegments,
  getEstimate,
  getOpportunity,
  getReportSnapshot,
} from "@/server/repositories/workbench";
import { createResearchJob } from "@/server/services/research-workflow";
import { saveMarketScenario } from "@/server/services/workbench-mutations";

const ESTIMATE_ID = "10000000-0000-4000-8000-000000000001";
const RESULT_ID = "20000000-0000-4000-8000-000000000001";
const SEGMENT_ID = "30000000-0000-4000-8000-000000000001";
const OPPORTUNITY_ID = "40000000-0000-4000-8000-000000000001";

// The underlying legacy ledger record is status=estimated, entity_unit=person,
// count_base=5. Release-facing mocks deliberately model only migration 018's
// safe projection: status=suppressed/release_suppressed=true with null numerics.
const LEGACY_RAW_BASE = "5";

function suppressedEstimateDetailRow() {
  return {
    estimate_id: ESTIMATE_ID,
    workspace_id: "workspace-1",
    subject_type: "query",
    subject_id: RESULT_ID,
    entity_unit: "person",
    status: "suppressed",
    release_suppressed: true,
    data_layer: "modeled",
    approval_status: "approved",
    count_low: null,
    count_base: null,
    count_high: null,
    share_low: null,
    share_base: null,
    share_high: null,
    denominator_definition: "withheld_by_release_policy",
    method_code: "withheld_by_release_policy",
    formula: "withheld_by_release_policy",
    geography_code: "KR",
    geography_name_ko: "대한민국",
    reference_period: "2025",
    model_version: "legacy-v1",
    confidence_json: {},
    components_json: [],
    assumptions_json: [],
    validation_gaps_json: [],
    dependencies_json: [],
    sources_json: [],
    data_version: "test-v1",
    created_at: "2026-08-25T00:00:00.000Z",
    updated_at: "2026-08-25T00:00:00.000Z",
    display_name: "Release-suppressed estimate",
    display_components_json: [{
      component_id: "component-1",
      component_code: null,
      component_type: "withheld_by_release_policy",
      directness_class: "withheld_by_release_policy",
      value_low: null,
      value_base: null,
      value_high: null,
    }],
    sensitivity_results: [{
      sensitivity_result_id: "sensitivity-1",
      factor_code: null,
      value_low: null,
      value_base: null,
      value_high: null,
    }],
    market_scenarios: [],
    tam_entities_low: null,
    tam_entities_base: null,
    tam_entities_high: null,
    sam_entities_low: null,
    sam_entities_base: null,
    sam_entities_high: null,
    som_entities_low: null,
    som_entities_base: null,
    som_entities_high: null,
    tam_revenue_low: null,
    tam_revenue_base: null,
    tam_revenue_high: null,
    sam_revenue_low: null,
    sam_revenue_base: null,
    sam_revenue_high: null,
    som_revenue_low: null,
    som_revenue_base: null,
    som_revenue_high: null,
    market_currency: null,
    active_market_scenario_count: 0,
    active_market_scenario_name: null,
    active_market_scenario_version: null,
  };
}

function sqlCalls(): string[] {
  return mocks.query.mock.calls.map(([sql]) => String(sql));
}

beforeEach(() => {
  mocks.query.mockReset();
  mocks.withWorkspaceTransaction.mockReset();
  mocks.withWorkspaceTransaction.mockImplementation(async (work) => work({ query: mocks.query }));
});

describe("migration 018 release-safe application wiring", () => {
  it("keeps a legacy Base=5 person estimate suppressed in estimate detail", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [suppressedEstimateDetailRow()] });

    const estimate = await getEstimate(ESTIMATE_ID) as unknown as Record<string, unknown>;

    expect(estimate).toMatchObject({
      estimate_id: ESTIMATE_ID,
      entity_unit: "person",
      status: "suppressed",
      count_low: null,
      count_base: null,
      count_high: null,
      market_scenarios: [],
      tam: null,
      sam: null,
      som: null,
      market_metric_unavailable_reason: "rare_output_below_release_threshold",
    });
    expect((estimate.factors as Array<Record<string, unknown>>)[0]).toMatchObject({
      low: null,
      base: null,
      high: null,
    });
    expect(JSON.stringify(estimate)).not.toContain(`"count_base":"${LEGACY_RAW_BASE}"`);
    expect(sqlCalls()[0]).toContain("FROM v_estimate_lineage lineage");
    expect(sqlCalls()[0]).toContain("v_estimate_component_release_boundary");
    expect(sqlCalls()[0]).toContain("v_estimate_sensitivity_release_boundary");
    expect(sqlCalls()[0]).toContain("lineage.status<>'suppressed'");
  });

  it("keeps suppressed counts and derived market metrics out of comparison normalization", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{
      comparison_id: null,
      workspace_id: null,
      comparison_name: "Unsaved comparison",
      comparison_status: "draft",
      position: 1,
      display_label: "Release-suppressed segment",
      query_result_id: RESULT_ID,
      segment_name: "Release-suppressed segment",
      primary_entity_unit: "person",
      estimate_id: ESTIMATE_ID,
      estimate_status: "suppressed",
      count_low: null,
      count_base: null,
      count_high: null,
      share_base: null,
      normalized_metrics: {},
      source_kind: "query_result",
      confidence_score: null,
      confidence_grade: null,
      validation_gap_count: null,
      direct_observation_share: null,
      estimate_updated_at: null,
      active_market_scenario_count: 0,
      market_scenario_id: null,
      market_scenario_name: null,
      market_scenario_version: null,
      market_horizon_months: null,
      market_estimate_id: null,
      tam_entities_base: null,
      sam_entities_base: null,
      som_entities_base: null,
      tam_revenue_base: null,
      sam_revenue_base: null,
      som_revenue_base: null,
      market_currency: null,
      annual_spend_per_entity: null,
      annual_spend_per_entity_unit: null,
    }] });

    const comparison = await compareSegments([RESULT_ID]);
    const member = comparison.members[0];
    const metrics = member.normalized_metrics as Record<string, unknown>;

    expect(member).toMatchObject({
      estimate_status: "suppressed",
      count_low: null,
      count_base: null,
      count_high: null,
      normalized_count_score: null,
      annual_spend: null,
    });
    expect(metrics).toMatchObject({
      raw_count_low: null,
      raw_count_base: null,
      raw_count_high: null,
      count_status: "suppressed",
      normalization_scope: "withheld_by_release_policy",
      unavailable_reason: "rare_output_below_release_threshold",
      confidence_score: null,
      validation_gap_count: null,
      direct_observation_share: null,
      estimate_updated_at: null,
      tam_entities_base: null,
      sam_entities_base: null,
      som_entities_base: null,
    });
    expect(JSON.stringify(comparison)).not.toContain(`"raw_count_base":"${LEGACY_RAW_BASE}"`);
    expect(sqlCalls()[0]).toContain("FROM v_segment_query_result_release_boundary sqr");
    expect(sqlCalls()[0]).toContain("JOIN v_estimate_release_boundary e");
    expect(sqlCalls()[0]).toContain("v_estimate_component_release_boundary");
    expect(sqlCalls()[0]).toContain("NOT e.release_suppressed");
  });

  it("hydrates an Opportunity only from release-safe result and estimate projections", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{
      opportunity_id: OPPORTUNITY_ID,
      opportunity_board_id: "50000000-0000-4000-8000-000000000001",
      workspace_id: "workspace-1",
      board_name: "Board",
      name: "Suppressed opportunity",
      problem_statement: "Aggregate hypothesis",
      hypothesis_summary: "Aggregate hypothesis",
      solution_idea: "Aggregate solution",
      status: "draft",
      optimistic_lock_version: "1",
      segment_snapshots: [{
        link_role: "primary_target",
        result_id: RESULT_ID,
        estimate_id: ESTIMATE_ID,
        estimate_status: "suppressed",
        count_low: null,
        count_base: null,
        count_high: null,
      }],
      current_content: [],
      score_components: [],
      experiments: [],
      current_estimate: {
        saved_segment_id: SEGMENT_ID,
        result_id: RESULT_ID,
        estimate_id: ESTIMATE_ID,
        estimate_status: "suppressed",
        primary_entity_unit: "person",
        count_low: null,
        count_base: null,
        count_high: null,
        share_low: null,
        share_base: null,
        share_high: null,
      },
      status_history: [],
      score_version_no: null,
      weight_config: null,
      overall_score: null,
      updated_at: "2026-08-25T00:00:00.000Z",
    }] });

    const opportunity = await getOpportunity(OPPORTUNITY_ID);

    expect(opportunity?.current_estimate).toMatchObject({
      estimate_id: ESTIMATE_ID,
      estimate_status: "suppressed",
      primary_entity_unit: "person",
      count_low: null,
      count_base: null,
      count_high: null,
    });
    expect(opportunity?.estimate_snapshot).toMatchObject({
      estimate_status: "suppressed",
      count_base: null,
    });
    expect(JSON.stringify(opportunity)).not.toContain(`"count_base":"${LEGACY_RAW_BASE}"`);
    expect(sqlCalls()[0]).toContain("FROM v_opportunity_snapshot snapshot");
    expect(sqlCalls()[0]).toContain("FROM v_segment_query_result_release_boundary current_result");
    expect(sqlCalls()[0]).toContain("JOIN v_estimate_release_boundary e");
  });

  it("preserves the same suppression in the estimate export snapshot", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [suppressedEstimateDetailRow()] });

    const snapshot = await getReportSnapshot("estimate", ESTIMATE_ID) as Record<string, unknown>;

    expect(snapshot).toMatchObject({
      estimate_id: ESTIMATE_ID,
      status: "suppressed",
      count_low: null,
      count_base: null,
      count_high: null,
      market_scenarios: [],
      market_metric_unavailable_reason: "rare_output_below_release_threshold",
    });
    expect(JSON.stringify(snapshot)).not.toContain(`"count_base":"${LEGACY_RAW_BASE}"`);
    expect(sqlCalls()[0]).toContain("FROM v_estimate_lineage lineage");
    expect(sqlCalls()[0]).toContain("v_estimate_component_release_boundary");
    expect(sqlCalls()[0]).toContain("v_estimate_sensitivity_release_boundary");
  });

  it("persists a research input with suppressed provenance and no rare numeric interval", async () => {
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM v_saved_segment_latest")) {
        return { rows: [{
          saved_segment_id: SEGMENT_ID,
          title: "Release-suppressed segment",
          resolved_version_no: 1,
          pinned_result_id: RESULT_ID,
          query_id: null,
          result_id: RESULT_ID,
          estimate_id: ESTIMATE_ID,
          filter_json: {},
          result_summary: {
            status: "suppressed",
            count: { low: null, base: null, high: null },
            unavailable_reason: "rare_output_below_release_threshold",
          },
          primary_entity_unit: "person",
          estimate_status: "suppressed",
          data_layer: "modeled",
          approval_status: "approved",
          count_low: null,
          count_base: null,
          count_high: null,
          denominator_definition: "withheld_by_release_policy",
          data_version: "test-v1",
        }] };
      }
      if (sql.includes("INSERT INTO research_job (")) {
        return { rows: [{ research_job_id: "research-job-1", status: "configuration_required" }] };
      }
      if (sql.includes("SELECT count(*)::text AS count FROM research_job_event")) {
        return { rows: [{ count: "1" }] };
      }
      if (sql.includes("INSERT INTO audit_event")) return { rows: [] };
      throw new Error(`unexpected_query:${sql}`);
    });

    const created = await createResearchJob({
      segmentId: SEGMENT_ID,
      targetSegment: "대한민국 개인 집계 세그먼트",
      targetVariable: "joint_prevalence",
      researchQuestion: "누락된 집계 근거를 조사해줘",
    });

    expect(created).toEqual({ id: "research-job-1", configurationRequired: true });
    const selectCall = mocks.query.mock.calls.find(([sql]) => String(sql).includes("FROM v_saved_segment_latest"));
    expect(selectCall?.[0]).toContain("LEFT JOIN v_estimate_release_boundary estimate");
    const insertCall = mocks.query.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO research_job ("));
    const payload = JSON.parse(String(insertCall?.[1]?.[8])) as {
      baseline: Record<string, unknown>;
      snapshotProvenance: Record<string, unknown>;
    };
    expect(payload.baseline).toMatchObject({
      estimateId: ESTIMATE_ID,
      status: "unavailable",
      value: null,
      lowBaseHigh: null,
      unit: "person",
      denominator: "withheld_by_release_policy",
    });
    expect(payload.snapshotProvenance).toMatchObject({
      status: "suppressed",
      count: { low: null, base: null, high: null },
      result: {
        status: "suppressed",
        count: { low: null, base: null, high: null },
        unavailable_reason: "rare_output_below_release_threshold",
      },
    });
    expect(JSON.stringify(payload)).not.toContain(`"base":"${LEGACY_RAW_BASE}"`);
  });

  it("rejects scenario creation from the release boundary before calculation or INSERT", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{
      estimate_id: ESTIMATE_ID,
      entity_unit: "person",
      count_low: null,
      count_base: null,
      count_high: null,
      run_id: "legacy-run-1",
      data_version: "test-v1",
      query_id: "60000000-0000-4000-8000-000000000001",
      result_id: RESULT_ID,
      saved_segment_id: SEGMENT_ID,
      saved_segment_version_no: 1,
      confidence_score: null,
      release_suppressed: true,
    }] });

    await expect(saveMarketScenario({
      estimateId: ESTIMATE_ID,
      queryResultId: RESULT_ID,
      name: "Release-safe rejection",
      factors: {},
    })).rejects.toThrow("suppressed_estimate_cannot_size_market");

    expect(mocks.query).toHaveBeenCalledTimes(1);
    expect(sqlCalls()[0]).toContain("FROM v_estimate_release_boundary e");
    expect(sqlCalls()[0]).toContain("FROM v_segment_query_result_release_boundary r");
    expect(sqlCalls().some((sql) => /INSERT\s+INTO/i.test(sql))).toBe(false);
  });
});
