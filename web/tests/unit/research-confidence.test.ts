import { describe, expect, it } from "vitest";

import { researchResultSchema } from "@/contracts/research";
import {
  calculateCanonicalResearchConfidence,
  calculateResearchConfidence,
  RESEARCH_CONFIDENCE_RULE_VERSION,
} from "@/domain/research-confidence";
import { researchResultFromProposedReview } from "@/server/services/research-values";

const providerComponents = {
  sourceQuality: 99,
  recency: 99,
  populationFit: 99,
  geographyMatch: 99,
  definitionMatch: 99,
  directObservation: 99,
  proxyStrength: 99,
  dependencySupport: 99,
  sourceConsistency: 99,
  inferenceDirectness: 99,
  modelStability: 99,
  allocationIntegrity: 99,
};

const result = researchResultSchema.parse({
  researchQuestion: "공식 공동분포가 존재하는가?",
  targetSegment: "검증 세그먼트",
  targetVariable: "serviceability_rate",
  existingBaseline: {
    estimateId: "baseline-1",
    status: "not_estimable",
    value: null,
    lowBaseHigh: null,
    unit: "enterprise",
    denominator: "대한민국 기업",
    definition: "현재 공동분포 근거가 없어 산정 불가",
    sourceTitle: null,
    version: "kr-v0.2.1",
  },
  proposedFactors: [{
    name: "공식 조사 비율",
    interval: { low: 0.2, base: 0.25, high: 0.3 },
    denominator: "대한민국 기업",
    observationClass: "direct",
    sourceIndexes: [0, 1],
  }],
  lowBaseHigh: { low: 0.2, base: 0.25, high: 0.3 },
  denominator: "대한민국 기업",
  geography: "KR",
  referenceYear: 2025,
  sources: [
    {
      institution: "대한민국 공공기관",
      title: "대한민국 공식 원자료",
      url: "https://example.go.kr/source-a",
      publicationDate: "2026-01-01",
      referenceYear: 2025,
      accessedAt: "2026-08-25T00:00:00.000Z",
      locator: "전국 표 1",
      usedValue: 0.25,
      sourceTier: 1,
    },
    {
      institution: "한국 통계기관",
      title: "한국 기업 보조표",
      url: "https://example.go.kr/source-b",
      publicationDate: "2026-02-01",
      referenceYear: 2025,
      accessedAt: "2026-08-25T00:00:00.000Z",
      locator: "전국 부표 2",
      usedValue: 0.24,
      sourceTier: 2,
    },
  ],
  citations: [
    { sourceIndex: 0, claim: "공식 조사 비율은 25%다." },
    { sourceIndex: 1, claim: "보조표의 비교 비율은 24%다." },
  ],
  inferenceMethod: "동일 분모 공식 표의 직접 관측값을 범위로 표현",
  limitations: ["세부 지역 교차표는 제공되지 않음"],
  confidenceComponents: providerComponents,
  variablesToVerify: ["세부 지역 교차분포"],
  affectedSegments: ["segment-1"],
  recommendedAction: "approve",
  opportunityIdeaBrief: null,
});

