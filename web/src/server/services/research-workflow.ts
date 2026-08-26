import "server-only";

import type { PoolClient } from "pg";

import { opportunityIdeaBriefSchema, researchBaselineSchema } from "@/contracts/research";
import {
  calculateCanonicalResearchConfidence,
  calculateResearchConfidence,
} from "@/domain/research-confidence";
import { buildResearchReviewCompleteness } from "@/domain/research-review";
import { assertNoHighConfidencePersonalData } from "@/domain/privacy";
import { BASELINE_MODEL_VERSION, RESEARCH_SCHEMA_VERSION } from "@/lib/constants";
import { getRuntimeContext, withWorkspaceTransaction } from "@/server/db";
import { getResearchEnvironment } from "@/server/env";
import {
  isResearchProviderConfigured,
  ResearchConfigurationError,
  ResearchSchemaError,
  runOpenAIResearch,
} from "@/server/ai/openai-research-adapter";
import {
  appendResearchReviewFeedback,
  assertResearchQueueEligibility,
  buildCanonicalResearchPayload,
  collectBaselineSourceIds,
  opportunityIdFromResearchTarget,
  plainObject,
  researchPromptConstraints,
  researchResultFromProposedReview,
  type PlainObject,
} from "@/server/services/research-values";
import {
  materializeApprovedResearchFactor,
  researchBaselineObject,
} from "@/server/services/research-materialization";
import { contentHash } from "@/server/services/segment-workflow";

interface ResearchSegmentContext {
  saved_segment_id: string;
  title: string;
  resolved_version_no: number;
  pinned_result_id: string | null;
  query_id: string | null;
  result_id: string | null;
  estimate_id: string | null;
  filter_json: unknown;
  result_summary: unknown;
  primary_entity_unit: string | null;
  estimate_status: string | null;
  denominator_definition: string | null;
  data_version: string | null;
  data_layer: string | null;
  approval_status: string | null;
  count_low: string | null;
  count_base: string | null;
  count_high: string | null;
}

type ResearchConditionClass = "feature" | "behavior" | "subtype" | "archetype";

interface ResearchSegmentConditionContext {
  condition_id: string;
  group_id: string;
  group_logic: "AND" | "OR" | "NOT";
  group_enabled: boolean;
  condition_namespace: string;
  source_code: string;
  operator: string;
  value_json: unknown;
  entity_unit: string;
  resolution_status: string;
  source_text: string | null;
  dependency_group: string | null;
  reference_year: number | null;
  evidence_id: number | null;
  ordinal: number;
  enabled: boolean;
}

function researchConditionClass(condition: ResearchSegmentConditionContext): ResearchConditionClass | null {
  const namespace = condition.condition_namespace.toLowerCase();
  const sourceCode = condition.source_code.toLowerCase();
  if (namespace === "subtype" || sourceCode.startsWith("subtype:")) return "subtype";
  if (namespace === "archetype" || sourceCode.startsWith("archetype:")) return "archetype";
  if (sourceCode.startsWith("behavior:") || sourceCode.startsWith("tag:")) return "behavior";
  if (["core_feature", "domain_feature", "dimension"].includes(namespace)
    || sourceCode.startsWith("feature:")
    || sourceCode.startsWith("core_feature:")
    || sourceCode.startsWith("domain_feature:")) return "feature";
  return null;
}

function normalizedResearchConditionClasses(
  conditions: ResearchSegmentConditionContext[],
): Record<ResearchConditionClass, PlainObject[]> {
  const classes: Record<ResearchConditionClass, PlainObject[]> = {
    feature: [],
    behavior: [],
    subtype: [],
    archetype: [],
  };
  for (const condition of conditions) {
    const conditionClass = researchConditionClass(condition);
    if (!conditionClass) continue;
    classes[conditionClass].push({
      conditionId: condition.condition_id,
      groupId: condition.group_id,
      groupLogic: condition.group_logic,
      groupEnabled: condition.group_enabled,
      conditionClass,
      namespace: condition.condition_namespace,
      sourceCode: condition.source_code,
      operator: condition.operator,
      value: condition.value_json,
      entityUnit: condition.entity_unit,
      resolutionStatus: condition.resolution_status,
      sourceText: condition.source_text,
      dependencyGroup: condition.dependency_group,
      referenceYear: condition.reference_year,
      evidenceId: condition.evidence_id,
      ordinal: condition.ordinal,
      enabled: condition.enabled,
    });
  }
  return classes;
}

function requiredActorId(): string {
  const actorId = getRuntimeContext().actorId;
  if (!actorId) throw new Error("actor_context_required");
  return actorId;
}

async function appendEvent(
  client: PoolClient,
  jobId: string,
  eventType: string,
  payload: unknown = {},
): Promise<void> {
  await client.query(
    `INSERT INTO research_job_event (research_job_id, sequence_no, event_type, payload)
     SELECT $1, coalesce(max(sequence_no),0)+1, $2, $3::jsonb
     FROM research_job_event WHERE research_job_id=$1`,
    [jobId, eventType, JSON.stringify(payload)],
  );
}

async function appendAudit(
  client: PoolClient,
  aggregateType: string,
  aggregateId: string,
  action: string,
  before: unknown,
  after: unknown,
): Promise<void> {
  const context = getRuntimeContext();
  await client.query(
    `INSERT INTO audit_event (
       workspace_id, actor_id, aggregate_type, aggregate_id, action,
       before_json, after_json, diff_json
     ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb)`,
    [context.workspaceId, requiredActorId(), aggregateType, aggregateId, action,
      before === null ? null : JSON.stringify(before),
      after === null ? null : JSON.stringify(after),
      JSON.stringify({ after_hash: contentHash(after) })],
  );
}

