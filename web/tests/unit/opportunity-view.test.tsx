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

import { OpportunityBoardView, OpportunityDetail } from "@/components/workbench-views";

afterEach(cleanup);

describe("Opportunity snapshot and provenance disclosure", () => {
  it("uses the exact primary-target name carried by segment_snapshots on the Board", () => {
    render(<OpportunityBoardView
      boardValue={{ boards: [{ opportunity_board_id: "board-1" }] }}
      opportunityValue={{ opportunities: [{
        opportunity_id: "opp-1",
        name: "정확한 세그먼트 연결",
        status: "researching",
        segment_name: "오래된 fallback 이름",
        segment_snapshots: [
          { link_role: "context", segment_name: "참고 세그먼트" },
          { link_role: "primary_target", segment_name: "생성 당시 연결 세그먼트" },
        ],
      }] }}
    />);

    expect(screen.getByText("생성 당시 연결 세그먼트", { exact: true })).toBeInTheDocument();
    expect(screen.queryByText("오래된 fallback 이름", { exact: true })).not.toBeInTheDocument();
  });

  it("shows complete interval deltas, score lineage, approved experiment evidence, and before/after history", () => {
    render(<OpportunityDetail value={{
      opportunity_id: "opp-1",
      name: "검증 가능한 Opportunity",
      problem: "반복 업무가 오래 걸린다.",
      hypothesis: "자동화 수요가 있다.",
      idea: "업무 자동화 도구",
      status: "researching",
      segment_name: "실제 연결 세그먼트",
      estimate_snapshot: {
        saved_segment_id: "segment-1",
        query_result_id: "result-pinned",
        estimate_id: "estimate-pinned",
        entity_unit: "enterprise",
        count_low: 80,
        count_base: 100,
        count_high: 120,
        data_version: "kr-v1",
      },
      current_estimate: {
        result_id: "result-current",
        resolved_version_no: 3,
        primary_entity_unit: "enterprise",
        count_low: 90,
        count_base: 130,
        count_high: 150,
      },
      score_components: [{
        metric_code: "market_size",
        raw_value: 70,
        normalized_score: 70,
        weight: 0.2,
        formula: "raw_value × weight",
        source_kind: "user_input",
        source_record_key: "opp-1",
      }],
      current_content: [{
        content_type: "idea_brief",
        source_kind: "ai_hypothesis",
        source_query_result_id: "result-pinned",
        source_market_estimate_id: "market-snapshot-1",
        source_subtype_ids: ["DOM-24-SUB-04"],
        source_archetype_ids: ["ARC-06-001"],
        provider_model: "openai/test-model",
        content: {
          ideaBrief: {
            problemHypothesis: "반복 업무 비용이 크다.",
            solutionIdea: "자동화 가이드",
            evidenceSourceIndexes: [0],
            sourceFeatureIds: ["core_feature:has_online_sales"],
            sourceBehaviorIds: ["behavior:DOM-24-BEH-01"],
            experimentPlan: {
              hypothesis: "담당자가 데모를 신청한다.",
              method: "단일 CTA 랜딩 페이지",
              primaryMetric: "데모 신청률",
              successCriteria: "방문자 대비 5% 이상",
            },
          },
          provenance: {
            researchJobId: "job-1",
            queryResultId: "result-pinned",
            marketEstimateId: "market-snapshot-1",
            sources: [{
              title: "공식 수요 조사",
              institution: "통계 기관",
              referenceYear: 2025,
              locator: "표 3",
              url: "https://example.com/source",
            }],
            citations: [{ sourceIndex: 0, claim: "반복 업무 부담을 뒷받침한다." }],
            sourceConditionVerification: {
              feature: {
                candidates: ["core_feature:has_online_sales"],
                rejected: [],
                verified: [{
                  conditionId: "condition-feature-1",
                  conditionNamespace: "core_feature",
                  sourceCode: "core_feature:has_online_sales",
                  operator: "eq",
                  value: true,
                  entityUnit: "enterprise",
                  referenceYear: 2025,
                  evidenceId: 42,
                  dependencyGroup: "sales_channel",
                  catalogLabel: "온라인 판매 채널 보유",
                }],
              },
              behavior: {
                candidates: ["behavior:DOM-24-BEH-01"],
                rejected: [],
                verified: [{
                  conditionId: "condition-behavior-1",
                  conditionNamespace: "behavior",
                  sourceCode: "behavior:DOM-24-BEH-01",
                  operator: "exists",
                  value: true,
                  entityUnit: "enterprise",
                  referenceYear: null,
                  evidenceId: null,
                  dependencyGroup: null,
                  catalogLabel: "거의 매일 이용 행동",
                }],
              },
            },
          },
        },
      }],
      status_history: [{
        action: "update",
        previous_status: "draft",
        new_status: "researching",
        occurred_at: "2026-08-25T00:00:00.000Z",
        before: { name: "이전 이름", status: "draft" },
        after: { name: "검증 가능한 Opportunity", status: "researching" },
      }],
    }} />);

    expect(screen.getByText("현재 계산 결과", { exact: true })).toBeInTheDocument();
    expect(screen.queryByText("현재 Baseline", { exact: true })).not.toBeInTheDocument();
    expect(screen.getByText("저장 시점 대비 +10 기업", { exact: true })).toBeInTheDocument();
    expect(screen.getAllByText("저장 시점 대비 +30 기업", { exact: true })).toHaveLength(2);
    expect(screen.getByText("근거 유형 사용자 입력 · source record opp-1", { exact: true })).toBeInTheDocument();
    expect(screen.getByText("단일 CTA 랜딩 페이지", { exact: true })).toBeInTheDocument();
    expect(screen.getByText("데모 신청률 · 방문자 대비 5% 이상", { exact: true })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "세그먼트 · 실제 연결 세그먼트" })).toHaveAttribute("href", "/builder/segment-1");
    expect(screen.getByRole("link", { name: "Estimate snapshot · estimate-pinned" })).toHaveAttribute("href", "/sizing/estimate-pinned");
    expect(screen.getByRole("link", { name: "Research Job · job-1" })).toHaveAttribute("href", "/research/jobs/job-1");
    expect(screen.getByRole("link", { name: "Subtype · DOM-24-SUB-04" })).toHaveAttribute("href", "/segments/subtypes/DOM-24-SUB-04");
    expect(screen.getByRole("link", { name: "Archetype · ARC-06-001" })).toHaveAttribute("href", "/archetypes/ARC-06-001");
    expect(screen.getByRole("link", { name: "Feature 조건 검색 · core_feature:has_online_sales" })).toHaveAttribute("href", "/search?q=core_feature%3Ahas_online_sales");
    expect(screen.getByRole("link", { name: "Behavior 조건 검색 · behavior:DOM-24-BEH-01" })).toHaveAttribute("href", "/search?q=behavior%3ADOM-24-BEH-01");
    expect(screen.getByText("core_feature · eq true", { exact: true })).toBeInTheDocument();
    expect(screen.getByText("온라인 판매 채널 보유 · 단위 enterprise · 기준연도 2025 · evidence 42 · dependency sales_channel", { exact: true })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "원문" })).toHaveAttribute("href", "https://example.com/source");
    expect(screen.getByText("반복 업무 부담을 뒷받침한다.", { exact: true })).toBeInTheDocument();
    expect(screen.getByText("전체 before / after 보기", { exact: true })).toBeInTheDocument();
    expect(screen.getByText(/"name": "이전 이름"/u)).toBeInTheDocument();
    expect(screen.getByText(/"name": "검증 가능한 Opportunity"/u)).toBeInTheDocument();
  });
});
