import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/server/db", () => ({
  withWorkspaceTransaction: async (work: (client: { query: typeof database.query }) => Promise<unknown>) => (
    work({ query: database.query })
  ),
}));

import { getEstimate, getEstimates, getReportSnapshot } from "@/server/repositories/workbench";

const ESTIMATE_ID = "10000000-0000-4000-8000-000000000001";
const SCENARIO_ID = "20000000-0000-4000-8000-000000000001";
const SCENARIO_VERSION = "user-a1b2c3d4e5f6";
const SELECTION = { scenarioId: SCENARIO_ID, scenarioVersion: SCENARIO_VERSION };

function explicitEstimateRow() {
  return {
    estimate_id: ESTIMATE_ID,
    workspace_id: "30000000-0000-4000-8000-000000000001",
    subject_type: "query",
    subject_id: "40000000-0000-4000-8000-000000000001",
    entity_unit: "enterprise",
    status: "estimated",
    data_layer: "modeled",
    approval_status: "approved",
    count_low: "100",
    count_base: "120",
    count_high: "140",
    share_low: null,
    share_base: null,
    share_high: null,
    denominator_definition: "대한민국 enterprise",
    method_code: "weighted_intersection",
    formula: "source × factor",
    geography_code: "KR",
    geography_name_ko: "대한민국",
    reference_period: "2025",
    model_version: "test-v1",
    confidence_json: {},
    components_json: [],
    assumptions_json: [],
    validation_gaps_json: [],
    dependencies_json: [],
    sources_json: [],
    data_version: "test-v1",
    created_at: "2026-08-25T00:00:00.000Z",
    updated_at: "2026-08-25T00:00:00.000Z",
    display_name: "Explicit scenario estimate",
    display_components_json: [],
    sensitivity_results: [],
    market_scenarios: [{
      scenario_id: SCENARIO_ID,
      scenario_version: SCENARIO_VERSION,
      scenario_status: "active",
    }],
    tam_entities_low: "100",
    tam_entities_base: "120",
    tam_entities_high: "140",
    sam_entities_low: "50",
    sam_entities_base: "60",
    sam_entities_high: "70",
    som_entities_low: "5",
    som_entities_base: "6",
    som_entities_high: "7",
    tam_revenue_low: null,
    tam_revenue_base: null,
    tam_revenue_high: null,
    sam_revenue_low: null,
    sam_revenue_base: null,
    sam_revenue_high: null,
    som_revenue_low: null,
    som_revenue_base: null,
    som_revenue_high: null,
    market_currency: "KRW",
    active_market_scenario_count: 2,
    active_market_scenario_name: "Chosen scenario",
    active_market_scenario_version: SCENARIO_VERSION,
    selected_market_scenario_id: SCENARIO_ID,
    market_scenario_selection_mode: "explicit",
  };
}

describe("explicit market scenario repository selection", () => {
  beforeEach(() => database.query.mockReset());

  it("binds an exact active scenario through estimate, workspace, and base-result lineage", async () => {
    database.query.mockResolvedValueOnce({ rows: [explicitEstimateRow()] });

    const estimate = await getEstimate(ESTIMATE_ID, SELECTION) as unknown as Record<string, unknown>;

    expect(estimate).toMatchObject({
      estimate_id: ESTIMATE_ID,
      selected_market_scenario_id: SCENARIO_ID,
      selected_market_scenario_version: SCENARIO_VERSION,
      market_scenario_selection_mode: "explicit",
      active_market_scenario_count: 2,
      tam: "120",
      market_metric_unavailable_reason: null,
    });
    const [sql, parameters] = database.query.mock.calls[0] as [string, unknown[]];
    expect(parameters).toEqual([[ESTIMATE_ID], SCENARIO_ID, SCENARIO_VERSION, "explicit"]);
    expect(sql).toContain("ms.base_query_result_id=result.result_id");
    expect(sql).toContain("result.estimate_id=lineage.estimate_id");
    expect(sql).toContain("ms.workspace_id=scenario_query.workspace_id");
    expect(sql).toContain("ms.workspace_id=current_setting('market_engine.workspace_id', true)::uuid");
    expect(sql).toContain("ms.status='active'");
    expect(sql).toContain("ms.scenario_id=$2 AND ms.version=$3");
    expect(sql).toContain("$4::text IS DISTINCT FROM 'unique_active'");
    expect(sql).toContain("v_estimate_component_release_boundary");
    expect(sql).toContain("v_estimate_sensitivity_release_boundary");
  });

  it("returns no estimate for a wrong, inactive, cross-estimate, or cross-workspace selection without fallback", async () => {
    database.query.mockResolvedValueOnce({ rows: [] });

    await expect(getEstimate(ESTIMATE_ID, SELECTION)).resolves.toBeNull();
    expect(database.query.mock.calls[0]?.[0]).toContain(
      "WHERE ($2::uuid IS NULL OR selected_scenario.scenario_id IS NOT NULL)",
    );
  });

  it("preserves the exact selection in an estimate report snapshot", async () => {
    database.query.mockResolvedValueOnce({ rows: [explicitEstimateRow()] });

    const snapshot = await getReportSnapshot("estimate", ESTIMATE_ID, SELECTION) as Record<string, unknown>;

    expect(snapshot).toMatchObject({
      selected_market_scenario_id: SCENARIO_ID,
      selected_market_scenario_version: SCENARIO_VERSION,
      market_scenario_selection_mode: "explicit",
    });
    expect(database.query.mock.calls[0]?.[1]).toEqual([[ESTIMATE_ID], SCENARIO_ID, SCENARIO_VERSION, "explicit"]);
  });

  it("rejects applying one explicit scenario to a multi-estimate batch", async () => {
    await expect(getEstimates([
      ESTIMATE_ID,
      "10000000-0000-4000-8000-000000000002",
    ], SELECTION)).rejects.toThrow("explicit_market_scenario_selection_requires_one_estimate");
    expect(database.query).not.toHaveBeenCalled();
  });
});
