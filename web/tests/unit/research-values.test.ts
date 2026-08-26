import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getResearchEnvironment } from "@/server/env";
import {
  appendResearchReviewFeedback,
  assertResearchQueueEligibility,
  buildCanonicalResearchPayload,
  collectBaselineSourceIds,
  opportunityIdFromResearchTarget,
  researchPromptConstraints,
} from "@/server/services/research-values";

describe("research canonical values", () => {
  it("preserves an explicit baseline instead of replacing it with an attached snapshot", () => {
    const explicit = { status: "not_estimable", denominator: "대한민국 소상공인", nested: { value: null } };
    const payload = buildCanonicalResearchPayload({
      researchQuestion: "결측 변수를 조사하라",
      targetSegment: "대한민국 소상공인",
      targetVariable: "purchase_frequency",
      explicitBaseline: explicit,
      attachedBaseline: { status: "estimated", value: 10 },
    });
    expect(payload.baseline).toMatchObject({
      status: "not_estimable",
      denominator: "대한민국 소상공인",
      definition: expect.any(String),
      lowBaseHigh: null,
    });
    expect(payload.snapshotProvenance).toEqual({
      targetVariableBaseline: explicit,
      segmentContext: { status: "estimated", value: 10 },
    });
    expect(payload.targetSegment).toBe("대한민국 소상공인");
  });

  it("normalizes an explicitly unavailable interval with null bounds to null", () => {
    const payload = buildCanonicalResearchPayload({
      researchQuestion: "결측 상태를 보존하라",
      targetSegment: "관측 불가 세그먼트",
      targetVariable: "joint_prevalence",
      explicitBaseline: {
        status: "not_estimable",
        value: null,
        lowBaseHigh: { low: null, base: null, high: null },
        denominator: "대한민국 기업",
      },
    });
    expect(payload.baseline).toMatchObject({
      status: "not_estimable",
      value: null,
      lowBaseHigh: null,
    });
  });

  it("keeps saved-segment lineage in provenance without widening canonical baseline fields", () => {
    const attached = {
      savedSegmentId: "00000000-0000-4000-8000-000000000111",
      savedSegmentVersionNo: 4,
      queryId: "00000000-0000-4000-8000-000000000222",
      resultId: "00000000-0000-4000-8000-000000000333",
      pinnedResultId: "00000000-0000-4000-8000-000000000333",
      estimateId: "00000000-0000-4000-8000-000000000444",
      status: "estimated",
      count: { low: 10, base: 20, high: 30 },
      unit: "enterprise",
      denominator: "대한민국 기업",
      definition: "저장 세그먼트의 고정 snapshot",
      filterDefinition: { where: [{ logic: "AND" }] },
      normalizedConditionClasses: {
        feature: [{ sourceCode: "feature:online_channel" }],
        behavior: [{ sourceCode: "behavior:repeat_purchase" }],
        subtype: [{ sourceCode: "subtype:DOM-24-SUB-04" }],
        archetype: [{ sourceCode: "archetype:ARC-06-001" }],
      },
    };
    const payload = buildCanonicalResearchPayload({
      researchQuestion: "저장된 조건 문맥을 보존하라",
      targetSegment: "대한민국 기업",
      targetVariable: "opportunity_idea_brief:00000000-0000-4000-8000-000000000123",
      attachedBaseline: attached,
    });

    expect(Object.keys(payload.baseline as Record<string, unknown>).sort()).toEqual([
      "definition",
      "denominator",
      "estimateId",
      "lowBaseHigh",
      "sourceTitle",
      "status",
      "unit",
      "value",
      "version",
    ]);
    expect(payload.snapshotProvenance).toEqual(attached);
  });

  it("adds review feedback to both canonical payload and next prompt constraints", () => {
    const payload = appendResearchReviewFeedback({ baseline: {} }, {
      reviewId: "00000000-0000-4000-8000-000000000123",
      note: "분모를 사업체로 한정하고 공공 1차 자료를 추가하라.",
      requestedAt: "2026-08-25T00:00:00.000Z",
    });
    expect(payload.reviewFeedback).toHaveLength(1);
    expect(researchPromptConstraints(payload)).toContain(
      "Human reviewer follow-up constraint: 분모를 사업체로 한정하고 공공 1차 자료를 추가하라.",
    );
  });

  it("resolves opportunity targets and only effectively enabled, normalized snapshot source codes", () => {
    expect(opportunityIdFromResearchTarget("opportunity_idea_brief:00000000-0000-4000-8000-000000000123"))
      .toBe("00000000-0000-4000-8000-000000000123");
    const baseline = {
      targetVariableBaseline: {
        note: "subtype:DOM-99-SUB-99 and archetype:ARC-99-999 are untrusted free text",
      },
      segmentContext: {
        savedSegmentId: "00000000-0000-4000-8000-000000000111",
        queryId: "00000000-0000-4000-8000-000000000222",
        filter: [{ sourceId: "subtype:DOM-98-SUB-98" }],
        normalizedConditionClasses: {
          subtype: [
            {
              conditionClass: "subtype", sourceCode: "subtype:DOM-24-SUB-04",
              groupEnabled: true, enabled: true,
            },
            {
              conditionClass: "subtype", sourceCode: "subtype:DOM-24-SUB-03",
              groupEnabled: false, enabled: false,
            },
          ],
          archetype: [
            {
              conditionClass: "archetype", sourceCode: "archetype:ARC-06-001",
              groupEnabled: true, enabled: true,
            },
            {
              conditionClass: "archetype", sourceCode: "archetype:ARC-06-002",
              groupEnabled: true, enabled: false,
            },
          ],
        },
      },
    };
    expect(collectBaselineSourceIds(baseline, "subtype")).toEqual(["DOM-24-SUB-04"]);
    expect(collectBaselineSourceIds(baseline, "archetype")).toEqual(["ARC-06-001"]);
    expect(collectBaselineSourceIds({
      savedSegmentId: baseline.segmentContext.savedSegmentId,
      queryId: baseline.segmentContext.queryId,
      filter: [{ sourceId: "subtype:DOM-24-SUB-04" }],
    }, "subtype")).toEqual([]);
  });

  it("queues only unresolved explicit target variables without confusing segment context for the target", () => {
    expect(() => assertResearchQueueEligibility({
      targetVariable: "joint_prevalence",
      explicitBaseline: {
        status: "estimated",
        value: 0.42,
        denominator: "대한민국 사업체",
      },
    })).toThrow("research_variable_already_calculable_from_existing_data");

    expect(() => assertResearchQueueEligibility({
      targetVariable: "joint_prevalence",
      explicitBaseline: {
        status: "not_estimable",
        denominator: "대한민국 사업체",
      },
    })).not.toThrow();
    expect(() => assertResearchQueueEligibility({
      targetVariable: "joint_prevalence",
      explicitBaseline: {
        status: "not_estimable",
        value: 0.42,
        denominator: "대한민국 사업체",
      },
    })).toThrow("baseline_status_value_conflict");
    expect(() => assertResearchQueueEligibility({
      targetVariable: "joint_prevalence",
    })).not.toThrow();
    expect(() => assertResearchQueueEligibility({
      targetVariable: "opportunity_idea_brief:00000000-0000-4000-8000-000000000123",
      explicitBaseline: { status: "estimated", value: 100 },
    })).not.toThrow();
  });
});

describe("research environment schema", () => {
  it("normalizes safe defaults and rejects an invalid lease", () => {
    const parsed = getResearchEnvironment({ NODE_ENV: "test", OPENAI_RESEARCH_ENABLED: "false" });
    expect(parsed.OPENAI_RESEARCH_MODEL).toBe("gpt-5.6");
    expect(parsed.OPENAI_RESEARCH_TIMEOUT_MS).toBe(240_000);
    expect(parsed.RESEARCH_RUNNING_LEASE_MS).toBe(300_000);
    expect(() => getResearchEnvironment({
      NODE_ENV: "test",
      OPENAI_RESEARCH_ENABLED: "false",
      RESEARCH_RUNNING_LEASE_MS: "10",
    })).toThrow("invalid_research_environment");
  });
});
