import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  reviewRevision: vi.fn(),
  saveOpportunity: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/server/services/segment-workflow", () => ({
  calculateEstimate: vi.fn(),
  interpretNaturalLanguage: vi.fn(),
  saveSegment: vi.fn(),
}));
vi.mock("@/server/services/workbench-mutations", () => ({
  saveComparison: vi.fn(),
  saveMarketScenario: vi.fn(),
  saveOpportunity: mocks.saveOpportunity,
}));
vi.mock("@/server/services/research-workflow", () => ({
  cancelResearchJob: vi.fn(),
  createResearchJob: vi.fn(),
  reviewRevision: mocks.reviewRevision,
}));

import { reviewRevisionAction, updateOpportunityAction } from "@/actions/workbench";

describe("reviewRevisionAction", () => {
  beforeEach(() => {
    mocks.reviewRevision.mockReset();
    mocks.saveOpportunity.mockReset();
    mocks.revalidatePath.mockReset();
  });

  it("returns a bounded user-facing conflict when an Opportunity editor is stale", async () => {
    mocks.saveOpportunity.mockRejectedValue(new Error("opportunity_edit_conflict"));
    const formData = new FormData();
    formData.set("opportunity_id", "opportunity-1");
    formData.set("expected_lock_version", "4");
    formData.set("name", "시장 기회");
    formData.set("problem", "검증할 문제");
    formData.set("hypothesis", "검증할 가설");
    formData.set("idea", "검증할 아이디어");
    formData.set("status", "researching");

    await expect(updateOpportunityAction(formData)).resolves.toEqual({
      ok: false,
      error: "다른 편집자가 먼저 저장했습니다. 최신 내용을 새로고침한 뒤 변경사항을 다시 적용하세요.",
    });
    expect(mocks.saveOpportunity).toHaveBeenCalledWith(expect.objectContaining({
      opportunityId: "opportunity-1",
      expectedLockVersion: "4",
    }));
  });

  it("rejects a review without a user-authored rationale", async () => {
    const formData = new FormData();
    formData.set("review_id", "review-1");
    formData.set("decision", "approve");

    await expect(reviewRevisionAction(formData)).resolves.toEqual({
      ok: false,
      error: "note_required",
    });
    expect(mocks.reviewRevision).not.toHaveBeenCalled();
  });

  it("passes the trimmed rationale to the governed review service", async () => {
    mocks.reviewRevision.mockResolvedValue("review-1");
    const formData = new FormData();
    formData.set("review_id", "review-1");
    formData.set("decision", "keep_baseline");
    formData.set("note", "  Current baseline remains better supported.  ");

    await expect(reviewRevisionAction(formData)).resolves.toEqual({ ok: true, id: "review-1" });
    expect(mocks.reviewRevision).toHaveBeenCalledWith({
      reviewId: "review-1",
      decision: "keep_baseline",
      modification: undefined,
      note: "Current baseline remains better supported.",
    });
  });
});