export async function createResearchJob(input: {
  segmentId?: string | null;
  targetSegment: string;
  targetVariable: string;
  researchQuestion: string;
  baseline?: unknown;
}): Promise<{ id: string; configurationRequired: boolean }> {
  const actorId = requiredActorId();
  const configured = isResearchProviderConfigured();
  const environment = getResearchEnvironment();
  const targetSegment = input.targetSegment.trim();
  const targetVariable = input.targetVariable.trim();
  const researchQuestion = input.researchQuestion.trim();
  if (!targetSegment) throw new Error("target_segment_required");
  if (!targetVariable) throw new Error("target_variable_required");
  if (!researchQuestion) throw new Error("research_question_required");
  assertNoHighConfidencePersonalData({
    targetSegment,
    targetVariable,
    researchQuestion,
    baseline: input.baseline,
  });
  assertResearchQueueEligibility({
    targetVariable,
    explicitBaseline: input.baseline,
  });
  return withWorkspaceTransaction(async (client: PoolClient) => {
    const context = getRuntimeContext();
    let segment: ResearchSegmentContext | null = null;
    if (input.segmentId) {
      segment = (await client.query<ResearchSegmentContext>(
        `SELECT latest.saved_segment_id,latest.title,latest.resolved_version_no,latest.pinned_result_id,
                latest.query_id,latest.result_id,latest.estimate_id,
                latest.filter_json,latest.result_summary,latest.primary_entity_unit,
                latest.estimate_status,latest.data_layer,latest.approval_status,
                latest.count_low,latest.count_base,latest.count_high,
                estimate.denominator_definition,estimate.data_version
         FROM v_saved_segment_latest latest
         LEFT JOIN v_estimate_release_boundary estimate ON estimate.estimate_id=latest.estimate_id
         WHERE latest.saved_segment_id=$1`,
        [input.segmentId],
      )).rows[0] ?? null;
      if (!segment) throw new Error("saved_segment_not_found");
    }
    const segmentConditions = segment?.query_id ? (await client.query<ResearchSegmentConditionContext>(
      `WITH RECURSIVE group_state AS (
         SELECT scg.*,scg.enabled AS effectively_enabled
           FROM segment_condition_group scg
          WHERE scg.query_id=$1 AND scg.parent_group_id IS NULL
         UNION ALL
         SELECT child.*,parent.effectively_enabled AND child.enabled
           FROM segment_condition_group child
           JOIN group_state parent
             ON parent.query_id=child.query_id AND parent.group_id=child.parent_group_id
       )
       SELECT sc.condition_id,sc.group_id,scg.logical_operator AS group_logic,
              scg.effectively_enabled AS group_enabled,sc.condition_namespace,sc.source_code,
              sc.operator,sc.value_json,sc.entity_unit,sc.resolution_status,
              sc.source_text,sc.dependency_group,sc.reference_year,sc.evidence_id,
              sc.ordinal,(sc.enabled AND scg.effectively_enabled) AS enabled
         FROM segment_condition sc
         JOIN group_state scg
           ON scg.query_id=sc.query_id AND scg.group_id=sc.group_id
        WHERE sc.query_id=$1
        ORDER BY scg.ordinal,sc.ordinal,sc.condition_id`,
      [segment.query_id],
    )).rows : [];
    const attachedBaseline = segment ? {
      savedSegmentId: segment.saved_segment_id,
      savedSegmentVersionNo: segment.resolved_version_no,
      segmentTitle: segment.title,
      queryId: segment.query_id,
      resultId: segment.result_id,
      pinnedResultId: segment.pinned_result_id,
      estimateId: segment.estimate_id,
      filter: segment.filter_json,
      filterDefinition: segment.filter_json,
      normalizedConditionClasses: normalizedResearchConditionClasses(segmentConditions),
      result: segment.result_summary,
      status: segment.estimate_status ?? (segment.count_base === null ? "not_estimable" : "estimated"),
      unit: segment.primary_entity_unit,
      denominator: segment.denominator_definition,
      definition: `저장 세그먼트 ${segment.title}의 고정된 estimate snapshot`,
      version: segment.data_version,
      dataLayer: segment.data_layer,
      approvalStatus: segment.approval_status,
      count: { low: segment.count_low, base: segment.count_base, high: segment.count_high },
    } : null;
    const payload = buildCanonicalResearchPayload({
      researchQuestion,
      targetSegment,
      targetVariable,
      explicitBaseline: input.baseline,
      attachedBaseline,
    });
    // The attached segment snapshot is loaded after the request-level scan.
    // Re-scan the complete canonical payload immediately before it can be
    // persisted or queued for a provider.
    assertNoHighConfidencePersonalData(payload);
    const inputHash = contentHash(payload);
    const status = configured ? "queued" : "configuration_required";
    const inserted = await client.query<{ research_job_id: string; status: string }>(
      `INSERT INTO research_job (
         workspace_id, saved_segment_id, query_id, research_question,
         target_segment, target_variable, provider, provider_model,
         output_schema_version, input_payload, input_hash, idempotency_key,
         status, created_by_actor_id, queued_at
       ) VALUES ($1,$2,$3,$4,$5,$6,'openai',$7,$8,$9::jsonb,$10,$10,$11,$12,
                 CASE WHEN $11='queued' THEN now() ELSE NULL END)
       ON CONFLICT (workspace_id, idempotency_key) WHERE idempotency_key IS NOT NULL
       DO UPDATE SET updated_at=research_job.updated_at
       RETURNING research_job_id,status`,
      [context.workspaceId, segment?.saved_segment_id ?? null, segment?.query_id ?? null,
        researchQuestion, targetSegment, targetVariable,
        environment.OPENAI_RESEARCH_MODEL, RESEARCH_SCHEMA_VERSION,
        JSON.stringify(payload), inputHash, status, actorId],
    );
    const id = inserted.rows[0].research_job_id;
    const persistedStatus = inserted.rows[0].status;
    const eventCount = await client.query<{ count: string }>("SELECT count(*)::text AS count FROM research_job_event WHERE research_job_id=$1", [id]);
    const created = Number(eventCount.rows[0].count) === 0;
    if (created) {
      await appendEvent(client, id, configured ? "queued" : "configuration_required", {
        provider: "openai",
        reason: configured ? null : "OPENAI_RESEARCH_ENABLED=true and OPENAI_API_KEY are both required in the worker environment.",
      });
      await client.query(
        `INSERT INTO research_job_step (research_job_id, step_no, step_name, status, input_hash)
         VALUES ($1,1,'provider_research',$2,$3)`,
        [id, configured ? "queued" : "skipped", inputHash],
      );
    }
    await appendAudit(client, "research_job", id, created ? "create" : "reuse_idempotent", null, {
      ...payload,
      status: persistedStatus,
    });
    return { id, configurationRequired: persistedStatus === "configuration_required" };
  });
}

export async function cancelResearchJob(jobId: string): Promise<void> {
  return withWorkspaceTransaction(async (client: PoolClient) => {
    const current = await client.query<{ status: string }>("SELECT status FROM research_job WHERE research_job_id=$1 FOR UPDATE", [jobId]);
    if (!current.rows[0]) throw new Error("research_job_not_found");
    if (!["draft", "queued", "running", "configuration_required"].includes(current.rows[0].status)) {
      throw new Error("research_job_is_not_cancellable");
    }
    const cancelled = await client.query(
      `UPDATE research_job SET status='cancelled', finished_at=now(), updated_at=now()
       WHERE research_job_id=$1 AND status=$2`,
      [jobId, current.rows[0].status],
    );
    if (cancelled.rowCount !== 1) throw new Error("research_job_cancel_conflict");
    await appendEvent(client, jobId, "cancelled", { previousStatus: current.rows[0].status });
    await appendAudit(client, "research_job", jobId, "cancel", current.rows[0], { status: "cancelled" });
  });
}

export function researchJobCanBeRequeued(status: string): boolean {
  return status === "configuration_required" || status === "failed";
}

export async function requeueResearchJob(jobId: string): Promise<void> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(jobId)) {
    throw new Error("research_job_id_must_be_uuid");
  }
  if (!isResearchProviderConfigured()) {
    throw new ResearchConfigurationError(
      "OPENAI_RESEARCH_ENABLED=true and OPENAI_API_KEY are required before requeueing external research",
    );
  }
  return withWorkspaceTransaction(async (client: PoolClient) => {
    const current = await client.query<{ status: string; attempt_count: number; max_attempts: number }>(
      "SELECT status,attempt_count,max_attempts FROM research_job WHERE research_job_id=$1 FOR UPDATE",
      [jobId],
    );
    const before = current.rows[0];
    if (!before) throw new Error("research_job_not_found");
    if (!researchJobCanBeRequeued(before.status)) throw new Error("research_job_is_not_requeueable");

    const requeued = await client.query(
      `UPDATE research_job
          SET status='queued', next_attempt_at=now(), queued_at=coalesce(queued_at,now()),
              started_at=NULL, finished_at=NULL, error_code=NULL, error_message=NULL,
              max_attempts=greatest(max_attempts,attempt_count+3), updated_at=now()
        WHERE research_job_id=$1 AND status=$2`,
      [jobId, before.status],
    );
    if (requeued.rowCount !== 1) throw new Error("research_job_requeue_conflict");
    await client.query(
      `UPDATE research_job_step
          SET status='queued', started_at=NULL, finished_at=NULL,
              error_code=NULL, error_message=NULL, updated_at=now()
        WHERE research_job_id=$1 AND step_no=1`,
      [jobId],
    );
    await appendEvent(client, jobId, "requeued_after_configuration", {
      previousStatus: before.status,
      provider: "openai",
    });
    await appendAudit(client, "research_job", jobId, "requeue_after_configuration", before, {
      status: "queued",
      provider: "openai",
    });
  });
}

