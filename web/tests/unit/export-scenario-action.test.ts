import { describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/services/segment-workflow", () => ({
  calculateEstimate: vi.fn(),
  interpretNaturalLanguage: vi.fn(),
  saveSegment: vi.fn(),
}));
vi.mock("@/server/services/workbench-mutations", () => ({
  saveComparison: vi.fn(),
  saveMarketScenario: vi.fn(),
  saveOpportunity: vi.fn(),
}));
vi.mock("@/server/services/research-workflow", () => ({
  cancelResearchJob: vi.fn(),
  createResearchJob: vi.fn(),
  reviewRevision: vi.fn(),
}));

import { exportSnapshotAction } from "@/actions/workbench";

const SCENARIO_ID = "10000000-0000-4000-8000-000000000001";
const SCENARIO_VERSION = "user-a1b2c3d4e5f6";

function exportForm() {
  const formData = new FormData();
  formData.set("snapshot_id", "estimate-1");
  formData.set("snapshot_kind", "estimate");
  formData.set("format", "json");
  return formData;
}

describe("estimate export scenario propagation", () => {
  it("adds the exact selected pair to the export URL", async () => {
    const formData = exportForm();
    formData.set("scenario_id", SCENARIO_ID);
    formData.set("scenario_version", SCENARIO_VERSION);

    const result = await exportSnapshotAction(formData);
    expect(result.ok).toBe(true);
    const url = new URL(result.id ?? "", "http://localhost");
    expect(url.pathname).toBe("/api/exports/estimate-1");
    expect(url.searchParams.get("scenarioId")).toBe(SCENARIO_ID);
    expect(url.searchParams.get("scenarioVersion")).toBe(SCENARIO_VERSION);
    expect(url.searchParams.get("scenarioSelectionMode")).toBe("explicit");
  });

  it("rejects a half-pair or repeated pair instead of exporting the automatic scenario", async () => {
    const halfPair = exportForm();
    halfPair.set("scenario_id", SCENARIO_ID);
    await expect(exportSnapshotAction(halfPair)).resolves.toMatchObject({
      ok: false,
      error: "invalid_market_scenario_selection",
    });

    const repeated = exportForm();
    repeated.append("scenario_id", SCENARIO_ID);
    repeated.append("scenario_id", SCENARIO_ID);
    repeated.set("scenario_version", SCENARIO_VERSION);
    await expect(exportSnapshotAction(repeated)).resolves.toMatchObject({
      ok: false,
      error: "invalid_market_scenario_selection",
    });
  });
});
