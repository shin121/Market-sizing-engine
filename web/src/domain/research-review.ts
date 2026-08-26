import Decimal from "decimal.js";

type DataRecord = Record<string, unknown>;
type Scalar = string | number;

export type ResearchComparisonStatus =
  | "comparable"
  | "baseline_unavailable"
  | "proposed_unavailable"
  | "baseline_non_numeric"
  | "proposed_non_numeric"
  | "denominator_unavailable"
  | "denominator_mismatch";

export type SourceFreshnessStatus = "current" | "aging" | "stale" | "future_dated" | "unavailable";

export interface ReviewInterval {
  low: Scalar;
  base: Scalar;
  high: Scalar;
}

export interface ResearchReviewCompleteness {
  deltaSummary: {
    schemaVersion: "research-review-delta-v1";
    comparison: {
      denominator: {
        baseline: string | null;
        proposed: string | null;
        status: "matching" | "unavailable" | "mismatch";
      };
      value: {
        baseline: Scalar | null;
        proposed: Scalar | null;
        absoluteChange: string | null;
        relativeChangePercent: string | null;
        relativeChangeStatus: "calculated" | "baseline_zero" | "unavailable";
        status: ResearchComparisonStatus;
      };
      interval: {
        baseline: ReviewInterval | null;
        proposed: ReviewInterval | null;
        absoluteChange: { low: string; base: string; high: string } | null;
        status: ResearchComparisonStatus;
      };
    };
    confidence: {
      baseline: { score: number | null; grade: string | null };
      proposed: { score: number | null; grade: string | null };
      scoreChange: number | null;
      gradeChanged: boolean | null;
    };
    sourceFreshness: Array<{
      sourceIndex: number;
      publicationDate: string | null;
      referenceYear: number | null;
      accessedAt: string | null;
      daysSincePublication: number | null;
      yearsSinceReference: number | null;
      daysSinceAccess: number | null;
      status: SourceFreshnessStatus;
    }>;
    computedAt: string;
  };
  affectedSegmentIds: string[];
  expectedRecalculation: {
    schemaVersion: "research-recalculation-impact-v1";
    affectedSegmentCount: number;
    affectedSegmentIds: string[];
    invalidationRequired: boolean;
    recalculationRequired: boolean;
    eligibilityStatus: "eligible" | "no_affected_segments" | "materialized_dependency_not_verified";
    trigger: "on_approved_revision_materialization" | null;
    expectedAction: "invalidate_and_recalculate_affected_segments" | null;
  };
}

function record(value: unknown): DataRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as DataRecord
    : {};
}

function scalar(value: unknown): Scalar | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) return value.trim();
  return null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numeric(value: Scalar | null): Decimal | null {
  if (value === null) return null;
  try {
    const parsed = new Decimal(typeof value === "string" ? value.replaceAll(",", "") : value);
    return parsed.isFinite() ? parsed : null;
  } catch {
    return null;
  }
}

function interval(value: unknown): ReviewInterval | null {
  const candidate = record(value);
  const low = scalar(candidate.low);
  const base = scalar(candidate.base);
  const high = scalar(candidate.high);
  return low === null || base === null || high === null ? null : { low, base, high };
}

function normalizedDenominator(value: string | null): string | null {
  return value?.toLocaleLowerCase("en-US").replace(/\s+/gu, " ").trim() || null;
}

function denominatorStatus(
  baseline: string | null,
  proposed: string | null,
): "matching" | "unavailable" | "mismatch" {
  const normalizedBaseline = normalizedDenominator(baseline);
  const normalizedProposed = normalizedDenominator(proposed);
  if (!normalizedBaseline || !normalizedProposed) return "unavailable";
  return normalizedBaseline === normalizedProposed ? "matching" : "mismatch";
}

function comparisonStatus(input: {
  baseline: Scalar | ReviewInterval | null;
  proposed: Scalar | ReviewInterval | null;
  baselineNumeric: boolean;
  proposedNumeric: boolean;
  denominator: "matching" | "unavailable" | "mismatch";
}): ResearchComparisonStatus {
  if (input.baseline === null) return "baseline_unavailable";
  if (input.proposed === null) return "proposed_unavailable";
  if (!input.baselineNumeric) return "baseline_non_numeric";
  if (!input.proposedNumeric) return "proposed_non_numeric";
  if (input.denominator === "unavailable") return "denominator_unavailable";
  if (input.denominator === "mismatch") return "denominator_mismatch";
  return "comparable";
}

function confidenceValue(value: unknown): number | null {
  const candidate = scalar(value);
  if (candidate === null) return null;
  const parsed = typeof candidate === "number" ? candidate : Number(candidate.replaceAll(",", ""));
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100 ? parsed : null;
}

function confidenceGrade(value: unknown): string | null {
  const candidate = text(value)?.toUpperCase() ?? null;
  return candidate && /^[A-E]$/u.test(candidate) ? candidate : null;
}

