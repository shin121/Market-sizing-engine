import { describe, expect, it } from "vitest";
import { zodTextFormat } from "openai/helpers/zod";

import { researchResultSchema } from "@/contracts/research";

const fixture = {
  researchQuestion: "공식 공동분포가 존재하는가?",
  targetSegment: "검증 세그먼트",
  targetVariable: "serviceability_rate",
  existingBaseline: {
    estimateId: "baseline-1",
    status: "not_estimable" as const,
    value: null,
    lowBaseHigh: null,
    unit: "enterprise",
    denominator: "대한민국 기업",
    definition: "현재 공동분포 근거가 없어 산정 불가",
    sourceTitle: null,
    version: "kr-v0.2.1",
  },
  proposedFactors: [
    {
      name: "공식 조사 비율",
      interval: { low: 0.2, base: 0.25, high: 0.3 },
      denominator: "대한민국의 동일 정의 모집단",
      observationClass: "direct" as const,
      sourceIndexes: [0],
    },
  ],
  lowBaseHigh: { low: 0.2, base: 0.25, high: 0.3 },
  denominator: "대한민국의 동일 정의 모집단",
  geography: "KR",
  referenceYear: 2025,
  sources: [
    {
      institution: "공공기관",
      title: "공식 원자료",
      url: "https://example.go.kr/source",
      publicationDate: "2026-01-01",
      referenceYear: 2025,
      accessedAt: "2026-08-25T00:00:00.000Z",
      locator: "표 1",
      usedValue: 0.25,
      sourceTier: 1,
    },
  ],
  citations: [{ sourceIndex: 0, claim: "기준 비율은 25%다." }],
  inferenceMethod: "공식 표의 직접 관측값에 오차 범위를 적용",
  limitations: ["세부 지역 교차표는 제공되지 않음"],
  confidenceComponents: {
    sourceQuality: 90,
    recency: 85,
    populationFit: 90,
    geographyMatch: 90,
    definitionMatch: 90,
    directObservation: 90,
    proxyStrength: 80,
    dependencySupport: 85,
    sourceConsistency: 90,
    inferenceDirectness: 90,
    modelStability: 85,
    allocationIntegrity: 90,
  },
  variablesToVerify: ["지역 교차분포"],
  affectedSegments: ["segment-1"],
  recommendedAction: "approve" as const,
  opportunityIdeaBrief: null,
};

function opportunityFixture() {
  return {
    ...fixture,
    targetVariable: "opportunity_idea_brief:00000000-0000-4000-8000-000000000123",
    opportunityIdeaBrief: {
      problemHypothesis: "반복적인 수작업이 의사결정을 늦춘다.",
      solutionIdea: "근거가 연결된 의사결정 워크벤치",
      valueProposition: "근거 검토 시간을 줄인다.",
      productPackage: null,
      pricingHypothesis: null,
      channels: ["산업 협회"],
      messageDraft: null,
      landingPageOutline: null,
      interviewGuide: ["현재 검토 흐름은 어떻게 되는가?"],
      experimentPlan: null,
      risks: ["표본 편향"],
      evidenceSourceIndexes: [0],
      sourceFeatureIds: ["core_feature:has_online_sales"],
      sourceBehaviorIds: ["behavior:DOM-24-BEH-01", "tag:DOM-24-TAG-01"],
    },
  };
}

