import { describe, expect, it } from "vitest";

import { buildResearchReviewCompleteness } from "@/domain/research-review";

describe("buildResearchReviewCompleteness", () => {
  it("computes value, interval, confidence, freshness, and recalculation detail when comparable", () => {
    const result = buildResearchReviewCompleteness({
      baseline: {
        value: "20",
        lowBaseHigh: { low: "10", base: "20", high: "30" },
        denominator: "대한민국 기업",
      },
      baselineConfidenceSource: {
        resultSummary: { confidence_score: 70, confidence_grade: "C" },
      },
      proposedInterval: { low: 12, base: 25, high: 35 },
      proposedDenominator: " 대한민국   기업 ",
      proposedConfidence: { score: 82, grade: "B" },
      sources: [{
        publicationDate: "2026-01-01",
        referenceYear: 2025,
        accessedAt: "2026-08-20T00:00:00.000Z",
      }],
      affectedSegments: ["segment-b", "segment-a", "segment-b", " "],
      calculationRelevantTarget: true,
      materializedCalculationDependency: true,
      computedAt: "2026-08-25T00:00:00.000Z",
    });

    expect(result.deltaSummary.comparison).toEqual({
      denominator: {
        baseline: "대한민국 기업",
        proposed: "대한민국   기업",
        status: "matching",
      },
      value: {
        baseline: "20",
        proposed: 25,
        absoluteChange: "5",
        relativeChangePercent: "25",
        relativeChangeStatus: "calculated",
        status: "comparable",
      },
      interval: {
        baseline: { low: "10", base: "20", high: "30" },
        proposed: { low: 12, base: 25, high: 35 },
        absoluteChange: { low: "2", base: "5", high: "5" },
        status: "comparable",
      },
    });
    expect(result.deltaSummary.confidence).toEqual({
      baseline: { score: 70, grade: "C" },
      proposed: { score: 82, grade: "B" },
      scoreChange: 12,
      gradeChanged: true,
    });
    expect(result.deltaSummary.sourceFreshness).toEqual([expect.objectContaining({
      sourceIndex: 0,
      daysSincePublication: 236,
      yearsSinceReference: 1,
      daysSinceAccess: 5,
      status: "current",
    })]);
    expect(result.affectedSegmentIds).toEqual(["segment-b", "segment-a"]);
    expect(result.expectedRecalculation).toMatchObject({
      affectedSegmentCount: 2,
      affectedSegmentIds: ["segment-b", "segment-a"],
      invalidationRequired: true,
      recalculationRequired: true,
      eligibilityStatus: "eligible",
      trigger: "on_approved_revision_materialization",
      expectedAction: "invalidate_and_recalculate_affected_segments",
    });
  });

  it("keeps deltas and baseline confidence null when evidence is unavailable or denominators differ", () => {
    const unavailable = buildResearchReviewCompleteness({
      baseline: {
        status: "not_estimable",
        value: null,
        lowBaseHigh: null,
        denominator: "대한민국 enterprise",
      },
      proposedInterval: { low: 0.2, base: 0.25, high: 0.3 },
      proposedDenominator: "대한민국 establishment",
      proposedConfidence: { score: 61, grade: "D" },
      sources: [{ publicationDate: "unknown", referenceYear: null, accessedAt: null }],
      affectedSegments: [],
      computedAt: "2026-08-25T00:00:00.000Z",
    });

    expect(unavailable.deltaSummary.comparison.value).toMatchObject({
      baseline: null,
      proposed: 0.25,
      absoluteChange: null,
      relativeChangePercent: null,
      relativeChangeStatus: "unavailable",
      status: "baseline_unavailable",
    });
    expect(unavailable.deltaSummary.comparison.interval).toMatchObject({
      baseline: null,
      absoluteChange: null,
      status: "baseline_unavailable",
    });
    expect(unavailable.deltaSummary.comparison.denominator.status).toBe("mismatch");
    expect(unavailable.deltaSummary.confidence).toEqual({
      baseline: { score: null, grade: null },
      proposed: { score: 61, grade: "D" },
      scoreChange: null,
      gradeChanged: null,
    });
    expect(unavailable.deltaSummary.sourceFreshness[0]).toMatchObject({
      daysSincePublication: null,
      yearsSinceReference: null,
      daysSinceAccess: null,
      status: "unavailable",
    });
    expect(unavailable.expectedRecalculation).toMatchObject({
      affectedSegmentCount: 0,
      affectedSegmentIds: [],
      invalidationRequired: false,
      recalculationRequired: false,
      eligibilityStatus: "no_affected_segments",
      trigger: null,
      expectedAction: null,
    });
  });

  it("calculates an absolute change but leaves relative change null for a zero baseline", () => {
    const result = buildResearchReviewCompleteness({
      baseline: { value: 0, lowBaseHigh: null, denominator: "동일 분모" },
      proposedInterval: { low: 1, base: 2, high: 3 },
      proposedDenominator: "동일 분모",
      proposedConfidence: {},
      sources: [],
      affectedSegments: [],
      computedAt: "2026-08-25T00:00:00.000Z",
    });

    expect(result.deltaSummary.comparison.value).toMatchObject({
      absoluteChange: "2",
      relativeChangePercent: null,
      relativeChangeStatus: "baseline_zero",
      status: "comparable",
    });
  });

  it("does not calculate a numeric delta across different denominators", () => {
    const result = buildResearchReviewCompleteness({
      baseline: {
        value: 100,
        lowBaseHigh: { low: 90, base: 100, high: 110 },
        denominator: "enterprise",
      },
      proposedInterval: { low: 100, base: 120, high: 140 },
      proposedDenominator: "establishment",
      proposedConfidence: {},
      sources: [],
      affectedSegments: [],
      computedAt: "2026-08-25T00:00:00.000Z",
    });

    expect(result.deltaSummary.comparison.value).toMatchObject({
      absoluteChange: null,
      relativeChangePercent: null,
      status: "denominator_mismatch",
    });
    expect(result.deltaSummary.comparison.interval).toMatchObject({
      absoluteChange: null,
      status: "denominator_mismatch",
    });
  });

  it("keeps proposed affected segments separate from verified recalculation dependencies", () => {
    const result = buildResearchReviewCompleteness({
      baseline: { value: 100, denominator: "enterprise" },
      proposedInterval: { low: 100, base: 120, high: 140 },
      proposedDenominator: "enterprise",
      proposedConfidence: {},
      sources: [],
      affectedSegments: ["segment-proposed"],
      computedAt: "2026-08-25T00:00:00.000Z",
    });

    expect(result.affectedSegmentIds).toEqual(["segment-proposed"]);
    expect(result.expectedRecalculation).toMatchObject({
      eligibilityStatus: "materialized_dependency_not_verified",
      invalidationRequired: false,
      recalculationRequired: false,
      trigger: null,
      expectedAction: null,
    });
  });
});