const CONFIDENCE_NESTED_KEYS = [
  "confidenceAssessment",
  "confidence_assessment",
  "confidence",
  "result",
  "resultSummary",
  "result_summary",
  "estimate",
] as const;

function extractConfidence(value: unknown, depth = 0): { score: number | null; grade: string | null } {
  const source = record(value);
  const directScore = confidenceValue(
    source.score ?? source.confidenceScore ?? source.confidence_score ?? source.totalScore ?? source.total_score
      ?? (typeof source.confidence === "number" || typeof source.confidence === "string" ? source.confidence : null),
  );
  const directGrade = confidenceGrade(source.confidenceGrade ?? source.confidence_grade ?? source.grade);
  if (depth >= 3 || (directScore !== null && directGrade !== null)) {
    return { score: directScore, grade: directGrade };
  }
  let score = directScore;
  let grade = directGrade;
  for (const key of CONFIDENCE_NESTED_KEYS) {
    const nested = record(source[key]);
    if (Object.keys(nested).length === 0) continue;
    const found = extractConfidence(nested, depth + 1);
    score ??= found.score;
    grade ??= found.grade;
    if (score !== null && grade !== null) break;
  }
  return { score, grade };
}

const DAY_MS = 86_400_000;

function parsedDate(value: unknown): Date | null {
  const candidate = text(value);
  if (!candidate) return null;
  const timestamp = Date.parse(candidate);
  return Number.isFinite(timestamp) ? new Date(timestamp) : null;
}

function elapsedDays(asOf: Date, date: Date | null): number | null {
  return date ? Math.floor((asOf.getTime() - date.getTime()) / DAY_MS) : null;
}

function freshnessStatus(input: {
  daysSincePublication: number | null;
  yearsSinceReference: number | null;
  daysSinceAccess: number | null;
}): SourceFreshnessStatus {
  if (input.daysSinceAccess === null) return "unavailable";
  if ((input.daysSincePublication !== null && input.daysSincePublication < -1)
    || (input.yearsSinceReference !== null && input.yearsSinceReference < 0)
    || input.daysSinceAccess < -1) return "future_dated";
  const evidenceAgeYears = input.daysSincePublication === null
    ? input.yearsSinceReference
    : input.daysSincePublication / 365.25;
  if (evidenceAgeYears === null) return "unavailable";
  if (evidenceAgeYears <= 2 && input.daysSinceAccess <= 365) return "current";
  if (evidenceAgeYears <= 5 && input.daysSinceAccess <= 730) return "aging";
  return "stale";
}

function sourceFreshness(sources: readonly unknown[], computedAt: string) {
  const asOf = parsedDate(computedAt);
  if (!asOf) throw new Error("research_review_computed_at_invalid");
  return sources.map((value, sourceIndex) => {
    const source = record(value);
    const publicationDate = text(source.publicationDate ?? source.publication_date);
    const accessedAt = text(source.accessedAt ?? source.accessed_at);
    const referenceYearValue = source.referenceYear ?? source.reference_year;
    const referenceYear = typeof referenceYearValue === "number" && Number.isInteger(referenceYearValue)
      ? referenceYearValue
      : typeof referenceYearValue === "string" && /^\d{4}$/u.test(referenceYearValue.trim())
        ? Number(referenceYearValue)
        : null;
    const daysSincePublication = elapsedDays(asOf, parsedDate(publicationDate));
    const daysSinceAccess = elapsedDays(asOf, parsedDate(accessedAt));
    const yearsSinceReference = referenceYear === null ? null : asOf.getUTCFullYear() - referenceYear;
    return {
      sourceIndex,
      publicationDate,
      referenceYear,
      accessedAt,
      daysSincePublication,
      yearsSinceReference,
      daysSinceAccess,
      status: freshnessStatus({ daysSincePublication, yearsSinceReference, daysSinceAccess }),
    };
  });
}

function uniqueSegmentIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean))];
}

