import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  query: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/db", () => ({
  withWorkspaceTransaction: async (work: (client: { query: typeof database.query }) => Promise<unknown>) => (
    work({ query: database.query })
  ),
}));

import { getOpportunity, getReportSnapshot, listOpportunities } from "@/server/repositories/workbench";

const ESTIMATE_IDS = [
  "10000000-0000-4000-8000-000000000001",
  "10000000-0000-4000-8000-000000000002",
] as const;

function estimateRow(estimateId: string) {
  return {
    estimate_id: estimateId,
    subject_id: `subject:${estimateId}`,
    subject_type: "query",
    confidence_json: {},
    display_name: `Estimate ${estimateId}`,
    display_components_json: [],
    sensitivity_results: [],
    tam_entities_base: null,
    sam_entities_base: null,
    som_entities_base: null,
    tam_revenue_base: null,
    sam_revenue_base: null,
    som_revenue_base: null,
    market_currency: null,
  };
}

describe("workbench report snapshot batching", () => {
  beforeEach(() => {
    database.query.mockReset();
    database.query.mockImplementation(async (sql: string, parameters: unknown[]) => {
      if (sql.includes("FROM v_comparison_detail")) {
        return {
          rows: ESTIMATE_IDS.map((estimateId, index) => ({
            comparison_id: "20000000-0000-4000-8000-000000000001",
            comparison_name: "Batch comparison",
            comparison_status: "saved",
            position: index + 1,
            query_result_id: `30000000-0000-4000-8000-00000000000${index + 1}`,
            estimate_id: estimateId,
            segment_name: `Segment ${index + 1}`,
            display_label: null,
          })),
        };
      }
      if (sql.includes("FROM v_estimate_lineage")) {
        const [estimateIds] = parameters as [string[]];
        return { rows: estimateIds.map(estimateRow) };
      }
      if (sql.includes("FROM production.v_workbench_opportunity_snapshot snapshot") || sql.includes("FROM v_opportunity_snapshot snapshot")) {
        if (sql.includes("WHERE snapshot.opportunity_id = $1")) {
          return { rows: [{
            opportunity_id: "40000000-0000-4000-8000-000000000001",
            current_content: [],
            segment_snapshots: [
              { link_role: "context", query_result_id: "result-context" },
              { link_role: "primary_target", query_result_id: "result-primary" },
            ],
          }] };
        }
        return { rows: [{
          opportunity_id: "40000000-0000-4000-8000-000000000001",
          segment_name: "정확한 query 이름",
          segment_snapshots: [{
            link_role: "primary_target",
            saved_segment_id: "50000000-0000-4000-8000-000000000001",
            query_result_id: "60000000-0000-4000-8000-000000000001",
          }],
        }] };
      }
      throw new Error(`unexpected_query:${sql}`);
    });
  });

  it("loads all comparison estimate snapshots in one batch query", async () => {
    const snapshot = await getReportSnapshot(
      "comparison",
      "20000000-0000-4000-8000-000000000001",
    ) as { estimate_snapshots: Array<{ estimate_id: string }> };

    expect(snapshot.estimate_snapshots.map((row) => row.estimate_id)).toEqual(ESTIMATE_IDS);
    expect(database.query).toHaveBeenCalledTimes(2);
    expect(database.query.mock.calls[1]?.[0]).toContain("unnest($1::uuid[])");
    expect(database.query.mock.calls[1]?.[1]).toEqual([[...ESTIMATE_IDS], null, null, null]);
    expect(database.query.mock.calls[1]?.[0]).toContain("ms.status='active'");
    expect(database.query.mock.calls[1]?.[0]).toContain("market_state.active_market_scenario_count=1");
  });

  it("hydrates the exact primary query name into the Board segment snapshot", async () => {
    const [opportunity] = await listOpportunities();
    expect(opportunity.segment_snapshots).toEqual([expect.objectContaining({
      link_role: "primary_target",
      segment_name: "정확한 query 이름",
    })]);
    expect(database.query.mock.calls[0]?.[0]).toContain("JOIN segment_query segment");
  });

  it("projects the primary target as both the pinned and current Opportunity comparison basis", async () => {
    const opportunity = await getOpportunity("40000000-0000-4000-8000-000000000001");
    expect(opportunity?.estimate_snapshot).toMatchObject({
      link_role: "primary_target",
      query_result_id: "result-primary",
    });
    expect(database.query.mock.calls[0]?.[0]).toContain("osl.link_role='primary_target'");
  });
});