interface ClaimedJob {
  research_job_id: string;
  research_question: string;
  target_segment: string;
  target_variable: string;
  input_payload: PlainObject;
  input_hash: string;
  attempt_count: number;
  max_attempts: number;
  workspace_id: string;
  created_by_actor_id: string;
  saved_segment_id: string | null;
  query_id: string | null;
}

async function recoverExpiredRunningJobs(client: PoolClient): Promise<void> {
  const leaseMs = getResearchEnvironment().RESEARCH_RUNNING_LEASE_MS;
  const stale = await client.query<{
    research_job_id: string;
    attempt_count: number;
    max_attempts: number;
  }>(
    `SELECT research_job_id,attempt_count,max_attempts
       FROM research_job
      WHERE status='running'
        AND updated_at <= now() - ($1::double precision * interval '1 millisecond')
      ORDER BY updated_at
      FOR UPDATE SKIP LOCKED
      LIMIT 50`,
    [leaseMs],
  );
  for (const row of stale.rows) {
    const retry = row.attempt_count < row.max_attempts;
    const recoveredStatus = retry ? "queued" : "failed";
    await client.query(
      `UPDATE research_job
          SET status=$2,
              next_attempt_at=CASE WHEN $2='queued' THEN now() ELSE NULL END,
              finished_at=CASE WHEN $2='failed' THEN now() ELSE NULL END,
              error_code='worker_lease_expired',
              error_message='The worker lease expired before the attempt completed.',
              updated_at=now()
        WHERE research_job_id=$1 AND status='running' AND attempt_count=$3`,
      [row.research_job_id, recoveredStatus, row.attempt_count],
    );
    await client.query(
      `UPDATE research_job_step
          SET status=$2,error_code='worker_lease_expired',
              error_message='The worker lease expired before the attempt completed.',
              finished_at=CASE WHEN $2='failed' THEN now() ELSE NULL END,updated_at=now()
        WHERE research_job_id=$1 AND step_no=1 AND status='running'`,
      [row.research_job_id, retry ? "retrying" : "failed"],
    );
    await appendEvent(client, row.research_job_id, retry ? "lease_expired_requeued" : "lease_expired_failed", {
      attempt: row.attempt_count,
      leaseMs,
    });
  }
}

async function claimJob(jobId: string | null, allowConfigurationRequired = false): Promise<ClaimedJob | null> {
  return withWorkspaceTransaction(async (client: PoolClient) => {
    await recoverExpiredRunningJobs(client);
    const result = await client.query<ClaimedJob>(
      `SELECT * FROM research_job
       WHERE (status='queued' OR ($2::boolean AND status='configuration_required'))
         AND (next_attempt_at IS NULL OR next_attempt_at <= now())
         AND attempt_count < max_attempts
         AND ($1::uuid IS NULL OR research_job_id=$1)
       ORDER BY priority, created_at
       FOR UPDATE SKIP LOCKED LIMIT 1`,
      [jobId, allowConfigurationRequired],
    );
    const job = result.rows[0];
    if (!job) return null;
    await client.query(
      `UPDATE research_job SET status='running', attempt_count=attempt_count+1,
         started_at=coalesce(started_at,now()), updated_at=now(), error_code=NULL, error_message=NULL
       WHERE research_job_id=$1`,
      [job.research_job_id],
    );
    await client.query(
      `UPDATE research_job_step SET status='running', started_at=now(), updated_at=now()
       WHERE research_job_id=$1 AND step_no=1`,
      [job.research_job_id],
    );
    await appendEvent(client, job.research_job_id, "running", { attempt: job.attempt_count + 1 });
    return { ...job, attempt_count: job.attempt_count + 1 };
  });
}