export function buildResearchReviewCompleteness(input: {
  baseline: unknown;
  baselineConfidenceSource?: unknown;
  proposedInterval: unknown;
  proposedDenominator: string | null;
  proposedConfidence: unknown;
  sources: readonly unknown[];
  affectedSegments: unknown;
  calculationRelevantTarget?: boolean;
  materializedCalculationDependency?: boolean;
  computedAt: string;
}): ResearchReviewCompleteness {
  const baseline = record(input.baseline);
  const baselineInterval = interval(baseline.lowBaseHigh ?? baseline.low_base_high);
  const proposedInterval = interval(input.proposedInterval);
  const baselineValue = scalar(baseline.value) ?? baselineInterval?.base ?? null;
  const proposedValue = proposedInterval?.base ?? null;
  const baselineDenominator = text(baseline.denominator);
  const proposedDenominator = text(input.proposedDenominator);
  const denominator = denominatorStatus(baselineDenominator, proposedDenominator);
  const baselineValueNumeric = numeric(baselineValue);
  const proposedValueNumeric = numeric(proposedValue);
  const valueStatus = comparisonStatus({
    baseline: baselineValue,
    proposed: proposedValue,
    baselineNumeric: baselineValueNumeric !== null,
    proposedNumeric: proposedValueNumeric !== null,
    denominator,
  });
  const baselineIntervalNumeric = baselineInterval && {
    low: numeric(baselineInterval.low),
    base: numeric(baselineInterval.base),
    high: numeric(baselineInterval.high),
  };
  const proposedIntervalNumeric = proposedInterval && {
    low: numeric(proposedInterval.low),
    base: numeric(proposedInterval.base),
    high: numeric(proposedInterval.high),
  };
  const baselineIntervalIsNumeric = Boolean(
    baselineIntervalNumeric?.low && baselineIntervalNumeric.base && baselineIntervalNumeric.high,
  );
  const proposedIntervalIsNumeric = Boolean(
    proposedIntervalNumeric?.low && proposedIntervalNumeric.base && proposedIntervalNumeric.high,
  );
  const intervalStatus = comparisonStatus({
    baseline: baselineInterval,
    proposed: proposedInterval,
    baselineNumeric: baselineIntervalIsNumeric,
    proposedNumeric: proposedIntervalIsNumeric,
    denominator,
  });
  const absoluteValueChange = valueStatus === "comparable" && baselineValueNumeric && proposedValueNumeric
    ? proposedValueNumeric.minus(baselineValueNumeric)
    : null;
  const relativeValueChange = absoluteValueChange && baselineValueNumeric && !baselineValueNumeric.isZero()
    ? absoluteValueChange.div(baselineValueNumeric.abs()).mul(100)
    : null;
  const absoluteIntervalChange = intervalStatus === "comparable"
    && baselineIntervalNumeric?.low && baselineIntervalNumeric.base && baselineIntervalNumeric.high
    && proposedIntervalNumeric?.low && proposedIntervalNumeric.base && proposedIntervalNumeric.high
    ? {
      low: proposedIntervalNumeric.low.minus(baselineIntervalNumeric.low).toString(),
      base: proposedIntervalNumeric.base.minus(baselineIntervalNumeric.base).toString(),
      high: proposedIntervalNumeric.high.minus(baselineIntervalNumeric.high).toString(),
    }
    : null;
  const baselineConfidence = extractConfidence(input.baselineConfidenceSource ?? input.baseline);
  const proposedConfidence = extractConfidence(input.proposedConfidence);
  const affectedSegmentIds = uniqueSegmentIds(input.affectedSegments);
  const recalculationRequired = affectedSegmentIds.length > 0
    && input.calculationRelevantTarget === true
    && input.materializedCalculationDependency === true;
  const eligibilityStatus = affectedSegmentIds.length === 0
    ? "no_affected_segments"
    : recalculationRequired
      ? "eligible"
      : "materialized_dependency_not_verified";

  return {
    deltaSummary: {
      schemaVersion: "research-review-delta-v1",
      comparison: {
        denominator: {
          baseline: baselineDenominator,
          proposed: proposedDenominator,
          status: denominator,
        },
        value: {
          baseline: baselineValue,
          proposed: proposedValue,
          absoluteChange: absoluteValueChange?.toString() ?? null,
          relativeChangePercent: relativeValueChange?.toString() ?? null,
          relativeChangeStatus: relativeValueChange
            ? "calculated"
            : valueStatus === "comparable" && baselineValueNumeric?.isZero()
              ? "baseline_zero"
              : "unavailable",
          status: valueStatus,
        },
        interval: {
          baseline: baselineInterval,
          proposed: proposedInterval,
          absoluteChange: absoluteIntervalChange,
          status: intervalStatus,
        },
      },
      confidence: {
        baseline: baselineConfidence,
        proposed: proposedConfidence,
        scoreChange: baselineConfidence.score === null || proposedConfidence.score === null
          ? null
          : Number((proposedConfidence.score - baselineConfidence.score).toFixed(2)),
        gradeChanged: baselineConfidence.grade === null || proposedConfidence.grade === null
          ? null
          : baselineConfidence.grade !== proposedConfidence.grade,
      },
      sourceFreshness: sourceFreshness(input.sources, input.computedAt),
      computedAt: input.computedAt,
    },
    affectedSegmentIds,
    expectedRecalculation: {
      schemaVersion: "research-recalculation-impact-v1",
      affectedSegmentCount: affectedSegmentIds.length,
      affectedSegmentIds,
      invalidationRequired: recalculationRequired,
      recalculationRequired,
      eligibilityStatus,
      trigger: recalculationRequired ? "on_approved_revision_materialization" : null,
      expectedAction: recalculationRequired ? "invalidate_and_recalculate_affected_segments" : null,
    },
  };
}
