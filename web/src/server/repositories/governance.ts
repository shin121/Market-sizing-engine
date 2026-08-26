import "server-only";

import type { QueryResultRow } from "pg";

import type { EntityUnit } from "@/domain/entity-units";
import { BASELINE_MODEL_VERSION } from "@/lib/constants";
import {
  queryRows,
  withWorkspaceTransaction,
  type RuntimeContext,
  type SqlParameter,
} from "@/server/db";
import {
  toIsoTimestamp,
  toJsonArray,
  toJsonValue,
  toNullableDateString,
  toNullableIsoTimestamp,
  toNullableNumber,
  toNumber,
  type JsonValue,
} from "@/server/db/serializers";

export interface GovernanceOverview {
  currentVersion: string | null;
  currentVersionKind: "publication" | "model" | null;
  sourceCount: number;
  sourceReleaseCount: number;
  modelCount: number;
  modelVersionCount: number;
  domainCount: number;
  subtypeCount: number;
  archetypeCount: number;
  validationGapCount: number;
  proposedRevisionCount: number;
  auditEventCount: number;
  dataAsOf: string | null;
  lastValidatedAt: string | null;
  migrationStatus: "ready" | "incomplete";
  checksumStatus: "verified" | "incomplete" | "not_available";
}

export type SourceReleaseStatus =
  | "registered"
  | "metadata_downloaded"
  | "downloaded"
  | "verified"
  | "superseded"
  | "blocked";

export interface SourceSummary {
  id: string;
  sourceId: string;
  name: string;
  title: string;
  institution: string;
  publisher: string;
  datasetTitle: string;
  officialUrl: string;
  license: string | null;
  sourceTier: number;
  sourceType: string;
  populationUniverse: string;
  entityUnit: string;
  geographicCoverage: string | null;
  status: SourceReleaseStatus | "no_release";
  latestReleaseId: string | null;
  latestVersion: string | null;
  referencePeriodStart: string | null;
  referencePeriodEnd: string | null;
  publicationDate: string | null;
  accessedAt: string | null;
  releaseCount: number;
  evidenceCount: number;
  usedByEstimateCount: number;
  reviewDueAt: string | null;
  updatedAt: string;
}

export interface EvidenceRecord {
  evidenceId: string;
  externalEvidenceKey: string | null;
  locator: string;
  supportedClaim: string;
  value: number | null;
  unit: string | null;
  denominator: string | null;
  extractionMethod: string;
  reviewerStatus: "unreviewed" | "machine_checked" | "human_reviewed" | "rejected";
  sourceTreatment: "raw" | "processed" | "proxy" | "inference" | null;
  usageContext: string | null;
  confidenceScore: number | null;
  reviewDueAt: string | null;
  dataVersion: string;
  updatedAt: string;
}

export interface SourceReleaseDetail {
  releaseId: string;
  versionLabel: string;
  referencePeriodStart: string | null;
  referencePeriodEnd: string | null;
  publicationDate: string | null;
  retrievedAt: string;
  localUri: string | null;
  fileFormat: string | null;
  checksum: string | null;
  citationText: string | null;
  status: SourceReleaseStatus;
  evidenceCount: number;
  usedByEstimateCount: number;
  evidence: EvidenceRecord[];
  dataVersion: string;
  updatedAt: string;
}

export interface SourceDetail extends SourceSummary {
  description: string | null;
  notes: string | null;
  releases: SourceReleaseDetail[];
}

export type SegmentationModelStatus = "candidate" | "selected" | "rejected" | "superseded";