async function completeJob(job: ClaimedJob, output: Awaited<ReturnType<typeof runOpenAIResearch>>): Promise<void> {
  await withWorkspaceTransaction(async (client: PoolClient) => {
    const active = await client.query<{ status: string; attempt_count: number }>(
      "SELECT status,attempt_count FROM research_job WHERE research_job_id=$1 FOR UPDATE",
      [job.research_job_id],
    );
    if (active.rows[0]?.status !== "running" || active.rows[0].attempt_count !== job.attempt_count) {
      return;
    }
    const resultHash = contentHash(output.result);
    const canonicalBaseline = plainObject(job.input_payload.baseline) ?? {};
    const parsedCanonicalBaseline = researchBaselineSchema.safeParse(canonicalBaseline);
    if (!parsedCanonicalBaseline.success) {
      throw new ResearchSchemaError("The canonical research baseline is invalid for confidence calculation.");
    }
    const serverConfidenceAssessment = calculateCanonicalResearchConfidence(output.result, {
      researchQuestion: job.research_question,
      targetSegment: job.target_segment,
      targetVariable: job.target_variable,
      existingBaseline: parsedCanonicalBaseline.data,
    });
    const canonicalBaselineHash = contentHash(canonicalBaseline);
    const providerBaselineHash = contentHash(output.result.existingBaseline);
    const baselineEchoMatchesCanonical = providerBaselineHash === canonicalBaselineHash;
    const identityMismatchFields = [
      output.result.researchQuestion === job.research_question ? null : "researchQuestion",
      output.result.targetSegment === job.target_segment ? null : "targetSegment",
      output.result.targetVariable === job.target_variable ? null : "targetVariable",
    ].filter((field): field is string => field !== null);
    const providerIdentityMatchesCanonical = identityMismatchFields.length === 0;
    const validationWarnings: PlainObject[] = [];
    if (!baselineEchoMatchesCanonical) {
      validationWarnings.push({
        code: "provider_baseline_echo_mismatch",
        message: "The provider baseline echo differs from the canonical job input. The canonical input remains authoritative.",
        canonicalBaselineHash,
        providerBaselineHash,
      });
    }
    if (!providerIdentityMatchesCanonical) {
      validationWarnings.push({
        code: "provider_identity_echo_mismatch",
        message: "Provider identity fields differ from the canonical job input. Canonical job values remain authoritative.",
        fields: identityMismatchFields,
      });
    }
    const structuredArtifactPayload = {
      result: output.result,
      provider: output.provider,
      model: output.model,
      usage: output.usage,
      webSearchSourceUrls: output.webSearchSourceUrls,
      providerConfidenceComponents: output.result.confidenceComponents,
      serverConfidenceAssessment,
      validation: {
        baselineEchoMatchesCanonical,
        canonicalBaselineHash,
        providerBaselineHash,
        providerIdentityMatchesCanonical,
        identityMismatchFields,
      },
    };
    const artifactHash = contentHash(structuredArtifactPayload);
    await client.query(
      `INSERT INTO research_job_artifact (
         research_job_id, research_job_step_id, artifact_kind,
         artifact_uri, sha256, media_type, structured_payload, schema_version,
         validation_status, validation_errors
       ) SELECT $1, research_job_step_id, 'structured_result', $2, $3,
                'application/json', $4::jsonb, $5, 'valid', $6::jsonb
         FROM research_job_step WHERE research_job_id=$1 AND step_no=1`,
      [job.research_job_id, `openai-response:${output.responseId}`, artifactHash,
        JSON.stringify(structuredArtifactPayload),
        RESEARCH_SCHEMA_VERSION, JSON.stringify(validationWarnings)],
    );
    const proposedPayload = {
      researchQuestion: job.research_question,
      targetSegment: job.target_segment,
      targetVariable: job.target_variable,
      factors: output.result.proposedFactors,
      lowBaseHigh: output.result.lowBaseHigh,
      denominator: output.result.denominator,
      geography: output.result.geography,
      referenceYear: output.result.referenceYear,
      sources: output.result.sources,
      webSearchSourceUrls: output.webSearchSourceUrls,
      citations: output.result.citations,
      inferenceMethod: output.result.inferenceMethod,
      limitations: output.result.limitations,
      providerConfidenceComponents: output.result.confidenceComponents,
      serverConfidenceAssessment,
      confidenceComponents: serverConfidenceAssessment.components,
      confidencePenalties: serverConfidenceAssessment.penalties,
      confidenceScore: serverConfidenceAssessment.score,
      confidenceGrade: serverConfidenceAssessment.grade,
      confidenceRuleVersion: serverConfidenceAssessment.ruleVersion,
      confidenceSignals: serverConfidenceAssessment.signals,
      variablesToVerify: output.result.variablesToVerify,
      opportunityIdeaBrief: output.result.opportunityIdeaBrief,
    };
    const canonicalBaselineVersion = canonicalBaseline.dataVersion
      ?? canonicalBaseline.data_version
      ?? canonicalBaseline.version
      ?? "baseline-current";
    const reviewCompleteness = buildResearchReviewCompleteness({
      baseline: canonicalBaseline,
      baselineConfidenceSource: job.input_payload.snapshotProvenance ?? canonicalBaseline,
      proposedInterval: output.result.lowBaseHigh,
      proposedDenominator: output.result.denominator,
      proposedConfidence: serverConfidenceAssessment,
      sources: output.result.sources,
      affectedSegments: output.result.affectedSegments,
      calculationRelevantTarget: false,
      materializedCalculationDependency: false,
      computedAt: new Date().toISOString(),
    });
    const revision = await client.query<{ proposed_revision_id: string }>(
      `INSERT INTO proposed_revision (
         workspace_id, research_job_id, target_kind, target_record_key,
         baseline_data_version, baseline_content_hash, baseline_payload,
         proposed_content_hash, proposed_payload, delta_summary,
         affected_segments, expected_recalculation, recommended_action,
         status, created_by_actor_id
       ) VALUES ($1,$2,'other',$3,$4,$5,$6::jsonb,$7,$8::jsonb,$9::jsonb,$10::jsonb,$11::jsonb,$12,'pending_review',$13)
       ON CONFLICT (research_job_id, target_kind, target_record_key, proposed_content_hash)
         WHERE research_job_id IS NOT NULL
       DO UPDATE SET updated_at=proposed_revision.updated_at
      RETURNING proposed_revision_id`,
      [job.workspace_id, job.research_job_id, `${job.target_segment}:${job.target_variable}`,
        String(canonicalBaselineVersion), canonicalBaselineHash, JSON.stringify(canonicalBaseline),
        contentHash(proposedPayload), JSON.stringify(proposedPayload),
        JSON.stringify({
          ...reviewCompleteness.deltaSummary,
          proposedFactorCount: output.result.proposedFactors.length,
          hasInterval: output.result.lowBaseHigh !== null,
          baselineEchoMatchesCanonical,
          providerIdentityMatchesCanonical,
          identityMismatchFields,
        }),
        JSON.stringify(reviewCompleteness.affectedSegmentIds),
        JSON.stringify(reviewCompleteness.expectedRecalculation),
        output.result.recommendedAction, job.created_by_actor_id],
    );
    const revisionId = revision.rows[0].proposed_revision_id;
    await client.query(
      `INSERT INTO review_item (
         workspace_id, proposed_revision_id, status, priority, created_by_actor_id
       ) VALUES ($1,$2,'pending',2,$3)
       ON CONFLICT (proposed_revision_id) WHERE proposed_revision_id IS NOT NULL
       DO UPDATE SET status=CASE WHEN review_item.status='changes_requested' THEN 'pending' ELSE review_item.status END,
                     updated_at=now()`,
      [job.workspace_id, revisionId, job.created_by_actor_id],
    );
    const completed = await client.query(
      `UPDATE research_job SET status='needs_review', provider=$2, provider_model=$3,
         finished_at=now(), updated_at=now()
       WHERE research_job_id=$1 AND status='running' AND attempt_count=$4`,
      [job.research_job_id, output.provider, output.model, job.attempt_count],
    );
    if (completed.rowCount !== 1) throw new Error("research_job_completion_conflict");
    await client.query(
      `UPDATE research_job_step SET status='succeeded', output_hash=$2,
         finished_at=now(), updated_at=now()
       WHERE research_job_id=$1 AND step_no=1 AND status='running'`,
      [job.research_job_id, resultHash],
    );
    await appendEvent(client, job.research_job_id, "needs_review", {
      revisionId,
      resultHash,
      artifactHash,
      responseId: output.responseId,
      webSearchSourceCount: output.webSearchSourceUrls.length,
      baselineEchoMatchesCanonical,
      providerIdentityMatchesCanonical,
      identityMismatchFields,
      confidenceScore: serverConfidenceAssessment.score,
      confidenceGrade: serverConfidenceAssessment.grade,
      confidenceRuleVersion: serverConfidenceAssessment.ruleVersion,
    });
  }, { workspaceId: job.workspace_id, actorId: job.created_by_actor_id });
}

async function failJob(job: ClaimedJob, error: unknown): Promise<void> {
  const configuration = error instanceof ResearchConfigurationError;
  const schema = error instanceof ResearchSchemaError;
  const message = error instanceof Error ? error.message : String(error);
  const code = configuration ? "configuration_required" : schema ? "schema_validation_failed" : "provider_request_failed";
  const retry = !configuration && job.attempt_count < job.max_attempts;
  const status = configuration ? "configuration_required" : retry ? "queued" : "failed";
  await withWorkspaceTransaction(async (client: PoolClient) => {
    const active = await client.query<{ status: string; attempt_count: number }>(
      "SELECT status,attempt_count FROM research_job WHERE research_job_id=$1 FOR UPDATE",
      [job.research_job_id],
    );
    if (active.rows[0]?.status !== "running" || active.rows[0].attempt_count !== job.attempt_count) {
      return;
    }
    await client.query(
      `INSERT INTO research_job_artifact (
         research_job_id, research_job_step_id, artifact_kind, structured_payload,
         schema_version, validation_status, validation_errors
       ) SELECT $1,research_job_step_id,'error',$2::jsonb,$3,'invalid',$4::jsonb
         FROM research_job_step WHERE research_job_id=$1 AND step_no=1`,
      [job.research_job_id, JSON.stringify({ code, message }), RESEARCH_SCHEMA_VERSION,
        JSON.stringify([{ code, message }])],
    );
    const failed = await client.query(
      `UPDATE research_job SET status=$2, error_code=$3, error_message=$4,
         next_attempt_at=CASE WHEN $2='queued' THEN now() + make_interval(secs => LEAST(60, power(2,attempt_count)::int)) ELSE NULL END,
         finished_at=CASE WHEN $2 IN ('failed','configuration_required') THEN now() ELSE finished_at END,
         updated_at=now() WHERE research_job_id=$1 AND status='running' AND attempt_count=$5`,
      [job.research_job_id, status, code, message.slice(0, 2000), job.attempt_count],
    );
    if (failed.rowCount !== 1) throw new Error("research_job_failure_conflict");
    await client.query(
      `UPDATE research_job_step SET status=$2, error_code=$3, error_message=$4,
         finished_at=CASE WHEN $2='failed' THEN now() ELSE finished_at END, updated_at=now()
       WHERE research_job_id=$1 AND step_no=1`,
      [job.research_job_id, retry ? "retrying" : configuration ? "skipped" : "failed", code, message.slice(0, 2000)],
    );
    await appendEvent(client, job.research_job_id, status, { code, retry, attempt: job.attempt_count });
  }, { workspaceId: job.workspace_id, actorId: job.created_by_actor_id });
}

