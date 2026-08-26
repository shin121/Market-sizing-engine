import { z } from "zod";

export const confidenceComponentsSchema = z.object({
  sourceQuality: z.number().min(0).max(100),
  recency: z.number().min(0).max(100),
  populationFit: z.number().min(0).max(100),
  geographyMatch: z.number().min(0).max(100),
  definitionMatch: z.number().min(0).max(100),
  directObservation: z.number().min(0).max(100),
  proxyStrength: z.number().min(0).max(100),
  dependencySupport: z.number().min(0).max(100),
  sourceConsistency: z.number().min(0).max(100),
  inferenceDirectness: z.number().min(0).max(100),
  modelStability: z.number().min(0).max(100),
  allocationIntegrity: z.number().min(0).max(100),
}).strict();

export type ConfidenceComponents = z.infer<typeof confidenceComponentsSchema>;

const weights: Record<keyof ConfidenceComponents, number> = {
  sourceQuality: 0.18,
  recency: 0.1,
  populationFit: 0.1,
  geographyMatch: 0.08,
  definitionMatch: 0.1,
  directObservation: 0.1,
  proxyStrength: 0.07,
  dependencySupport: 0.1,
  sourceConsistency: 0.05,
  inferenceDirectness: 0.05,
  modelStability: 0.04,
  allocationIntegrity: 0.03,
};

export function confidenceGrade(score: number): "A" | "B" | "C" | "D" | "E" {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  if (score >= 40) return "D";
  return "E";
}

export function calculateConfidence(
  components: ConfidenceComponents,
  penalties: readonly { code: string; points: number; reason: string }[] = [],
): { score: number; grade: "A" | "B" | "C" | "D" | "E"; components: ConfidenceComponents; penalties: typeof penalties } {
  const parsed = confidenceComponentsSchema.parse(components);
  const weighted = (Object.keys(weights) as (keyof ConfidenceComponents)[]).reduce(
    (total, key) => total + parsed[key] * weights[key],
    0,
  );
  const penalty = penalties.reduce((total, item) => total + Math.max(0, item.points), 0);
  const score = Math.max(0, Math.min(100, Math.round(weighted - penalty)));
  return { score, grade: confidenceGrade(score), components: parsed, penalties };
}
