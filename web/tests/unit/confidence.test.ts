import { describe, expect, it } from "vitest";

import { calculateConfidence } from "@/domain/confidence";

describe("calculateConfidence", () => {
  it("applies explicit penalties after rule-based components", () => {
    const components = {
      sourceQuality: 80,
      recency: 70,
      populationFit: 80,
      geographyMatch: 70,
      definitionMatch: 70,
      directObservation: 60,
      proxyStrength: 50,
      dependencySupport: 40,
      sourceConsistency: 70,
      inferenceDirectness: 60,
      modelStability: 80,
      allocationIntegrity: 100,
    };
    const unpenalized = calculateConfidence(components);
    const penalized = calculateConfidence(components, [{ code: "independence", points: 10, reason: "공동관측 없음" }]);
    expect(penalized.score).toBe(unpenalized.score - 10);
    expect(penalized.penalties[0]?.code).toBe("independence");
  });
});
