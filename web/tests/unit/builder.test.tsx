import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  calculateEstimateAction: vi.fn(),
  interpretSegmentAction: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  saveSegmentAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }),
}));

vi.mock("@/actions/workbench", () => ({
  calculateEstimateAction: mocks.calculateEstimateAction,
  interpretSegmentAction: mocks.interpretSegmentAction,
  saveSegmentAction: mocks.saveSegmentAction,
}));

import {
  SegmentBuilder,
  type BuilderCondition,
  type BuilderConditionOption,
  type BuilderInitialState,
} from "@/components/builder";

const existingCondition: BuilderCondition = {
  id: "condition-existing",
  sourceId: "core_feature:online_channel",
  sourceKind: "core_feature",
  label: "기존 온라인 채널 조건",
  group: "Feature",
  unit: "enterprise",
  operator: "exists",
  value: "",
  matchStatus: "exact",
  referenceYear: 2025,
  enabled: true,
};

const library: BuilderConditionOption[] = [
  {
    id: "geography:capital-region",
    sourceKind: "geography",
    label: "수도권",
    group: "Geography",
    unit: "all",
    values: ["수도권"],
    status: "exact",
  },
  {
    id: "core_feature:online_channel",
    sourceKind: "core_feature",
    label: "온라인 판매채널",
    group: "Feature",
    unit: "enterprise",
    values: [],
    status: "exact",
  },
];

function initialState(overrides: Partial<BuilderInitialState> = {}): BuilderInitialState {
  return {
    id: "segment-existing",
    name: "Builder component contract",
    entityUnit: "enterprise",
    naturalLanguage: "",
    groups: [{
      id: "group-root",
      logic: "AND",
      enabled: true,
      conditions: [existingCondition],
      groups: [],
    }],
    ...overrides,
  };
}

function dataTransfer() {
  const values = new Map<string, string>();
  return {
    dropEffect: "none",
    effectAllowed: "uninitialized",
    getData: (type: string) => values.get(type) ?? "",
    setData: (type: string, value: string) => values.set(type, value),
  };
}

