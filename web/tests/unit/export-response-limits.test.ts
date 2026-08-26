import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
vi.mock("@/server/repositories/workbench", () => ({ getReportSnapshot: vi.fn() }));

import { GET } from "@/app/api/exports/[snapshotId]/route";
import {
  boundedTextResponse,
  DEFAULT_EXPORT_RESPONSE_LIMIT_BYTES,
} from "@/server/http/bounded-text";
import { getReportSnapshot } from "@/server/repositories/workbench";

const encoder = new TextEncoder();
const mockedGetReportSnapshot = vi.mocked(getReportSnapshot);
const SCENARIO_ID = "10000000-0000-4000-8000-000000000001";
const SCENARIO_VERSION = "user-a1b2c3d4e5f6";

function exportRequest(format: "json" | "csv" | "print") {
  return GET(
    new NextRequest(`http://localhost/api/exports/estimate-1?kind=estimate&format=${format}`),
    { params: Promise.resolve({ snapshotId: "estimate-1" }) },
  );
}

function opportunityExportRequest(format: "json" | "csv" | "print") {
  return GET(
    new NextRequest(`http://localhost/api/exports/opportunity-1?kind=opportunity&format=${format}`),
    { params: Promise.resolve({ snapshotId: "opportunity-1" }) },
  );
}

