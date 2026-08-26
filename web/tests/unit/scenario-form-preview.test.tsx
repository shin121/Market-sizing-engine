import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

import { ScenarioForm } from "@/components/workbench-controls";
import { saveScenarioAction } from "@/actions/workbench";

afterEach(cleanup);

describe("ScenarioForm live preview", () => {
  it("uses the governed sizing formula before saving", async () => {
    const user = userEvent.setup();
    render(<ScenarioForm
      estimateId="estimate-1"
      currency="KRW"
      entityUnit="enterprise"
      eligibleEntities={{ low: 1_000, base: 1_500, high: 2_000 }}
    />);

    await user.type(screen.getByRole("spinbutton", { name: "기간 (개월)" }), "12");
    const serviceability = screen.getByRole("group", { name: "서비스 가능 비율 *" });
    await user.type(within(serviceability).getByRole("textbox", { name: "Low" }), "0.4");
    await user.type(within(serviceability).getByRole("textbox", { name: "Base" }), "0.5");
    await user.type(within(serviceability).getByRole("textbox", { name: "High" }), "0.6");
    const attainable = screen.getByRole("group", { name: "획득 가능 비율 *" });
    await user.type(within(attainable).getByRole("textbox", { name: "Low" }), "0.1");
    await user.type(within(attainable).getByRole("textbox", { name: "Base" }), "0.2");
    await user.type(within(attainable).getByRole("textbox", { name: "High" }), "0.3");

    const preview = await screen.findByRole("region", { name: "시나리오 실시간 미리보기" });
    await waitFor(() => {
      expect(within(preview).getByText("1,500")).toBeInTheDocument();
      expect(within(preview).getByText("750")).toBeInTheDocument();
      expect(within(preview).getByText("150")).toBeInTheDocument();
    });
    expect(within(preview).getByText("연간 지출 근거가 없어 revenue는 미산정입니다.")).toBeInTheDocument();
  });

  it("preserves decimal strings above Number.MAX_SAFE_INTEGER in preview and submission", async () => {
    const user = userEvent.setup();
    vi.mocked(saveScenarioAction).mockResolvedValue({ ok: true, id: "scenario-large" });
    render(<ScenarioForm
      estimateId="estimate-large"
      currency="KRW"
      entityUnit="enterprise"
      eligibleEntities={{
        low: "9007199254740993",
        base: "9007199254740995",
        high: "9007199254740997",
      }}
    />);

    await user.type(screen.getByRole("textbox", { name: "시나리오 이름" }), "정밀도 보존");
    await user.type(screen.getByRole("spinbutton", { name: "기간 (개월)" }), "12");
    const spend = screen.getByRole("group", { name: "연간 지출 / entity (선택)" });
    for (const label of ["Low", "Base", "High"]) {
      await user.type(within(spend).getByRole("textbox", { name: label }), "9007199254740993");
    }
    for (const groupName of ["서비스 가능 비율 *", "획득 가능 비율 *"]) {
      const group = screen.getByRole("group", { name: groupName });
      for (const label of ["Low", "Base", "High"]) {
        await user.type(within(group).getByRole("textbox", { name: label }), "1");
      }
    }

    const preview = await screen.findByRole("region", { name: "시나리오 실시간 미리보기" });
    await waitFor(() => {
      expect(within(preview).getAllByText("9,007,199,254,740,995")).toHaveLength(3);
    });
    await user.click(screen.getByRole("button", { name: "시나리오 저장" }));
    await waitFor(() => expect(saveScenarioAction).toHaveBeenCalledTimes(1));
    const submitted = vi.mocked(saveScenarioAction).mock.calls[0][0];
    const factors = JSON.parse(String(submitted.get("factors_json"))) as Record<string, unknown>;
    expect(factors).toMatchObject({
      annualSpendPerEntity: {
        low: "9007199254740993",
        base: "9007199254740993",
        high: "9007199254740993",
      },
      serviceabilityRate: { low: "1", base: "1", high: "1" },
      attainableShare: { low: "1", base: "1", high: "1" },
    });
  });
});
