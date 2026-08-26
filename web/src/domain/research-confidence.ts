import Decimal from "decimal.js";

import type { ResearchResult } from "@/contracts/research";
import {
  calculateConfidence,
  type ConfidenceComponents,
} from "@/domain/confidence";

export const RESEARCH_CONFIDENCE_RULE_VERSION = "research-confidence-v1";

export interface ResearchConfidenceSignals {
  sourceCount: number;
  referencedSourceCount: number;
  citationCount: number;
  factorCount: number;
  directFactorCount: number;
  proxyFactorCount: number;
  inferredFactorCount: number;
  numericProposal: boolean;
  resultReferenceYear: number | null;
  asOfYear: number | null;
}

export interface ResearchConfidenceAssessment {
  ruleVersion: typeof RESEARCH_CONFIDENCE_RULE_VERSION;
  score: number;
  grade: "A" | "B" | "C" | "D" | "E";
  components: ConfidenceComponents;
  penalties: readonly { code: string; points: number; reason: string }[];
  signals: ResearchConfidenceSignals;
}

export function calculateCanonicalResearchConfidence(
  providerResult: ResearchResult,
  canonical: {
    researchQuestion: string;
    targetSegment: string;
    targetVariable: string;
    existingBaseline: ResearchResult["existingBaseline"];
  },
  options: { asOfYear?: number | null } = {},
): ResearchConfidenceAssessment {
  return calculateResearchConfidence({ ...providerResult, ...canonical }, options);
}

const SOURCE_TIER_SCORE: Record<number, number> = {
  1: 100,
  2: 92,
  3: 84,
  4: 76,
  5: 68,
  6: 58,
  7: 45,
  8: 20,
};

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Number(value.toFixed(2))));
}

function average(values: readonly number[], fallback = 0): number {
  if (values.length === 0) return fallback;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");
}

function searchable(value: string): string {
  return ` ${value.toLocaleLowerCase("en-US").replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim()} `;
}

function parsedYear(value: string | null): number | null {
  if (!value) return null;
  const matched = value.match(/(?:19|20|21|22)\d{2}/)?.[0];
  if (matched) return Number(matched);
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).getUTCFullYear() : null;
}

function inferAsOfYear(result: ResearchResult, override: number | null | undefined): number | null {
  if (override !== undefined) {
    if (override !== null && (!Number.isInteger(override) || override < 1900 || override > 2200)) {
      throw new Error("research_confidence_as_of_year_invalid");
    }
    return override;
  }
  const accessYears = result.sources
    .map((source) => parsedYear(source.accessedAt))
    .filter((year): year is number => year !== null);
  if (accessYears.length > 0) return Math.max(...accessYears);
  return result.referenceYear;
}

function sourceYear(source: ResearchResult["sources"][number], fallback: number | null): number | null {
  return source.referenceYear ?? parsedYear(source.publicationDate) ?? fallback;
}

function recencyScore(age: number): number {
  if (age < -1) return 20;
  if (age <= 1) return 100;
  if (age === 2) return 90;
  if (age === 3) return 80;
  if (age === 4) return 70;
  if (age === 5) return 60;
  if (age <= 7) return 45;
  if (age <= 10) return 30;
  return 10;
}

function intervalStability(interval: ResearchResult["lowBaseHigh"]): number {
  if (!interval) return 0;
  try {
    const low = new Decimal(interval.low);
    const base = new Decimal(interval.base);
    const high = new Decimal(interval.high);
    const width = high.minus(low).abs();
    if (base.isZero()) return width.isZero() ? 70 : 30;
    const relativeWidth = width.div(base.abs()).toNumber();
    if (!Number.isFinite(relativeWidth)) return 0;
    if (relativeWidth <= 0.1) return 85;
    if (relativeWidth <= 0.25) return 80;
    if (relativeWidth <= 0.5) return 70;
    if (relativeWidth <= 1) return 55;
    if (relativeWidth <= 2) return 40;
    return 20;
  } catch {
    return 0;
  }
}

function geographyAliases(geography: string): string[] {
  const normalized = normalize(geography);
  const aliases = new Set([normalized]);
  if (["kr", "kor", "korea", "south korea", "대한민국", "한국"].includes(normalized)) {
    for (const alias of ["kr", "kor", "korea", "south korea", "대한민국", "한국", "전국"]) {
      aliases.add(alias);
    }
  }
  return [...aliases].filter(Boolean);
}

function referencedIndexes(result: ResearchResult): number[] {
  const indexes = new Set<number>();
  for (const factor of result.proposedFactors) {
    for (const index of factor.sourceIndexes) indexes.add(index);
  }
  for (const citation of result.citations) indexes.add(citation.sourceIndex);
  for (const index of result.opportunityIdeaBrief?.evidenceSourceIndexes ?? []) indexes.add(index);
  if (indexes.size === 0) result.sources.forEach((_, index) => indexes.add(index));
  return [...indexes].filter((index) => result.sources[index] !== undefined).sort((left, right) => left - right);
}

