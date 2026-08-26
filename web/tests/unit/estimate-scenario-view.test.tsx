import { cleanup, render, screen } from "@testing-library/react";
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

import { EstimateDetail } from "@/components/workbench-views";

const ESTIMATE_ID = "10000000-0000-4000-8000-000000000001";
const FIRST_SCENARIO_ID = "20000000-0000-4000-8000-000000000001";
const SECOND_SCENARIO_ID = "20000000-0000-4000-8000-000000000002";

afterEach(cleanup);

function estimateValue(mode: "explicit" | "unique_active") {
  const selectedId = mode === "explicit" ? SECOND_SCENARIO_ID : FIRST_SCENARIO_ID;
  const selectedVersion = mode === "explicit" ? "user-second" : "user-first";
  const scenarios = [{
    scenario_id: FIRST_SCENARIO_ID,
    scenario_name: "첫 번째 시나리오",
    scenario_version: "user-first",
    scenario_status: "active",
    market_unit: "enterprise",
    tam_entities_low: "90",
    tam_entities_base: "100",
    tam_entities_high: "110",
    sam_entities_low: "45",
    sam_entities_base: "50",
    sam_entities_high: "55",
    som_entities_low: "4",
    som_entities_base: "5",
    som_entities_high: "6",
  }, ...(mode === "explicit" ? [{
    scenario_id: SECOND_SCENARIO_ID,
    scenario_name: "두 번째 시나리오",
    scenario_version: "user-second",
    scenario_status: "active",
    market_unit: "enterprise",
    tam_entities_low: "180",
    tam_entities_base: "200",
    tam_entities_high: "220",
    sam_entities_low: "90",
    sam_entities_base: "100",
    sam_entities_high: "110",
    som_entities_low: "9",
    som_entities_base: "10",
    som_entities_high: "11",
  }] : [])];
  return {
    estimate_id: ESTIMATE_ID,
    id: ESTIMATE_ID,
    name: "시나리오 선택 estimate",
    status: "estimated",
    entity_unit: "enterprise",
    count_low: null,
    count_base: null,
    count_high: null,
    active_market_scenario_count: scenarios.length,
    active_market_scenario_name: mode === "explicit" ? "두 번째 시나리오" : "첫 번째 시나리오",
    active_market_scenario_version: selectedVersion,
    selected_market_scenario_id: selectedId,
    selected_market_scenario_version: selectedVersion,
    market_scenario_selection_mode: mode,
    market_scenarios: scenarios,
    tam_low: mode === "explicit" ? "180" : "90",
    tam: mode === "explicit" ? "200" : "100",
    tam_high: mode === "explicit" ? "220" : "110",
    sam_low: mode === "explicit" ? "90" : "45",
    sam: mode === "explicit" ? "100" : "50",
    sam_high: mode === "explicit" ? "110" : "55",
    som_low: mode === "explicit" ? "9" : "4",
    som: mode === "explicit" ? "10" : "5",
    som_high: mode === "explicit" ? "11" : "6",
    confidence_json: {},
    factors: [],
    sensitivity: [],
    sources_json: [],
    validation_gaps_json: [],
  };
}

describe("estimate scenario selection disclosure", () => {
  it("renders a registered Gold Query spend interval without turning it into aggregate revenue", () => {
    render(<EstimateDetail value={{
      ...estimateValue("unique_active"),
      related_spend_json: {
        metric_code: "monthly_willingness_to_pay_krw",
        display_name: "소액 구독 의향 관련 지출",
        value_low: "1000",
        value_base: "4900",
        value_high: "7900",
        unit: "KRW",
        reference_year: 2024,
        method_code: "query_spend_basis",
        source_release_ids: ["REL-KOCCA-MUSIC-2024"],
        confidence_score: 65,
      },
    }} />);

    expect(screen.getByRole("heading", { name: "소액 구독 의향 관련 지출" })).toBeInTheDocument();
    expect(screen.getByText("1,000 KRW", { exact: true })).toBeInTheDocument();
    expect(screen.getByText("4,900 KRW", { exact: true })).toBeInTheDocument();
    expect(screen.getByText("7,900 KRW", { exact: true })).toBeInTheDocument();
    expect(screen.getByText(/전체 시장 매출로 합산한 값이 아닙니다/)).toBeInTheDocument();
    expect(screen.getByText("대표 질의 지출 근거", { exact: true })).toBeInTheDocument();
  });

  it("links every active scenario to its exact pair and marks the explicit current selection", () => {
    render(<EstimateDetail value={estimateValue("explicit")} />);

    expect(screen.getByText(/명시 선택 · 두 번째 시나리오/)).toBeInTheDocument();
    const current = screen.getByRole("link", { name: "현재 · 명시 선택" });
    expect(current).toHaveAttribute("aria-current", "page");
    expect(current).toHaveAttribute(
      "href",
      `/sizing/${ESTIMATE_ID}?scenarioId=${SECOND_SCENARIO_ID}&scenarioVersion=user-second`,
    );
    expect(screen.getByRole("link", { name: "이 시나리오 선택" })).toHaveAttribute(
      "href",
      `/sizing/${ESTIMATE_ID}?scenarioId=${FIRST_SCENARIO_ID}&scenarioVersion=user-first`,
    );
    const print = screen.getByRole("link", { name: "인쇄 보고서" });
    expect(print.getAttribute("href")).toContain(`scenarioId=${SECOND_SCENARIO_ID}`);
    expect(print.getAttribute("href")).toContain("scenarioVersion=user-second");
    expect(print.getAttribute("href")).toContain("scenarioSelectionMode=explicit");
  });

  it("distinguishes the unique-active automatic selection and locks it into export links", () => {
    render(<EstimateDetail value={estimateValue("unique_active")} />);

    expect(screen.getByText(/유일한 활성 시나리오 자동 선택 · 첫 번째 시나리오/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "현재 · 유일 활성 자동 선택" }))
      .toHaveAttribute("aria-current", "page");
    const print = screen.getByRole("link", { name: "인쇄 보고서" });
    expect(print.getAttribute("href")).toContain(`scenarioId=${FIRST_SCENARIO_ID}`);
    expect(print.getAttribute("href")).toContain("scenarioVersion=user-first");
    expect(print.getAttribute("href")).toContain("scenarioSelectionMode=unique_active");
  });
});
