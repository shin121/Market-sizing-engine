import "server-only";

import type { PoolClient } from "pg";
import { z } from "zod";

import { researchSourceSchema } from "@/contracts/research";
import { calculateConfidence, confidenceComponentsSchema } from "@/domain/confidence";
import { intervalSchema } from "@/domain/interval";
import { contentHash } from "@/server/services/segment-workflow";
import { plainObject, type PlainObject } from "@/server/services/research-values";

const citationSchema = z.object({
  sourceIndex: z.number().int().nonnegative(),
  claim: z.string().min(1),
});

const penaltySchema = z.object({
  code: z.string().min(1),
  points: z.number().nonnegative(),
  reason: z.string().min(1),
});

const OPPORTUNITY_IDEA_TARGET = /^opportunity_idea_brief:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function requiredText(record: PlainObject, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`approved_research_factor_${key}_required`);
  }
  return value.trim();
}

function optionalEntityUnit(baseline: PlainObject): string | null {
  const unit = baseline.unit;
  return typeof unit === "string" && [
    "person", "child_person", "household", "establishment", "enterprise",
  ].includes(unit) ? unit : null;
}

export async function materializeApprovedResearchFactor(input: {
  client: PoolClient;
  workspaceId: string;
  proposedRevisionId: string;
  publicationVersionId: string;
  proposed: PlainObject;
  baseline: PlainObject;
  actorId: string;
}): Promise<string | null> {
  if (input.proposed.lowBaseHigh === null || input.proposed.lowBaseHigh === undefined) {
    const proposedFactors = input.proposed.factors ?? input.proposed.proposedFactors;
    const factors = Array.isArray(proposedFactors) ? proposedFactors : [];
    const rawTargetVariable = input.proposed.targetVariable ?? input.proposed.target_variable;
    const targetVariable = typeof rawTargetVariable === "string" ? rawTargetVariable : "";
    if (factors.length > 0 && !OPPORTUNITY_IDEA_TARGET.test(targetVariable)) {
      throw new Error("approved_research_factor_aggregate_interval_required");
    }
    return null;
  }

  const interval = intervalSchema.safeParse(input.proposed.lowBaseHigh);
  if (!interval.success) throw new Error("approved_research_factor_interval_invalid");
  const sources = z.array(researchSourceSchema).min(1).max(32).safeParse(input.proposed.sources);
  if (!sources.success) throw new Error("approved_research_factor_sources_invalid");
  const citations = z.array(citationSchema).min(1).max(96).safeParse(input.proposed.citations);
  if (!citations.success) throw new Error("approved_research_factor_citations_invalid");
  for (const citation of citations.data) {
    if (!sources.data[citation.sourceIndex]) throw new Error("approved_research_factor_citation_source_missing");
  }

  const components = confidenceComponentsSchema.safeParse(input.proposed.confidenceComponents);
  if (!components.success) throw new Error("approved_research_factor_confidence_invalid");
  const penalties = z.array(penaltySchema).max(32).safeParse(input.proposed.confidencePenalties ?? []);
  if (!penalties.success) throw new Error("approved_research_factor_penalties_invalid");
  const confidence = calculateConfidence(components.data, penalties.data);
  const targetSegment = requiredText(input.proposed, "targetSegment");
  const targetVariable = requiredText(input.proposed, "targetVariable");
  const denominator = requiredText(input.proposed, "denominator");
  const geography = requiredText(input.proposed, "geography");
  const inferenceMethod = requiredText(input.proposed, "inferenceMethod");
  const referenceYear = input.proposed.referenceYear;
  if (referenceYear !== null && referenceYear !== undefined
      && (!Number.isInteger(referenceYear) || Number(referenceYear) < 1900 || Number(referenceYear) > 2200)) {
    throw new Error("approved_research_factor_reference_year_invalid");
  }
  const limitations = Array.isArray(input.proposed.limitations) ? input.proposed.limitations : [];
  const factors = Array.isArray(input.proposed.factors) ? input.proposed.factors : [];
  const sourceBundleHash = contentHash({ sources: sources.data, citations: citations.data });
  const ruleVersion = typeof input.proposed.confidenceRuleVersion === "string"
    && input.proposed.confidenceRuleVersion.trim()
    ? input.proposed.confidenceRuleVersion.trim()
    : "research-confidence-v1";
  const factorValues = [
    input.workspaceId,
    input.publicationVersionId,
    input.proposedRevisionId,
    targetSegment,
    targetVariable,
    optionalEntityUnit(input.baseline),
    denominator,
    geography,
    referenceYear ?? null,
    interval.data.low,
    interval.data.base,
    interval.data.high,
    inferenceMethod,
    JSON.stringify({ factors }),
    JSON.stringify(limitations),
    confidence.score,
    confidence.grade,
    JSON.stringify(confidence.components),
    JSON.stringify(confidence.penalties),
    ruleVersion,
    sourceBundleHash,
    sources.data.length,
    input.actorId,
  ];

  const inserted = await input.client.query<{ approved_factor_id: string }>(
    `INSERT INTO approved_research_factor (
       workspace_id,publication_version_id,proposed_revision_id,supersedes_factor_id,
       target_segment,target_variable,entity_unit,denominator,geography,reference_year,
       value_low,value_base,value_high,inference_method,observation_summary,limitations,
       confidence_score,confidence_grade,confidence_components,confidence_penalties,
       confidence_rule_version,source_bundle_hash,source_count,created_by_actor_id
     ) VALUES (
       $1,$2,$3,
       (SELECT approved_factor_id FROM approved_research_factor
         WHERE workspace_id=$1 AND target_segment=$4 AND target_variable=$5
         ORDER BY created_at DESC LIMIT 1),
       $4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15::jsonb,
       $16,$17,$18::jsonb,$19::jsonb,$20,$21,$22,$23
     )
     ON CONFLICT (proposed_revision_id) DO NOTHING
     RETURNING approved_factor_id`,
    factorValues,
  );
  const insertedFactorId = inserted.rows[0]?.approved_factor_id;
  if (!insertedFactorId) {
    const existing = (await input.client.query<{ approved_factor_id: string }>(
      `SELECT approved_factor_id
         FROM approved_research_factor
        WHERE workspace_id=$1
          AND publication_version_id=$2
          AND proposed_revision_id=$3
          AND target_segment=$4
          AND target_variable=$5
          AND entity_unit IS NOT DISTINCT FROM $6
          AND denominator=$7
          AND geography=$8
          AND reference_year IS NOT DISTINCT FROM $9
          AND value_low=$10::numeric
          AND value_base=$11::numeric
          AND value_high=$12::numeric
          AND inference_method=$13
          AND observation_summary=$14::jsonb
          AND limitations=$15::jsonb
          AND confidence_score=$16
          AND confidence_grade=$17
          AND confidence_components=$18::jsonb
          AND confidence_penalties=$19::jsonb
          AND confidence_rule_version=$20
          AND source_bundle_hash=$21
          AND source_count=$22
          AND created_by_actor_id=$23`,
      factorValues,
    )).rows[0];
    if (!existing) {
      throw new Error("approved_research_factor_materialization_conflict");
    }
    const persistedSources = (await input.client.query<{ source_index: number; source_hash: string }>(
      `SELECT source_index,source_hash
         FROM approved_research_factor_source
        WHERE approved_factor_id=$1
        ORDER BY source_index`,
      [existing.approved_factor_id],
    )).rows;
    const expectedSourceHashes = sources.data.map((source) => contentHash(source));
    if (persistedSources.length !== expectedSourceHashes.length
        || persistedSources.some((source, index) => (
          source.source_index !== index || source.source_hash !== expectedSourceHashes[index]
        ))) {
      throw new Error("approved_research_factor_materialization_conflict");
    }
    return existing.approved_factor_id;
  }

  const factorId = insertedFactorId;

  for (const [sourceIndex, source] of sources.data.entries()) {
    const claims = citations.data
      .filter((citation) => citation.sourceIndex === sourceIndex)
      .map((citation) => citation.claim);
    await input.client.query(
      `INSERT INTO approved_research_factor_source (
         approved_factor_id,source_index,institution,title,url,publication_date,
         reference_year,accessed_at,locator,used_value,source_tier,claims,source_hash
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12::jsonb,$13)
       ON CONFLICT (approved_factor_id,source_index) DO NOTHING`,
      [factorId, sourceIndex, source.institution, source.title, source.url,
        source.publicationDate, source.referenceYear, source.accessedAt, source.locator,
        JSON.stringify(source.usedValue), source.sourceTier, JSON.stringify(claims), contentHash(source)],
    );
  }
  return factorId;
}

export function researchBaselineObject(value: unknown): PlainObject {
  return plainObject(value) ?? {};
}
