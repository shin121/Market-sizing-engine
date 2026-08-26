import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  insertedMetrics: [] as Array<Record<string, unknown>>,
  query: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/db", () => ({
  getRuntimeContext: () => ({
    workspaceId: "00000000-0000-4000-8000-000000000001",
    actorId: "00000000-0000-4000-8000-000000000002",
  }),
  withWorkspaceTransaction: async (
    work: (client: { query: typeof database.query }) => Promise<unknown>,
  ) => work({ query: database.query }),
}));
vi.mock("@/server/services/segment-workflow", () => ({
  contentHash: () => "comparison-snapshot-precision-hash",
}));

import { saveComparison } from "@/server/services/workbench-mutations";

const EXACT_OVER_MAX_SAFE_INTEGER = "9007199254740993";
const ADJACENT_LOWER_INTEGER = "9007199254740992";

function segmentResult(index: number, value: string) {
  return {
    requested_id: `segment-${index}`,
    segment_id: `10000000-0000-4000-8000-00000000000${index}`,
    saved_segment_version_no: 1,
    result_id: `20000000-0000-4000-8000-00000000000${index}`,
    estimate_id: `30000000-0000-4000-8000-00000000000${index}`,
    entity_unit: "enterprise",
    count_low: value,
    count_base: value,
    count_high: value,
    share_base: "0.5",
    confidence_score: "80",
    confidence_grade: "B",
    validation_gap_count: "0",
    direct_observation_share: "1",
    estimate_updated_at: "2026-08-25T00:00:00.000Z",
    active_market_scenario_count: 1,
    market_scenario_id: `40000000-0000-4000-8000-00000000000${index}`,
    market_scenario_name: `Scenario ${index}`,
    market_scenario_version: "user-precision",
    market_horizon_months: 12,
    market_estimate_id: `50000000-0000-4000-8000-00000000000${index}`,
    tam_entities_base: value,
    sam_entities_base: value,
    som_entities_base: value,
    tam_revenue_base: value,
    sam_revenue_base: value,
    som_revenue_base: value,
    market_currency: "KRW",
    annual_spend_per_entity: value,
    annual_spend_per_entity_unit: "KRW/entity/year",
    label: `Segment ${index}`,
  };
}

describe("saved comparison numeric precision", () => {
  beforeEach(() => {
    database.insertedMetrics = [];
    database.query.mockReset();
    database.query.mockImplementation(async (sql: string, parameters: unknown[] = []) => {
      if (sql.includes("WITH requested AS")) {
        return {
          rows: [
            segmentResult(1, EXACT_OVER_MAX_SAFE_INTEGER),
            segmentResult(2, ADJACENT_LOWER_INTEGER),
          ],
        };
      }
      if (sql.includes("INSERT INTO comparison_workspace")) {
        return { rows: [{ comparison_id: "60000000-0000-4000-8000-000000000001" }] };
      }
      if (sql.includes("INSERT INTO comparison_member")) {
        database.insertedMetrics.push(JSON.parse(String(parameters[5])) as Record<string, unknown>);
        return { rows: [] };
      }
      if (sql.includes("INSERT INTO audit_event")) return { rows: [] };
      throw new Error(`unexpected_query:${sql}`);
    });
  });

  it("keeps PostgreSQL numeric strings exact while deriving only the normalized score as a number", async () => {
    await saveComparison({
      name: "Precision regression",
      segmentIds: ["segment-1", "segment-2"],
    });

    expect(database.insertedMetrics).toHaveLength(2);
    expect(database.insertedMetrics[0]).toMatchObject({
      raw_count_low: EXACT_OVER_MAX_SAFE_INTEGER,
      raw_count_base: EXACT_OVER_MAX_SAFE_INTEGER,
      raw_count_high: EXACT_OVER_MAX_SAFE_INTEGER,
      tam_entities_base: EXACT_OVER_MAX_SAFE_INTEGER,
      sam_entities_base: EXACT_OVER_MAX_SAFE_INTEGER,
      som_entities_base: EXACT_OVER_MAX_SAFE_INTEGER,
      tam_revenue_base: EXACT_OVER_MAX_SAFE_INTEGER,
      sam_revenue_base: EXACT_OVER_MAX_SAFE_INTEGER,
      som_revenue_base: EXACT_OVER_MAX_SAFE_INTEGER,
      annual_spend_per_entity: EXACT_OVER_MAX_SAFE_INTEGER,
      confidence_score: "80",
      validation_gap_count: "0",
      direct_observation_share: "1",
      normalized_count_score: 100,
    });
    expect(database.insertedMetrics[1]).toMatchObject({
      raw_count_base: ADJACENT_LOWER_INTEGER,
      normalized_count_score: 0,
    });
    expect(typeof database.insertedMetrics[0]?.normalized_count_score).toBe("number");
  });
});