describe("research structured output contract", () => {
  it("accepts a fully traceable structured result", () => {
    expect(researchResultSchema.parse(fixture).sources[0].sourceTier).toBe(1);
  });

  it("converts to an OpenAI strict Structured Outputs schema", () => {
    const format = zodTextFormat(researchResultSchema, "market_research_result");
    expect(JSON.stringify(format)).not.toContain('"format":"uri"');
  });

  it.each(["not-a-url", "ftp://example.go.kr/source"])(
    "rejects a non-HTTP original source URL: %s",
    (url) => {
      const invalid = { ...fixture, sources: [{ ...fixture.sources[0], url }] };
      expect(researchResultSchema.safeParse(invalid).success).toBe(false);
    },
  );

  it("rejects citations that do not resolve to an original source", () => {
    const invalid = { ...fixture, citations: [{ sourceIndex: 4, claim: "출처 없는 주장" }] };
    expect(researchResultSchema.safeParse(invalid).success).toBe(false);
  });

  it("rejects reversed Low/Base/High intervals", () => {
    const invalid = { ...fixture, lowBaseHigh: { low: 0.4, base: 0.3, high: 0.2 } };
    expect(researchResultSchema.safeParse(invalid).success).toBe(false);
  });

  it.each([
    "2025-02-29",
    "2026-02-30",
    "2026-13-01",
    "2026-01-01T00:00:00.000Z",
    "unknown",
  ])("rejects a publication date that is not a strict ISO calendar date: %s", (publicationDate) => {
    const invalid = {
      ...fixture,
      sources: [{ ...fixture.sources[0], publicationDate }],
    };
    expect(researchResultSchema.safeParse(invalid).success).toBe(false);
  });

  it("rejects an ordinary factor proposal whose aggregate interval cannot be materialized", () => {
    const invalid = { ...fixture, lowBaseHigh: null };
    const parsed = researchResultSchema.safeParse(invalid);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: ["lowBaseHigh"] }),
      ]));
    }
  });

  it("rejects a numeric Low/Base/High proposal without an original source and citation", () => {
    const invalid = { ...fixture, proposedFactors: [], sources: [], citations: [] };
    const parsed = researchResultSchema.safeParse(invalid);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.map((issue) => issue.message)).toEqual(expect.arrayContaining([
        "Numeric research proposals require at least one original source.",
        "Numeric research proposals require at least one citation.",
      ]));
    }
  });

  it("requires every numeric factor to resolve to a cited source with an explicit used value", () => {
    const uncitedSource = {
      ...fixture.sources[0],
      title: "별도 공식 원자료",
      url: "https://example.go.kr/other-source",
    };
    const invalid = {
      ...fixture,
      sources: [...fixture.sources, uncitedSource],
      citations: [{ sourceIndex: 1, claim: "별도 출처의 주장" }],
    };
    expect(researchResultSchema.safeParse(invalid).success).toBe(false);
    expect(researchResultSchema.safeParse({
      ...fixture,
      proposedFactors: [{ ...fixture.proposedFactors[0], sourceIndexes: [] }],
    }).success).toBe(false);
    expect(researchResultSchema.safeParse({
      ...fixture,
      sources: [{ ...fixture.sources[0], usedValue: null }],
    }).success).toBe(false);
  });

  it("still permits an explicit not-estimable result with no invented numeric evidence", () => {
    const notEstimable = {
      ...fixture,
      proposedFactors: [],
      lowBaseHigh: null,
      referenceYear: null,
      sources: [],
      citations: [],
      recommendedAction: "research_more" as const,
    };
    expect(researchResultSchema.safeParse(notEstimable).success).toBe(true);
  });

  it("caps serialized strings and repeated arrays", () => {
    expect(researchResultSchema.safeParse({ ...fixture, researchQuestion: "x".repeat(8_001) }).success).toBe(false);
    expect(researchResultSchema.safeParse({
      ...fixture,
      limitations: Array.from({ length: 65 }, (_, index) => `제약 ${index}`),
    }).success).toBe(false);
  });

  it("requires a source-pinned nullable idea brief only for opportunity idea jobs", () => {
    const opportunity = opportunityFixture();
    expect(researchResultSchema.safeParse(opportunity).success).toBe(true);
    expect(researchResultSchema.safeParse({ ...opportunity, opportunityIdeaBrief: null }).success).toBe(false);
    expect(researchResultSchema.safeParse({ ...fixture, opportunityIdeaBrief: opportunity.opportunityIdeaBrief }).success).toBe(false);
  });

  it("rejects opportunity idea briefs with empty, duplicate, missing, or uncited evidence", () => {
    const opportunity = opportunityFixture();
    const issueMessages = (value: unknown) => {
      const parsed = researchResultSchema.safeParse(value);
      expect(parsed.success).toBe(false);
      return parsed.success ? [] : parsed.error.issues.map((issue) => issue.message);
    };

    expect(issueMessages({ ...opportunity, sources: [] }))
      .toContain("Opportunity idea research requires at least one original source.");
    expect(issueMessages({ ...opportunity, citations: [] }))
      .toContain("Opportunity idea research requires at least one citation.");
    expect(issueMessages({
      ...opportunity,
      opportunityIdeaBrief: { ...opportunity.opportunityIdeaBrief, evidenceSourceIndexes: [] },
    })).toContain("Opportunity idea evidence source indexes cannot be empty.");
    expect(issueMessages({
      ...opportunity,
      opportunityIdeaBrief: { ...opportunity.opportunityIdeaBrief, evidenceSourceIndexes: [0, 0] },
    })).toContain("Opportunity idea evidence source indexes must be unique.");
    expect(issueMessages({
      ...opportunity,
      opportunityIdeaBrief: { ...opportunity.opportunityIdeaBrief, evidenceSourceIndexes: [1] },
    })).toEqual(expect.arrayContaining([
      "Opportunity idea source index 1 does not exist.",
      "Opportunity idea source index 1 must have a matching citation.",
    ]));

    const secondSource = {
      ...fixture.sources[0],
      title: "두 번째 공식 원자료",
      url: "https://example.go.kr/source-2",
    };
    expect(issueMessages({
      ...opportunity,
      sources: [...opportunity.sources, secondSource],
      opportunityIdeaBrief: { ...opportunity.opportunityIdeaBrief, evidenceSourceIndexes: [1] },
    })).toContain("Opportunity idea source index 1 must have a matching citation.");
    expect(researchResultSchema.safeParse({
      ...opportunity,
      sources: [...opportunity.sources, secondSource],
      citations: [...opportunity.citations, { sourceIndex: 1, claim: "두 번째 출처가 가설을 뒷받침한다." }],
      opportunityIdeaBrief: { ...opportunity.opportunityIdeaBrief, evidenceSourceIndexes: [1] },
    }).success).toBe(true);
  });

  it("requires explicit, unique registry IDs for feature and behavior idea sources", () => {
    const opportunity = opportunityFixture();
    expect(researchResultSchema.safeParse({
      ...opportunity,
      opportunityIdeaBrief: {
        ...opportunity.opportunityIdeaBrief,
        sourceFeatureIds: ["core_feature:has_online_sales", "core_feature:has_online_sales"],
      },
    }).success).toBe(false);
    expect(researchResultSchema.safeParse({
      ...opportunity,
      opportunityIdeaBrief: {
        ...opportunity.opportunityIdeaBrief,
        sourceBehaviorIds: ["tag:DOM-24-TAG-01", "tag:DOM-24-TAG-01"],
      },
    }).success).toBe(false);
    expect(researchResultSchema.safeParse({
      ...opportunity,
      opportunityIdeaBrief: {
        ...opportunity.opportunityIdeaBrief,
        sourceFeatureIds: ["behavior:DOM-24-BEH-01"],
      },
    }).success).toBe(false);
    expect(researchResultSchema.safeParse({
      ...opportunity,
      opportunityIdeaBrief: {
        ...opportunity.opportunityIdeaBrief,
        sourceBehaviorIds: ["core_feature:has_online_sales"],
      },
    }).success).toBe(false);
    const withoutFeatureIds = Object.fromEntries(
      Object.entries(opportunity.opportunityIdeaBrief).filter(([key]) => key !== "sourceFeatureIds"),
    );
    expect(researchResultSchema.safeParse({
      ...opportunity,
      opportunityIdeaBrief: withoutFeatureIds,
    }).success).toBe(false);
  });
});