export interface ModelSummary {
  id: string;
  modelId: string;
  segmentationModelId: string;
  name: string;
  domainId: string;
  domainCode: string;
  domainNameKo: string;
  algorithm: string;
  selectedK: number;
  sampleSize: number;
  weightedSupport: number;
  effectiveSampleSize: number;
  status: SegmentationModelStatus;
  modelVersionId: string;
  modelVersion: string;
  randomSeed: number;
  clusterCount: number;
  subtypeCount: number;
  estimateCount: number;
  artifactSha256: string | null;
  membershipSha256: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ModelCluster {
  clusterId: string;
  clusterNumber: number;
  rawClusterNumber: number | null;
  labelKo: string;
  labelEvidence: JsonValue;
  weightedPrevalence: number;
  effectiveSampleSize: number;
  hardSupport: number;
  softSupport: number;
  subtypes: Array<{
    subtypeId: string;
    subtypeCode: string;
    nameKo: string;
    definition: string;
    labelStatus: string;
    confidenceScore: number | null;
    confidenceGrade: string | null;
  }>;
}

export interface ModelDetail extends ModelSummary {
  description: string;
  featurePipeline: JsonValue;
  sampleDefinition: JsonValue;
  candidateK: JsonValue;
  randomSeeds: JsonValue;
  stabilityMetrics: JsonValue;
  selectionRationale: string;
  artifactUri: string;
  membershipUri: string | null;
  methodologyHash: string;
  sourceManifestHash: string;
  parameterConfig: JsonValue;
  pipelineRun: {
    runId: string;
    pipelineName: string;
    gitCommit: string | null;
    startedAt: string;
    finishedAt: string | null;
    status: "running" | "success" | "failed" | "cancelled";
    qualityMetrics: JsonValue;
  };
  clusters: ModelCluster[];
}

export type PublicationVersionStatus = "draft" | "approved" | "published" | "superseded";

export interface VersionSummary {
  id: string;
  publicationVersionId: string;
  version: string;
  versionLabel: string;
  workspaceId: string | null;
  parentVersionId: string | null;
  baselineModelVersionId: string;
  baselineModelVersion: string;
  status: PublicationVersionStatus;
  rationale: string;
  approvedByActorId: string | null;
  approvedAt: string | null;
  publishedAt: string | null;
  estimateCount: number;
  approvedEstimateCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface VersionEstimate {
  estimateId: string;
  subjectType: "archetype" | "query" | "control" | "scenario";
  subjectId: string;
  entityUnit: EntityUnit;
  status: "estimated" | "not_estimable" | "suppressed" | "superseded";
  approvalStatus: "not_required" | "pending" | "approved" | "rejected";
  countLow: number | null;
  countBase: number | null;
  countHigh: number | null;
  shareLow: number | null;
  shareBase: number | null;
  shareHigh: number | null;
  denominatorDefinition: string;
  methodCode: string;
  formula: string;
  geographyCode: string;
  referencePeriod: string;
  modelVersion: string;
  confidence: JsonValue | null;
  dependencies: JsonValue[];
  sources: JsonValue[];
  validationGaps: JsonValue[];
  createdAt: string;
}

export interface VersionDetail extends VersionSummary {
  description: string;
  parentVersionLabel: string | null;
  estimates: VersionEstimate[];
}

export interface AuditLogEntry {
  id: string;
  auditEventId: string;
  workspaceId: string | null;
  actorId: string | null;
  actor: string | null;
  targetType: string;
  targetId: string;
  action: string;
  previousStatus: string | null;
  newStatus: string | null;
  before: JsonValue | null;
  after: JsonValue | null;
  diff: JsonValue;
  requestId: string | null;
  correlationId: string | null;
  transactionId: string;
  createdAt: string;
  occurredAt: string;
}

export interface ListSourcesOptions {
  query?: string;
  sourceTier?: number;
  entityUnit?: string;
  status?: SourceReleaseStatus;
  limit?: number;
  offset?: number;
}

export interface ListModelsOptions {
  domainId?: string;
  domainCode?: string;
  status?: SegmentationModelStatus;
  limit?: number;
  offset?: number;
}

export interface ListVersionsOptions {
  status?: PublicationVersionStatus;
  limit?: number;
  offset?: number;
  context?: RuntimeContext;
}

export interface ListAuditLogsOptions {
  targetType?: string;
  targetId?: string;
  action?: string;
  actorId?: string;
  occurredBefore?: string;
  occurredAfter?: string;
  limit?: number;
  offset?: number;
  context?: RuntimeContext;
}

interface OverviewRow extends QueryResultRow {
  current_version: string | null;
  current_version_kind: GovernanceOverview["currentVersionKind"];
  source_count: string | number;
  source_release_count: string | number;
  model_count: string | number;
  model_version_count: string | number;
  domain_count: string | number;
  subtype_count: string | number;
  archetype_count: string | number;
  validation_gap_count: string | number;
  proposed_revision_count: string | number;
  audit_event_count: string | number;
  data_as_of: Date | string | null;
  last_validated_at: Date | string | null;
  migration_status: GovernanceOverview["migrationStatus"];
  checksum_status: GovernanceOverview["checksumStatus"];
}

function pageValue(value: number | undefined, fallback: number, maximum: number, field: string): number {
  const result = value ?? fallback;
  if (!Number.isInteger(result) || result < 0 || result > maximum) throw new Error(`${field}_out_of_range`);
  return result;
}

function requiredIdentifier(value: string, field: string): string {
  const result = value.trim();
  if (!result || result.length > 240) throw new Error(`${field}_invalid`);
  return result;
}

function optionalJson(value: unknown, field: string): JsonValue | null {
  return value === null || value === undefined ? null : toJsonValue(value, field);
}

function timestampFilter(value: string, field: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) throw new Error(`${field}_invalid`);
  return date.toISOString();
}

export async function getGovernanceOverview(context?: RuntimeContext): Promise<GovernanceOverview> {
  return withWorkspaceTransaction(async (client) => {
    const result = await client.query<OverviewRow>(`
      WITH current_publication AS (
        SELECT version_label
        FROM data_release_version
        WHERE status = 'published'
          AND (workspace_id IS NULL OR workspace_id = market_engine_current_workspace_id())
        ORDER BY coalesce(published_at, approved_at, created_at) DESC
        LIMIT 1
      ), current_model AS (
        SELECT version
        FROM model_version
        WHERE version = $1
        LIMIT 1
      )
      SELECT
        coalesce((SELECT version_label FROM current_publication), (SELECT version FROM current_model)) AS current_version,
        CASE
          WHEN EXISTS (SELECT 1 FROM current_publication) THEN 'publication'
          WHEN EXISTS (SELECT 1 FROM current_model) THEN 'model'
          ELSE NULL
        END AS current_version_kind,
        (SELECT count(*) FROM data_source) AS source_count,
        (SELECT count(*) FROM source_release) AS source_release_count,
        (SELECT count(*) FROM segmentation_model WHERE status = 'selected') AS model_count,
        (SELECT count(*) FROM model_version) AS model_version_count,
        (SELECT count(*) FROM domain_registry WHERE active) AS domain_count,
        (SELECT count(*) FROM subtype_definition WHERE is_primary) AS subtype_count,
        (SELECT count(*) FROM archetype) AS archetype_count,
        (SELECT count(*) FROM validation_gap WHERE status IN ('open', 'in_progress')) AS validation_gap_count,
        (SELECT count(*) FROM proposed_revision
          WHERE workspace_id = market_engine_current_workspace_id() AND status = 'pending_review') AS proposed_revision_count,
        (SELECT count(*) FROM audit_event
          WHERE workspace_id = market_engine_current_workspace_id()) AS audit_event_count,
        (SELECT max(reference_period_end) FROM source_release) AS data_as_of,
        (SELECT max(finished_at) FROM pipeline_run WHERE status = 'success') AS last_validated_at,
        CASE WHEN
          to_regclass('public.v_explorer_domain_summary') IS NOT NULL AND
          to_regclass('public.v_source_evidence_lineage') IS NOT NULL AND
          to_regclass('public.audit_event') IS NOT NULL
        THEN 'ready' ELSE 'incomplete' END AS migration_status,
        CASE
          WHEN EXISTS (
            SELECT 1 FROM source_release
            WHERE status IN ('downloaded', 'verified') AND checksum IS NULL
          ) THEN 'incomplete'
          WHEN EXISTS (SELECT 1 FROM source_release WHERE checksum IS NOT NULL) THEN 'verified'
          ELSE 'not_available'
        END AS checksum_status
    `, [BASELINE_MODEL_VERSION]);
    const row = result.rows[0];
    if (!row) throw new Error("governance_overview_unavailable");
    return {
      currentVersion: row.current_version,
      currentVersionKind: row.current_version_kind,
      sourceCount: toNumber(row.source_count, "source_count"),
      sourceReleaseCount: toNumber(row.source_release_count, "source_release_count"),
      modelCount: toNumber(row.model_count, "model_count"),
      modelVersionCount: toNumber(row.model_version_count, "model_version_count"),
      domainCount: toNumber(row.domain_count, "domain_count"),
      subtypeCount: toNumber(row.subtype_count, "subtype_count"),
      archetypeCount: toNumber(row.archetype_count, "archetype_count"),
      validationGapCount: toNumber(row.validation_gap_count, "validation_gap_count"),
      proposedRevisionCount: toNumber(row.proposed_revision_count, "proposed_revision_count"),
      auditEventCount: toNumber(row.audit_event_count, "audit_event_count"),
      dataAsOf: toNullableDateString(row.data_as_of, "data_as_of"),
      lastValidatedAt: toNullableIsoTimestamp(row.last_validated_at, "last_validated_at"),
      migrationStatus: row.migration_status,
      checksumStatus: row.checksum_status,
    };
  }, context);
}

interface SourceRow extends QueryResultRow {
  source_id: string;
  publisher: string;
  dataset_title: string;
  official_url: string;
  license: string | null;
  source_tier: number;
  source_type: string;
  population_universe: string;
  entity_unit: string;
  geographic_coverage: string | null;
  notes: string | null;
  latest_release_id: string | null;
  latest_version: string | null;
  latest_status: SourceReleaseStatus | null;
  reference_period_start: Date | string | null;
  reference_period_end: Date | string | null;
  publication_date: Date | string | null;
  retrieved_at: Date | string | null;
  release_count: string | number;
  evidence_count: string | number;
  used_by_estimate_count: string | number;
  review_due_at: Date | string | null;
  updated_at: Date | string;
}

const SOURCE_SELECT = `
  SELECT
    ds.source_id,
    ds.publisher,
    ds.dataset_title,
    ds.official_url,
    ds.license,
    ds.source_tier,
    ds.source_type,
    ds.population_universe,
    ds.entity_unit,
    ds.geographic_coverage,
    ds.notes,
    latest.release_id AS latest_release_id,
    latest.version_label AS latest_version,
    latest.status AS latest_status,
    latest.reference_period_start,
    latest.reference_period_end,
    latest.publication_date,
    latest.retrieved_at,
    coalesce(counts.release_count, 0) AS release_count,
    coalesce(counts.evidence_count, 0) AS evidence_count,
    coalesce(counts.used_by_estimate_count, 0) AS used_by_estimate_count,
    counts.review_due_at,
    greatest(ds.updated_at, coalesce(latest.updated_at, ds.updated_at)) AS updated_at
  FROM data_source ds
  LEFT JOIN LATERAL (
    SELECT sr.*
    FROM source_release sr
    WHERE sr.source_id = ds.source_id
    ORDER BY sr.reference_period_end DESC NULLS LAST, sr.publication_date DESC NULLS LAST, sr.retrieved_at DESC
    LIMIT 1
  ) latest ON true
  LEFT JOIN LATERAL (
    SELECT
      count(DISTINCT sr.release_id) AS release_count,
      count(DISTINCT ev.evidence_id) AS evidence_count,
      count(DISTINCT ec.estimate_id) AS used_by_estimate_count,
      min(ev.review_due_at) FILTER (WHERE ev.review_due_at >= current_date) AS review_due_at
    FROM source_release sr
    LEFT JOIN evidence ev USING (release_id)
    LEFT JOIN estimate_component ec USING (evidence_id)
    WHERE sr.source_id = ds.source_id
  ) counts ON true
`;

function mapSource(row: SourceRow): SourceSummary {
  return {
    id: row.source_id,
    sourceId: row.source_id,
    name: row.dataset_title,
    title: row.dataset_title,
    institution: row.publisher,
    publisher: row.publisher,
    datasetTitle: row.dataset_title,
    officialUrl: row.official_url,
    license: row.license,
    sourceTier: toNumber(row.source_tier, "source_tier"),
    sourceType: row.source_type,
    populationUniverse: row.population_universe,
    entityUnit: row.entity_unit,
    geographicCoverage: row.geographic_coverage,
    status: row.latest_status ?? "no_release",
    latestReleaseId: row.latest_release_id,
    latestVersion: row.latest_version,
    referencePeriodStart: toNullableDateString(row.reference_period_start, "reference_period_start"),
    referencePeriodEnd: toNullableDateString(row.reference_period_end, "reference_period_end"),
    publicationDate: toNullableDateString(row.publication_date, "publication_date"),
    accessedAt: toNullableIsoTimestamp(row.retrieved_at, "retrieved_at"),
    releaseCount: toNumber(row.release_count, "release_count"),
    evidenceCount: toNumber(row.evidence_count, "evidence_count"),
    usedByEstimateCount: toNumber(row.used_by_estimate_count, "used_by_estimate_count"),
    reviewDueAt: toNullableDateString(row.review_due_at, "review_due_at"),
    updatedAt: toIsoTimestamp(row.updated_at, "updated_at"),
  };
}

export async function listSources(options: ListSourcesOptions = {}): Promise<SourceSummary[]> {
  const params: SqlParameter[] = [];
  const predicates: string[] = [];
  if (options.query?.trim()) {
    params.push(options.query.trim());
    predicates.push(
      `concat_ws(' ', ds.source_id, ds.publisher, ds.dataset_title, ds.source_type, ds.population_universe)
         ILIKE '%' || $${params.length} || '%'`,
    );
  }
  if (options.sourceTier !== undefined) {
    if (!Number.isInteger(options.sourceTier) || options.sourceTier < 1 || options.sourceTier > 3) {
      throw new Error("source_tier_invalid");
    }
    params.push(options.sourceTier);
    predicates.push(`ds.source_tier = $${params.length}`);
  }
  if (options.entityUnit) {
    params.push(requiredIdentifier(options.entityUnit, "entity_unit"));
    predicates.push(`ds.entity_unit = $${params.length}`);
  }
  if (options.status) {
    params.push(options.status);
    predicates.push(`latest.status = $${params.length}`);
  }
  params.push(pageValue(options.limit, 100, 500, "limit"));
  const limitParameter = params.length;
  params.push(pageValue(options.offset, 0, 100_000, "offset"));
  const offsetParameter = params.length;
  const where = predicates.length ? `WHERE ${predicates.join(" AND ")}` : "";
  const rows = await queryRows<SourceRow>(
    `${SOURCE_SELECT}
     ${where}
     ORDER BY ds.source_tier, ds.publisher, ds.dataset_title
     LIMIT $${limitParameter} OFFSET $${offsetParameter}`,
    params,
  );
  return rows.map(mapSource);
}

interface ReleaseRow extends QueryResultRow {
  release_id: string;
  version_label: string;
  reference_period_start: Date | string | null;
  reference_period_end: Date | string | null;
  publication_date: Date | string | null;
  retrieved_at: Date | string;
  local_uri: string | null;
  file_format: string | null;
  checksum: string | null;
  citation_text: string | null;
  status: SourceReleaseStatus;
  data_version: string;
  updated_at: Date | string;
  evidence_count: string | number;
  used_by_estimate_count: string | number;
}

interface EvidenceRow extends QueryResultRow {
  evidence_id: string | number;
  release_id: string;
  external_evidence_key: string | null;
  locator: string;
  supported_claim: string;
  value: string | number | null;
  unit: string | null;
  denominator: string | null;
  extraction_method: string;
  reviewer_status: EvidenceRecord["reviewerStatus"];
  source_treatment: EvidenceRecord["sourceTreatment"];
  usage_context: string | null;
  confidence_score: number | null;
  review_due_at: Date | string | null;
  data_version: string;
  updated_at: Date | string;
}

export async function getSource(sourceId: string): Promise<SourceDetail | null> {
  const id = requiredIdentifier(sourceId, "source_id");
  const sourceRows = await queryRows<SourceRow>(`${SOURCE_SELECT} WHERE ds.source_id = $1 LIMIT 1`, [id]);
  const source = sourceRows[0];
  if (!source) return null;
  const [releaseRows, evidenceRows] = await Promise.all([
    queryRows<ReleaseRow>(
      `SELECT
         sr.*,
         count(DISTINCT ev.evidence_id) AS evidence_count,
         count(DISTINCT ec.estimate_id) AS used_by_estimate_count
       FROM source_release sr
       LEFT JOIN evidence ev USING (release_id)
       LEFT JOIN estimate_component ec USING (evidence_id)
       WHERE sr.source_id = $1
       GROUP BY sr.release_id
       ORDER BY sr.reference_period_end DESC NULLS LAST, sr.publication_date DESC NULLS LAST, sr.retrieved_at DESC`,
      [id],
    ),
    queryRows<EvidenceRow>(
      `SELECT ev.*
       FROM evidence ev
       JOIN source_release sr USING (release_id)
       WHERE sr.source_id = $1
       ORDER BY sr.reference_period_end DESC NULLS LAST, ev.evidence_id`,
      [id],
    ),
  ]);
  const evidenceByRelease = new Map<string, EvidenceRecord[]>();
  for (const evidence of evidenceRows) {
    const item: EvidenceRecord = {
      evidenceId: String(evidence.evidence_id),
      externalEvidenceKey: evidence.external_evidence_key,
      locator: evidence.locator,
      supportedClaim: evidence.supported_claim,
      value: toNullableNumber(evidence.value, "evidence.value"),
      unit: evidence.unit,
      denominator: evidence.denominator,
      extractionMethod: evidence.extraction_method,
      reviewerStatus: evidence.reviewer_status,
      sourceTreatment: evidence.source_treatment,
      usageContext: evidence.usage_context,
      confidenceScore: toNullableNumber(evidence.confidence_score, "evidence.confidence_score"),
      reviewDueAt: toNullableDateString(evidence.review_due_at, "evidence.review_due_at"),
      dataVersion: evidence.data_version,
      updatedAt: toIsoTimestamp(evidence.updated_at, "evidence.updated_at"),
    };
    evidenceByRelease.set(evidence.release_id, [...(evidenceByRelease.get(evidence.release_id) ?? []), item]);
  }

  return {
    ...mapSource(source),
    description: source.notes,
    notes: source.notes,
    releases: releaseRows.map((release) => ({
      releaseId: release.release_id,
      versionLabel: release.version_label,
      referencePeriodStart: toNullableDateString(release.reference_period_start, "release.reference_period_start"),
      referencePeriodEnd: toNullableDateString(release.reference_period_end, "release.reference_period_end"),
      publicationDate: toNullableDateString(release.publication_date, "release.publication_date"),
      retrievedAt: toIsoTimestamp(release.retrieved_at, "release.retrieved_at"),
      localUri: release.local_uri,
      fileFormat: release.file_format,
      checksum: release.checksum,
      citationText: release.citation_text,
      status: release.status,
      evidenceCount: toNumber(release.evidence_count, "release.evidence_count"),
      usedByEstimateCount: toNumber(release.used_by_estimate_count, "release.used_by_estimate_count"),
      evidence: evidenceByRelease.get(release.release_id) ?? [],
      dataVersion: release.data_version,
      updatedAt: toIsoTimestamp(release.updated_at, "release.updated_at"),
    })),
  };
}

interface ModelRow extends QueryResultRow {
  segmentation_model_id: string;
  domain_id: string;
  domain_code: string;
  domain_name_ko: string;
  algorithm: string;
  selected_k: number;
  sample_size: number;
  weighted_support: string | number;
  effective_sample_size: string | number;
  status: SegmentationModelStatus;
  model_version_id: string;
  model_version: string;
  random_seed: string | number;
  cluster_count: string | number;
  subtype_count: string | number;
  estimate_count: string | number;
  artifact_sha256: string | null;
  membership_sha256: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  feature_pipeline?: unknown;
  sample_definition?: unknown;
  candidate_k?: unknown;
  random_seeds?: unknown;
  stability_metrics?: unknown;
  selection_rationale?: string;
  artifact_uri?: string;
  membership_uri?: string | null;
  methodology_hash?: string;
  source_manifest_hash?: string;
  parameter_json?: unknown;
  run_id?: string;
  pipeline_name?: string;
  git_commit?: string | null;
  run_started_at?: Date | string;
  run_finished_at?: Date | string | null;
  run_status?: ModelDetail["pipelineRun"]["status"];
  quality_metrics?: unknown;
}

const MODEL_SELECT = `
  SELECT
    sm.segmentation_model_id,
    sm.domain_id,
    dr.domain_code,
    dr.name_ko AS domain_name_ko,
    sm.algorithm,
    sm.selected_k,
    sm.sample_size,
    sm.weighted_support,
    sm.effective_sample_size,
    sm.status,
    sm.model_version_id,
    mv.version AS model_version,
    mv.random_seed,
    coalesce(counts.cluster_count, 0) AS cluster_count,
    coalesce(counts.subtype_count, 0) AS subtype_count,
    coalesce(estimates.estimate_count, 0) AS estimate_count,
    sm.artifact_sha256,
    sm.membership_sha256,
    sm.created_at,
    sm.updated_at
  FROM segmentation_model sm
  JOIN domain_registry dr USING (domain_id)
  JOIN model_version mv USING (model_version_id)
  LEFT JOIN LATERAL (
    SELECT
      count(DISTINCT cd.cluster_id) AS cluster_count,
      count(DISTINCT sd.subtype_id) AS subtype_count
    FROM cluster_definition cd
    LEFT JOIN subtype_definition sd USING (cluster_id)
    WHERE cd.segmentation_model_id = sm.segmentation_model_id
  ) counts ON true
  LEFT JOIN LATERAL (
    SELECT count(*) AS estimate_count
    FROM estimate e
    WHERE e.model_version_id = sm.model_version_id
  ) estimates ON true
`;

function mapModel(row: ModelRow): ModelSummary {
  return {
    id: row.segmentation_model_id,
    modelId: row.segmentation_model_id,
    segmentationModelId: row.segmentation_model_id,
    name: `${row.domain_name_ko} · ${row.algorithm}`,
    domainId: row.domain_id,
    domainCode: row.domain_code,
    domainNameKo: row.domain_name_ko,
    algorithm: row.algorithm,
    selectedK: toNumber(row.selected_k, "selected_k"),
    sampleSize: toNumber(row.sample_size, "sample_size"),
    weightedSupport: toNumber(row.weighted_support, "weighted_support"),
    effectiveSampleSize: toNumber(row.effective_sample_size, "effective_sample_size"),
    status: row.status,
    modelVersionId: row.model_version_id,
    modelVersion: row.model_version,
    randomSeed: toNumber(row.random_seed, "random_seed"),
    clusterCount: toNumber(row.cluster_count, "cluster_count"),
    subtypeCount: toNumber(row.subtype_count, "subtype_count"),
    estimateCount: toNumber(row.estimate_count, "estimate_count"),
    artifactSha256: row.artifact_sha256,
    membershipSha256: row.membership_sha256,
    createdAt: toIsoTimestamp(row.created_at, "created_at"),
    updatedAt: toIsoTimestamp(row.updated_at, "updated_at"),
  };
}

export async function listModels(options: ListModelsOptions = {}): Promise<ModelSummary[]> {
  const params: SqlParameter[] = [];
  const predicates: string[] = [];
  if (options.domainId) {
    params.push(requiredIdentifier(options.domainId, "domain_id"));
    predicates.push(`sm.domain_id = $${params.length}`);
  }
  if (options.domainCode) {
    params.push(requiredIdentifier(options.domainCode, "domain_code"));
    predicates.push(`dr.domain_code = $${params.length}`);
  }
  if (options.status) {
    params.push(options.status);
    predicates.push(`sm.status = $${params.length}`);
  }
  params.push(pageValue(options.limit, 100, 500, "limit"));
  const limitParameter = params.length;
  params.push(pageValue(options.offset, 0, 100_000, "offset"));
  const offsetParameter = params.length;
  const where = predicates.length ? `WHERE ${predicates.join(" AND ")}` : "";
  const rows = await queryRows<ModelRow>(
    `${MODEL_SELECT}
     ${where}
     ORDER BY CASE sm.status WHEN 'selected' THEN 0 ELSE 1 END, dr.name_ko, sm.created_at DESC
     LIMIT $${limitParameter} OFFSET $${offsetParameter}`,
    params,
  );
  return rows.map(mapModel);
}

interface ClusterRow extends QueryResultRow {
  cluster_id: string;
  cluster_number: number;
  raw_cluster_number: number | null;
  post_hoc_label_ko: string;
  label_evidence: unknown;
  weighted_prevalence: string | number;
  effective_sample_size: string | number;
  hard_support: number;
  soft_support: string | number;
  subtypes_json: unknown;
}

export async function getModel(modelId: string): Promise<ModelDetail | null> {
  const id = requiredIdentifier(modelId, "model_id");
  const rows = await queryRows<ModelRow>(
    `SELECT summary.*,
       sm.feature_pipeline,
       sm.sample_definition,
       sm.candidate_k,
       sm.random_seeds,
       sm.stability_metrics,
       sm.selection_rationale,
       sm.artifact_uri,
       sm.membership_uri,
       mv.methodology_hash,
       mv.source_manifest_hash,
       mv.parameter_json,
       pr.run_id,
       pr.pipeline_name,
       pr.git_commit,
       pr.started_at AS run_started_at,
       pr.finished_at AS run_finished_at,
       pr.status AS run_status,
       pr.quality_metrics
     FROM (${MODEL_SELECT}) summary
     JOIN segmentation_model sm USING (segmentation_model_id)
     JOIN model_version mv ON mv.model_version_id = sm.model_version_id
     JOIN pipeline_run pr ON pr.run_id = sm.run_id
     WHERE summary.segmentation_model_id = $1
     LIMIT 1`,
    [id],
  );
  const row = rows[0];
  if (!row) return null;
  const clusterRows = await queryRows<ClusterRow>(
    `SELECT
       cd.cluster_id,
       cd.cluster_number,
       cd.raw_cluster_number,
       cd.post_hoc_label_ko,
       cd.label_evidence,
       cd.weighted_prevalence,
       cd.effective_sample_size,
       cd.hard_support,
       cd.soft_support,
       coalesce(jsonb_agg(
         jsonb_build_object(
           'subtypeId', sd.subtype_id,
           'subtypeCode', sd.subtype_code,
           'nameKo', sd.name_ko,
           'definition', sd.definition,
           'labelStatus', sd.label_status,
           'confidenceScore', sc.total_score,
           'confidenceGrade', sc.grade
         ) ORDER BY sd.name_ko
       ) FILTER (WHERE sd.subtype_id IS NOT NULL), '[]'::jsonb) AS subtypes_json
     FROM cluster_definition cd
     LEFT JOIN subtype_definition sd USING (cluster_id)
     LEFT JOIN subtype_confidence sc USING (subtype_id)
     WHERE cd.segmentation_model_id = $1
     GROUP BY cd.cluster_id
     ORDER BY cd.cluster_number`,
    [id],
  );
  if (
    row.feature_pipeline === undefined ||
    row.sample_definition === undefined ||
    row.candidate_k === undefined ||
    row.random_seeds === undefined ||
    row.stability_metrics === undefined ||
    row.selection_rationale === undefined ||
    row.artifact_uri === undefined ||
    row.methodology_hash === undefined ||
    row.source_manifest_hash === undefined ||
    row.parameter_json === undefined ||
    row.run_id === undefined ||
    row.pipeline_name === undefined ||
    row.run_started_at === undefined ||
    row.run_status === undefined ||
    row.quality_metrics === undefined
  ) {
    throw new Error("model_detail_row_incomplete");
  }

  return {
    ...mapModel(row),
    description: row.selection_rationale,
    featurePipeline: toJsonValue(row.feature_pipeline, "feature_pipeline"),
    sampleDefinition: toJsonValue(row.sample_definition, "sample_definition"),
    candidateK: toJsonValue(row.candidate_k, "candidate_k"),
    randomSeeds: toJsonValue(row.random_seeds, "random_seeds"),
    stabilityMetrics: toJsonValue(row.stability_metrics, "stability_metrics"),
    selectionRationale: row.selection_rationale,
    artifactUri: row.artifact_uri,
    membershipUri: row.membership_uri ?? null,
    methodologyHash: row.methodology_hash,
    sourceManifestHash: row.source_manifest_hash,
    parameterConfig: toJsonValue(row.parameter_json, "parameter_json"),
    pipelineRun: {
      runId: row.run_id,
      pipelineName: row.pipeline_name,
      gitCommit: row.git_commit ?? null,
      startedAt: toIsoTimestamp(row.run_started_at, "run_started_at"),
      finishedAt: toNullableIsoTimestamp(row.run_finished_at, "run_finished_at"),
      status: row.run_status,
      qualityMetrics: toJsonValue(row.quality_metrics, "quality_metrics"),
    },
    clusters: clusterRows.map((cluster) => {
      const subtypes = toJsonArray(cluster.subtypes_json, "subtypes_json").map((value, index) => {
        if (!value || Array.isArray(value) || typeof value !== "object") {
          throw new Error(`subtypes_json_${index}_invalid`);
        }
        return {
          subtypeId: String(value.subtypeId),
          subtypeCode: String(value.subtypeCode),
          nameKo: String(value.nameKo),
          definition: String(value.definition),
          labelStatus: String(value.labelStatus),
          confidenceScore: toNullableNumber(value.confidenceScore, `subtypes_json_${index}.confidenceScore`),
          confidenceGrade: value.confidenceGrade === null ? null : String(value.confidenceGrade),
        };
      });
      return {
        clusterId: cluster.cluster_id,
        clusterNumber: toNumber(cluster.cluster_number, "cluster_number"),
        rawClusterNumber: toNullableNumber(cluster.raw_cluster_number, "raw_cluster_number"),
        labelKo: cluster.post_hoc_label_ko,
        labelEvidence: toJsonValue(cluster.label_evidence, "label_evidence"),
        weightedPrevalence: toNumber(cluster.weighted_prevalence, "weighted_prevalence"),
        effectiveSampleSize: toNumber(cluster.effective_sample_size, "effective_sample_size"),
        hardSupport: toNumber(cluster.hard_support, "hard_support"),
        softSupport: toNumber(cluster.soft_support, "soft_support"),
        subtypes,
      };
    }),
  };
}

interface VersionRow extends QueryResultRow {
  publication_version_id: string;
  workspace_id: string | null;
  version_label: string;
  parent_version_id: string | null;
  baseline_model_version_id: string;
  baseline_model_version: string;
  status: PublicationVersionStatus;
  rationale: string;
  approved_by_actor_id: string | null;
  approved_at: Date | string | null;
  published_at: Date | string | null;
  estimate_count: string | number;
  approved_estimate_count: string | number;
  created_at: Date | string;
  updated_at: Date | string;
  parent_version_label?: string | null;
}

const VERSION_SELECT = `
  SELECT
    drv.publication_version_id,
    drv.workspace_id,
    drv.version_label,
    drv.parent_version_id,
    drv.baseline_model_version_id,
    mv.version AS baseline_model_version,
    drv.status,
    drv.rationale,
    drv.approved_by_actor_id,
    drv.approved_at,
    drv.published_at,
    count(e.estimate_id) AS estimate_count,
    count(e.estimate_id) FILTER (WHERE e.approval_status = 'approved') AS approved_estimate_count,
    drv.created_at,
    drv.updated_at
  FROM data_release_version drv
  JOIN model_version mv ON mv.model_version_id = drv.baseline_model_version_id
  LEFT JOIN estimate e USING (publication_version_id)
`;

function mapVersion(row: VersionRow): VersionSummary {
  return {
    id: row.publication_version_id,
    publicationVersionId: row.publication_version_id,
    version: row.version_label,
    versionLabel: row.version_label,
    workspaceId: row.workspace_id,
    parentVersionId: row.parent_version_id,
    baselineModelVersionId: row.baseline_model_version_id,
    baselineModelVersion: row.baseline_model_version,
    status: row.status,
    rationale: row.rationale,
    approvedByActorId: row.approved_by_actor_id,
    approvedAt: toNullableIsoTimestamp(row.approved_at, "approved_at"),
    publishedAt: toNullableIsoTimestamp(row.published_at, "published_at"),
    estimateCount: toNumber(row.estimate_count, "estimate_count"),
    approvedEstimateCount: toNumber(row.approved_estimate_count, "approved_estimate_count"),
    createdAt: toIsoTimestamp(row.created_at, "created_at"),
    updatedAt: toIsoTimestamp(row.updated_at, "updated_at"),
  };
}

export async function listVersions(options: ListVersionsOptions = {}): Promise<VersionSummary[]> {
  return withWorkspaceTransaction(async (client) => {
    const params: SqlParameter[] = [];
    const predicates: string[] = [
      "(drv.workspace_id IS NULL OR drv.workspace_id = market_engine_current_workspace_id())",
      "NOT production.is_fixture_text(drv.version_label)",
      "NOT production.is_fixture_text(drv.rationale)",
      "coalesce(drv.approved_by_actor_id::text, '') NOT LIKE '00000000-0000-4000-8000-0000000000%'",
    ];
    if (options.status) {
      params.push(options.status);
      predicates.push(`drv.status = $${params.length}`);
    }
    params.push(pageValue(options.limit, 100, 500, "limit"));
    const limitParameter = params.length;
    params.push(pageValue(options.offset, 0, 100_000, "offset"));
    const offsetParameter = params.length;
    const where = `WHERE ${predicates.join(" AND ")}`;
    const result = await client.query<VersionRow>(
      `${VERSION_SELECT}
       ${where}
       GROUP BY drv.publication_version_id, mv.version
       ORDER BY coalesce(drv.published_at, drv.approved_at, drv.created_at) DESC, drv.version_label DESC
       LIMIT $${limitParameter} OFFSET $${offsetParameter}`,
      params,
    );
    return result.rows.map(mapVersion);
  }, options.context);
}

interface VersionEstimateRow extends QueryResultRow {
  estimate_id: string;
  subject_type: VersionEstimate["subjectType"];
  subject_id: string;
  entity_unit: EntityUnit;
  status: VersionEstimate["status"];
  approval_status: VersionEstimate["approvalStatus"];
  count_low: string | number | null;
  count_base: string | number | null;
  count_high: string | number | null;
  share_low: string | number | null;
  share_base: string | number | null;
  share_high: string | number | null;
  denominator_definition: string;
  method_code: string;
  formula: string;
  geography_code: string;
  reference_period: string;
  model_version: string;
  confidence_json: unknown;
  dependencies_json: unknown;
  sources_json: unknown;
  validation_gaps_json: unknown;
  created_at: Date | string;
}

export async function getVersion(
  versionId: string,
  context?: RuntimeContext,
): Promise<VersionDetail | null> {
  const id = requiredIdentifier(versionId, "version_id");
  return withWorkspaceTransaction(async (client) => {
    const versionResult = await client.query<VersionRow>(
      `SELECT
         drv.publication_version_id,
         drv.workspace_id,
         drv.version_label,
         drv.parent_version_id,
         drv.baseline_model_version_id,
         mv.version AS baseline_model_version,
         drv.status,
         drv.rationale,
         drv.approved_by_actor_id,
         drv.approved_at,
         drv.published_at,
         count(e.estimate_id) AS estimate_count,
         count(e.estimate_id) FILTER (WHERE e.approval_status = 'approved') AS approved_estimate_count,
         drv.created_at,
         drv.updated_at,
         parent.version_label AS parent_version_label
       FROM data_release_version drv
       JOIN model_version mv ON mv.model_version_id = drv.baseline_model_version_id
       LEFT JOIN estimate e USING (publication_version_id)
       LEFT JOIN data_release_version parent ON parent.publication_version_id = drv.parent_version_id
       WHERE drv.publication_version_id = $1
         AND (drv.workspace_id IS NULL OR drv.workspace_id = market_engine_current_workspace_id())
         AND NOT production.is_fixture_text(drv.version_label)
         AND NOT production.is_fixture_text(drv.rationale)
         AND coalesce(drv.approved_by_actor_id::text, '') NOT LIKE '00000000-0000-4000-8000-0000000000%'
       GROUP BY drv.publication_version_id, mv.version, parent.version_label
       LIMIT 1`,
      [id],
    );
    const row = versionResult.rows[0];
    if (!row) return null;
    const estimateResult = await client.query<VersionEstimateRow>(
      `SELECT
         estimate_id,
         subject_type,
         subject_id,
         entity_unit,
         status,
         approval_status,
         count_low,
         count_base,
         count_high,
         share_low,
         share_base,
         share_high,
         denominator_definition,
         method_code,
         formula,
         geography_code,
         reference_period,
         model_version,
         confidence_json,
         dependencies_json,
         sources_json,
         validation_gaps_json,
         created_at
       FROM v_estimate_lineage
       WHERE publication_version_id = $1
       ORDER BY created_at DESC, estimate_id`,
      [id],
    );
    return {
      ...mapVersion(row),
      description: row.rationale,
      parentVersionLabel: row.parent_version_label ?? null,
      estimates: estimateResult.rows.map((estimate) => ({
        estimateId: estimate.estimate_id,
        subjectType: estimate.subject_type,
        subjectId: estimate.subject_id,
        entityUnit: estimate.entity_unit,
        status: estimate.status,
        approvalStatus: estimate.approval_status,
        countLow: toNullableNumber(estimate.count_low, "estimate.count_low"),
        countBase: toNullableNumber(estimate.count_base, "estimate.count_base"),
        countHigh: toNullableNumber(estimate.count_high, "estimate.count_high"),
        shareLow: toNullableNumber(estimate.share_low, "estimate.share_low"),
        shareBase: toNullableNumber(estimate.share_base, "estimate.share_base"),
        shareHigh: toNullableNumber(estimate.share_high, "estimate.share_high"),
        denominatorDefinition: estimate.denominator_definition,
        methodCode: estimate.method_code,
        formula: estimate.formula,
        geographyCode: estimate.geography_code,
        referencePeriod: estimate.reference_period,
        modelVersion: estimate.model_version,
        confidence: optionalJson(estimate.confidence_json, "estimate.confidence_json"),
        dependencies: toJsonArray(estimate.dependencies_json, "estimate.dependencies_json"),
        sources: toJsonArray(estimate.sources_json, "estimate.sources_json"),
        validationGaps: toJsonArray(estimate.validation_gaps_json, "estimate.validation_gaps_json"),
        createdAt: toIsoTimestamp(estimate.created_at, "estimate.created_at"),
      })),
    };
  }, context);
}

interface AuditRow extends QueryResultRow {
  audit_event_id: string | number;
  workspace_id: string | null;
  actor_id: string | null;
  aggregate_type: string;
  aggregate_id: string;
  action: string;
  previous_status: string | null;
  new_status: string | null;
  before_json: unknown;
  after_json: unknown;
  diff_json: unknown;
  request_id: string | null;
  correlation_id: string | null;
  transaction_id: string | number;
  occurred_at: Date | string;
}

export async function listAuditLogs(options: ListAuditLogsOptions = {}): Promise<AuditLogEntry[]> {
  return withWorkspaceTransaction(async (client) => {
    const params: SqlParameter[] = [];
    const predicates: string[] = [
      "coalesce(actor_id::text, '') NOT LIKE '00000000-0000-4000-8000-0000000000%'",
      "NOT production.is_fixture_text(before_json::text)",
      "NOT production.is_fixture_text(after_json::text)",
      "NOT production.is_fixture_text(diff_json::text)",
    ];
    for (const [column, value, field] of [
      ["aggregate_type", options.targetType, "target_type"],
      ["aggregate_id", options.targetId, "target_id"],
      ["action", options.action, "action"],
      ["actor_id::text", options.actorId, "actor_id"],
    ] as const) {
      if (!value) continue;
      params.push(requiredIdentifier(value, field));
      predicates.push(`${column} = $${params.length}`);
    }
    if (options.occurredBefore) {
      params.push(timestampFilter(options.occurredBefore, "occurred_before"));
      predicates.push(`occurred_at < $${params.length}::timestamptz`);
    }
    if (options.occurredAfter) {
      params.push(timestampFilter(options.occurredAfter, "occurred_after"));
      predicates.push(`occurred_at >= $${params.length}::timestamptz`);
    }
    params.push(pageValue(options.limit, 100, 500, "limit"));
    const limitParameter = params.length;
    params.push(pageValue(options.offset, 0, 100_000, "offset"));
    const offsetParameter = params.length;
    const where = predicates.length ? `WHERE ${predicates.join(" AND ")}` : "";
    const result = await client.query<AuditRow>(
      `SELECT
         audit_event_id,
         workspace_id,
         actor_id,
         aggregate_type,
         aggregate_id,
         action,
         before_json ->> 'status' AS previous_status,
         after_json ->> 'status' AS new_status,
         before_json,
         after_json,
         diff_json,
         request_id,
         correlation_id,
         transaction_id,
         occurred_at
       FROM audit_event
       ${where}
       ORDER BY occurred_at DESC, audit_event_id DESC
       LIMIT $${limitParameter} OFFSET $${offsetParameter}`,
      params,
    );
    return result.rows.map((row) => ({
      id: String(row.audit_event_id),
      auditEventId: String(row.audit_event_id),
      workspaceId: row.workspace_id,
      actorId: row.actor_id,
      actor: row.actor_id,
      targetType: row.aggregate_type,
      targetId: row.aggregate_id,
      action: row.action,
      previousStatus: row.previous_status,
      newStatus: row.new_status,
      before: optionalJson(row.before_json, "before_json"),
      after: optionalJson(row.after_json, "after_json"),
      diff: toJsonValue(row.diff_json, "diff_json"),
      requestId: row.request_id,
      correlationId: row.correlation_id,
      transactionId: String(row.transaction_id),
      createdAt: toIsoTimestamp(row.occurred_at, "occurred_at"),
      occurredAt: toIsoTimestamp(row.occurred_at, "occurred_at"),
    }));
  }, options.context);
}
