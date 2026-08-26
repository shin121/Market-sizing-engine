import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getEstimate: vi.fn(),
  getReportSnapshot: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/server/repositories/workbench", () => ({
  getEstimate: mocks.getEstimate,
  getReportSnapshot: mocks.getReportSnapshot,
}));
vi.mock("@/components/workbench-views", () => ({
  EstimateDetail: () => null,
  PrintableReport: () => null,
}));

import EstimatePage from "@/app/(workbench)/sizing/[estimateId]/page";
import PrintReportPage from "@/app/reports/[snapshotId]/print/page";

const ESTIMATE_ID = "10000000-0000-4000-8000-000000000001";
const SCENARIO_ID = "20000000-0000-4000-8000-000000000001";
const SCENARIO_VERSION = "user-a1b2c3d4e5f6";

function renderPage(searchParams: {
  scenarioId?: string | string[];
  scenarioVersion?: string | string[];
}) {
  return EstimatePage({
    params: Promise.resolve({ estimateId: ESTIMATE_ID }),
    searchParams: Promise.resolve(searchParams),
  });
}

describe("estimate detail explicit scenario URL", () => {
  beforeEach(() => {
    mocks.getEstimate.mockReset();
    mocks.getReportSnapshot.mockReset();
    mocks.notFound.mockClear();
    mocks.getEstimate.mockResolvedValue({ estimate_id: ESTIMATE_ID });
    mocks.getReportSnapshot.mockResolvedValue({ estimate_id: ESTIMATE_ID });
  });

  it("keeps the no-query page behavior automatic", async () => {
    await renderPage({});
    expect(mocks.getEstimate).toHaveBeenCalledWith(ESTIMATE_ID, null);
  });

  it("passes the exact valid pair into the release-safe repository", async () => {
    await renderPage({ scenarioId: SCENARIO_ID, scenarioVersion: SCENARIO_VERSION });
    expect(mocks.getEstimate).toHaveBeenCalledWith(ESTIMATE_ID, {
      scenarioId: SCENARIO_ID,
      scenarioVersion: SCENARIO_VERSION,
    });
  });

  it.each([
    { scenarioId: SCENARIO_ID },
    { scenarioVersion: SCENARIO_VERSION },
    { scenarioId: [SCENARIO_ID], scenarioVersion: SCENARIO_VERSION },
    { scenarioId: SCENARIO_ID, scenarioVersion: [SCENARIO_VERSION] },
    { scenarioId: "bad-id", scenarioVersion: SCENARIO_VERSION },
    { scenarioId: SCENARIO_ID, scenarioVersion: "" },
  ])("returns notFound for an invalid query without repository fallback", async (query) => {
    await expect(renderPage(query)).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.getEstimate).not.toHaveBeenCalled();
  });

  it("returns notFound when the exact active lineage does not resolve", async () => {
    mocks.getEstimate.mockResolvedValueOnce(null);
    await expect(renderPage({ scenarioId: SCENARIO_ID, scenarioVersion: "wrong-version" }))
      .rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.getEstimate).toHaveBeenCalledWith(ESTIMATE_ID, {
      scenarioId: SCENARIO_ID,
      scenarioVersion: "wrong-version",
    });
  });

  it("replays the exact ID, version, and unique-active mode on the printable report page", async () => {
    await PrintReportPage({
      params: Promise.resolve({ snapshotId: ESTIMATE_ID }),
      searchParams: Promise.resolve({
        scenarioId: SCENARIO_ID,
        scenarioVersion: SCENARIO_VERSION,
        scenarioSelectionMode: "unique_active",
      }),
    });

    expect(mocks.getReportSnapshot).toHaveBeenCalledWith("estimate", ESTIMATE_ID, {
      scenarioId: SCENARIO_ID,
      scenarioVersion: SCENARIO_VERSION,
      selectionMode: "unique_active",
    });
  });

  it("fails closed on a repeated printable selection mode", async () => {
    await expect(PrintReportPage({
      params: Promise.resolve({ snapshotId: ESTIMATE_ID }),
      searchParams: Promise.resolve({
        scenarioId: SCENARIO_ID,
        scenarioVersion: SCENARIO_VERSION,
        scenarioSelectionMode: ["explicit", "explicit"],
      }),
    })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.getReportSnapshot).not.toHaveBeenCalled();
  });
});
