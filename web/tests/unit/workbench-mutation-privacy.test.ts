import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  withWorkspaceTransaction: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/db", () => ({
  getRuntimeContext: () => ({ workspaceId: "workspace-1", actorId: "actor-1" }),
  withWorkspaceTransaction: mocks.withWorkspaceTransaction,
}));
vi.mock("@/server/services/segment-workflow", () => ({
  contentHash: () => "test-hash",
}));

import { saveComparison, saveMarketScenario } from "@/server/services/workbench-mutations";

describe("workbench mutation privacy boundaries", () => {
  it("rejects personal data in a market scenario before persistence", async () => {
    await expect(saveMarketScenario({
      estimateId: "estimate-1",
      name: "집계 시나리오",
      factors: {
        productDefinition: "person@example.com에게 제공할 상품",
        serviceabilityRate: { low: "0.1", base: "0.2", high: "0.3" },
        attainableShare: { low: "0.1", base: "0.2", high: "0.3" },
      },
    })).rejects.toThrow("personal_data_not_allowed:email_address");
    expect(mocks.withWorkspaceTransaction).not.toHaveBeenCalled();
  });

  it("rejects personal data in a comparison name before persistence", async () => {
    await expect(saveComparison({
      name: "010-1234-5678 비교",
      segmentIds: ["segment-1", "segment-2"],
    })).rejects.toThrow("personal_data_not_allowed:phone_number");
    expect(mocks.withWorkspaceTransaction).not.toHaveBeenCalled();
  });
});