describe("bounded export responses", () => {
  beforeEach(() => {
    mockedGetReportSnapshot.mockReset();
    mockedGetReportSnapshot.mockResolvedValue({
      estimate_id: "estimate-1",
      entity_unit: "enterprise",
      reference_period: "2025",
      denominator_definition: "대한민국 enterprise",
      method_code: "direct_count",
      confidence_json: { grade: "A" },
      validation_gaps_json: [],
      sources_json: [{ release_id: "release-1" }],
    });
  });

  it("counts multibyte text as UTF-8 bytes and preserves successful response headers", async () => {
    const response = boundedTextResponse("한", {
      status: 201,
      headers: {
        "Content-Disposition": 'attachment; filename="evidence.txt"',
        "Content-Type": "text/plain; charset=utf-8",
      },
    }, 3);

    expect(response.status).toBe(201);
    expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="evidence.txt"');
    expect(response.headers.get("content-length")).toBe("3");
    await expect(response.text()).resolves.toBe("한");
  });

  it("returns a small non-downloadable JSON error when the UTF-8 ceiling is exceeded", async () => {
    const response = boundedTextResponse("한", {
      headers: { "Content-Disposition": 'attachment; filename="too-large.txt"' },
    }, 2);
    const body = await response.text();

    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(response.headers.get("content-disposition")).toBeNull();
    expect(response.headers.get("content-length")).toBe(String(encoder.encode(body).byteLength));
    expect(JSON.parse(body)).toEqual({ error: "response_body_too_large" });
  });

  it.each([
    ["json", "application/json; charset=utf-8", 'attachment; filename="estimate-estimate-1.json"'],
    ["csv", "text/csv; charset=utf-8", 'attachment; filename="estimate-estimate-1.csv"'],
    ["print", "text/html; charset=utf-8", null],
  ] as const)("applies the byte ceiling and expected headers to %s exports", async (format, contentType, disposition) => {
    const response = await exportRequest(format);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(contentType);
    expect(response.headers.get("content-disposition")).toBe(disposition);
    expect(response.headers.get("content-length")).toBe(String(encoder.encode(body).byteLength));
    expect(body).toContain("estimate-1");
    expect(body).toContain("release-1");
  });

  it("rejects a multibyte export above the 5 MiB route ceiling", async () => {
    mockedGetReportSnapshot.mockResolvedValue({
      estimate_id: "estimate-1",
      evidence: "한".repeat(Math.floor(DEFAULT_EXPORT_RESPONSE_LIMIT_BYTES / 3) + 1),
    });

    const response = await exportRequest("json");
    const body = await response.text();

    expect(response.status).toBe(500);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(response.headers.get("content-disposition")).toBeNull();
    expect(response.headers.get("content-length")).toBe(String(encoder.encode(body).byteLength));
    expect(JSON.parse(body)).toEqual({ error: "response_body_too_large" });
  });

  it("keeps the append-only condition provenance envelope in JSON, CSV, and print exports", async () => {
    mockedGetReportSnapshot.mockResolvedValue({
      opportunity_id: "opportunity-1",
      current_content: [{
        content: {
          ideaBrief: {
            sourceFeatureIds: ["core_feature:has_online_sales"],
            sourceBehaviorIds: ["behavior:DOM-24-BEH-01"],
          },
          provenance: {
            sourceConditionVerification: {
              feature: { verified: [{ sourceCode: "core_feature:has_online_sales", operator: "eq", value: true, referenceYear: 2025 }] },
              behavior: { verified: [{ sourceCode: "behavior:DOM-24-BEH-01", operator: "exists", value: true, referenceYear: null }] },
            },
          },
        },
      }],
    });

    const jsonResponse = await opportunityExportRequest("json");
    const jsonBody = await jsonResponse.json();
    expect(jsonBody.immutableSnapshot.current_content[0].content.provenance.sourceConditionVerification)
      .toMatchObject({
        feature: { verified: [{ sourceCode: "core_feature:has_online_sales", operator: "eq", referenceYear: 2025 }] },
        behavior: { verified: [{ sourceCode: "behavior:DOM-24-BEH-01", operator: "exists", referenceYear: null }] },
      });

    const csv = await (await opportunityExportRequest("csv")).text();
    const print = await (await opportunityExportRequest("print")).text();
    for (const value of ["core_feature:has_online_sales", "behavior:DOM-24-BEH-01"]) {
      expect(csv).toContain(value);
      expect(print).toContain(value);
    }
  });

  it("preserves an exact explicit scenario ID, version, and selection mode in JSON, CSV, and print", async () => {
    mockedGetReportSnapshot.mockResolvedValue({
      estimate_id: "estimate-1",
      selected_market_scenario_id: SCENARIO_ID,
      selected_market_scenario_version: SCENARIO_VERSION,
      market_scenario_selection_mode: "explicit",
      tam: "120",
    });
    const request = (format: "json" | "csv" | "print") => GET(
      new NextRequest(`http://localhost/api/exports/estimate-1?kind=estimate&format=${format}&scenarioId=${SCENARIO_ID}&scenarioVersion=${SCENARIO_VERSION}`),
      { params: Promise.resolve({ snapshotId: "estimate-1" }) },
    );

    const json = await (await request("json")).json();
    expect(json.immutableSnapshot).toMatchObject({
      selected_market_scenario_id: SCENARIO_ID,
      selected_market_scenario_version: SCENARIO_VERSION,
      market_scenario_selection_mode: "explicit",
    });
    const csv = await (await request("csv")).text();
    const print = await (await request("print")).text();
    for (const value of [SCENARIO_ID, SCENARIO_VERSION, "explicit"]) {
      expect(csv).toContain(value);
      expect(print).toContain(value);
    }
    expect(mockedGetReportSnapshot).toHaveBeenCalledWith("estimate", "estimate-1", {
      scenarioId: SCENARIO_ID,
      scenarioVersion: SCENARIO_VERSION,
    });
  });

  it("fails closed before repository access when scenario query fields are repeated", async () => {
    const response = await GET(
      new NextRequest(`http://localhost/api/exports/estimate-1?kind=estimate&format=json&scenarioId=${SCENARIO_ID}&scenarioId=${SCENARIO_ID}&scenarioVersion=${SCENARIO_VERSION}`),
      { params: Promise.resolve({ snapshotId: "estimate-1" }) },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "snapshot_not_found" });
    expect(mockedGetReportSnapshot).not.toHaveBeenCalled();
  });

  it("returns 404 with no automatic fallback when an exact selection does not resolve", async () => {
    mockedGetReportSnapshot.mockResolvedValueOnce(null);
    const response = await GET(
      new NextRequest(`http://localhost/api/exports/estimate-1?kind=estimate&format=json&scenarioId=${SCENARIO_ID}&scenarioVersion=wrong-version`),
      { params: Promise.resolve({ snapshotId: "estimate-1" }) },
    );

    expect(response.status).toBe(404);
    expect(mockedGetReportSnapshot).toHaveBeenCalledWith("estimate", "estimate-1", {
      scenarioId: SCENARIO_ID,
      scenarioVersion: "wrong-version",
    });
  });
});
