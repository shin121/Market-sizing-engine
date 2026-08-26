import { z } from "zod";

import { confidenceComponentsSchema } from "@/domain/confidence";
import { intervalSchema } from "@/domain/interval";

const MAX_SHORT_TEXT = 512;
const MAX_TEXT = 4_000;
const MAX_LONG_TEXT = 8_000;
const MAX_INTERVAL_VALUE_TEXT = 128;
const MAX_FACTORS = 32;
const MAX_SOURCES = 32;
const MAX_CITATIONS = 96;
const MAX_LIST_ITEMS = 64;
const MAX_AFFECTED_SEGMENTS = 512;
const MAX_SOURCE_INDEXES = 16;

const ISO_CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/u;
const OPPORTUNITY_IDEA_TARGET = /^opportunity_idea_brief:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const FEATURE_SOURCE_ID = /^(?:core_feature|domain_feature|dimension_value):\S+$/u;
const BEHAVIOR_SOURCE_ID = /^(?:behavior|tag):\S+$/u;

function isStrictIsoCalendarDate(value: string): boolean {
  const match = ISO_CALENDAR_DATE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= daysInMonth[month - 1];
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

const boundedIntervalSchema = intervalSchema.superRefine((interval, context) => {
  for (const key of ["low", "base", "high"] as const) {
    const value = interval[key];
    if (typeof value === "string" && (value.length === 0 || value.length > MAX_INTERVAL_VALUE_TEXT)) {
      context.addIssue({
        code: "custom",
        path: [key],
        message: `Interval ${key} must contain 1-${MAX_INTERVAL_VALUE_TEXT} characters when serialized as text.`,
      });
    }
  }
});

export const researchBaselineSchema = z.object({
  estimateId: z.string().min(1).max(MAX_SHORT_TEXT).nullable(),
  status: z.enum(["estimated", "not_estimable", "unavailable", "unknown"]),
  value: z.union([z.number(), z.string().min(1).max(MAX_SHORT_TEXT)]).nullable(),
  lowBaseHigh: boundedIntervalSchema.nullable(),
  unit: z.string().min(1).max(MAX_SHORT_TEXT).nullable(),
  denominator: z.string().min(1).max(MAX_TEXT).nullable(),
  definition: z.string().min(1).max(MAX_LONG_TEXT),
  sourceTitle: z.string().min(1).max(MAX_TEXT).nullable(),
  version: z.string().min(1).max(MAX_SHORT_TEXT).nullable(),
}).strict();

export const researchSourceSchema = z.object({
  institution: z.string().min(1).max(MAX_SHORT_TEXT),
  title: z.string().min(1).max(MAX_TEXT),
  // OpenAI Structured Outputs does not accept JSON Schema's `format: uri`.
  // Keep the provider schema as a bounded string and enforce an HTTP(S) URL
  // again with Zod before any result is persisted.
  url: z.string().max(2_048).refine(isHttpUrl, {
    message: "Source URL must be an absolute HTTP(S) URL.",
  }),
  publicationDate: z.string().refine(isStrictIsoCalendarDate, {
    message: "Publication date must be a valid ISO calendar date (YYYY-MM-DD).",
  }).nullable(),
  referenceYear: z.number().int().min(1900).max(2200).nullable(),
  accessedAt: z.string().datetime(),
  locator: z.string().min(1).max(MAX_TEXT),
  usedValue: z.union([z.number(), z.string().min(1).max(MAX_TEXT)]).nullable(),
  sourceTier: z.number().int().min(1).max(8),
}).strict();

export const opportunityIdeaBriefSchema = z.object({
  problemHypothesis: z.string().min(1).max(MAX_TEXT).nullable(),
  solutionIdea: z.string().min(1).max(MAX_TEXT).nullable(),
  valueProposition: z.string().min(1).max(MAX_TEXT).nullable(),
  productPackage: z.string().min(1).max(MAX_TEXT).nullable(),
  pricingHypothesis: z.string().min(1).max(MAX_TEXT).nullable(),
  channels: z.array(z.string().min(1).max(MAX_SHORT_TEXT)).max(MAX_LIST_ITEMS).nullable(),
  messageDraft: z.string().min(1).max(MAX_LONG_TEXT).nullable(),
  landingPageOutline: z.string().min(1).max(MAX_LONG_TEXT).nullable(),
  interviewGuide: z.array(z.string().min(1).max(MAX_TEXT)).max(MAX_LIST_ITEMS).nullable(),
  experimentPlan: z.object({
    hypothesis: z.string().min(1).max(MAX_TEXT),
    method: z.string().min(1).max(MAX_TEXT),
    primaryMetric: z.string().min(1).max(MAX_SHORT_TEXT),
    successCriteria: z.string().min(1).max(MAX_TEXT),
  }).strict().nullable(),
  risks: z.array(z.string().min(1).max(MAX_TEXT)).max(MAX_LIST_ITEMS).nullable(),
  evidenceSourceIndexes: z.array(z.number().int().nonnegative()).max(MAX_SOURCE_INDEXES),
  sourceFeatureIds: z.array(
    z.string().min(1).max(MAX_SHORT_TEXT).regex(FEATURE_SOURCE_ID),
  ).max(MAX_LIST_ITEMS),
  sourceBehaviorIds: z.array(
    z.string().min(1).max(MAX_SHORT_TEXT).regex(BEHAVIOR_SOURCE_ID),
  ).max(MAX_LIST_ITEMS),
}).strict();

export const researchResultSchema = z
  .object({
    researchQuestion: z.string().min(1).max(MAX_LONG_TEXT),
    targetSegment: z.string().min(1).max(MAX_SHORT_TEXT),
    targetVariable: z.string().min(1).max(MAX_SHORT_TEXT),
    existingBaseline: researchBaselineSchema,
    proposedFactors: z.array(
      z.object({
        name: z.string().min(1).max(MAX_SHORT_TEXT),
        interval: boundedIntervalSchema,
        denominator: z.string().min(1).max(MAX_TEXT),
        observationClass: z.enum(["direct", "proxy", "inferred"]),
        sourceIndexes: z.array(z.number().int().nonnegative()).max(MAX_SOURCE_INDEXES),
      }).strict(),
    ).max(MAX_FACTORS),
    lowBaseHigh: boundedIntervalSchema.nullable(),
    denominator: z.string().min(1).max(MAX_TEXT),
    geography: z.string().min(1).max(MAX_SHORT_TEXT),
    referenceYear: z.number().int().min(1900).max(2200).nullable(),
    sources: z.array(researchSourceSchema).max(MAX_SOURCES),
    citations: z.array(z.object({
      sourceIndex: z.number().int().nonnegative(),
      claim: z.string().min(1).max(MAX_TEXT),
    }).strict()).max(MAX_CITATIONS),
    inferenceMethod: z.string().min(1).max(MAX_LONG_TEXT),
    limitations: z.array(z.string().min(1).max(MAX_TEXT)).max(MAX_LIST_ITEMS),
    // These are provider-proposed component scores. Server rules calculate the
    // authoritative score and grade before this result becomes a proposal.
    confidenceComponents: confidenceComponentsSchema,
    variablesToVerify: z.array(z.string().min(1).max(MAX_TEXT)).max(MAX_LIST_ITEMS),
    affectedSegments: z.array(z.string().min(1).max(MAX_SHORT_TEXT)).max(MAX_AFFECTED_SEGMENTS),
    recommendedAction: z.enum(["approve", "modify", "research_more", "keep_baseline"]),
    opportunityIdeaBrief: opportunityIdeaBriefSchema.nullable(),
  })
  .strict()
  .superRefine((result, context) => {
    const numericProposal = result.lowBaseHigh !== null || result.proposedFactors.length > 0;
    const citedSourceIndexes = new Set(result.citations.map((citation) => citation.sourceIndex));
    const opportunityTarget = OPPORTUNITY_IDEA_TARGET.test(result.targetVariable);
    if (!opportunityTarget && result.proposedFactors.length > 0 && result.lowBaseHigh === null) {
      context.addIssue({
        code: "custom",
        path: ["lowBaseHigh"],
        message: "Ordinary numeric factor research requires an aggregate Low/Base/High interval for materialization.",
      });
    }
    if (numericProposal && result.sources.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["sources"],
        message: "Numeric research proposals require at least one original source.",
      });
    }
    if (numericProposal && result.citations.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["citations"],
        message: "Numeric research proposals require at least one citation.",
      });
    }
    for (const citation of result.citations) {
      if (!result.sources[citation.sourceIndex]) {
        context.addIssue({
          code: "custom",
          path: ["citations"],
          message: `Citation source index ${citation.sourceIndex} does not exist.`,
        });
      }
    }
    for (const [factorIndex, factor] of result.proposedFactors.entries()) {
      if (factor.sourceIndexes.length === 0) {
        context.addIssue({
          code: "custom",
          path: ["proposedFactors", factorIndex, "sourceIndexes"],
          message: "Every numeric factor requires at least one source index.",
        });
      }
      if (new Set(factor.sourceIndexes).size !== factor.sourceIndexes.length) {
        context.addIssue({
          code: "custom",
          path: ["proposedFactors", factorIndex, "sourceIndexes"],
          message: "Factor source indexes must be unique.",
        });
      }
      for (const sourceIndex of factor.sourceIndexes) {
        if (!result.sources[sourceIndex]) {
          context.addIssue({
            code: "custom",
            path: ["proposedFactors", factorIndex, "sourceIndexes"],
            message: `Factor source index ${sourceIndex} does not exist.`,
          });
        }
        if (!citedSourceIndexes.has(sourceIndex)) {
          context.addIssue({
            code: "custom",
            path: ["proposedFactors", factorIndex, "sourceIndexes"],
            message: `Factor source index ${sourceIndex} must have a matching citation.`,
          });
        }
      }
      if (!factor.sourceIndexes.some((sourceIndex) => result.sources[sourceIndex]?.usedValue !== null)) {
        context.addIssue({
          code: "custom",
          path: ["proposedFactors", factorIndex, "sourceIndexes"],
          message: "Every numeric factor requires a referenced source with an explicit usedValue.",
        });
      }
    }
    if (result.lowBaseHigh !== null && result.proposedFactors.length === 0) {
      const aggregateValueIsSourced = result.citations.some(
        (citation) => result.sources[citation.sourceIndex]?.usedValue !== null,
      );
      if (!aggregateValueIsSourced) {
        context.addIssue({
          code: "custom",
          path: ["lowBaseHigh"],
          message: "A numeric Low/Base/High proposal requires a cited source with an explicit usedValue.",
        });
      }
    }
    if (opportunityTarget && result.sources.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["sources"],
        message: "Opportunity idea research requires at least one original source.",
      });
    }
    if (opportunityTarget && result.citations.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["citations"],
        message: "Opportunity idea research requires at least one citation.",
      });
    }
    if (opportunityTarget && result.opportunityIdeaBrief) {
      const evidenceSourceIndexes = result.opportunityIdeaBrief.evidenceSourceIndexes;
      if (evidenceSourceIndexes.length === 0) {
        context.addIssue({
          code: "custom",
          path: ["opportunityIdeaBrief", "evidenceSourceIndexes"],
          message: "Opportunity idea evidence source indexes cannot be empty.",
        });
      }
      if (new Set(evidenceSourceIndexes).size !== evidenceSourceIndexes.length) {
        context.addIssue({
          code: "custom",
          path: ["opportunityIdeaBrief", "evidenceSourceIndexes"],
          message: "Opportunity idea evidence source indexes must be unique.",
        });
      }
      for (const sourceIndex of evidenceSourceIndexes) {
        if (!result.sources[sourceIndex]) {
          context.addIssue({
            code: "custom",
            path: ["opportunityIdeaBrief", "evidenceSourceIndexes"],
            message: `Opportunity idea source index ${sourceIndex} does not exist.`,
          });
        }
        if (!citedSourceIndexes.has(sourceIndex)) {
          context.addIssue({
            code: "custom",
            path: ["opportunityIdeaBrief", "evidenceSourceIndexes"],
            message: `Opportunity idea source index ${sourceIndex} must have a matching citation.`,
          });
        }
      }
      for (const [field, description] of [
        ["sourceFeatureIds", "feature source IDs"],
        ["sourceBehaviorIds", "behavior source IDs"],
      ] as const) {
        const sourceIds = result.opportunityIdeaBrief[field];
        if (new Set(sourceIds).size !== sourceIds.length) {
          context.addIssue({
            code: "custom",
            path: ["opportunityIdeaBrief", field],
            message: `Opportunity idea ${description} must be unique.`,
          });
        }
      }
    }
    if (opportunityTarget && !result.opportunityIdeaBrief) {
      context.addIssue({ code: "custom", message: "Opportunity idea research requires opportunityIdeaBrief." });
    }
    if (!opportunityTarget && result.opportunityIdeaBrief) {
      context.addIssue({ code: "custom", message: "opportunityIdeaBrief must be null for ordinary factor research." });
    }
  });

export type ResearchResult = z.infer<typeof researchResultSchema>;
export type OpportunityIdeaBrief = z.infer<typeof opportunityIdeaBriefSchema>;

export const researchJobStatusSchema = z.enum([
  "draft",
  "queued",
  "running",
  "needs_review",
  "approved",
  "rejected",
  "failed",
  "cancelled",
  "configuration_required",
]);

export type ResearchJobStatus = z.infer<typeof researchJobStatusSchema>;
