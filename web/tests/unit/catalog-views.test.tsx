import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/comparison-selection", () => ({
  AddToComparisonButton: () => null,
}));

vi.mock("@/components/workbench-controls", () => ({
  SaveCatalogSegmentButton: () => null,
}));

import { ArchetypeDirectory, AxisOverview, DomainOverview, SubtypeProfile } from "@/components/catalog-views";

afterEach(cleanup);

const axis = {
  axisCode: "object",
  description: "누구를 대상으로 하는지 구분합니다.",
  status: "applicable",
  allowedValues: ["개인", "가구"],
  domainSubtypeCount: 4,
  subtypeCount: null,
};

describe("catalog truthfulness states", () => {
  it("keeps the domain total separate from an unregistered direct axis relationship", () => {
    render(<DomainOverview value={{
      domainId: "domain-1",
      domainCode: "education_learning",
      nameKo: "교육·학습",
      description: "교육 시장",
      primaryEntityUnit: "person",
      coverageStatus: "complete",
      primarySubtypeCount: 4,
      reusableArchetypeCount: 8,
      featureCount: 2,
      behaviorCount: 1,
      axes: [axis],
    }} />);

    expect(screen.getByText("Domain Primary Subtype")).toBeInTheDocument();
    expect(screen.getByText("직접 연결 미등록", { exact: true })).toBeInTheDocument();
    expect(screen.queryByText("4 subtype", { exact: true })).not.toBeInTheDocument();
  });

  it("labels direct and domain-wide subtype counts independently on the axis detail", () => {
    render(<AxisOverview axisValue={axis} subtypeValue={[]} domainCode="education_learning" />);

    const context = screen.getByRole("heading", { name: "연결 정보" }).closest("article");
    expect(context).not.toBeNull();
    expect(within(context!).getByText("직접 연결 Subtype")).toBeInTheDocument();
    expect(within(context!).getByText("직접 연결 미등록", { exact: true })).toBeInTheDocument();
    expect(within(context!).getByText("Domain 전체 Primary Subtype")).toBeInTheDocument();
    expect(within(context!).getByText("4", { exact: true })).toBeInTheDocument();
  });

  it("uses registered subtype label status and evidence boundary", () => {
    render(<SubtypeProfile value={{
      subtypeId: "DOM-24-SUB-04",
      nameKo: "검증 대기 Subtype",
      definition: "모델 사후해석으로 구성된 subtype입니다.",
      primaryEntityUnit: "person",
      labelStatus: "post_hoc_interpreted",
      evidenceBoundary: "unverified_do_not_claim",
    }} />);

    expect(screen.getByText("사후 해석 라벨", { exact: true })).toBeInTheDocument();
    expect(screen.getByText("Subtype 라벨 상태 · 사후 해석 라벨", { exact: true })).toBeInTheDocument();
    expect(screen.queryByText("post_hoc_interpreted", { exact: true })).not.toBeInTheDocument();
    expect(screen.getByText("외부 플랫폼 주장 금지 · 검증 필요", { exact: true })).toBeInTheDocument();
    expect(screen.queryByText("unverified_do_not_claim", { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByText("상태 미확인", { exact: true })).not.toBeInTheDocument();
  });

  it("marks paged archetype rows for browser-native render virtualization", () => {
    render(<ArchetypeDirectory value={{
      archetypes: [{
        archetypeId: "ARC-06-001",
        nameKo: "홈페이지 미보유 60대 음식점 사업자",
        entityUnit: "enterprise",
        status: "estimated",
        countBase: 81767,
      }],
      page: 2,
      pageSize: 50,
      registryTotal: 1440,
      hasNext: true,
    }} filters={{}} />);

    const row = screen.getByRole("row", { name: /홈페이지 미보유 60대 음식점 사업자/u });
    expect(row).toHaveClass("content-virtualized-row");
    expect(row).toHaveAttribute("data-result-index", "51");
  });
});