async function processClaimedResearchJob(job: ClaimedJob | null): Promise<string | null> {
  if (!job) return null;
  try {
    const baseline = plainObject(job.input_payload.baseline) ?? {};
    const snapshotProvenance = plainObject(job.input_payload.snapshotProvenance);
    const output = await runOpenAIResearch({
      researchQuestion: job.research_question,
      targetSegment: job.target_segment,
      targetVariable: job.target_variable,
      baseline,
      snapshotProvenance,
      constraints: researchPromptConstraints(job.input_payload),
    });
    await completeJob(job, output);
  } catch (error) {
    await failJob(job, error);
  }
  return job.research_job_id;
}

export async function processNextResearchJob(): Promise<string | null> {
  return processClaimedResearchJob(await claimJob(null));
}

export async function processResearchJob(jobId: string): Promise<string | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(jobId)) {
    throw new Error("research_job_id_must_be_uuid");
  }
  // Exact one-shot processing may resume a job that was deliberately parked
  // while credentials were unavailable. The adapter still requires both the
  // explicit enable flag and API key before any external request is made.
  return processClaimedResearchJob(await claimJob(jobId, true));
}

export type ReviewAction = "approve" | "approve_modified" | "reject" | "request_more_research" | "keep_baseline";

export interface ReviewDecisionPolicy {
  databaseAction: "approve" | "modify_and_approve" | "reject" | "request_more_research" | "keep_existing";
  approvalPayload: "original" | "modified" | null;
  requestsMoreResearch: boolean;
  nonApprovalReviewStatus: "rejected" | "closed" | null;
}

export function reviewDecisionPolicy(decision: ReviewAction): ReviewDecisionPolicy {
  if (decision === "approve") return {
    databaseAction: "approve",
    approvalPayload: "original",
    requestsMoreResearch: false,
    nonApprovalReviewStatus: null,
  };
  if (decision === "approve_modified") return {
    databaseAction: "modify_and_approve",
    approvalPayload: "modified",
    requestsMoreResearch: false,
    nonApprovalReviewStatus: null,
  };
  if (decision === "request_more_research") return {
    databaseAction: "request_more_research",
    approvalPayload: null,
    requestsMoreResearch: true,
    nonApprovalReviewStatus: null,
  };
  return {
    databaseAction: decision === "keep_baseline" ? "keep_existing" : "reject",
    approvalPayload: null,
    requestsMoreResearch: false,
    nonApprovalReviewStatus: decision === "keep_baseline" ? "closed" : "rejected",
  };
}

function affectedSegmentIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string =>
    typeof item === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item),
  ))];
}

interface ReviewResearchContext {
  review_item_id: string;
  workspace_id: string;
  status: string;
  proposed_revision_id: string;
  research_job_id: string | null;
  proposed_payload: PlainObject;
  baseline_payload: PlainObject;
  target_record_key: string;
  target_kind: string;
  affected_segments: unknown;
  materialized_estimate_id: string | null;
  research_question: string | null;
  research_target_segment: string | null;
  research_target_variable: string | null;
  research_provider_model: string | null;
  research_saved_segment_id: string | null;
  research_input_payload: PlainObject | null;
  research_input_hash: string | null;
}

interface VerifiedSnapshotSourceIds {
  candidates: string[];
  verified: string[];
  rejected: string[];
}

interface VerifiedSnapshotCondition {
  conditionId: string;
  conditionNamespace: string;
  sourceCode: string;
  operator: string;
  value: unknown;
  entityUnit: string;
  resolutionStatus: string;
  sourceText: string | null;
  dependencyGroup: string | null;
  referenceYear: number | null;
  evidenceId: number | null;
  catalogSourceKind: string;
  catalogSourceRecordId: string;
  catalogDomainId: string | null;
  catalogDimensionId: string | null;
  catalogLabel: string;
  catalogDefinition: string;
  catalogSensitiveClass: string;
}

interface VerifiedSnapshotConditionReferences {
  candidates: string[];
  verified: VerifiedSnapshotCondition[];
  rejected: string[];
}

