import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  reviewRevisionAction: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: mocks.refresh }),
}));
vi.mock("@/actions/workbench", () => ({
  cancelResearchJobAction: vi.fn(),
  createOpportunityAction: vi.fn(),
  createResearchJobAction: vi.fn(),
  exportSnapshotAction: vi.fn(),
  reviewRevisionAction: mocks.reviewRevisionAction,
  saveComparisonAction: vi.fn(),
  saveSegmentAction: vi.fn(),
  saveScenarioAction: vi.fn(),
  updateOpportunityAction: vi.fn(),
}));

import { ReviewActions } from "@/components/workbench-controls";

beforeEach(() => {
  mocks.reviewRevisionAction.mockReset();
  mocks.refresh.mockReset();
  mocks.reviewRevisionAction.mockResolvedValue({ ok: true, id: "review-1" });
});

afterEach(cleanup);

describe("ReviewActions confirmation", () => {
  it("does not record a terminal decision until the explicit second confirmation", async () => {
    const user = userEvent.setup();
    render(<ReviewActions reviewId="review-1" defaultModificationJson="{}" />);
    await user.type(screen.getByRole("textbox", { name: "검토 메모" }), "현재 근거와 충돌하므로 반려합니다.");

    await user.click(screen.getByRole("button", { name: "반려" }));
    expect(mocks.reviewRevisionAction).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toHaveTextContent("반려 결정을 기록할까요?");

    await user.click(screen.getByRole("button", { name: "반려 확정" }));
    await waitFor(() => expect(mocks.reviewRevisionAction).toHaveBeenCalledTimes(1));
    const formData = mocks.reviewRevisionAction.mock.calls[0][0] as FormData;
    expect(formData.get("review_id")).toBe("review-1");
    expect(formData.get("decision")).toBe("reject");
    expect(formData.get("note")).toBe("현재 근거와 충돌하므로 반려합니다.");
  });

  it("allows the pending decision to be cancelled without a mutation", async () => {
    const user = userEvent.setup();
    render(<ReviewActions reviewId="review-1" defaultModificationJson="{}" />);
    await user.click(screen.getByRole("button", { name: "승인" }));
    await user.click(screen.getByRole("button", { name: "취소" }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(mocks.reviewRevisionAction).not.toHaveBeenCalled();
  });
});