describe("calculateResearchConfidence", () => {
  it("calculates all twelve authoritative components and rule metadata deterministically", () => {
    const first = calculateResearchConfidence(result);
    const second = calculateResearchConfidence(result);

    expect(first).toEqual(second);
    expect(first.ruleVersion).toBe(RESEARCH_CONFIDENCE_RULE_VERSION);
    expect(Object.keys(first.components)).toHaveLength(12);
    expect(first.signals).toMatchObject({
      sourceCount: 2,
      referencedSourceCount: 2,
      factorCount: 1,
      directFactorCount: 1,
      asOfYear: 2026,
    });
    expect(first.score).toBeGreaterThanOrEqual(70);
  });

  it("does not use provider-proposed component scores as authoritative inputs", () => {
    const providerZeroes = researchResultSchema.parse({
      ...result,
      confidenceComponents: Object.fromEntries(Object.keys(providerComponents).map((key) => [key, 0])),
    });

    expect(calculateResearchConfidence(providerZeroes)).toEqual(calculateResearchConfidence(result));
  });

  it("uses canonical job identity and baseline instead of a mismatched provider echo", () => {
    const mismatchedEcho = researchResultSchema.parse({
      ...result,
      researchQuestion: "provider가 바꾼 질문",
      targetSegment: "provider가 바꾼 세그먼트",
      targetVariable: "provider_changed_variable",
      existingBaseline: {
        ...result.existingBaseline,
        denominator: "일치하지 않는 모집단",
        definition: "provider가 바꾼 baseline 정의",
      },
    });
    const canonical = calculateCanonicalResearchConfidence(mismatchedEcho, {
      researchQuestion: result.researchQuestion,
      targetSegment: result.targetSegment,
      targetVariable: result.targetVariable,
      existingBaseline: result.existingBaseline,
    }, { asOfYear: 2026 });

    expect(canonical).toEqual(calculateResearchConfidence(result, { asOfYear: 2026 }));
  });

  it("reduces confidence through observable tier, recency, and inference penalties", () => {
    const weak = researchResultSchema.parse({
      ...result,
      proposedFactors: [{
        ...result.proposedFactors[0],
        observationClass: "inferred",
        sourceIndexes: [0],
      }],
      sources: [{
        ...result.sources[0],
        institution: "AI inference",
        title: "한국 합성 추론",
        publicationDate: "2010-01-01",
        referenceYear: 2010,
        usedValue: 0.25,
        sourceTier: 8,
      }],
      citations: [{ sourceIndex: 0, claim: "합성 추론 비율은 25%다." }],
    });
    const strongAssessment = calculateResearchConfidence(result, { asOfYear: 2026 });
    const weakAssessment = calculateResearchConfidence(weak, { asOfYear: 2026 });
    const penaltyCodes = weakAssessment.penalties.map((penalty) => penalty.code);

    expect(weakAssessment.score).toBeLessThan(strongAssessment.score);
    expect(penaltyCodes).toEqual(expect.arrayContaining([
      "ai_inference_source",
      "no_direct_observation",
      "inferred_factor",
      "single_source",
      "stale_source",
    ]));
  });

  it("rejects an invalid explicit assessment year", () => {
    expect(() => calculateResearchConfidence(result, { asOfYear: 1800 })).toThrow(
      "research_confidence_as_of_year_invalid",
    );
  });

  it("rebuilds reviewer modifications and ignores stale or adversarial confidence fields", () => {
    const staleStrongAssessment = calculateResearchConfidence(result, { asOfYear: 2026 });
    const rebuilt = researchResultFromProposedReview({
      proposed: {
        researchQuestion: "조작된 질문",
        targetSegment: "조작된 세그먼트",
        targetVariable: "조작된 변수",
        factors: [{
          name: "합성 추론 비율",
          interval: { low: 0.1, base: 0.25, high: 0.9 },
          denominator: "대한민국 기업",
          observationClass: "inferred",
          sourceIndexes: [0],
        }],
        lowBaseHigh: { low: 0.1, base: 0.25, high: 0.9 },
        denominator: "대한민국 기업",
        geography: "KR",
        referenceYear: 2010,
        sources: [{
          ...result.sources[0],
          institution: "AI inference",
          title: "한국 합성 추론",
          publicationDate: "2010-01-01",
          referenceYear: 2010,
          sourceTier: 8,
        }],
        citations: [{ sourceIndex: 0, claim: "합성 추론 비율은 25%다." }],
        inferenceMethod: "검토자가 수정한 합성 추론",
        limitations: ["직접 관측이 없다."],
        variablesToVerify: ["공식 직접 관측값"],
        opportunityIdeaBrief: null,
        providerConfidenceComponents: providerComponents,
        serverConfidenceAssessment: staleStrongAssessment,
        confidenceComponents: providerComponents,
        confidencePenalties: [],
        confidenceScore: 100,
        confidenceGrade: "A",
        confidenceRuleVersion: "attacker-rule-v999",
      },
      baseline: result.existingBaseline,
      affectedSegments: [],
      researchQuestion: result.researchQuestion,
      targetSegment: result.targetSegment,
      targetVariable: result.targetVariable,
    });
    const recalculated = calculateResearchConfidence(rebuilt, { asOfYear: 2026 });

    expect(rebuilt.researchQuestion).toBe(result.researchQuestion);
    expect(rebuilt.targetSegment).toBe(result.targetSegment);
    expect(recalculated.score).toBeLessThan(staleStrongAssessment.score);
    expect(recalculated.components.sourceQuality).toBe(20);
    expect(recalculated.components.directObservation).toBe(0);
    expect(recalculated.ruleVersion).toBe(RESEARCH_CONFIDENCE_RULE_VERSION);
  });
});
