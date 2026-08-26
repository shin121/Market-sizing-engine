import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { researchJobCanBeRequeued, reviewDecisionPolicy } from "@/server/services/research-workflow";

describe("research review decision policy", () => {
  it("requeues only failed or configuration-required provider jobs", () => {
    expect(researchJobCanBeRequeued("configuration_required")).toBe(true);
    expect(researchJobCanBeRequeued("failed")).toBe(true);
    expect(researchJobCanBeRequeued("queued")).toBe(false);
    expect(researchJobCanBeRequeued("needs_review")).toBe(false);
    expect(researchJobCanBeRequeued("approved")).toBe(false);
  });

  it("keeps approve, modified approval, reject, and keep-baseline effects distinct", () => {
    expect(reviewDecisionPolicy("approve")).toEqual({
      databaseAction: "approve",
      approvalPayload: "original",
      requestsMoreResearch: false,
      nonApprovalReviewStatus: null,
    });
    expect(reviewDecisionPolicy("approve_modified")).toEqual({
      databaseAction: "modify_and_approve",
      approvalPayload: "modified",
      requestsMoreResearch: false,
      nonApprovalReviewStatus: null,
    });
    expect(reviewDecisionPolicy("reject")).toEqual({
      databaseAction: "reject",
      approvalPayload: null,
      requestsMoreResearch: false,
      nonApprovalReviewStatus: "rejected",
    });
    expect(reviewDecisionPolicy("keep_baseline")).toEqual({
      databaseAction: "keep_existing",
      approvalPayload: null,
      requestsMoreResearch: false,
      nonApprovalReviewStatus: "closed",
    });
  });
});
