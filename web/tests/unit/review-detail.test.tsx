import { cleanup, render, screen, within } from "@testing-library/react";
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

import { ReviewDetail } from "@/components/workbench-views";

afterEach(cleanup);

const reviewFixture = {
  review_id: "00000000-0000-4000-8000-000000000001",
  status: "pending",
  research_job: { research_question: "공식 근거로 기준값을 갱신할 것인가?" },
  proposed_revision: {
    status: "pending_review",
    baseline_data_version: "kr-v1",
    baseline_payload: {
      status: "estimated",
      value: 100,
      lowBaseHigh: { low: 90, base: 100, high: 110 },
      denominator: "대한민국 기업",
      unit: "enterprise",
      definition: "승인된 canonical snapshot",
    },
    proposed_payload: {
      lowBaseHigh: { low: 100, base: 120, high: 140 },
      denominator: "대한민국 기업",
      referenceYear: 2025,
      inferenceMethod: "공식 표의 직접 관측값을 같은 분모에 적용",
      factors: [{
        name: "공식 조사 비율",
        interval: { low: 0.1, base: 0.12, high: 0.14 },
        observationClass: "direct",
      }],
      limitations: ["지역별 교차표가 없다."],
      sources: [{
        institution: "공공기관",
        title: "공식 원자료",
        url: "https://example.go.kr/source",
        publicationDate: "2026-01-01",
        referenceYear: 2025,
        accessedAt: "2026-08-20T00:00:00.000Z",
        locator: "표 1",
      }],
      citations: [{ sourceIndex: 0, claim: "공식 표가 제안값을 뒷받침한다." }],
    },
    delta_summary: {
      comparison: {
        denominator: { baseline: "대한민국 기업", proposed: "대한민국 기업", status: "matching" },
        value: {
          baseline: 100,
          proposed: 120,
          absoluteChange: "20",
          relativeChangePercent: "20",
          status: "comparable",
        },
        interval: {
          baseline: { low: 90, base: 100, high: 110 },
          proposed: { low: 100, base: 120, high: 140 },
          absoluteChange: { low: "10", base: "20", high: "30" },
          status: "comparable",
        },
      },
      confidence: {
        baseline: { score: 70, grade: "C" },
        proposed: { score: 82, grade: "B" },
        scoreChange: 12,
        gradeChanged: true,
      },
      sourceFreshness: [{
        sourceIndex: 0,
        publicationDate: "2026-01-01",
        referenceYear: 2025,
        accessedAt: "2026-08-20T00:00:00.000Z",
        daysSincePublication: 236,
        yearsSinceReference: 1,
        daysSinceAccess: 5,
        status: "current",
      }],
    },
    affected_segments: ["segment-001"],
    expected_recalculation: {
      affectedSegmentCount: 1,
      affectedSegmentIds: ["segment-001"],
      invalidationRequired: true,
      recalculationRequired: true,
      trigger: "on_approved_revision_materialization",
      expectedAction: "invalidate_and_recalculate_affected_segments",
    },
  },
};

describe("ReviewDetail", () => {
  it("renders a complete governed before/after review and all five decisions", () => {
    render(<ReviewDetail value={reviewFixture} />);

    expect(screen.getByRole("heading", { name: "공식 근거로 기준값을 갱신할 것인가?" })).toBeInTheDocument();
    expect(screen.getByText("승인된 canonical snapshot")).toBeInTheDocument();
    expect(screen.getAllByText("90 / 100 / 110").length).toBeGreaterThan(0);
    expect(screen.getAllByText("100 / 120 / 140").length).toBeGreaterThan(0);

    const deltaPanel = screen.getByRole("heading", { name: "변경량" }).closest("article");
    expect(deltaPanel).not.toBeNull();
    expect(within(deltaPanel!).getAllByText("+20", { exact: true })).toHaveLength(2);
    expect(within(deltaPanel!).getByText("+20%", { exact: true })).toBeInTheDocument();
    expect(within(deltaPanel!).getByText("70.00 / 100 · C", { exact: true })).toBeInTheDocument();
    expect(within(deltaPanel!).getByText("82.00 / 100 · B", { exact: true })).toBeInTheDocument();
    expect(within(deltaPanel!).getByText("+12", { exact: true })).toBeInTheDocument();

    expect(screen.getByText("segment-001", { exact: true })).toBeInTheDocument();
    expect(screen.getByText("지역별 교차표가 없다.", { exact: true })).toBeInTheDocument();
    expect(screen.getByText(/공공기관 · 기준연도 2025 · 최신/u)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "원문" })).toHaveAttribute("href", "https://example.go.kr/source");

    for (const action of ["승인", "수정 후 승인", "추가 조사", "반려", "기존 값 유지"]) {
      expect(screen.getByRole("button", { name: action })).toBeInTheDocument();
    }
  });
});