function snapshotText(record: PlainObject | null, ...keys: string[]): string | null {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

async function verifySnapshotSourceIds(
  client: PoolClient,
  snapshotProvenance: unknown,
  queryResultId: string | null,
  prefix: "subtype" | "archetype",
): Promise<VerifiedSnapshotSourceIds> {
  const candidates = collectBaselineSourceIds(snapshotProvenance, prefix);
  if (!candidates.length || !queryResultId) {
    return { candidates, verified: [], rejected: candidates };
  }
  const activeConditions = await client.query<{ condition_namespace: string; source_code: string }>(
    `WITH RECURSIVE group_state AS (
       SELECT scg.query_id,scg.group_id,scg.parent_group_id,
              scg.enabled AS effectively_enabled
         FROM v_segment_query_result_release_boundary sqr
         JOIN segment_condition_group scg ON scg.query_id=sqr.query_id
        WHERE sqr.result_id=$1 AND scg.parent_group_id IS NULL
       UNION ALL
       SELECT child.query_id,child.group_id,child.parent_group_id,
              parent.effectively_enabled AND child.enabled
         FROM segment_condition_group child
         JOIN group_state parent
           ON parent.query_id=child.query_id AND parent.group_id=child.parent_group_id
     )
     SELECT DISTINCT sc.condition_namespace,sc.source_code
       FROM segment_condition sc
       JOIN group_state state USING (query_id,group_id)
      WHERE state.effectively_enabled AND sc.enabled`,
    [queryResultId],
  );
  const pinnedIds = new Set(activeConditions.rows.flatMap((condition) => {
    if (condition.condition_namespace.toLowerCase() !== prefix) return [];
    const marker = `${prefix}:`;
    if (!condition.source_code.toLowerCase().startsWith(marker)) return [];
    return [condition.source_code.slice(marker.length).trim()];
  }).filter(Boolean));
  const pinnedCandidates = candidates.filter((id) => pinnedIds.has(id));
  if (!pinnedCandidates.length) {
    return { candidates, verified: [], rejected: candidates };
  }
  const registry = prefix === "subtype"
    ? await client.query<{ source_id: string }>(
      "SELECT subtype_id AS source_id FROM subtype_definition WHERE subtype_id=ANY($1::text[])",
      [pinnedCandidates],
    )
    : await client.query<{ source_id: string }>(
      "SELECT archetype_id AS source_id FROM archetype WHERE archetype_id=ANY($1::text[])",
      [pinnedCandidates],
    );
  const registered = new Set(registry.rows.map((row) => row.source_id));
  const verified = pinnedCandidates.filter((id) => registered.has(id)).sort();
  const verifiedSet = new Set(verified);
  return {
    candidates,
    verified,
    rejected: candidates.filter((id) => !verifiedSet.has(id)).sort(),
  };
}

async function verifySnapshotConditionReferences(
  client: PoolClient,
  queryResultId: string,
  candidates: string[],
  conditionClass: "feature" | "behavior",
): Promise<VerifiedSnapshotConditionReferences> {
  const expectedSourceKinds = conditionClass === "feature"
    ? ["core_feature", "domain_feature", "dimension_value"]
    : ["behavior", "tag"];
  const normalizedCandidates = [...new Set(candidates)].sort();
  if (!normalizedCandidates.length) return { candidates: [], verified: [], rejected: [] };

  const conditions = await client.query<{
    condition_id: string;
    condition_namespace: string;
    source_code: string;
    operator: string;
    value_json: unknown;
    entity_unit: string;
    resolution_status: string;
    source_text: string | null;
    dependency_group: string | null;
    reference_year: number | null;
    evidence_id: number | null;
    ordinal: number;
    catalog_source_kind: string;
    catalog_source_record_id: string;
    catalog_domain_id: string | null;
    catalog_dimension_id: string | null;
    catalog_label: string;
    catalog_definition: string;
    catalog_sensitive_class: string;
  }>(
    `WITH RECURSIVE group_state AS (
       SELECT scg.query_id,scg.group_id,scg.parent_group_id,scg.ordinal,
              scg.enabled AS effectively_enabled
         FROM v_segment_query_result_release_boundary sqr
         JOIN segment_condition_group scg ON scg.query_id=sqr.query_id
        WHERE sqr.result_id=$1 AND scg.parent_group_id IS NULL
       UNION ALL
       SELECT child.query_id,child.group_id,child.parent_group_id,child.ordinal,
              parent.effectively_enabled AND child.enabled
         FROM segment_condition_group child
         JOIN group_state parent
           ON parent.query_id=child.query_id AND parent.group_id=child.parent_group_id
     )
     SELECT sc.condition_id,sc.condition_namespace,sc.source_code,sc.operator,sc.value_json,
            sc.entity_unit,sc.resolution_status,sc.source_text,sc.dependency_group,
            sc.reference_year,sc.evidence_id,sc.ordinal,
            catalog.source_kind AS catalog_source_kind,
            catalog.source_record_id AS catalog_source_record_id,
            catalog.domain_id AS catalog_domain_id,
            catalog.dimension_id AS catalog_dimension_id,
            catalog.label_ko AS catalog_label,
            catalog.definition AS catalog_definition,
            catalog.sensitive_class AS catalog_sensitive_class
       FROM segment_condition sc
       JOIN group_state state USING (query_id,group_id)
       JOIN production.v_workbench_condition_catalog catalog
         ON catalog.catalog_id=sc.source_code AND catalog.queryable
      WHERE state.effectively_enabled AND sc.enabled
        AND sc.source_code=ANY($2::text[])
        AND catalog.source_kind=ANY($3::text[])
      ORDER BY array_position($2::text[],sc.source_code),state.ordinal,sc.ordinal,sc.condition_id`,
    [queryResultId, normalizedCandidates, expectedSourceKinds],
  );
  const verified = conditions.rows.map((condition) => ({
    conditionId: condition.condition_id,
    conditionNamespace: condition.condition_namespace,
    sourceCode: condition.source_code,
    operator: condition.operator,
    value: condition.value_json,
    entityUnit: condition.entity_unit,
    resolutionStatus: condition.resolution_status,
    sourceText: condition.source_text,
    dependencyGroup: condition.dependency_group,
    referenceYear: condition.reference_year,
    evidenceId: condition.evidence_id,
    catalogSourceKind: condition.catalog_source_kind,
    catalogSourceRecordId: condition.catalog_source_record_id,
    catalogDomainId: condition.catalog_domain_id,
    catalogDimensionId: condition.catalog_dimension_id,
    catalogLabel: condition.catalog_label,
    catalogDefinition: condition.catalog_definition,
    catalogSensitiveClass: condition.catalog_sensitive_class,
  }));
  const verifiedCodes = new Set(verified.map((condition) => condition.sourceCode));
  return {
    candidates: normalizedCandidates,
    verified,
    rejected: normalizedCandidates.filter((sourceCode) => !verifiedCodes.has(sourceCode)),
  };
}

async function appendApprovedOpportunityIdeaBrief(
  client: PoolClient,
  row: ReviewResearchContext,
  proposed: PlainObject,
  publicationVersionId: string,
  actorId: string,
): Promise<string | null> {
  const opportunityId = row.research_target_variable
    ? opportunityIdFromResearchTarget(row.research_target_variable)
    : null;
  if (!opportunityId) return null;
  if (!row.research_job_id) throw new Error("opportunity_idea_research_job_required");
  if (!row.research_saved_segment_id) throw new Error("opportunity_idea_saved_segment_required");

  const canonicalInput = plainObject(row.research_input_payload) ?? {};
  const snapshotRoot = plainObject(canonicalInput.snapshotProvenance);
  const segmentSnapshot = plainObject(snapshotRoot?.segmentContext ?? snapshotRoot?.segment_context)
    ?? snapshotRoot;
  const snapshotSavedSegmentId = snapshotText(segmentSnapshot, "savedSegmentId", "saved_segment_id");
  const snapshotQueryResultId = snapshotText(
    segmentSnapshot,
    "resultId",
    "result_id",
    "pinnedResultId",
    "pinned_result_id",
  );
  if (snapshotSavedSegmentId !== row.research_saved_segment_id || !snapshotQueryResultId) {
    throw new Error("opportunity_idea_research_snapshot_mismatch");
  }

  const ideaBrief = opportunityIdeaBriefSchema.safeParse(proposed.opportunityIdeaBrief);
  if (!ideaBrief.success) throw new Error("approved_opportunity_idea_brief_invalid");

  const provenance = await client.query<{
    opportunity_id: string;
    query_result_id: string | null;
    market_estimate_id: string | null;
  }>(
    `SELECT o.opportunity_id,link.query_result_id,link.market_estimate_id
       FROM opportunity o
       JOIN opportunity_board ob USING (opportunity_board_id)
       JOIN LATERAL (
         SELECT osl.query_result_id,osl.market_estimate_id
           FROM opportunity_segment_link osl
          WHERE osl.opportunity_id=o.opportunity_id
            AND osl.saved_segment_id=$3
            AND osl.link_role='primary_target'
            AND osl.query_result_id=$4
          ORDER BY osl.pinned_at DESC,osl.query_result_id
          LIMIT 1
       ) link ON true
      WHERE o.opportunity_id=$1 AND ob.workspace_id=$2
      FOR UPDATE OF o`,
    [opportunityId, getRuntimeContext().workspaceId, row.research_saved_segment_id, snapshotQueryResultId],
  );
  const pinned = provenance.rows[0];
  if (!pinned) throw new Error("opportunity_idea_research_snapshot_mismatch");
  if (!pinned.query_result_id) throw new Error("opportunity_idea_query_result_required");

  const canonicalBaseline = plainObject(canonicalInput.baseline) ?? {};
  const snapshotProvenance = plainObject(canonicalInput.snapshotProvenance) ?? canonicalBaseline;
  const sources = Array.isArray(proposed.sources) ? proposed.sources : [];
  const citations = Array.isArray(proposed.citations) ? proposed.citations : [];
  const limitations = Array.isArray(proposed.limitations) ? proposed.limitations : [];
  const subtypeSourceIds = await verifySnapshotSourceIds(
    client,
    snapshotProvenance,
    pinned.query_result_id,
    "subtype",
  );
  const archetypeSourceIds = await verifySnapshotSourceIds(
    client,
    snapshotProvenance,
    pinned.query_result_id,
    "archetype",
  );
  const featureConditions = await verifySnapshotConditionReferences(
    client,
    pinned.query_result_id,
    ideaBrief.data.sourceFeatureIds,
    "feature",
  );
  if (featureConditions.rejected.length) {
    throw new Error("approved_opportunity_idea_feature_reference_invalid");
  }
  const behaviorConditions = await verifySnapshotConditionReferences(
    client,
    pinned.query_result_id,
    ideaBrief.data.sourceBehaviorIds,
    "behavior",
  );
  if (behaviorConditions.rejected.length) {
    throw new Error("approved_opportunity_idea_behavior_reference_invalid");
  }
  const content = {
    classification: "ai_hypothesis",
    ideaBrief: ideaBrief.data,
    provenance: {
      researchJobId: row.research_job_id,
      proposedRevisionId: row.proposed_revision_id,
      publicationVersionId,
      researchInputHash: row.research_input_hash,
      canonicalBaselineHash: contentHash(canonicalBaseline),
      queryResultId: pinned.query_result_id,
      marketEstimateId: pinned.market_estimate_id,
      providerModel: row.research_provider_model,
      sources,
      citations,
      limitations,
      providerConfidenceComponents: plainObject(proposed.providerConfidenceComponents),
      serverConfidenceAssessment: plainObject(proposed.serverConfidenceAssessment),
      confidenceComponents: plainObject(proposed.confidenceComponents),
      confidenceScore: proposed.confidenceScore ?? null,
      confidenceGrade: proposed.confidenceGrade ?? null,
      confidenceRuleVersion: proposed.confidenceRuleVersion ?? null,
      sourceIdVerification: {
        subtype: subtypeSourceIds,
        archetype: archetypeSourceIds,
      },
      sourceConditionVerification: {
        feature: featureConditions,
        behavior: behaviorConditions,
      },
    },
  };
  const next = await client.query<{ version_no: number }>(
    `SELECT coalesce(max(version_no),0)+1 AS version_no
       FROM opportunity_content_version
      WHERE opportunity_id=$1 AND content_key='idea_brief'`,
    [opportunityId],
  );
  const inserted = await client.query<{ opportunity_content_version_id: string }>(
    `INSERT INTO opportunity_content_version (
       opportunity_id,content_key,content_type,version_no,content,source_kind,
       source_query_result_id,source_market_estimate_id,source_subtype_ids,
       source_archetype_ids,provider_model,created_by_actor_id
     ) VALUES ($1,'idea_brief','idea_brief',$2,$3::jsonb,'ai_hypothesis',$4,$5,$6::jsonb,$7::jsonb,$8,$9)
     RETURNING opportunity_content_version_id`,
    [opportunityId, next.rows[0].version_no, JSON.stringify(content), pinned.query_result_id,
      pinned.market_estimate_id, JSON.stringify(subtypeSourceIds.verified),
      JSON.stringify(archetypeSourceIds.verified),
      row.research_provider_model, actorId],
  );
  const contentVersionId = inserted.rows[0].opportunity_content_version_id;
  await appendAudit(client, "opportunity_content_version", contentVersionId, "append_ai_hypothesis", null, {
    opportunityId,
    researchJobId: row.research_job_id,
    publicationVersionId,
    sourceQueryResultId: pinned.query_result_id,
    sourceMarketEstimateId: pinned.market_estimate_id,
    sourceSubtypeIds: subtypeSourceIds,
    sourceArchetypeIds: archetypeSourceIds,
    sourceFeatureConditions: featureConditions,
    sourceBehaviorConditions: behaviorConditions,
  });
  return contentVersionId;
}

export async function reviewRevision(input: {
  reviewId: string;
  decision: ReviewAction;
  modification?: unknown;
  note: string;
}): Promise<string> {
  const actorId = requiredActorId();
  const note = input.note.trim();
  if (!note) throw new Error("review_note_required");
  assertNoHighConfidencePersonalData({ note, modification: input.modification });
  return withWorkspaceTransaction(async (client: PoolClient) => {
    const locked = await client.query<ReviewResearchContext>(
      `SELECT ri.review_item_id,ri.workspace_id,ri.status,pr.proposed_revision_id,pr.research_job_id,
              pr.proposed_payload,pr.baseline_payload,pr.target_record_key,pr.target_kind,
              pr.affected_segments,pr.materialized_estimate_id,
              rj.research_question,
              rj.target_segment AS research_target_segment,
              rj.target_variable AS research_target_variable,
              rj.provider_model AS research_provider_model,
              rj.saved_segment_id AS research_saved_segment_id,
              rj.input_payload AS research_input_payload,
              rj.input_hash AS research_input_hash
       FROM review_item ri JOIN proposed_revision pr USING (proposed_revision_id)
       LEFT JOIN research_job rj ON rj.research_job_id=pr.research_job_id
       WHERE ri.review_item_id=$1 FOR UPDATE OF ri,pr`,
      [input.reviewId],
    );
    const row = locked.rows[0];
    if (!row) throw new Error("review_item_not_found");
    const reviewer = await client.query<{ role: string }>(
      `SELECT role FROM workspace_member
        WHERE workspace_id=$1 AND actor_id=$2 AND role IN ('owner','reviewer')
        FOR SHARE`,
      [row.workspace_id, actorId],
    );
    if (!reviewer.rows[0]) throw new Error("reviewer_role_required");
    if (!["pending", "in_review", "changes_requested"].includes(row.status)) throw new Error("review_item_is_terminal");
    const decisionPolicy = reviewDecisionPolicy(input.decision);
    if (decisionPolicy.approvalPayload === "modified" && !input.modification) {
      throw new Error("modification_json_required");
    }
    const sequence = await client.query<{ sequence_no: number }>(
      "SELECT coalesce(max(sequence_no),0)+1 AS sequence_no FROM review_decision WHERE review_item_id=$1",
      [input.reviewId],
    );
    await client.query(
      `INSERT INTO review_decision (
         review_item_id, sequence_no, action, modified_payload, rationale, decided_by_actor_id
       ) VALUES ($1,$2,$3,$4::jsonb,$5,$6)`,
      [input.reviewId, sequence.rows[0].sequence_no, decisionPolicy.databaseAction,
        decisionPolicy.approvalPayload === "modified" ? JSON.stringify(input.modification) : null,
        note, actorId],
    );

    if (decisionPolicy.approvalPayload) {
      const configuredModelVersion = process.env.MARKET_ENGINE_MODEL_VERSION?.trim() || BASELINE_MODEL_VERSION;
      const latestModel = await client.query<{ model_version_id: string; version: string }>(
        "SELECT model_version_id,version FROM model_version WHERE version=$1",
        [configuredModelVersion],
      );
      if (!latestModel.rows[0]) throw new Error("configured_model_version_not_loaded");
      const submittedProposed = plainObject(
        decisionPolicy.approvalPayload === "modified" ? input.modification : row.proposed_payload,
      );
      if (!submittedProposed) throw new Error("approved_proposal_must_be_a_json_object");
      const approvedResearchResult = researchResultFromProposedReview({
        proposed: submittedProposed,
        baseline: row.baseline_payload,
        affectedSegments: row.affected_segments,
        researchQuestion: row.research_question,
        targetSegment: row.research_target_segment,
        targetVariable: row.research_target_variable,
      });
      const approvedConfidence = calculateResearchConfidence(approvedResearchResult);
      const proposed: PlainObject = {
        researchQuestion: approvedResearchResult.researchQuestion,
        targetSegment: approvedResearchResult.targetSegment,
        targetVariable: approvedResearchResult.targetVariable,
        factors: approvedResearchResult.proposedFactors,
        lowBaseHigh: approvedResearchResult.lowBaseHigh,
        denominator: approvedResearchResult.denominator,
        geography: approvedResearchResult.geography,
        referenceYear: approvedResearchResult.referenceYear,
        sources: approvedResearchResult.sources,
        citations: approvedResearchResult.citations,
        inferenceMethod: approvedResearchResult.inferenceMethod,
        limitations: approvedResearchResult.limitations,
        variablesToVerify: approvedResearchResult.variablesToVerify,
        opportunityIdeaBrief: approvedResearchResult.opportunityIdeaBrief,
        recommendedAction: approvedResearchResult.recommendedAction,
        providerConfidenceComponents: approvedResearchResult.confidenceComponents,
        serverConfidenceAssessment: approvedConfidence,
        confidenceComponents: approvedConfidence.components,
        confidencePenalties: approvedConfidence.penalties,
        confidenceScore: approvedConfidence.score,
        confidenceGrade: approvedConfidence.grade,
        confidenceRuleVersion: approvedConfidence.ruleVersion,
        confidenceSignals: approvedConfidence.signals,
      };
      const approvedHash = contentHash(proposed);
      const version = await client.query<{ publication_version_id: string }>(
        `INSERT INTO data_release_version (
           workspace_id,version_label,parent_version_id,baseline_model_version_id,
           status,rationale,approved_by_actor_id,approved_at
         ) VALUES ($1,$2,
           (SELECT publication_version_id FROM data_release_version
             WHERE status IN ('approved','published') AND (workspace_id IS NULL OR workspace_id=$1)
             ORDER BY approved_at DESC LIMIT 1),
           $3,'approved',$4,$5,now()) RETURNING publication_version_id`,
        [getRuntimeContext().workspaceId, `review-${input.reviewId}-${approvedHash.slice(0, 10)}`,
          latestModel.rows[0].model_version_id, note, actorId],
      );
      const materializedFactorId = await materializeApprovedResearchFactor({
        client,
        workspaceId: row.workspace_id,
        proposedRevisionId: row.proposed_revision_id,
        publicationVersionId: version.rows[0].publication_version_id,
        proposed,
        baseline: researchBaselineObject(row.baseline_payload),
        actorId,
      });
      const opportunityContentVersionId = await appendApprovedOpportunityIdeaBrief(
        client,
        row,
        proposed,
        version.rows[0].publication_version_id,
        actorId,
      );
      await client.query(
        `UPDATE proposed_revision SET status='approved', proposed_payload=$2::jsonb,
           proposed_content_hash=$3, approved_publication_version_id=$4,
           materialized_factor_id=$5, updated_at=now()
         WHERE proposed_revision_id=$1`,
        [row.proposed_revision_id, JSON.stringify(proposed), approvedHash,
          version.rows[0].publication_version_id, materializedFactorId],
      );
      await client.query("UPDATE review_item SET status='approved',updated_at=now() WHERE review_item_id=$1", [input.reviewId]);
      const segmentIds = affectedSegmentIds(row.affected_segments);
      const invalidationCanChangeCalculation = row.materialized_estimate_id !== null
        && ["estimate", "estimate_component", "assumption", "evidence", "source_release", "unit_bridge"].includes(row.target_kind);
      const invalidated = segmentIds.length === 0 || !invalidationCanChangeCalculation ? { rowCount: 0 } : await client.query(
        `UPDATE segment_query_result sqr
            SET cache_status='invalidated', invalidated_at=now()
          WHERE sqr.cache_status='valid'
            AND EXISTS (
              SELECT 1
                FROM saved_segment_version ssv
               WHERE ssv.query_id=sqr.query_id
                 AND ssv.saved_segment_id=ANY($1::uuid[])
            )`,
        [segmentIds],
      );
      if (row.research_job_id) {
        const approvedJob = await client.query(
          "UPDATE research_job SET status='approved',updated_at=now() WHERE research_job_id=$1 AND status='needs_review'",
          [row.research_job_id],
        );
        if (approvedJob.rowCount !== 1) throw new Error("research_job_approval_conflict");
        await appendEvent(client, row.research_job_id, "approved", {
          reviewId: input.reviewId,
          publicationVersionId: version.rows[0].publication_version_id,
          invalidatedResultCount: invalidated.rowCount ?? 0,
          cacheInvalidationSkippedReason: invalidationCanChangeCalculation
            ? null
            : "approved_revision_has_no_materialized_calculation_dependency",
          materializedFactorId,
          opportunityContentVersionId,
        });
      }
    } else if (decisionPolicy.requestsMoreResearch) {
      if (!row.research_job_id || !row.research_input_payload) {
        throw new Error("request_more_research_requires_a_research_job");
      }
      const nextPayload = appendResearchReviewFeedback(row.research_input_payload, {
        reviewId: input.reviewId,
        note,
        requestedAt: new Date().toISOString(),
      });
      const nextInputHash = contentHash(nextPayload);
      await client.query("UPDATE review_item SET status='changes_requested',updated_at=now() WHERE review_item_id=$1", [input.reviewId]);
      const requeued = await client.query(
        `UPDATE research_job SET status='queued', next_attempt_at=now(), finished_at=NULL,
           max_attempts=greatest(max_attempts,attempt_count+3),input_payload=$2::jsonb,input_hash=$3,
           error_code=NULL,error_message=NULL,updated_at=now()
         WHERE research_job_id=$1 AND status='needs_review'`,
        [row.research_job_id, JSON.stringify(nextPayload), nextInputHash],
      );
      if (requeued.rowCount !== 1) throw new Error("research_job_requeue_conflict");
      await client.query(
        `UPDATE research_job_step SET status='queued',started_at=NULL,finished_at=NULL,input_hash=$2,
           error_code=NULL,error_message=NULL,updated_at=now()
         WHERE research_job_id=$1 AND step_no=1`,
        [row.research_job_id, nextInputHash],
      );
      await appendEvent(client, row.research_job_id, "queued_after_review", {
        reviewId: input.reviewId,
        note,
        inputHash: nextInputHash,
      });
    } else {
      const reviewStatus = decisionPolicy.nonApprovalReviewStatus;
      if (!reviewStatus) throw new Error("review_decision_policy_invalid");
      await client.query("UPDATE proposed_revision SET status='rejected',updated_at=now() WHERE proposed_revision_id=$1", [row.proposed_revision_id]);
      await client.query("UPDATE review_item SET status=$2,updated_at=now() WHERE review_item_id=$1", [input.reviewId, reviewStatus]);
      if (row.research_job_id) {
        await client.query("UPDATE research_job SET status='rejected',updated_at=now() WHERE research_job_id=$1", [row.research_job_id]);
        await appendEvent(client, row.research_job_id, "rejected", { reviewId: input.reviewId, decision: input.decision });
      }
    }
    await appendAudit(client, "review_item", input.reviewId, input.decision, row, { decision: input.decision, note });
    return row.proposed_revision_id;
  });
}
