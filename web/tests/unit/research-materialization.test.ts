import type { PoolClient } from "pg";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { materializeApprovedResearchFactor } from "@/server/services/research-materialization";

function input(proposed: Record<string, unknown>, query = vi.fn()) {
  return {
    client: { query } as unknown as PoolClient,
    workspaceId: "00000000-0000-4000-8000-000000000001",
    proposedRevisionId: "00000000-0000-4000-8000-000000000002",
    publicationVersionId: "00000000-0000-4000-8000-000000000003",
    proposed,
    baseline: {},
    actorId: "00000000-0000-4000-8000-000000000004",
  };
}

describe("approved research factor materialization boundary", () => {
  it("rejects ordinary factors when no aggregate interval can be persisted", async () => {
    const query = vi.fn();
    await expect(materializeApprovedResearchFactor(input({
      targetVariable: "ordinary_rate",
      factors: [{ interval: { low: 0.1, base: 0.2, high: 0.3 } }],
      lowBaseHigh: null,
    }, query))).rejects.toThrow("approved_research_factor_aggregate_interval_required");
    await expect(materializeApprovedResearchFactor(input({
      target_variable: "ordinary_rate",
      proposedFactors: [{ interval: { low: 0.1, base: 0.2, high: 0.3 } }],
      lowBaseHigh: null,
    }, query))).rejects.toThrow("approved_research_factor_aggregate_interval_required");
    await expect(materializeApprovedResearchFactor(input({
      targetVariable: "opportunity_idea_brief:not-a-uuid",
      factors: [{ interval: { low: 0.1, base: 0.2, high: 0.3 } }],
      lowBaseHigh: null,
    }, query))).rejects.toThrow("approved_research_factor_aggregate_interval_required");
    expect(query).not.toHaveBeenCalled();
  });

  it("does not invent a factor for non-numeric or opportunity-only output", async () => {
    const query = vi.fn();
    await expect(materializeApprovedResearchFactor(input({
      targetVariable: "ordinary_gap",
      factors: [],
      lowBaseHigh: null,
    }, query))).resolves.toBeNull();
    await expect(materializeApprovedResearchFactor(input({
      targetVariable: "opportunity_idea_brief:00000000-0000-4000-8000-000000000123",
      factors: [{ interval: { low: 0.1, base: 0.2, high: 0.3 } }],
      lowBaseHigh: null,
    }, query))).resolves.toBeNull();
    expect(query).not.toHaveBeenCalled();
  });
});