beforeEach(() => {
  mocks.calculateEstimateAction.mockResolvedValue({ ok: true, id: "estimate-1" });
  mocks.interpretSegmentAction.mockResolvedValue({ ok: false, error: "not_configured" });
  mocks.saveSegmentAction.mockResolvedValue({ ok: true, id: "segment-existing" });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SegmentBuilder interactions", () => {
  it("drops a library condition into the selected group and keeps a keyboard add alternative", async () => {
    const user = userEvent.setup();
    render(<SegmentBuilder library={library} initial={initialState({
      groups: [{ id: "group-root", logic: "AND", enabled: true, conditions: [], groups: [] }],
    })} />);

    const dragCard = screen.getByText("수도권", { exact: true, selector: ".library-option strong" }).closest<HTMLElement>(".library-option");
    const dropTarget = screen.getByRole("group", { name: "조건 그룹 01 드롭 영역" });
    expect(dragCard).not.toBeNull();
    expect(dragCard).toHaveAttribute("draggable", "true");

    const transfer = dataTransfer();
    fireEvent.dragStart(dragCard!, { dataTransfer: transfer });
    fireEvent.dragEnter(dropTarget, { dataTransfer: transfer });
    expect(dropTarget.closest(".condition-group")).toHaveClass("drag-target");
    fireEvent.drop(dropTarget, { dataTransfer: transfer });

    expect(within(dropTarget).getByText("수도권", { exact: true, selector: ".condition-copy strong" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("수도권 조건을 선택한 그룹에 추가했습니다");

    const keyboardAdd = screen.getByRole("button", { name: "온라인 판매채널 추가" });
    keyboardAdd.focus();
    await user.keyboard("{Enter}");
    expect(within(dropTarget).getByText("온라인 판매채널", { exact: true })).toBeInTheDocument();
  });

  it("clones groups and persists group and condition enable states", async () => {
    const user = userEvent.setup();
    render(<SegmentBuilder library={library} initial={initialState()} />);

    await user.click(screen.getByRole("button", { name: "조건 그룹 01 복제" }));
    const dropTargets = screen.getAllByRole("group", { name: /조건 그룹 \d+ 드롭 영역/u });
    expect(dropTargets).toHaveLength(2);
    expect(within(dropTargets[0]).getByText(existingCondition.label, { exact: true })).toBeInTheDocument();
    expect(within(dropTargets[1]).getByText(existingCondition.label, { exact: true })).toBeInTheDocument();

    await user.click(screen.getByLabelText("조건 그룹 02 활성화"));
    await user.click(screen.getAllByLabelText(`${existingCondition.label} 조건 활성화`)[0]);
    await user.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => expect(mocks.saveSegmentAction).toHaveBeenCalledTimes(1));
    const formData = mocks.saveSegmentAction.mock.calls[0][0] as FormData;
    const payload = JSON.parse(String(formData.get("conditions_json"))) as Array<{
      enabled: boolean;
      conditions: Array<{ enabled: boolean }>;
    }>;
    expect(payload).toHaveLength(2);
    expect(payload[0]).toMatchObject({ enabled: true, conditions: [{ enabled: false }] });
    expect(payload[1]).toMatchObject({ enabled: false, conditions: [{ enabled: true }] });
  });

  it("keeps interpreted conditions in a draft until explicit apply and supports cancel", async () => {
    const user = userEvent.setup();
    mocks.interpretSegmentAction.mockResolvedValue({
      ok: true,
      interpretation: {
        suggestedEntityUnit: "household",
        conditions: [
          { sourceId: "geography:capital-region", sourceKind: "geography", label: "수도권", group: "geography", unit: "all", operator: "eq", value: "수도권", matchStatus: "exact" },
          { sourceId: "feature:dual-income", sourceKind: "core_feature", label: "맞벌이", group: "core_feature", unit: "household", operator: "eq", value: "true", matchStatus: "similar" },
          { sourceId: "feature:education-use", sourceKind: "domain_feature", label: "사교육 이용", group: "domain_feature", unit: "household", operator: "eq", value: "high", matchStatus: "proxy" },
          { sourceId: "feature:cost-pressure", sourceKind: "domain_feature", label: "교육비 부담", group: "domain_feature", unit: "household", operator: "eq", value: "high", matchStatus: "ambiguous" },
        ],
        unmatched: ["초등학생 자녀"],
      },
    });
    render(<SegmentBuilder library={library} initial={initialState()} />);

    const question = "수도권 맞벌이 가구 중 초등학생 자녀를 둔 사교육비 부담 가구";
    await user.type(screen.getByRole("textbox", { name: "자연어 질문" }), question);
    await user.click(screen.getByRole("button", { name: "조건 해석" }));

    const draft = await screen.findByRole("region", { name: "자연어 해석 draft" });
    const currentGroup = screen.getByRole("group", { name: "조건 그룹 01 드롭 영역" });
    expect(within(currentGroup).getByText(existingCondition.label, { exact: true })).toBeInTheDocument();
    expect(within(currentGroup).queryByText("수도권", { exact: true })).not.toBeInTheDocument();
    for (const status of ["정확히 매칭", "유사 조건", "대체 proxy", "정의 불명확", "현재 DB 미등록", "추가 조사 필요"]) {
      expect(within(draft).getByText(status, { exact: true })).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "저장" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "시장규모 계산" })).toBeDisabled();

    await user.click(within(draft).getByRole("button", { name: "해석 취소" }));
    expect(screen.queryByRole("region", { name: "자연어 해석 draft" })).not.toBeInTheDocument();
    expect(within(currentGroup).getByText(existingCondition.label, { exact: true })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "조건 해석" }));
    const secondDraft = await screen.findByRole("region", { name: "자연어 해석 draft" });
    await user.click(within(secondDraft).getByRole("button", { name: "해석 적용" }));

    expect(screen.queryByRole("region", { name: "자연어 해석 draft" })).not.toBeInTheDocument();
    const appliedGroup = screen.getByRole("group", { name: "조건 그룹 01 드롭 영역" });
    expect(within(appliedGroup).queryByText(existingCondition.label, { exact: true })).not.toBeInTheDocument();
    expect(within(appliedGroup).getByText("수도권", { exact: true, selector: ".condition-copy strong" })).toBeInTheDocument();
    expect(within(appliedGroup).getByText("맞벌이", { exact: true })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "대상 단위" })).toHaveValue("household");
    const unmatchedValidation = screen.getByText("미매칭 조건", { exact: true }).closest("div");
    expect(unmatchedValidation).not.toBeNull();
    expect(within(unmatchedValidation!).getByText(/초등학생 자녀 · 추가 조사 필요/u)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /미매칭 조건 근거 조사하기/u })).toBeInTheDocument();
  });
});
