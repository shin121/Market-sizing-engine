import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/actions/workbench", () => ({
  cancelResearchJobAction: vi.fn(),
  createOpportunityAction: vi.fn(),
  createResearchJobAction: vi.fn(),
  exportSnapshotAction: vi.fn(),
  reviewRevisionAction: vi.fn(),
  saveComparisonAction: vi.fn(),
  saveSegmentAction: vi.fn(),
  saveScenarioAction: vi.fn(),
  updateOpportunityAction: vi.fn(),
}));

import { OpportunityEditor } from "@/components/workbench-controls";

afterEach(cleanup);

describe("OpportunityEditor optimistic locking", () => {
  it("submits the exact version loaded with the editable snapshot", () => {
    const { container } = render(<OpportunityEditor value={{
      id: "opportunity-1",
      lockVersion: "17",
      name: "시장 기회",
      problem: "검증할 문제",
      hypothesis: "검증할 가설",
      idea: "검증할 아이디어",
      revenueModel: "",
      price: "",
      channels: "",
      competingAlternatives: "",
      assumptions: "",
      nextExperiment: "",
      status: "researching",
      notes: "",
      scores: {},
      weights: {},
    }} />);

    expect(container.querySelector<HTMLInputElement>('input[name="expected_lock_version"]'))
      .toHaveValue("17");
  });
});