export function calculateResearchConfidence(
  result: ResearchResult,
  options: { asOfYear?: number | null } = {},
): ResearchConfidenceAssessment {
  const asOfYear = inferAsOfYear(result, options.asOfYear);
  const numericProposal = result.lowBaseHigh !== null || result.proposedFactors.length > 0;
  const sourceIndexes = referencedIndexes(result);
  const sources = sourceIndexes.map((index) => result.sources[index]);
  const citedIndexes = new Set(result.citations.map((citation) => citation.sourceIndex));
  const denominator = normalize(result.denominator);
  const directFactors = result.proposedFactors.filter((factor) => factor.observationClass === "direct");
  const proxyFactors = result.proposedFactors.filter((factor) => factor.observationClass === "proxy");
  const inferredFactors = result.proposedFactors.filter((factor) => factor.observationClass === "inferred");
  const factorCount = result.proposedFactors.length;

  const sourceQuality = average(sources.map((source) => SOURCE_TIER_SCORE[source.sourceTier] ?? 0));
  const sourceAges = sources
    .map((source) => sourceYear(source, result.referenceYear))
    .filter((year): year is number => year !== null && asOfYear !== null)
    .map((year) => (asOfYear as number) - year);
  const recency = average(sourceAges.map(recencyScore));

  const denominatorMatchShare = factorCount === 0
    ? null
    : result.proposedFactors.filter((factor) => normalize(factor.denominator) === denominator).length / factorCount;
  const populationFit = denominatorMatchShare === null
    ? (numericProposal && sources.length > 0 ? 60 : 40)
    : 40 + 60 * denominatorMatchShare;

  const aliases = geographyAliases(result.geography);
  const geographyMatches = sources.filter((source) => {
    const haystack = searchable(`${source.institution} ${source.title} ${source.locator}`);
    return aliases.some((alias) => haystack.includes(` ${alias} `));
  }).length;
  const geographyMatch = sources.length === 0
    ? 0
    : geographyMatches === 0
      ? 55
      : 65 + 35 * (geographyMatches / sources.length);

  const baselineDenominator = normalize(result.existingBaseline.denominator);
  const usedValueShare = sources.length === 0
    ? 0
    : sources.filter((source) => source.usedValue !== null).length / sources.length;
  const definitionMatch = 20
    + (denominatorMatchShare === null ? (numericProposal ? 15 : 10) : 25 * denominatorMatchShare)
    + (baselineDenominator && baselineDenominator === denominator ? 20 : 0)
    + 20 * usedValueShare
    + (result.referenceYear === null ? 0 : 15);

  const directObservation = factorCount === 0 ? 0 : 100 * (directFactors.length / factorCount);
  const proxyStrength = proxyFactors.length === 0
    ? (factorCount === directFactors.length && factorCount > 0 ? 100 : inferredFactors.length > 0 ? 30 : 40)
    : average(proxyFactors.map((factor) => {
      const scores = factor.sourceIndexes
        .map((index) => result.sources[index])
        .filter((source) => source !== undefined)
        .map((source) => SOURCE_TIER_SCORE[source.sourceTier] ?? 0);
      return Math.min(85, average(scores));
    }));

  const dependencySupport = factorCount > 0
    ? average(result.proposedFactors.map((factor) => {
      const resolvedSources = factor.sourceIndexes
        .map((index) => result.sources[index])
        .filter((source) => source !== undefined);
      return (resolvedSources.length > 0 ? 35 : 0)
        + (factor.sourceIndexes.length > 0 && factor.sourceIndexes.every((index) => citedIndexes.has(index)) ? 35 : 0)
        + (resolvedSources.some((source) => source.usedValue !== null) ? 30 : 0);
    }))
    : numericProposal
      ? (result.citations.length > 0 ? 50 : 0) + (sources.some((source) => source.usedValue !== null) ? 50 : 0)
      : 0;

  const uniqueUrls = new Set(sources.map((source) => source.url)).size;
  const uniqueInstitutions = new Set(sources.map((source) => normalize(source.institution))).size;
  const sourceConsistency = sources.length === 0
    ? 0
    : sources.length === 1
      ? 55
      : Math.min(100, 65 + 20 * (uniqueUrls / sources.length) + 15 * (uniqueInstitutions / sources.length));

  const inferenceDirectness = factorCount === 0
    ? 0
    : average(result.proposedFactors.map((factor) => (
      factor.observationClass === "direct" ? 100 : factor.observationClass === "proxy" ? 65 : 25
    )));

  const intervals = [
    result.lowBaseHigh,
    ...result.proposedFactors.map((factor) => factor.interval),
  ].filter((interval): interval is NonNullable<ResearchResult["lowBaseHigh"]> => interval !== null);
  const modelStability = average(intervals.map(intervalStability));

  const duplicateFactorReferences = result.proposedFactors.reduce(
    (count, factor) => count + Math.max(0, factor.sourceIndexes.length - new Set(factor.sourceIndexes).size),
    0,
  );
  const citationKeys = result.citations.map((citation) => `${citation.sourceIndex}:${normalize(citation.claim)}`);
  const duplicateCitations = Math.max(0, citationKeys.length - new Set(citationKeys).size);
  const duplicateAffectedSegments = Math.max(
    0,
    result.affectedSegments.length - new Set(result.affectedSegments).size,
  );
  const opportunityIndexes = result.opportunityIdeaBrief?.evidenceSourceIndexes ?? [];
  const unsupportedOpportunityIndexes = opportunityIndexes.filter((index) => !citedIndexes.has(index)).length;
  const allocationIntegrity = 100
    - duplicateFactorReferences * 10
    - duplicateCitations * 5
    - duplicateAffectedSegments * 5
    - (denominatorMatchShare === null ? 0 : (1 - denominatorMatchShare) * 30)
    - unsupportedOpportunityIndexes * 15;

  const components: ConfidenceComponents = {
    sourceQuality: clampScore(sourceQuality),
    recency: clampScore(recency),
    populationFit: clampScore(populationFit),
    geographyMatch: clampScore(geographyMatch),
    definitionMatch: clampScore(definitionMatch),
    directObservation: clampScore(directObservation),
    proxyStrength: clampScore(proxyStrength),
    dependencySupport: clampScore(dependencySupport),
    sourceConsistency: clampScore(sourceConsistency),
    inferenceDirectness: clampScore(inferenceDirectness),
    modelStability: clampScore(modelStability),
    allocationIntegrity: clampScore(allocationIntegrity),
  };

  const penalties: { code: string; points: number; reason: string }[] = [];
  if (sources.some((source) => source.sourceTier === 8)) {
    penalties.push({ code: "ai_inference_source", points: 15, reason: "At least one referenced source is tier 8 AI inference." });
  }
  if (numericProposal && factorCount > 0 && directFactors.length === 0) {
    penalties.push({ code: "no_direct_observation", points: 10, reason: "The numeric proposal has no directly observed factor." });
  }
  if (inferredFactors.length > 0) {
    penalties.push({
      code: "inferred_factor",
      points: Math.min(12, 4 + Math.round(8 * (inferredFactors.length / factorCount))),
      reason: "One or more proposal factors are inferred rather than observed.",
    });
  }
  if (numericProposal && sources.length === 1) {
    penalties.push({ code: "single_source", points: 5, reason: "The numeric proposal depends on a single referenced source." });
  }
  if (numericProposal && result.referenceYear === null) {
    penalties.push({ code: "missing_reference_year", points: 8, reason: "The numeric proposal has no explicit result reference year." });
  }
  const oldestAge = sourceAges.length > 0 ? Math.max(...sourceAges) : null;
  if (oldestAge !== null && oldestAge > 5) {
    penalties.push({
      code: "stale_source",
      points: Math.min(12, Math.round((oldestAge - 5) * 1.5)),
      reason: `At least one referenced source is ${oldestAge} years old at the assessment year.`,
    });
  }
  if (numericProposal && components.geographyMatch <= 55) {
    penalties.push({
      code: "geography_not_source_matched",
      points: 5,
      reason: "The requested geography is not explicitly matched in referenced source metadata.",
    });
  }
  if (numericProposal && components.definitionMatch < 60) {
    penalties.push({ code: "definition_mismatch", points: 5, reason: "Denominator or reference-period definitions are weakly aligned." });
  }
  if (numericProposal && components.modelStability < 50) {
    penalties.push({ code: "wide_interval", points: 5, reason: "The proposed numeric interval is too wide for a stable estimate." });
  }
  if (!numericProposal && result.opportunityIdeaBrief && sources.length === 0) {
    penalties.push({ code: "unsupported_hypothesis", points: 15, reason: "The hypothesis draft has no referenced evidence source." });
  }

  const calculated = calculateConfidence(components, penalties);
  return {
    ruleVersion: RESEARCH_CONFIDENCE_RULE_VERSION,
    score: calculated.score,
    grade: calculated.grade,
    components: calculated.components,
    penalties: calculated.penalties,
    signals: {
      sourceCount: result.sources.length,
      referencedSourceCount: sources.length,
      citationCount: result.citations.length,
      factorCount,
      directFactorCount: directFactors.length,
      proxyFactorCount: proxyFactors.length,
      inferredFactorCount: inferredFactors.length,
      numericProposal,
      resultReferenceYear: result.referenceYear,
      asOfYear,
    },
  };
}
