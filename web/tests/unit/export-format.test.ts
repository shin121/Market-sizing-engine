import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { escapeCsv, flattenSnapshotRows, renderPrintReport } from "@/app/api/exports/[snapshotId]/route";

describe("purpose-built export formatting", () => {
  it("expands nested evidence into long-form rows instead of JSON-in-cell blobs", () => {
    const rows = flattenSnapshotRows({
      estimate_id: "estimate-1",
      data_version: "kr-v1",
      reference_period: "2025",
      denominator_definition: "대한민국 enterprise",
      method_code: "weighted_intersection",
      confidence_json: { grade: "B", total_score: 81 },
      validation_gaps_json: [{ gap_code: "joint_distribution_missing", status: "open" }],
      sources_json: [{
        source_id: "source-1",
        release_id: "release-2025",
        title: "공식 통계",
        official_url: "https://example.com/release-2025",
        reference_year: 2025,
        locator: "표 3",
      }],
      factors: [{ component_code: "population", value_base: 100 }],
    });
    expect(rows).toContainEqual({ section: "출처 목록", path: "sources_json[0].title", value: "공식 통계" });
    expect(rows).toContainEqual({ section: "출처 목록", path: "sources_json[0].release_id", value: "release-2025" });
    expect(rows).toContainEqual({ section: "출처 목록", path: "sources_json[0].official_url", value: "https://example.com/release-2025" });
    expect(rows).toContainEqual({ section: "metadata", path: "reference_period", value: "2025" });
    expect(rows).toContainEqual({ section: "metadata", path: "denominator_definition", value: "대한민국 enterprise" });
    expect(rows).toContainEqual({ section: "metadata", path: "method_code", value: "weighted_intersection" });
    expect(rows).toContainEqual({ section: "metadata", path: "data_version", value: "kr-v1" });
    expect(rows).toContainEqual({ section: "신뢰도", path: "confidence_json.grade", value: "B" });
    expect(rows).toContainEqual({ section: "validation_gaps_json", path: "validation_gaps_json[0].gap_code", value: "joint_distribution_missing" });
    expect(rows.some((row) => row.value.startsWith("{"))).toBe(false);
  });

  it("preserves required estimate provenance metadata in the printable export", () => {
    const rows = flattenSnapshotRows({
      estimate_id: "estimate-required-metadata",
      entity_unit: "enterprise",
      reference_period: "2025-Q4",
      denominator_definition: "대한민국 enterprise",
      method_code: "direct_count",
      data_version: "kr-enterprise-2025-v2",
      confidence_json: { grade: "A", total_score: 92 },
      validation_gaps_json: [{ gap_code: "coverage_review", status: "resolved" }],
      sources_json: [{ release_id: "release-42", official_url: "https://example.com/release-42" }],
    });
    const html = renderPrintReport({
      kind: "estimate",
      snapshotId: "estimate-required-metadata",
      generatedAt: "2026-08-25T00:00:00.000Z",
      rows,
    });

    for (const requiredValue of [
      "estimate-required-metadata",
      "enterprise",
      "2025-Q4",
      "대한민국 enterprise",
      "direct_count",
      "kr-enterprise-2025-v2",
      "release-42",
      "https://example.com/release-42",
      "coverage_review",
      "2026-08-25T00:00:00.000Z",
    ]) expect(html).toContain(requiredValue);
  });

  it("renders semantic report tables without a raw JSON pre block", () => {
    const rows = flattenSnapshotRows({ opportunity_id: "opp-1", current_content: [{ problem: "검증할 문제" }] });
    const html = renderPrintReport({ kind: "opportunity", snapshotId: "opp-1", generatedAt: "2026-08-25T00:00:00.000Z", rows });
    expect(html).toContain("Opportunity Brief");
    expect(html).toContain("검증할 문제");
    expect(html).toContain("<table>");
    expect(html).not.toContain("<pre>");
  });

  it("preserves approved feature and behavior provenance in CSV rows and print", () => {
    const rows = flattenSnapshotRows({
      opportunity_id: "opp-condition-provenance",
      current_content: [{
        content: {
          ideaBrief: {
            sourceFeatureIds: ["core_feature:has_online_sales"],
            sourceBehaviorIds: ["behavior:DOM-24-BEH-01"],
          },
          provenance: {
            queryResultId: "result-pinned",
            sourceConditionVerification: {
              feature: { verified: [{
                sourceCode: "core_feature:has_online_sales",
                operator: "eq",
                value: true,
                referenceYear: 2025,
              }] },
              behavior: { verified: [{
                sourceCode: "behavior:DOM-24-BEH-01",
                operator: "exists",
                value: true,
                referenceYear: null,
              }] },
            },
          },
        },
      }],
    });
    expect(rows).toContainEqual({
      section: "Opportunity Brief",
      path: "current_content[0].content.provenance.sourceConditionVerification.feature.verified[0].sourceCode",
      value: "core_feature:has_online_sales",
    });
    expect(rows).toContainEqual({
      section: "Opportunity Brief",
      path: "current_content[0].content.provenance.sourceConditionVerification.feature.verified[0].operator",
      value: "eq",
    });
    expect(rows).toContainEqual({
      section: "Opportunity Brief",
      path: "current_content[0].content.provenance.sourceConditionVerification.feature.verified[0].referenceYear",
      value: "2025",
    });
    const csv = rows.map((row) => [row.section, row.path, row.value].map(escapeCsv).join(",")).join("\n");
    const html = renderPrintReport({
      kind: "opportunity",
      snapshotId: "opp-condition-provenance",
      generatedAt: "2026-08-25T00:00:00.000Z",
      rows,
    });
    expect(csv).toContain("core_feature:has_online_sales");
    expect(csv).toContain("behavior:DOM-24-BEH-01");
    expect(html).toContain("core_feature:has_online_sales");
    expect(html).toContain("behavior:DOM-24-BEH-01");
  });

  it.each(["=1+1", "+SUM(A1:A2)", "-2+3", "@cmd", "  =HYPERLINK(\"https://evil.example\")", "\t=1+1"])(
    "neutralizes spreadsheet formula cells in CSV output: %s",
    (value) => {
      expect(escapeCsv(value)).toMatch(/^"'/);
    },
  );

  it("preserves negative numeric evidence as a numeric CSV cell", () => {
    const row = flattenSnapshotRows({ growth_rate: -0.2 })[0];
    expect(row.value).toBe("-0.2");
    expect(escapeCsv(row.value)).toBe('"-0.2"');
    expect(escapeCsv(" -2.5e-3 ")).toBe('" -2.5e-3 "');
  });
});
