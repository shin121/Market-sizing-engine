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

import { getEstimate, listEstimates } from "@/server/repositories/workbench";

const ESTIMATE_ID = "domain-universe:DOM-01";

describe("production estimate list query", () => {
  beforeEach(() => {
    database.query.mockReset();
    database.query.mockResolvedValue({ rows: [{
      estimate_id: ESTIMATE_ID,
      display_name: "테스트 도메인",
      denominator_definition: "공식 잠재 모집단",
      confidence_json: { grade: "A", total_score: 99 },
      related_spend_json: { value_base: "4900", unit: "KRW" },
    }] });
  });

  it("combines calibrated mart rows with release-safe operational estimates", async () => {
    const rows = await listEstimates();

    expect(rows[0]).toMatchObject({
      estimate_id: ESTIMATE_ID,
      id: ESTIMATE_ID,
      name: "테스트 도메인",
      description: "공식 잠재 모집단",
      confidence_grade: "A",
      confidence_score: 99,
      related_spend_json: { value_base: "4900", unit: "KRW" },
    });
    expect(database.query).toHaveBeenCalledTimes(1);

    const [sql, parameters] = database.query.mock.calls[0] as [string, unknown[]];
    expect(parameters).toEqual([null, null, 50, 0]);
    expect(sql).toContain("FROM production.v_workbench_market_sizing_directory");
    expect(sql).toContain("FROM v_estimate_lineage lineage");
    expect(sql).toContain("FROM production.v_trend_spend_summary spend");
    expect(sql).toContain("NOT production.is_fixture_text");
    expect(sql).toContain("lineage.workspace_id = current_setting('market_engine.workspace_id', true)::uuid");
    expect(sql).toContain("lineage.workspace_id IS NULL");
    expect(sql).toContain("LIMIT $3 OFFSET $4");
    expect(sql).toContain("ORDER BY is_operational DESC, updated_at DESC");
  });

  it("preserves status, exact-id, and bounded page parameters in the candidate scan", async () => {
    await listEstimates({
      status: "estimated",
      estimateId: ESTIMATE_ID,
      limit: 500,
      offset: -10,
    });

    const [sql, parameters] = database.query.mock.calls[0] as [string, unknown[]];
    expect(parameters).toEqual(["estimated", "domain-market:DOM-01", 200, 0]);
    expect(sql).toContain("($1::text IS NULL OR status = $1 OR ($1 = 'estimated' AND status = 'bounded_estimate'))");
    expect(sql).toContain("($2::text IS NULL OR estimate_id = $2)");
  });

  it("decodes prefixed route IDs and rejects malformed UUID IDs before PostgreSQL", async () => {
    await getEstimate("gold-query%3AGOLD-10");

    expect(database.query).toHaveBeenCalledTimes(1);
    expect(database.query.mock.calls[0]?.[1]).toEqual([null, "gold-query:GOLD-10", 1, 0]);

    database.query.mockClear();
    await expect(getEstimate("not-a-valid-estimate-id")).resolves.toBeNull();
    expect(database.query).not.toHaveBeenCalled();
  });
});
