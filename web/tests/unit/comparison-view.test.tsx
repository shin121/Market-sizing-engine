import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/comparison-selection", () => ({
  ComparisonSelection: () => null,
}));

vi.mock("@/components/workbench-controls", () => ({
  CancelResearchButton: () => null,
  ExportButtons: () => null,
  OpportunityCreateForm: () => null,
  OpportunityEditor: () => null,
  ResearchCreateForm: () => null,
  ReviewActions: () => null,
  SaveComparisonForm: () => null,
  ScenarioForm: () => null,
}));

import { ComparisonView } from "@/components/workbench-views";

afterEach(cleanup);

function member(id: string, name: string, normalizedMetrics: Record<string, unknown>) {
  return {
    id,
    name,
    primary_entity_unit: "enterprise",
    source_kind: "query_result",
    normalized_metrics: {
      raw_count_low: "80",
      raw_count_base: "100",
      raw_count_high: "120",
      normalized_count_score: 50,
      confidence_score: "70",
      confidence_grade: "C",
      validation_gap_count: "1",
      direct_observation_share: "0.5",
      estimate_updated_at: "2026-08-25T00:00:00.000Z",
      metric_unavailable_reasons: {},
      ...normalizedMetrics,
    },
  };
}

describe("comparison market scenario disclosure", () => {
  it("shows the pinned scenario and actual annual-spend override while explaining ambiguous and entity-only states", () => {
    const selectedScenarioId = "10000000-0000-4000-8000-000000000001";
    render(<ComparisonView value={{
      name: "시나리오 무결성 비교",
      items: [
        member("20000000-0000-4000-8000-000000000001", "단일 시나리오", {
          raw_count_low: "9007199254740993",
          raw_count_base: "9007199254740993",
          raw_count_high: "9007199254740993",
          active_market_scenario_count: 1,
          market_scenario_id: selectedScenarioId,
          market_scenario_name: "6개월 검증 시나리오",
          market_scenario_version: "user-abc123",
          market_horizon_months: 6,
          tam_entities_base: "9007199254740993",
          sam_entities_base: "30",
          som_entities_base: "3",
          tam_revenue_base: "9007199254740993",
          sam_revenue_base: "1800000",
          som_revenue_base: "180000",
          annual_spend_per_entity: "9007199254740993",
          annual_spend_per_entity_unit: "KRW/entity/year",
          currency: "KRW",
        }),
        member("20000000-0000-4000-8000-000000000002", "Entity-only 시나리오", {
          active_market_scenario_count: 1,
          market_scenario_id: "10000000-0000-4000-8000-000000000002",
          market_scenario_name: "Entity-only",
          market_scenario_version: "user-entity",
          market_horizon_months: 12,
          tam_entities_base: 200,
          sam_entities_base: 60,
          som_entities_base: 6,
          tam_revenue_base: null,
          sam_revenue_base: null,
          som_revenue_base: null,
          annual_spend_per_entity: null,
          currency: "KRW",
          metric_unavailable_reasons: {
            tam_revenue_base: "annual_spend_evidence_not_available",
            sam_revenue_base: "annual_spend_evidence_not_available",
            som_revenue_base: "annual_spend_evidence_not_available",
            annual_spend_per_entity: "annual_spend_evidence_not_available",
          },
        }),
        member("20000000-0000-4000-8000-000000000003", "시나리오 모호", {
          active_market_scenario_count: 2,
          market_scenario_id: null,
          tam_entities_base: null,
          sam_entities_base: null,
          som_entities_base: null,
          tam_revenue_base: null,
          sam_revenue_base: null,
          som_revenue_base: null,
          annual_spend_per_entity: null,
          currency: null,
          metric_unavailable_reasons: {
            market_scenario_id: "multiple_active_market_scenarios_require_explicit_selection",
            tam_entities_base: "multiple_active_market_scenarios_require_explicit_selection",
            sam_entities_base: "multiple_active_market_scenarios_require_explicit_selection",
            som_entities_base: "multiple_active_market_scenarios_require_explicit_selection",
            tam_revenue_base: "multiple_active_market_scenarios_require_explicit_selection",
            sam_revenue_base: "multiple_active_market_scenarios_require_explicit_selection",
            som_revenue_base: "multiple_active_market_scenarios_require_explicit_selection",
            annual_spend_per_entity: "multiple_active_market_scenarios_require_explicit_selection",
          },
        }),
      ],
    }} />);

    expect(screen.getByRole("columnheader", { name: "선택 시나리오" })).toBeInTheDocument();
    expect(screen.getByText("6개월 검증 시나리오", { exact: true })).toBeInTheDocument();
    expect(screen.getByText("버전 user-abc123 · 6개월", { exact: true })).toBeInTheDocument();
    expect(screen.getByText(selectedScenarioId, { exact: true })).toBeInTheDocument();
    expect(screen.getAllByText("9,007,199,254,740,993 기업", { exact: true }).length).toBeGreaterThanOrEqual(5);
    expect(screen.getAllByText("9,007,199,254,740,993 KRW", { exact: true }).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("KRW/entity/year", { exact: true })).toBeInTheDocument();
    expect(screen.getAllByText("활성 시나리오는 있지만 연간 지출 근거가 없어 revenue를 산정하지 않았습니다.").length).toBeGreaterThanOrEqual(4);
    expect(screen.getAllByText("활성 시나리오가 여러 개라 사용할 시나리오를 명시적으로 선택해야 합니다.").length).toBeGreaterThanOrEqual(1);
  });
});
