import "server-only";

import type { QueryResultRow } from "pg";

import type { EntityUnit } from "@/domain/entity-units";
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
  toNullableNumber,
  toNumber,
  type JsonValue,
} from "@/server/db/serializers";

export type ConfidenceGrade = "A" | "B" | "C" | "D" | "E";
export type CatalogEntityUnit = EntityUnit | "all";

export interface DomainSummary {
  domainId: string;
  domainCode: string;
  nameKo: string;
  description: string;
  primaryEntityUnit: EntityUnit;
  categoryCode: string;
  categoryNameKo: string;
  coverageStatus: "complete" | "complete_with_evidence_constraints" | "incomplete";
  active: boolean;
  minorGuardrail: boolean;
  axisCount: number;
  featureCount: number;
  queryableFeatureCount: number;
  behaviorCount: number;
  primarySubtypeCount: number;
  reusableArchetypeCount: number;
  phase1ParentDecisionCount: number;
  eligibleParentCount: number;
  parentAllocationCount: number;
  sourceReleaseCount: number;
  averageConfidenceScore: number | null;
  lowestConfidenceGrade: ConfidenceGrade | null;
  coverageScore: number | null;
  coverageConfidenceGrade: ConfidenceGrade | null;
  coverageGaps: JsonValue | null;
  segmentationModelId: string | null;
  segmentationAlgorithm: string | null;
  selectedK: number | null;
  sampleSize: number | null;
  effectiveSampleSize: number | null;
  modelVersion: string | null;
  referencePeriod: string | null;
  profile: JsonValue | null;
  populationStatus: "estimated";
  countLow: number;
  countBase: number;
  countHigh: number;
  shareLow: number;
  shareBase: number;
  shareHigh: number;
  estimateGrade: ConfidenceGrade;
  confidenceScore: number;
  referenceYear: number;
  geographyScope: string;
  allocationSemantics: string;
  calibrationVersion: string;
  methodCode: string;
  formula: string;
  uncertaintyMethod: string;
  sourceReleaseIds: JsonValue;
  sources: JsonValue[];
  denominatorDefinition: string;
  displayStatusKo: string;
  status: "estimated" | "bounded_estimate";
  countStatusReason: string;
  updatedAt: string;
}

export interface AxisValue {
  order: number;
  value: JsonValue;
  label: string;
}

export interface AxisDistributionValue {
  valueCode: string;
  label: string;
  shareLow: number;
  shareBase: number;
  shareHigh: number;
  countLow: number;
  countBase: number;
  countHigh: number;
  status: string;
  calibrationVersion: string;
}

export interface AxisDetail {
  dimensionId: string;
  domainId: string;
  domainCode: string;
  domainNameKo: string;
  primaryEntityUnit: EntityUnit;
  axisCode: string;
  nameKo: string;
  description: string;
  status: "applicable" | "not_applicable";
  applicability: "applicable" | "not_applicable";
  applicabilityReason: string;
  sortOrder: number;
  values: AxisValue[];
  allowedValues: string[];
  distribution: AxisDistributionValue[];
  parentPopulation: number;
  confidenceScore: number;
  confidenceGrade: ConfidenceGrade;
  referenceYear: number;
  allocationSemantics: string;
  queryableFeatureCount: number;
  domainSubtypeCount: number;
  /** Direct axis-to-subtype links only. Null means that relationship is not registered. */
  subtypeCount: number | null;
  domainArchetypeCount: number;
  modelVersion: string | null;
  dataVersion: string;
  updatedAt: string;
}

export interface DomainAssociation {
  associationId: string;
  relatedDomainId: string;
  relatedDomainCode: string;
  relatedDomainNameKo: string;
  entityUnit: EntityUnit | "cross_unit";
  weightedSupport: number | null;
  effectiveSampleSize: number | null;
  jointPrevalenceLow: number | null;
  jointPrevalenceBase: number | null;
  jointPrevalenceHigh: number | null;
  lift: number | null;
  methodCode: string;
  independenceAssumed: boolean;
  caveat: string;
  modelVersion: string;
}

export interface DomainDetail extends DomainSummary {
  axes: AxisDetail[];
  subtypes: SubtypeSummary[];
  conditions: ConditionLibraryItem[];
  associations: DomainAssociation[];
  geographyDistribution: JsonValue[];
  confidenceComponents: JsonValue | null;
}

export interface SubtypeSummary {
  subtypeId: string;
  subtypeCode: string;
  nameKo: string;
  definition: string;
  isPrimary: boolean;
  labelStatus: "post_hoc_interpreted" | "validated" | "needs_review";
  evidenceBoundary: string;
  domainId: string;
  domainCode: string;
  domainNameKo: string;
  primaryEntityUnit: EntityUnit;
  segmentationModelId: string;
  algorithm: string;
  selectedK: number;
  modelVersion: string | null;
  clusterNumber: number;
  rawClusterNumber: number | null;
  clusterLabelKo: string;
  clusterHardSupport: number;
  domainShareLow: number | null;
  domainShareBase: number | null;
  domainShareHigh: number | null;
  effectiveSampleSize: number | null;
  stabilityScore: number | null;
  confidenceScore: number | null;
  confidenceGrade: ConfidenceGrade | null;
  populationConfidenceScore: number | null;
  populationConfidenceGrade: ConfidenceGrade | null;
  interpretationConfidenceScore: number | null;
  interpretationConfidenceGrade: ConfidenceGrade | null;
  targetabilityConfidenceScore: number | null;
  targetabilityConfidenceGrade: ConfidenceGrade | null;
  targetabilityClass: string | null;
  platformClaimStatus: string | null;
  parentAllocationCount: number;
  representativeCount: number;
  populationCountStatus: "estimated";
  status: "estimated";
  countLow: number;
  countBase: number;
  countHigh: number;
  geographyScope: string;
  referenceYear: number;
  allocationSemantics: "exclusive_partition";
  estimateGrade: ConfidenceGrade;
  sourceReleaseIds: JsonValue;
  relatedArchetypes: JsonValue;
  relatedFeatures: JsonValue;
  relatedBehaviors: JsonValue;
  calibrationVersion: string;
  uncertaintyMethod: string;
}

export interface SubtypeAllocation {
  archetypeId: string;
  archetypeNameKo: string;
  definition: string;
  entityUnit: EntityUnit;
  shareLow: number;
  shareBase: number;
  shareHigh: number;
  countLow: number;
  countBase: number;
  countHigh: number;
  denominatorCountBase: number;
  allocationFormula: string;
  conditionalMethod: string;
  modelVersion: string;
  status: "bounded_estimate";
  confidenceScore: number;
  confidenceGrade: ConfidenceGrade;
}

export interface SubtypeTag {
  tagId: string;
  tagCode: string;
  tagType: "motivation" | "barrier" | "engagement" | "occasion";
  nameKo: string;
  prevalenceLow: number | null;
  prevalenceBase: number | null;
  prevalenceHigh: number | null;
  methodCode: string;
  nonAdditiveWarning: string;
  provenance: string;
}

export interface SubtypeRepresentative {
  rank: number;
  distance: number;
  summary: string;
  privacyDisclosure: string;
}

export interface SubtypeDetail extends SubtypeSummary {
  confidenceGaps: JsonValue | null;
  validationPlan: JsonValue | null;
  observedEvidence: JsonValue | null;
  assumptions: JsonValue | null;
  inferredProfile: JsonValue | null;
  jobsToBeDone: JsonValue | null;
  triggers: JsonValue | null;
  barriers: JsonValue | null;
  engagementModes: JsonValue | null;
  creativeHypotheses: JsonValue | null;
  prohibitedInferences: JsonValue | null;
  activationPayload: JsonValue | null;
  allocations: SubtypeAllocation[];
  tags: SubtypeTag[];
  representatives: SubtypeRepresentative[];
  featureDistribution: JsonValue[];
  behaviorDistribution: JsonValue[];
  regionDistribution: JsonValue[];
  confidenceComponents: JsonValue | null;
}

export interface ArchetypeSummary {
  archetypeId: string;
  nameKo: string;
  nameEn: string | null;
  definition: string;
  primaryEntityUnit: EntityUnit;
  ageMin: number | null;
  ageMax: number | null;
  status: "estimated" | "not_estimable" | "deprecated" | "draft";
  version: string;
  categoryCode: string;
  categoryNameKo: string;
  relatedDomainIds: string[];
  relatedSubtypeIds: string[];
  estimateId: string | null;
  estimateEntityUnit: EntityUnit | null;
  estimateStatus: "estimated" | "not_estimable" | "suppressed" | "superseded" | null;
  countLow: number | null;
  countBase: number | null;
  countHigh: number | null;
  shareLow: number | null;
  shareBase: number | null;
  shareHigh: number | null;
  denominatorDefinition: string | null;
  methodCode: string | null;
  formula: string | null;
  dataLayer: "baseline" | "derived_estimate" | "user_scenario" | "proposed_revision" | "approved_version" | null;
  approvalStatus: "not_required" | "pending" | "approved" | "rejected" | null;
  confidenceScore: number | null;
  confidenceGrade: ConfidenceGrade | null;
  validationGapCount: number;
  domainContextId: string;
  domainContextCount: number;
  referenceYear: number;
  geographyScope: string;
  calibrationVersion: string;
  calibrationMethod: string;
  supportingSources: JsonValue;
  allocationSemantics: string;
  updatedAt: string;
}

export interface ArchetypeMarketContext {
  domainContextId: string;
  contextDomains: JsonValue;
  countLow: number;
  countBase: number;
  countHigh: number;
  shareLow: number;
  shareBase: number;
  shareHigh: number;
  entityUnit: EntityUnit;
  referenceYear: number;
  geographyScope: string;
  confidenceScore: number;
  estimateGrade: ConfidenceGrade;
  calibrationVersion: string;
  calibrationMethod: string;
  supportingSources: JsonValue;
}

export interface ArchetypeSubtypeLink {
  subtypeId: string;
  subtypeCode: string;
  subtypeNameKo: string;
  domainId: string;
  domainNameKo: string;
  segmentationModelId: string;
  shareLow: number;
  shareBase: number;
  shareHigh: number;
  countLow: number;
  countBase: number;
  countHigh: number;
  modelVersion: string;
}

export interface ArchetypeRepresentative {
  sourceKind: "nemotron" | "synthetic_minor" | "synthetic_household" | "synthetic_business";
  rank: number;
  similarity: number | null;
  summary: string | null;
}

export interface ValidationGapSummary {
  validationGapId: string;
  gapType: string;
  description: string;
  impact: "low" | "medium" | "high" | "critical";
  verificationQuestion: string | null;
  recommendedSource: string | null;
  expectedImprovement: string | null;
  priority: number;
  status: "open" | "in_progress" | "resolved" | "accepted";
}

export interface ArchetypeDetail extends ArchetypeSummary {
  rule: JsonValue | null;
  ruleHash: string | null;
  ruleKind: "deterministic" | "probabilistic" | "mixed" | null;
  observableTraits: JsonValue | null;
  inferredNeeds: JsonValue | null;
  triggers: JsonValue | null;
  objections: JsonValue | null;
  channels: JsonValue | null;
  inferenceDisclosure: string | null;
  subtypeLinks: ArchetypeSubtypeLink[];
  representatives: ArchetypeRepresentative[];
  validationGaps: ValidationGapSummary[];
  marketContexts: ArchetypeMarketContext[];
}

export type CatalogObjectType = "domain" | "axis" | "feature" | "behavior" | "subtype" | "archetype" | "estimate" | "saved_segment" | "opportunity";

export interface CatalogSearchResult {
  objectType: CatalogObjectType;
  objectId: string;
  workspaceId: string | null;
  title: string;
  summary: string;
  entityUnit: EntityUnit | null;
  domainId: string | null;
  relevance: number;
  updatedAt: string;
  routePath: string;
}

export type ConditionSourceKind =
  | "core_feature"
  | "domain_feature"
  | "dimension_value"
  | "calibration_dimension"
  | "behavior"
  | "tag"
  | "subtype"
  | "archetype"
  | "gold_query"
  | "geography";

export interface ConditionLibraryItem {
  catalogId: string;
  sourceKind: ConditionSourceKind;
  sourceRecordId: string;
  domainId: string | null;
  dimensionId: string | null;
  sourceCode: string;
  labelKo: string;
  definition: string;
  entityUnit: CatalogEntityUnit;
  dataType: "boolean" | "integer" | "number" | "string" | "date" | "category" | "json";
  allowedValues: JsonValue[];
  sensitiveClass: string;
  queryable: boolean;
}

export interface ListDomainsOptions {
  includeInactive?: boolean;
}

export interface ListSubtypesOptions {
  domainId?: string;
  domainCode?: string;
  axisCode?: string;
  query?: string;
  primaryOnly?: boolean;
  limit?: number;
  offset?: number;
}

export interface ListArchetypesOptions {
  domainId?: string;
  domainCode?: string;
  subtypeId?: string;
  axisCode?: string;
  categoryCode?: string;
  entityUnit?: EntityUnit;
  unit?: string;
  query?: string;
  q?: string;
  feature?: string;
  behavior?: string;
  age?: string;
  region?: string;
  household?: string;
  occupation?: string;
  income?: string;
  business?: string;
  estimateGrade?: ConfidenceGrade;
  minConfidence?: number;
  includeDeprecated?: boolean;
  sort?: string;
  cursor?: string;
  limit?: number;
  offset?: number;
}

export interface SearchCatalogOptions {
  objectTypes?: CatalogObjectType[];
  domainId?: string;
  entityUnit?: EntityUnit;
  limit?: number;
  offset?: number;
  context?: RuntimeContext;
}

export interface ConditionLibraryOptions {
  catalogId?: string;
  domainId?: string;
  sourceKinds?: ConditionSourceKind[];
  entityUnit?: CatalogEntityUnit;
  query?: string;
  queryableOnly?: boolean;
  /** Keep the unfiltered Builder bootstrap bounded; disable only for paginated registry access. */
  balancedSample?: boolean;
  balancedLimitPerKind?: number;
  limit?: number;
  offset?: number;
}

interface DomainRow extends QueryResultRow {
  domain_id: string;
  domain_code: string;
  name_ko: string;
  description: string;
  primary_entity_unit: EntityUnit;
  category_code: string;
  category_name_ko: string;
  coverage_status: DomainSummary["coverageStatus"];
  active: boolean;
  minor_guardrail: boolean;
  axis_count: number;
  feature_count: number;
  queryable_feature_count: number;
  behavior_count: number;
  primary_subtype_count: number;
  reusable_archetype_count: number;
  phase1_parent_decision_count: number;
  eligible_parent_count: number;
  parent_allocation_count: number;
  source_release_count: number;
  average_confidence_score: string | number | null;
  lowest_confidence_grade: ConfidenceGrade | null;
  coverage_score: string | number | null;
  coverage_confidence_grade: ConfidenceGrade | null;
  coverage_gaps: unknown;
  segmentation_model_id: string | null;
  segmentation_algorithm: string | null;
  selected_k: number | null;
  sample_size: number | null;
  effective_sample_size: string | number | null;
  model_version: string | null;
  reference_period: string | null;
  profile_json: unknown;
  production_count_low: string | number;
  production_count_base: string | number;
  production_count_high: string | number;
  production_share_low: string | number;
  production_share_base: string | number;
  production_share_high: string | number;
  production_estimate_grade: ConfidenceGrade;
  production_confidence_score: string | number;
  production_reference_year: number;
  production_geography_scope: string;
  production_allocation_semantics: string;
  production_calibration_version: string;
  production_method_code: string;
  production_formula: string;
  production_uncertainty_method: string;
  production_source_release_ids: unknown;
  production_display_status_ko: string;
  production_status: "estimated" | "bounded_estimate";
  production_updated_at: Date | string;
  updated_at: Date | string;
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

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(String);
}

function mapDomain(row: DomainRow): DomainSummary {
  const productionSources = toJsonArray(row.production_source_release_ids, "production_source_release_ids");
  return {
    domainId: row.domain_id,
    domainCode: row.domain_code,
    nameKo: row.name_ko,
    description: row.description,
    primaryEntityUnit: row.primary_entity_unit,
    categoryCode: row.category_code,
    categoryNameKo: row.category_name_ko,
    coverageStatus: row.coverage_status,
    active: row.active,
    minorGuardrail: row.minor_guardrail,
    axisCount: toNumber(row.axis_count, "axis_count"),
    featureCount: toNumber(row.feature_count, "feature_count"),
    queryableFeatureCount: toNumber(row.queryable_feature_count, "queryable_feature_count"),
    behaviorCount: toNumber(row.behavior_count, "behavior_count"),
    primarySubtypeCount: toNumber(row.primary_subtype_count, "primary_subtype_count"),
    reusableArchetypeCount: toNumber(row.reusable_archetype_count, "reusable_archetype_count"),
    phase1ParentDecisionCount: toNumber(row.phase1_parent_decision_count, "phase1_parent_decision_count"),
    eligibleParentCount: toNumber(row.eligible_parent_count, "eligible_parent_count"),
    parentAllocationCount: toNumber(row.parent_allocation_count, "parent_allocation_count"),
    sourceReleaseCount: toNumber(row.source_release_count, "source_release_count"),
    averageConfidenceScore: toNullableNumber(row.average_confidence_score, "average_confidence_score"),
    lowestConfidenceGrade: row.lowest_confidence_grade,
    coverageScore: toNullableNumber(row.coverage_score, "coverage_score"),
    coverageConfidenceGrade: row.coverage_confidence_grade,
    coverageGaps: optionalJson(row.coverage_gaps, "coverage_gaps"),
    segmentationModelId: row.segmentation_model_id,
    segmentationAlgorithm: row.segmentation_algorithm,
    selectedK: toNullableNumber(row.selected_k, "selected_k"),
    sampleSize: toNullableNumber(row.sample_size, "sample_size"),
    effectiveSampleSize: toNullableNumber(row.effective_sample_size, "effective_sample_size"),
    modelVersion: row.model_version,
    referencePeriod: row.reference_period,
    profile: optionalJson(row.profile_json, "profile_json"),
    populationStatus: "estimated",
    countLow: toNumber(row.production_count_low, "production_count_low"),
    countBase: toNumber(row.production_count_base, "production_count_base"),
    countHigh: toNumber(row.production_count_high, "production_count_high"),
    shareLow: toNumber(row.production_share_low, "production_share_low"),
    shareBase: toNumber(row.production_share_base, "production_share_base"),
    shareHigh: toNumber(row.production_share_high, "production_share_high"),
    estimateGrade: row.production_estimate_grade,
    confidenceScore: toNumber(row.production_confidence_score, "production_confidence_score"),
    referenceYear: toNumber(row.production_reference_year, "production_reference_year"),
    geographyScope: row.production_geography_scope,
    allocationSemantics: row.production_allocation_semantics,
    calibrationVersion: row.production_calibration_version,
    methodCode: row.production_method_code,
    formula: row.production_formula,
    uncertaintyMethod: row.production_uncertainty_method,
    sourceReleaseIds: toJsonValue(row.production_source_release_ids, "production_source_release_ids"),
    sources: productionSources.map((releaseId) => ({
      nameKo: "공식·보정 근거",
      releaseId: String(releaseId),
      referenceYear: row.production_reference_year,
    })),
    denominatorDefinition: row.production_allocation_semantics === "overlapping_membership"
      ? "단위별 대한민국 공식 Universe 안의 중복 가능 Domain 참여 시장"
      : "단위별 대한민국 공식 Universe",
    displayStatusKo: row.production_display_status_ko,
    status: row.production_status,
    countStatusReason: `보정 시장 모집단 · ${row.production_calibration_version} · ${row.production_reference_year}년 · 등급 ${row.production_estimate_grade} (${toNumber(row.production_confidence_score, "production_confidence_score")}점)`,
    updatedAt: toIsoTimestamp(row.production_updated_at, "production_updated_at"),
  };
}

const DOMAIN_SELECT = `
  SELECT *
  FROM (
    SELECT
      explorer.*,
      production_summary.count_low AS production_count_low,
      production_summary.count_base AS production_count_base,
      production_summary.count_high AS production_count_high,
      production_summary.participation_share_low AS production_share_low,
      production_summary.participation_share_base AS production_share_base,
      production_summary.participation_share_high AS production_share_high,
      production_summary.estimate_grade AS production_estimate_grade,
      production_summary.confidence_score AS production_confidence_score,
      production_summary.reference_year AS production_reference_year,
      production_summary.geography_scope AS production_geography_scope,
      production_summary.allocation_semantics AS production_allocation_semantics,
      production_summary.calibration_version AS production_calibration_version,
      production_summary.method_code AS production_method_code,
      production_summary.formula AS production_formula,
      production_summary.uncertainty_method AS production_uncertainty_method,
      production_summary.source_release_ids AS production_source_release_ids,
      production_summary.display_status_ko AS production_display_status_ko,
      production_summary.status AS production_status,
      greatest(explorer.updated_at, production_summary.updated_at) AS production_updated_at
    FROM v_explorer_domain_summary explorer
    JOIN production.v_domain_market_summary production_summary
      ON production_summary.domain_id = explorer.domain_id
  ) domain_read_model
`;

export async function listDomains(options: ListDomainsOptions = {}): Promise<DomainSummary[]> {
  const rows = await queryRows<DomainRow>(
    `${DOMAIN_SELECT}
     WHERE ($1::boolean OR active)
     ORDER BY category_code, domain_code`,
    [options.includeInactive ?? false],
  );
  return rows.map(mapDomain);
}

interface AxisRow extends QueryResultRow {
  dimension_id: string;
  domain_id: string;
  domain_code: string;
  domain_name_ko: string;
  primary_entity_unit: EntityUnit;
  axis_code: string;
  axis_name_ko: string;
  axis_description_ko: string;
  applicability: AxisDetail["applicability"];
  applicability_reason: string;
  sort_order: number;
  values_json: unknown;
  distribution_json: unknown;
  parent_population: string | number;
  production_confidence_score: string | number;
  production_estimate_grade: ConfidenceGrade;
  production_reference_year: number;
  production_allocation_semantics: string;
  queryable_feature_count: number;
  domain_subtype_count: number;
  domain_archetype_count: number;
  model_version: string | null;
  data_version: string;
  updated_at: Date | string;
}

const AXIS_SELECT = `
  SELECT
    dd.dimension_id,
    dd.domain_id,
    dr.domain_code,
    dr.name_ko AS domain_name_ko,
    dr.primary_entity_unit,
    dd.axis_code,
    production_axis.display_name_ko AS axis_name_ko,
    production_axis.description_ko AS axis_description_ko,
    dd.applicability,
    dd.applicability_reason,
    dd.sort_order,
    coalesce(values.values_json, '[]'::jsonb) AS values_json,
    coalesce(distribution.distribution_json, '[]'::jsonb) AS distribution_json,
    distribution.parent_population,
    distribution.confidence_score AS production_confidence_score,
    distribution.estimate_grade AS production_estimate_grade,
    distribution.reference_year AS production_reference_year,
    distribution.allocation_semantics AS production_allocation_semantics,
    coalesce(features.queryable_feature_count, 0)::integer AS queryable_feature_count,
    coalesce(subtypes.domain_subtype_count, 0)::integer AS domain_subtype_count,
    coalesce(archetypes.domain_archetype_count, 0)::integer AS domain_archetype_count,
    model.model_version,
    dd.data_version,
    dd.updated_at
  FROM domain_dimension dd
  JOIN domain_registry dr USING (domain_id)
  JOIN production.v_axis_summary production_axis
    ON production_axis.dimension_id = dd.dimension_id
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(
      jsonb_build_object('order', dv.value_order, 'value', dv.value_json, 'label', dv.value_text)
      ORDER BY dv.value_order
    ) AS values_json
    FROM v_domain_dimension_value dv
    WHERE dv.dimension_id = dd.dimension_id
  ) values ON true
  JOIN LATERAL (
    SELECT
      max(axis_value.parent_population) AS parent_population,
      max(axis_value.confidence_score) AS confidence_score,
      min(axis_value.estimate_grade) AS estimate_grade,
      max(axis_value.reference_year) AS reference_year,
      min(axis_value.allocation_semantics) AS allocation_semantics,
      jsonb_agg(jsonb_build_object(
        'valueCode', axis_value.value_code,
        'label', axis_value.display_name_ko,
        'shareLow', axis_value.share_low,
        'shareBase', axis_value.share_base,
        'shareHigh', axis_value.share_high,
        'countLow', axis_value.count_low,
        'countBase', axis_value.count_base,
        'countHigh', axis_value.count_high,
        'status', axis_value.distribution_status,
        'calibrationVersion', axis_value.calibration_version
      ) ORDER BY axis_value.value_code) AS distribution_json
    FROM production.v_axis_distribution axis_value
    WHERE axis_value.dimension_id = dd.dimension_id
  ) distribution ON true
  LEFT JOIN LATERAL (
    SELECT count(*) FILTER (WHERE df.queryable)::integer AS queryable_feature_count
    FROM domain_feature df
    WHERE df.dimension_id = dd.dimension_id
  ) features ON true
  LEFT JOIN LATERAL (
    SELECT count(*) FILTER (WHERE sd.is_primary)::integer AS domain_subtype_count
    FROM subtype_definition sd
    WHERE sd.domain_id = dd.domain_id
  ) subtypes ON true
  LEFT JOIN LATERAL (
    SELECT count(DISTINCT pdd.phase1_archetype_id)::integer AS domain_archetype_count
    FROM parent_decomposition_decision pdd
    WHERE pdd.domain_id = dd.domain_id
  ) archetypes ON true
  LEFT JOIN LATERAL (
    SELECT mv.version AS model_version
    FROM segmentation_model sm
    JOIN model_version mv USING (model_version_id)
    WHERE sm.domain_id = dd.domain_id AND sm.status = 'selected'
    ORDER BY sm.created_at DESC
    LIMIT 1
  ) model ON true
`;

function mapAxis(row: AxisRow): AxisDetail {
  const rawValues = toJsonArray(row.values_json, "values_json");
  const values = rawValues.map((value, index): AxisValue => {
    if (!value || Array.isArray(value) || typeof value !== "object") {
      throw new Error(`axis_value_${index}_must_be_an_object`);
    }
    return {
      order: toNumber(value.order, `axis_value_${index}.order`),
      value: value.value ?? null,
      label: String(value.label ?? ""),
    };
  });
  const distribution = toJsonArray(row.distribution_json, "distribution_json").map((value, index): AxisDistributionValue => {
    if (!value || Array.isArray(value) || typeof value !== "object") {
      throw new Error(`axis_distribution_${index}_must_be_an_object`);
    }
    return {
      valueCode: String(value.valueCode ?? ""),
      label: String(value.label ?? ""),
      shareLow: toNumber(value.shareLow, `axis_distribution_${index}.shareLow`),
      shareBase: toNumber(value.shareBase, `axis_distribution_${index}.shareBase`),
      shareHigh: toNumber(value.shareHigh, `axis_distribution_${index}.shareHigh`),
      countLow: toNumber(value.countLow, `axis_distribution_${index}.countLow`),
      countBase: toNumber(value.countBase, `axis_distribution_${index}.countBase`),
      countHigh: toNumber(value.countHigh, `axis_distribution_${index}.countHigh`),
      status: String(value.status ?? "calibrated"),
      calibrationVersion: String(value.calibrationVersion ?? ""),
    };
  });
  return {
    dimensionId: row.dimension_id,
    domainId: row.domain_id,
    domainCode: row.domain_code,
    domainNameKo: row.domain_name_ko,
    primaryEntityUnit: row.primary_entity_unit,
    axisCode: row.axis_code,
    nameKo: row.axis_name_ko,
    description: row.axis_description_ko,
    status: row.applicability,
    applicability: row.applicability,
    applicabilityReason: row.applicability_reason,
    sortOrder: toNumber(row.sort_order, "sort_order"),
    values,
    allowedValues: values.map((value) => value.label),
    distribution,
    parentPopulation: toNumber(row.parent_population, "parent_population"),
    confidenceScore: toNumber(row.production_confidence_score, "production_confidence_score"),
    confidenceGrade: row.production_estimate_grade,
    referenceYear: toNumber(row.production_reference_year, "production_reference_year"),
    allocationSemantics: row.production_allocation_semantics,
    queryableFeatureCount: toNumber(row.queryable_feature_count, "queryable_feature_count"),
    domainSubtypeCount: toNumber(row.domain_subtype_count, "domain_subtype_count"),
    // The current registry has no subtype-to-axis edge. Keep the domain-wide
    // total above for context, but never expose it as an axis-linked count.
    subtypeCount: null,
    domainArchetypeCount: toNumber(row.domain_archetype_count, "domain_archetype_count"),
    modelVersion: row.model_version,
    dataVersion: row.data_version,
    updatedAt: toIsoTimestamp(row.updated_at, "updated_at"),
  };
}

async function listAxesForDomain(domainId: string): Promise<AxisDetail[]> {
  const rows = await queryRows<AxisRow>(
    `${AXIS_SELECT}
     WHERE dd.domain_id = $1
     ORDER BY dd.sort_order`,
    [domainId],
  );
  return rows.map(mapAxis);
}

export function getAxis(dimensionId: string): Promise<AxisDetail | null>;
export function getAxis(domainCode: string, axisCode: string): Promise<AxisDetail | null>;
export async function getAxis(dimensionOrDomainCode: string, axisCode?: string): Promise<AxisDetail | null> {
  const first = requiredIdentifier(dimensionOrDomainCode, axisCode ? "domain_code" : "dimension_id");
  const params: SqlParameter[] = [first];
  const predicate = axisCode
    ? (params.push(requiredIdentifier(axisCode, "axis_code")), "dr.domain_code = $1 AND dd.axis_code = $2")
    : "dd.dimension_id = $1";
  const rows = await queryRows<AxisRow>(
    `${AXIS_SELECT}
     WHERE ${predicate}
     LIMIT 1`,
    params,
  );
  return rows[0] ? mapAxis(rows[0]) : null;
}

interface AssociationRow extends QueryResultRow {
  association_id: string;
  related_domain_id: string;
  related_domain_code: string;
  related_domain_name_ko: string;
  entity_unit: DomainAssociation["entityUnit"];
  weighted_support: string | number | null;
  effective_sample_size: string | number | null;
  joint_prevalence_low: string | number | null;
  joint_prevalence_base: string | number | null;
  joint_prevalence_high: string | number | null;
  lift: string | number | null;
  method_code: string;
  independence_assumed: boolean;
  caveat: string;
  model_version: string;
}

async function listDomainAssociations(domainId: string): Promise<DomainAssociation[]> {
  const rows = await queryRows<AssociationRow>(
    `SELECT
       da.association_id,
       CASE WHEN da.domain_id_a = $1 THEN da.domain_id_b ELSE da.domain_id_a END AS related_domain_id,
       related.domain_code AS related_domain_code,
       related.name_ko AS related_domain_name_ko,
       da.entity_unit,
       da.weighted_support,
       da.effective_sample_size,
       da.joint_prevalence_low,
       da.joint_prevalence_base,
       da.joint_prevalence_high,
       da.lift,
       da.method_code,
       da.independence_assumed,
       da.caveat,
       mv.version AS model_version
     FROM domain_association da
     JOIN domain_registry related
       ON related.domain_id = CASE WHEN da.domain_id_a = $1 THEN da.domain_id_b ELSE da.domain_id_a END
     JOIN model_version mv USING (model_version_id)
     WHERE da.domain_id_a = $1 OR da.domain_id_b = $1
     ORDER BY related.name_ko`,
    [domainId],
  );
  return rows.map((row) => ({
    associationId: row.association_id,
    relatedDomainId: row.related_domain_id,
    relatedDomainCode: row.related_domain_code,
    relatedDomainNameKo: row.related_domain_name_ko,
    entityUnit: row.entity_unit,
    weightedSupport: toNullableNumber(row.weighted_support, "weighted_support"),
    effectiveSampleSize: toNullableNumber(row.effective_sample_size, "effective_sample_size"),
    jointPrevalenceLow: toNullableNumber(row.joint_prevalence_low, "joint_prevalence_low"),
    jointPrevalenceBase: toNullableNumber(row.joint_prevalence_base, "joint_prevalence_base"),
    jointPrevalenceHigh: toNullableNumber(row.joint_prevalence_high, "joint_prevalence_high"),
    lift: toNullableNumber(row.lift, "lift"),
    methodCode: row.method_code,
    independenceAssumed: row.independence_assumed,
    caveat: row.caveat,
    modelVersion: row.model_version,
  }));
}

export async function getDomain(domainId: string): Promise<DomainDetail | null> {
  const id = requiredIdentifier(domainId, "domain_id");
  const rows = await queryRows<DomainRow>(
    `${DOMAIN_SELECT} WHERE domain_id = $1 OR domain_code = $1 LIMIT 1`,
    [id],
  );
  if (!rows[0]) return null;
  const canonicalDomainId = rows[0].domain_id;
  const [axes, subtypes, conditions, associations, geographyRows, confidenceRows] = await Promise.all([
    listAxesForDomain(canonicalDomainId),
    listSubtypes({ domainId: canonicalDomainId, primaryOnly: true, limit: 100 }),
    getConditionLibrary({ domainId: canonicalDomainId, queryableOnly: false, limit: 1_000 }),
    listDomainAssociations(canonicalDomainId),
    queryRows<GeographyDistributionRow>(
      `SELECT geography_code, display_name_ko,
              share_low, share_base, share_high,
              count_low, count_base, count_high
       FROM production.v_geography_distribution
       WHERE subject_type = 'domain' AND subject_id = $1
       ORDER BY share_base DESC, geography_code`,
      [canonicalDomainId],
    ),
    queryRows<QueryResultRow>(
      `SELECT *
       FROM production.v_confidence_breakdown
       WHERE subject_type = 'domain' AND subject_id = $1
       LIMIT 1`,
      [canonicalDomainId],
    ),
  ]);
  return {
    ...mapDomain(rows[0]),
    axes,
    subtypes,
    conditions,
    associations,
    geographyDistribution: geographyRows.map((geography) => ({
      id: geography.geography_code,
      nameKo: geography.display_name_ko,
      low: toNumber(geography.share_low, "share_low"),
      value: toNumber(geography.share_base, "share_base"),
      high: toNumber(geography.share_high, "share_high"),
      countLow: toNumber(geography.count_low, "count_low"),
      countBase: toNumber(geography.count_base, "count_base"),
      countHigh: toNumber(geography.count_high, "count_high"),
      provenance: "official_region_control × calibrated_domain_membership",
    })),
    confidenceComponents: confidenceRows[0]
      ? toJsonValue(confidenceRows[0], "confidence_components")
      : null,
  };
}

interface SubtypeRow extends QueryResultRow {
  subtype_id: string;
  subtype_code: string;
  name_ko: string;
  definition: string;
  is_primary: boolean;
  label_status: SubtypeSummary["labelStatus"];
  evidence_boundary: string;
  domain_id: string;
  domain_code: string;
  domain_name_ko: string;
  primary_entity_unit: EntityUnit;
  segmentation_model_id: string;
  algorithm: string;
  selected_k: number;
  model_version: string | null;
  cluster_number: number;
  raw_cluster_number: number | null;
  post_hoc_label_ko: string;
  cluster_hard_support: number;
  domain_share_low: string | number | null;
  domain_share_base: string | number | null;
  domain_share_high: string | number | null;
  effective_sample_size: string | number | null;
  stability_score: string | number | null;
  confidence_score: number | null;
  confidence_grade: ConfidenceGrade | null;
  population_confidence_score: number | null;
  population_confidence_grade: ConfidenceGrade | null;
  interpretation_confidence_score: number | null;
  interpretation_confidence_grade: ConfidenceGrade | null;
  targetability_confidence_score: number | null;
  targetability_confidence_grade: ConfidenceGrade | null;
  targetability_class: string | null;
  platform_claim_status: string | null;
  parent_allocation_count: number;
  representative_count: number;
  population_count_status: "parent_context_required";
  production_count_low: string | number;
  production_count_base: string | number;
  production_count_high: string | number;
  production_geography_scope: string;
  production_reference_year: number;
  production_allocation_semantics: "exclusive_partition";
  production_estimate_grade: ConfidenceGrade;
  production_confidence_score: string | number;
  production_source_release_ids: unknown;
  production_related_archetypes: unknown;
  production_related_features: unknown;
  production_related_behaviors: unknown;
  production_model_version: string;
  production_uncertainty_method: string;
  confidence_gaps?: unknown;
  validation_plan?: unknown;
  observed_evidence?: unknown;
  assumptions_json?: unknown;
  inferred_profile?: unknown;
  jobs_to_be_done?: unknown;
  triggers?: unknown;
  barriers?: unknown;
  engagement_modes?: unknown;
  creative_hypotheses?: unknown;
  prohibited_inferences?: unknown;
  activation_payload?: unknown;
}

const SUBTYPE_COLUMNS = `
  detail.subtype_id,
  detail.subtype_code,
  market.display_name_ko AS name_ko,
  market.definition_ko AS definition,
  sd.is_primary,
  detail.label_status,
  detail.evidence_boundary,
  detail.domain_id,
  detail.domain_code,
  detail.domain_name_ko,
  detail.primary_entity_unit,
  detail.segmentation_model_id,
  detail.algorithm,
  detail.selected_k,
  detail.model_version,
  detail.cluster_number,
  detail.raw_cluster_number,
  detail.post_hoc_label_ko,
  detail.cluster_hard_support,
  market.share_low AS domain_share_low,
  market.share_base AS domain_share_base,
  market.share_high AS domain_share_high,
  detail.effective_sample_size,
  detail.stability_score,
  market.confidence_score,
  market.estimate_grade AS confidence_grade,
  detail.population_confidence_score,
  detail.population_confidence_grade,
  detail.interpretation_confidence_score,
  detail.interpretation_confidence_grade,
  detail.targetability_confidence_score,
  detail.targetability_confidence_grade,
  detail.targetability_class,
  detail.platform_claim_status,
  detail.parent_allocation_count,
  detail.representative_count,
  detail.population_count_status,
  market.count_low AS production_count_low,
  market.count_base AS production_count_base,
  market.count_high AS production_count_high,
  market.geography_scope AS production_geography_scope,
  market.reference_year AS production_reference_year,
  market.allocation_semantics AS production_allocation_semantics,
  market.estimate_grade AS production_estimate_grade,
  market.confidence_score AS production_confidence_score,
  market.source_release_ids AS production_source_release_ids,
  market.related_archetypes AS production_related_archetypes,
  market.related_features AS production_related_features,
  market.related_behaviors AS production_related_behaviors,
  market.model_version AS production_model_version,
  market.uncertainty_method AS production_uncertainty_method
`;

function mapSubtype(row: SubtypeRow): SubtypeSummary {
  return {
    subtypeId: row.subtype_id,
    subtypeCode: row.subtype_code,
    nameKo: row.name_ko,
    definition: row.definition,
    isPrimary: row.is_primary,
    labelStatus: row.label_status,
    evidenceBoundary: row.evidence_boundary,
    domainId: row.domain_id,
    domainCode: row.domain_code,
    domainNameKo: row.domain_name_ko,
    primaryEntityUnit: row.primary_entity_unit,
    segmentationModelId: row.segmentation_model_id,
    algorithm: row.algorithm,
    selectedK: toNumber(row.selected_k, "selected_k"),
    modelVersion: row.model_version,
    clusterNumber: toNumber(row.cluster_number, "cluster_number"),
    rawClusterNumber: toNullableNumber(row.raw_cluster_number, "raw_cluster_number"),
    clusterLabelKo: row.post_hoc_label_ko,
    clusterHardSupport: toNumber(row.cluster_hard_support, "cluster_hard_support"),
    domainShareLow: toNullableNumber(row.domain_share_low, "domain_share_low"),
    domainShareBase: toNullableNumber(row.domain_share_base, "domain_share_base"),
    domainShareHigh: toNullableNumber(row.domain_share_high, "domain_share_high"),
    effectiveSampleSize: toNullableNumber(row.effective_sample_size, "effective_sample_size"),
    stabilityScore: toNullableNumber(row.stability_score, "stability_score"),
    confidenceScore: toNullableNumber(row.confidence_score, "confidence_score"),
    confidenceGrade: row.confidence_grade,
    populationConfidenceScore: toNumber(row.production_confidence_score, "production_confidence_score"),
    populationConfidenceGrade: row.production_estimate_grade,
    interpretationConfidenceScore: toNullableNumber(
      row.interpretation_confidence_score,
      "interpretation_confidence_score",
    ),
    interpretationConfidenceGrade: row.interpretation_confidence_grade,
    targetabilityConfidenceScore: toNullableNumber(
      row.targetability_confidence_score,
      "targetability_confidence_score",
    ),
    targetabilityConfidenceGrade: row.targetability_confidence_grade,
    targetabilityClass: row.targetability_class,
    platformClaimStatus: row.platform_claim_status,
    parentAllocationCount: toNumber(row.parent_allocation_count, "parent_allocation_count"),
    representativeCount: toNumber(row.representative_count, "representative_count"),
    populationCountStatus: "estimated",
    status: "estimated",
    countLow: toNumber(row.production_count_low, "production_count_low"),
    countBase: toNumber(row.production_count_base, "production_count_base"),
    countHigh: toNumber(row.production_count_high, "production_count_high"),
    geographyScope: row.production_geography_scope,
    referenceYear: toNumber(row.production_reference_year, "production_reference_year"),
    allocationSemantics: row.production_allocation_semantics,
    estimateGrade: row.production_estimate_grade,
    sourceReleaseIds: toJsonValue(row.production_source_release_ids, "production_source_release_ids"),
    relatedArchetypes: toJsonValue(row.production_related_archetypes, "production_related_archetypes"),
    relatedFeatures: toJsonValue(row.production_related_features, "production_related_features"),
    relatedBehaviors: toJsonValue(row.production_related_behaviors, "production_related_behaviors"),
    calibrationVersion: row.production_model_version,
    uncertaintyMethod: row.production_uncertainty_method,
  };
}

export async function listSubtypes(options: ListSubtypesOptions = {}): Promise<SubtypeSummary[]> {
  // Phase 2 registers axes at the domain level but does not register a
  // subtype-to-axis edge. Returning every domain subtype would falsely imply
  // a direct relationship, so an axis-constrained request is intentionally
  // empty until that provenance table exists.
  if (options.axisCode) return [];
  const params: SqlParameter[] = [];
  const predicates: string[] = [];
  if (options.domainId) {
    params.push(requiredIdentifier(options.domainId, "domain_id"));
    predicates.push(`detail.domain_id = $${params.length}`);
  }
  if (options.domainCode) {
    params.push(requiredIdentifier(options.domainCode, "domain_code"));
    predicates.push(`detail.domain_code = $${params.length}`);
  }
  if (options.query?.trim()) {
    params.push(options.query.trim());
    predicates.push(
      `concat_ws(' ', detail.subtype_code, detail.name_ko, detail.definition, detail.domain_name_ko) ILIKE '%' || $${params.length} || '%'`,
    );
  }
  if (options.primaryOnly ?? true) predicates.push("sd.is_primary");
  params.push(pageValue(options.limit, 100, 500, "limit"));
  const limitParameter = params.length;
  params.push(pageValue(options.offset, 0, 100_000, "offset"));
  const offsetParameter = params.length;
  const where = predicates.length ? `WHERE ${predicates.join(" AND ")}` : "";
  const rows = await queryRows<SubtypeRow>(
    `SELECT ${SUBTYPE_COLUMNS}
     FROM v_subtype_explorer_detail detail
     JOIN subtype_definition sd USING (subtype_id)
     JOIN production.v_subtype_market_summary market USING (subtype_id)
     ${where}
     ORDER BY detail.domain_name_ko, detail.name_ko, detail.subtype_id
     LIMIT $${limitParameter} OFFSET $${offsetParameter}`,
    params,
  );
  return rows.map(mapSubtype);
}

interface AllocationRow extends QueryResultRow {
  archetype_id: string;
  archetype_name_ko: string;
  archetype_definition: string;
  entity_unit: EntityUnit;
  share_low: string | number;
  share_base: string | number;
  share_high: string | number;
  count_low: string | number;
  count_base: string | number;
  count_high: string | number;
  denominator_count_base: string | number;
  allocation_formula: string;
  conditional_method: string;
  model_version: string;
}

interface TagRow extends QueryResultRow {
  tag_id: string;
  tag_code: string;
  tag_type: SubtypeTag["tagType"];
  name_ko: string;
  prevalence_low: string | number | null;
  prevalence_base: string | number | null;
  prevalence_high: string | number | null;
  method_code: string;
  non_additive_warning: string;
  provenance: string;
}

interface SubtypeRepresentativeRow extends QueryResultRow {
  rank: number;
  distance: string | number;
  representative_summary: string;
  privacy_disclosure: string;
}

interface FeaturePrevalenceRow extends QueryResultRow {
  domain_feature_id: string;
  display_name_ko: string;
  prevalence_low: string | number;
  prevalence_base: string | number;
  prevalence_high: string | number;
  count_low: string | number;
  count_base: string | number;
  count_high: string | number;
  coverage_status: string;
}

interface BehaviorPrevalenceRow extends QueryResultRow {
  behavior_template_id: string;
  display_name_ko: string;
  prevalence_low: string | number;
  prevalence_base: string | number;
  prevalence_high: string | number;
  count_low: string | number;
  count_base: string | number;
  count_high: string | number;
  frequency_per_month_base: string | number;
  coverage_status: string;
}

interface GeographyDistributionRow extends QueryResultRow {
  geography_code: string;
  display_name_ko: string;
  share_low: string | number;
  share_base: string | number;
  share_high: string | number;
  count_low: string | number;
  count_base: string | number;
  count_high: string | number;
}

export async function getSubtype(subtypeId: string): Promise<SubtypeDetail | null> {
  const id = requiredIdentifier(subtypeId, "subtype_id");
  const rows = await queryRows<SubtypeRow>(
    `SELECT ${SUBTYPE_COLUMNS},
       detail.confidence_gaps,
       detail.validation_plan,
       detail.observed_evidence,
       detail.assumptions_json,
       detail.inferred_profile,
       detail.jobs_to_be_done,
       detail.triggers,
       detail.barriers,
       detail.engagement_modes,
       detail.creative_hypotheses,
       detail.prohibited_inferences,
       detail.activation_payload
     FROM v_subtype_explorer_detail detail
     JOIN subtype_definition sd USING (subtype_id)
     JOIN production.v_subtype_market_summary market USING (subtype_id)
     WHERE detail.subtype_id = $1
     LIMIT 1`,
    [id],
  );
  const row = rows[0];
  if (!row) return null;

  const [allocationRows, tagRows, representativeRows, featureRows, behaviorRows, geographyRows, confidenceRows] = await Promise.all([
    queryRows<AllocationRow>(
      `SELECT
         a.archetype_id,
         a.name_ko AS archetype_name_ko,
         a.one_line_definition AS archetype_definition,
         a.primary_entity_unit AS entity_unit,
         sa.share_low,
         sa.share_base,
         sa.share_high,
         sa.count_low,
         sa.count_base,
         sa.count_high,
         sa.denominator_count_base,
         sa.allocation_formula,
         sa.conditional_method,
         mv.version AS model_version
       FROM subtype_allocation sa
       JOIN archetype a ON a.archetype_id = sa.phase1_archetype_id
       JOIN model_version mv USING (model_version_id)
       WHERE sa.subtype_id = $1
       ORDER BY sa.count_base DESC, a.name_ko`,
      [id],
    ),
    queryRows<TagRow>(
      `SELECT
         dt.tag_id,
         dt.tag_code,
         dt.tag_type,
         dt.name_ko,
         sta.prevalence_low,
         sta.prevalence_base,
         sta.prevalence_high,
         sta.method_code,
         sta.non_additive_warning,
         dt.provenance
       FROM subtype_tag_allocation sta
       JOIN domain_tag dt USING (tag_id)
       WHERE sta.subtype_id = $1
       ORDER BY dt.tag_type, dt.name_ko`,
      [id],
    ),
    queryRows<SubtypeRepresentativeRow>(
      `SELECT cr.rank, cr.distance, cr.representative_summary, cr.privacy_disclosure
       FROM subtype_definition sd
       JOIN cluster_representative cr USING (cluster_id)
       WHERE sd.subtype_id = $1
       ORDER BY cr.rank`,
      [id],
    ),
    queryRows<FeaturePrevalenceRow>(
      `SELECT domain_feature_id, display_name_ko,
              prevalence_low, prevalence_base, prevalence_high,
              count_low, count_base, count_high, coverage_status
       FROM production.v_feature_prevalence
       WHERE domain_id = $1
       ORDER BY prevalence_base DESC, display_name_ko`,
      [row.domain_id],
    ),
    queryRows<BehaviorPrevalenceRow>(
      `SELECT behavior_template_id, display_name_ko,
              prevalence_low, prevalence_base, prevalence_high,
              count_low, count_base, count_high,
              frequency_per_month_base, coverage_status
       FROM production.v_behavior_prevalence
       WHERE domain_id = $1
       ORDER BY prevalence_base DESC, display_name_ko`,
      [row.domain_id],
    ),
    queryRows<GeographyDistributionRow>(
      `SELECT geography_code, display_name_ko,
              share_low, share_base, share_high,
              count_low, count_base, count_high
       FROM production.v_geography_distribution
       WHERE subject_type = 'domain' AND subject_id = $1
       ORDER BY share_base DESC, geography_code`,
      [row.domain_id],
    ),
    queryRows<QueryResultRow>(
      `SELECT *
       FROM production.v_confidence_breakdown
       WHERE subject_type = 'subtype' AND subject_id = $1
       LIMIT 1`,
      [id],
    ),
  ]);

  return {
    ...mapSubtype(row),
    confidenceGaps: optionalJson(row.confidence_gaps, "confidence_gaps"),
    validationPlan: optionalJson(row.validation_plan, "validation_plan"),
    observedEvidence: optionalJson(row.observed_evidence, "observed_evidence"),
    assumptions: optionalJson(row.assumptions_json, "assumptions_json"),
    inferredProfile: optionalJson(row.inferred_profile, "inferred_profile"),
    jobsToBeDone: optionalJson(row.jobs_to_be_done, "jobs_to_be_done"),
    triggers: optionalJson(row.triggers, "triggers"),
    barriers: optionalJson(row.barriers, "barriers"),
    engagementModes: optionalJson(row.engagement_modes, "engagement_modes"),
    creativeHypotheses: optionalJson(row.creative_hypotheses, "creative_hypotheses"),
    prohibitedInferences: optionalJson(row.prohibited_inferences, "prohibited_inferences"),
    activationPayload: optionalJson(row.activation_payload, "activation_payload"),
    allocations: allocationRows.map((allocation) => ({
      archetypeId: allocation.archetype_id,
      archetypeNameKo: allocation.archetype_name_ko,
      definition: allocation.archetype_definition,
      entityUnit: allocation.entity_unit,
      shareLow: toNumber(allocation.share_low, "share_low"),
      shareBase: toNumber(allocation.share_base, "share_base"),
      shareHigh: toNumber(allocation.share_high, "share_high"),
      countLow: toNumber(allocation.count_low, "count_low"),
      countBase: toNumber(allocation.count_base, "count_base"),
      countHigh: toNumber(allocation.count_high, "count_high"),
      denominatorCountBase: toNumber(allocation.denominator_count_base, "denominator_count_base"),
      allocationFormula: allocation.allocation_formula,
      conditionalMethod: allocation.conditional_method,
      modelVersion: allocation.model_version,
      status: "bounded_estimate",
      confidenceScore: toNumber(row.production_confidence_score, "production_confidence_score"),
      confidenceGrade: row.production_estimate_grade,
    })),
    tags: tagRows.map((tag) => ({
      tagId: tag.tag_id,
      tagCode: tag.tag_code,
      tagType: tag.tag_type,
      nameKo: tag.name_ko,
      prevalenceLow: toNullableNumber(tag.prevalence_low, "prevalence_low"),
      prevalenceBase: toNullableNumber(tag.prevalence_base, "prevalence_base"),
      prevalenceHigh: toNullableNumber(tag.prevalence_high, "prevalence_high"),
      methodCode: tag.method_code,
      nonAdditiveWarning: tag.non_additive_warning,
      provenance: tag.provenance,
    })),
    representatives: representativeRows.map((representative) => ({
      rank: toNumber(representative.rank, "rank"),
      distance: toNumber(representative.distance, "distance"),
      summary: representative.representative_summary,
      privacyDisclosure: representative.privacy_disclosure,
    })),
    featureDistribution: featureRows.map((feature) => ({
      id: feature.domain_feature_id,
      nameKo: feature.display_name_ko,
      prevalenceLow: toNumber(feature.prevalence_low, "prevalence_low"),
      prevalenceBase: toNumber(feature.prevalence_base, "prevalence_base"),
      prevalenceHigh: toNumber(feature.prevalence_high, "prevalence_high"),
      countLow: toNumber(feature.count_low, "count_low"),
      countBase: toNumber(feature.count_base, "count_base"),
      countHigh: toNumber(feature.count_high, "count_high"),
      provenance: feature.coverage_status,
    })),
    behaviorDistribution: behaviorRows.map((behavior) => ({
      id: behavior.behavior_template_id,
      nameKo: behavior.display_name_ko,
      prevalenceLow: toNumber(behavior.prevalence_low, "prevalence_low"),
      prevalenceBase: toNumber(behavior.prevalence_base, "prevalence_base"),
      prevalenceHigh: toNumber(behavior.prevalence_high, "prevalence_high"),
      countLow: toNumber(behavior.count_low, "count_low"),
      countBase: toNumber(behavior.count_base, "count_base"),
      countHigh: toNumber(behavior.count_high, "count_high"),
      frequencyPerMonthBase: toNumber(behavior.frequency_per_month_base, "frequency_per_month_base"),
      provenance: behavior.coverage_status,
    })),
    regionDistribution: geographyRows.map((geography) => ({
      id: geography.geography_code,
      nameKo: geography.display_name_ko,
      low: toNumber(geography.share_low, "share_low"),
      value: toNumber(geography.share_base, "share_base"),
      high: toNumber(geography.share_high, "share_high"),
      countLow: toNumber(geography.count_low, "count_low"),
      countBase: toNumber(geography.count_base, "count_base"),
      countHigh: toNumber(geography.count_high, "count_high"),
      provenance: "Parent Domain geographic distribution",
    })),
    confidenceComponents: confidenceRows[0]
      ? toJsonValue(confidenceRows[0], "confidence_components")
      : null,
  };
}

interface ArchetypeRow extends QueryResultRow {
  archetype_id: string;
  name_ko: string;
  name_en: string | null;
  one_line_definition: string;
  primary_entity_unit: EntityUnit;
  age_min: number | null;
  age_max: number | null;
  archetype_status: ArchetypeSummary["status"];
  archetype_version: string;
  category_code: string;
  category_name_ko: string;
  related_domain_ids: string[] | null;
  related_subtype_ids: string[] | null;
  estimate_id: string | null;
  estimate_entity_unit: EntityUnit | null;
  estimate_status: ArchetypeSummary["estimateStatus"];
  count_low: string | number | null;
  count_base: string | number | null;
  count_high: string | number | null;
  share_low: string | number | null;
  share_base: string | number | null;
  share_high: string | number | null;
  denominator_definition: string | null;
  method_code: string | null;
  formula: string | null;
  data_layer: ArchetypeSummary["dataLayer"];
  approval_status: ArchetypeSummary["approvalStatus"];
  confidence_score: number | null;
  confidence_grade: ConfidenceGrade | null;
  validation_gap_count: number;
  domain_context_id: string;
  domain_context_count: number;
  reference_year: number;
  geography_scope: string;
  calibration_version: string;
  calibration_method: string;
  supporting_sources: unknown;
  allocation_semantics: string;
  updated_at: Date | string;
  rule_json?: unknown;
  rule_hash?: string | null;
  deterministic_or_probabilistic?: ArchetypeDetail["ruleKind"];
  observable_traits?: unknown;
  inferred_needs?: unknown;
  triggers?: unknown;
  objections?: unknown;
  channels?: unknown;
  inference_disclosure?: string | null;
}

const ARCHETYPE_COLUMNS = `
  search.archetype_id,
  search.name_ko,
  search.name_en,
  search.one_line_definition,
  search.primary_entity_unit,
  search.age_min,
  search.age_max,
  market.status AS archetype_status,
  search.archetype_version,
  search.category_code,
  search.category_name_ko,
  coalesce(relations.related_domain_ids, ARRAY[]::text[]) AS related_domain_ids,
  coalesce(relations.related_subtype_ids, ARRAY[]::text[]) AS related_subtype_ids,
  'archetype-market:' || market.archetype_id || ':' || market.domain_context_id AS estimate_id,
  market.entity_unit AS estimate_entity_unit,
  market.status AS estimate_status,
  market.estimated_count_low AS count_low,
  market.estimated_count_base AS count_base,
  market.estimated_count_high AS count_high,
  market.estimated_share_low AS share_low,
  market.estimated_share_base AS share_base,
  market.estimated_share_high AS share_high,
  market.domain_context_id AS denominator_definition,
  market.calibration_method AS method_code,
  'weighted_synthetic_membership × calibrated_parent_population'::text AS formula,
  'baseline'::text AS data_layer,
  'approved'::text AS approval_status,
  market.confidence_score,
  market.estimate_grade AS confidence_grade,
  search.validation_gap_count,
  market.domain_context_id,
  market.domain_context_count,
  market.reference_year,
  market.geography_scope,
  market.calibration_version,
  market.calibration_method,
  market.supporting_sources,
  market.allocation_semantics,
  search.updated_at
`;

const ARCHETYPE_FROM = `
  FROM v_archetype_search search
  JOIN production.v_workbench_archetype_primary_context market
    ON market.archetype_id = search.archetype_id
  LEFT JOIN LATERAL (
    SELECT
      array_agg(DISTINCT sd.domain_id ORDER BY sd.domain_id) AS related_domain_ids,
      array_agg(DISTINCT sa.subtype_id ORDER BY sa.subtype_id) AS related_subtype_ids
    FROM subtype_allocation sa
    JOIN subtype_definition sd USING (subtype_id)
    WHERE sa.phase1_archetype_id = search.archetype_id
  ) relations ON true
`;

function mapArchetype(row: ArchetypeRow): ArchetypeSummary {
  return {
    archetypeId: row.archetype_id,
    nameKo: row.name_ko,
    nameEn: row.name_en,
    definition: row.one_line_definition,
    primaryEntityUnit: row.primary_entity_unit,
    ageMin: toNullableNumber(row.age_min, "age_min"),
    ageMax: toNullableNumber(row.age_max, "age_max"),
    status: row.archetype_status,
    version: row.archetype_version,
    categoryCode: row.category_code,
    categoryNameKo: row.category_name_ko,
    relatedDomainIds: stringArray(row.related_domain_ids),
    relatedSubtypeIds: stringArray(row.related_subtype_ids),
    estimateId: row.estimate_id,
    estimateEntityUnit: row.estimate_entity_unit,
    estimateStatus: row.estimate_status,
    countLow: toNullableNumber(row.count_low, "count_low"),
    countBase: toNullableNumber(row.count_base, "count_base"),
    countHigh: toNullableNumber(row.count_high, "count_high"),
    shareLow: toNullableNumber(row.share_low, "share_low"),
    shareBase: toNullableNumber(row.share_base, "share_base"),
    shareHigh: toNullableNumber(row.share_high, "share_high"),
    denominatorDefinition: row.denominator_definition,
    methodCode: row.method_code,
    formula: row.formula,
    dataLayer: row.data_layer,
    approvalStatus: row.approval_status,
    confidenceScore: toNullableNumber(row.confidence_score, "confidence_score"),
    confidenceGrade: row.confidence_grade,
    validationGapCount: toNumber(row.validation_gap_count, "validation_gap_count"),
    domainContextId: row.domain_context_id,
    domainContextCount: toNumber(row.domain_context_count, "domain_context_count"),
    referenceYear: toNumber(row.reference_year, "reference_year"),
    geographyScope: row.geography_scope,
    calibrationVersion: row.calibration_version,
    calibrationMethod: row.calibration_method,
    supportingSources: toJsonValue(row.supporting_sources, "supporting_sources"),
    allocationSemantics: row.allocation_semantics,
    updatedAt: toIsoTimestamp(row.updated_at, "updated_at"),
  };
}

export async function listArchetypes(options: ListArchetypesOptions = {}): Promise<ArchetypeSummary[]> {
  const params: SqlParameter[] = [];
  const predicates: string[] = [];
  const candidatePredicates: string[] = [];
  if (options.domainId) {
    params.push(requiredIdentifier(options.domainId, "domain_id"));
    predicates.push(
      `EXISTS (
         SELECT 1 FROM subtype_allocation sa
         JOIN subtype_definition sd USING (subtype_id)
         WHERE sa.phase1_archetype_id = search.archetype_id AND sd.domain_id = $${params.length}
       )`,
    );
    candidatePredicates.push(
      `EXISTS (
         SELECT 1 FROM subtype_allocation sa
         JOIN subtype_definition sd USING (subtype_id)
         WHERE sa.phase1_archetype_id = a.archetype_id AND sd.domain_id = $${params.length}
       )`,
    );
  }
  if (options.domainCode) {
    params.push(requiredIdentifier(options.domainCode, "domain_code"));
    predicates.push(
      `EXISTS (
         SELECT 1 FROM subtype_allocation sa
         JOIN subtype_definition sd USING (subtype_id)
         JOIN domain_registry dr USING (domain_id)
         WHERE sa.phase1_archetype_id = search.archetype_id AND dr.domain_code = $${params.length}
       )`,
    );
    candidatePredicates.push(
      `EXISTS (
         SELECT 1 FROM subtype_allocation sa
         JOIN subtype_definition sd USING (subtype_id)
         JOIN domain_registry dr USING (domain_id)
         WHERE sa.phase1_archetype_id = a.archetype_id AND dr.domain_code = $${params.length}
       )`,
    );
  }
  if (options.subtypeId) {
    params.push(requiredIdentifier(options.subtypeId, "subtype_id"));
    predicates.push(
      `EXISTS (
         SELECT 1 FROM subtype_allocation sa
         WHERE sa.phase1_archetype_id = search.archetype_id AND sa.subtype_id = $${params.length}
       )`,
    );
    candidatePredicates.push(
      `EXISTS (
         SELECT 1 FROM subtype_allocation sa
         WHERE sa.phase1_archetype_id = a.archetype_id AND sa.subtype_id = $${params.length}
       )`,
    );
  }
  if (options.axisCode) {
    requiredIdentifier(options.axisCode, "axis_code");
    predicates.push("FALSE /* subtype-to-axis provenance is not registered */");
    candidatePredicates.push("FALSE /* subtype-to-axis provenance is not registered */");
  }
  if (options.categoryCode) {
    params.push(requiredIdentifier(options.categoryCode, "category_code"));
    predicates.push(`search.category_code = $${params.length}`);
    candidatePredicates.push(`c.code = $${params.length}`);
  }
  const requestedUnit = options.entityUnit ?? options.unit;
  if (requestedUnit) {
    if (!["person", "child_person", "household", "establishment", "enterprise"].includes(requestedUnit)) {
      throw new Error("entity_unit_invalid");
    }
    params.push(requestedUnit);
    predicates.push(`search.primary_entity_unit = $${params.length}`);
    candidatePredicates.push(`a.primary_entity_unit = $${params.length}`);
  }
  const requestedQuery = options.query ?? options.q;
  if (requestedQuery?.trim()) {
    params.push(requestedQuery.trim());
    predicates.push(`search.search_text ILIKE '%' || $${params.length} || '%'`);
  }
  for (const [field, value] of [
    ["feature", options.feature],
    ["behavior", options.behavior],
    ["region", options.region],
    ["household", options.household],
    ["occupation", options.occupation],
    ["income", options.income],
    ["business", options.business],
  ] as const) {
    if (!value?.trim()) continue;
    if (value.length > 200) throw new Error(`${field}_filter_too_long`);
    params.push(value.trim());
    predicates.push(
      `concat_ws(' ', search.name_ko, search.one_line_definition, search.rule_json::text,
                       search.observable_traits::text, search.inferred_needs::text,
                       search.triggers::text, search.objections::text, search.channels::text)
         ILIKE '%' || $${params.length} || '%'`,
    );
  }
  if (options.age?.trim()) {
    const match = /^(\d{1,3})(?:\s*-\s*(\d{1,3})|\s*\+)?$/.exec(options.age.trim());
    if (!match) throw new Error("age_filter_invalid");
    const minimum = Number(match[1]);
    const maximum = match[2] ? Number(match[2]) : options.age.includes("+") ? 130 : minimum;
    if (minimum > maximum || maximum > 130) throw new Error("age_filter_invalid");
    params.push(minimum, maximum);
    predicates.push(
      `(
         ((search.age_min IS NOT NULL OR search.age_max IS NOT NULL)
          AND coalesce(search.age_max, search.age_min) >= $${params.length - 1}
          AND coalesce(search.age_min, search.age_max) <= $${params.length})
         OR EXISTS (
           SELECT 1
           FROM jsonb_array_elements(coalesce(search.rule_json->'and', '[]'::jsonb)) rule_condition
           WHERE rule_condition->>'feature' IN ('age','owner_age','household_head_age','representative_age')
             AND rule_condition->>'op' = 'between'
             AND jsonb_typeof(rule_condition->'value') = 'array'
             AND (rule_condition->'value'->>0) ~ '^\\d{1,3}$'
             AND (rule_condition->'value'->>1) ~ '^\\d{1,3}$'
             AND (rule_condition->'value'->>1)::integer >= $${params.length - 1}
             AND (rule_condition->'value'->>0)::integer <= $${params.length}
         )
       )`,
    );
  }
  if (options.estimateGrade) {
    if (!(["A", "B", "C", "D", "E"] as const).includes(options.estimateGrade)) {
      throw new Error("estimate_grade_filter_invalid");
    }
    params.push(options.estimateGrade);
    predicates.push(`market.estimate_grade = $${params.length}`);
  }
  if (options.minConfidence !== undefined) {
    if (!Number.isFinite(options.minConfidence) || options.minConfidence < 0 || options.minConfidence > 100) {
      throw new Error("minimum_confidence_filter_invalid");
    }
    params.push(options.minConfidence);
    predicates.push(`market.confidence_score >= $${params.length}`);
  }
  if (!options.includeDeprecated) {
    predicates.push("search.archetype_status <> 'deprecated'");
    candidatePredicates.push("a.status <> 'deprecated'");
  }

  const sortSql = ({
    name: "search.name_ko, search.archetype_id",
    count: "market.estimated_count_base DESC NULLS LAST, search.name_ko",
    confidence: "market.confidence_score DESC NULLS LAST, search.name_ko",
    updated: "search.updated_at DESC, search.archetype_id",
  } as const)[options.sort as "name" | "count" | "confidence" | "updated"] ??
    "search.name_ko, search.archetype_id";
  const hasAdvancedTextFilter = Boolean(
    requestedQuery?.trim() || options.feature?.trim() || options.behavior?.trim()
      || options.region?.trim() || options.household?.trim() || options.occupation?.trim()
      || options.income?.trim() || options.business?.trim(),
  );
  const hasAdvancedFilter = hasAdvancedTextFilter || Boolean(options.age?.trim())
    || Boolean(options.estimateGrade) || options.minConfidence !== undefined;
  if (options.cursor) {
    if (hasAdvancedFilter || (options.sort && options.sort !== "name") || (options.offset ?? 0) !== 0) {
      throw new Error("archetype_cursor_requires_name_sort_and_zero_offset");
    }
    const cursor = decodeArchetypeCursor(options.cursor);
    params.push(cursor.nameKo, cursor.archetypeId);
    predicates.push(`(search.name_ko,search.archetype_id) > ($${params.length - 1},$${params.length})`);
    candidatePredicates.push(`(a.name_ko,a.archetype_id) > ($${params.length - 1},$${params.length})`);
  }
  params.push(pageValue(options.limit, 100, 500, "limit"));
  const limitParameter = params.length;
  params.push(pageValue(options.offset, 0, 100_000, "offset"));
  const offsetParameter = params.length;
  const where = predicates.length ? `WHERE ${predicates.join(" AND ")}` : "";
  const candidateWhere = candidatePredicates.length ? `WHERE ${candidatePredicates.join(" AND ")}` : "";
  const canPageBeforeEnrichment = !hasAdvancedFilter && (!options.sort || options.sort === "name");

  const rows = await queryRows<ArchetypeRow>(
    canPageBeforeEnrichment
      ? `WITH candidates AS MATERIALIZED (
           SELECT a.archetype_id, a.name_ko
           FROM archetype a
           JOIN category c USING (category_id)
           ${candidateWhere}
           ORDER BY a.name_ko, a.archetype_id
           LIMIT $${limitParameter} OFFSET $${offsetParameter}
         )
         SELECT ${ARCHETYPE_COLUMNS}
         FROM candidates candidate
         CROSS JOIN LATERAL (
           SELECT *
           FROM v_archetype_search selected
           WHERE selected.archetype_id = candidate.archetype_id
           LIMIT 1
         ) search
         JOIN production.v_workbench_archetype_primary_context market
           ON market.archetype_id = search.archetype_id
         LEFT JOIN LATERAL (
           SELECT
             array_agg(DISTINCT sd.domain_id ORDER BY sd.domain_id) AS related_domain_ids,
             array_agg(DISTINCT sa.subtype_id ORDER BY sa.subtype_id) AS related_subtype_ids
           FROM subtype_allocation sa
           JOIN subtype_definition sd USING (subtype_id)
           WHERE sa.phase1_archetype_id = search.archetype_id
         ) relations ON true
         ORDER BY candidate.name_ko, candidate.archetype_id`
      : `SELECT ${ARCHETYPE_COLUMNS}
         ${ARCHETYPE_FROM}
         ${where}
         ORDER BY ${sortSql}
         LIMIT $${limitParameter} OFFSET $${offsetParameter}`,
    params,
  );
  return rows.map(mapArchetype);
}

interface ArchetypeRegistryCountRow extends QueryResultRow {
  archetype_count: string | number;
}

export async function getArchetypeRegistryCount(): Promise<number> {
  const rows = await queryRows<ArchetypeRegistryCountRow>(
    `SELECT archetype_count
     FROM production.v_workbench_product_dod
     LIMIT 1`,
  );
  if (!rows[0]) throw new Error("workbench_product_dod_missing");
  return toNumber(rows[0].archetype_count, "archetype_count");
}

export function encodeArchetypeCursor(archetype: Pick<ArchetypeSummary, "archetypeId" | "nameKo">): string {
  return Buffer.from(JSON.stringify({ v: 1, archetypeId: archetype.archetypeId, nameKo: archetype.nameKo }), "utf8").toString("base64url");
}

function decodeArchetypeCursor(cursor: string): { archetypeId: string; nameKo: string } {
  if (!cursor || cursor.length > 1_000) throw new Error("archetype_cursor_invalid");
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as Record<string, unknown>;
    if (value.v !== 1 || typeof value.archetypeId !== "string" || !value.archetypeId
      || typeof value.nameKo !== "string" || !value.nameKo) throw new Error("invalid");
    return { archetypeId: requiredIdentifier(value.archetypeId, "archetype_cursor_id"), nameKo: value.nameKo.slice(0, 240) };
  } catch {
    throw new Error("archetype_cursor_invalid");
  }
}

interface ArchetypeSubtypeRow extends QueryResultRow {
  subtype_id: string;
  subtype_code: string;
  subtype_name_ko: string;
  domain_id: string;
  domain_name_ko: string;
  segmentation_model_id: string;
  share_low: string | number;
  share_base: string | number;
  share_high: string | number;
  count_low: string | number;
  count_base: string | number;
  count_high: string | number;
  model_version: string;
}

interface ArchetypeRepresentativeRow extends QueryResultRow {
  source_kind: ArchetypeRepresentative["sourceKind"];
  rank: number;
  distance_or_similarity: string | number | null;
  representative_summary: string | null;
}

interface ValidationGapRow extends QueryResultRow {
  validation_gap_id: string | number;
  gap_type: string;
  description: string;
  impact: ValidationGapSummary["impact"];
  verification_question: string | null;
  recommended_source: string | null;
  expected_improvement: string | null;
  priority: number;
  status: ValidationGapSummary["status"];
}

interface ArchetypeMarketContextRow extends QueryResultRow {
  domain_context_id: string;
  context_domains: unknown;
  estimated_count_low: string | number;
  estimated_count_base: string | number;
  estimated_count_high: string | number;
  estimated_share_low: string | number;
  estimated_share_base: string | number;
  estimated_share_high: string | number;
  entity_unit: EntityUnit;
  reference_year: number;
  geography_scope: string;
  confidence_score: number;
  estimate_grade: ConfidenceGrade;
  calibration_version: string;
  calibration_method: string;
  supporting_sources: unknown;
}

export async function getArchetype(archetypeId: string): Promise<ArchetypeDetail | null> {
  const id = requiredIdentifier(archetypeId, "archetype_id");
  const rows = await queryRows<ArchetypeRow>(
    `SELECT ${ARCHETYPE_COLUMNS},
       search.rule_json,
       search.rule_hash,
       search.deterministic_or_probabilistic,
       search.observable_traits,
       search.inferred_needs,
       search.triggers,
       search.objections,
       search.channels,
       search.inference_disclosure
     ${ARCHETYPE_FROM}
     WHERE search.archetype_id = $1
     LIMIT 1`,
    [id],
  );
  const row = rows[0];
  if (!row) return null;

  const [subtypeRows, representativeRows, gapRows, marketContextRows] = await Promise.all([
    queryRows<ArchetypeSubtypeRow>(
      `SELECT
         sd.subtype_id,
         sd.subtype_code,
         sd.name_ko AS subtype_name_ko,
         dr.domain_id,
         dr.name_ko AS domain_name_ko,
         cd.segmentation_model_id,
         sa.share_low,
         sa.share_base,
         sa.share_high,
         sa.count_low,
         sa.count_base,
         sa.count_high,
         mv.version AS model_version
       FROM subtype_allocation sa
       JOIN subtype_definition sd USING (subtype_id)
       JOIN cluster_definition cd USING (cluster_id)
       JOIN domain_registry dr USING (domain_id)
       JOIN model_version mv USING (model_version_id)
       WHERE sa.phase1_archetype_id = $1
       ORDER BY dr.name_ko, sa.count_base DESC, sd.name_ko`,
      [id],
    ),
    queryRows<ArchetypeRepresentativeRow>(
      `SELECT source_kind, rank, distance_or_similarity, representative_summary
       FROM archetype_representative
       WHERE archetype_id = $1
       ORDER BY source_kind, rank`,
      [id],
    ),
    queryRows<ValidationGapRow>(
      `SELECT
         validation_gap_id,
         gap_type,
         description,
         impact,
         verification_question,
         recommended_source,
         expected_improvement,
         priority,
         status
       FROM validation_gap
       WHERE archetype_id = $1 AND estimate_id IS NULL
       ORDER BY priority, validation_gap_id`,
      [id],
    ),
    queryRows<ArchetypeMarketContextRow>(
      `SELECT
         domain_context_id,
         context_domains,
         estimated_count_low,
         estimated_count_base,
         estimated_count_high,
         estimated_share_low,
         estimated_share_base,
         estimated_share_high,
         entity_unit,
         reference_year,
         geography_scope,
         confidence_score,
         estimate_grade,
         calibration_version,
         calibration_method,
         supporting_sources
       FROM production.v_archetype_market_summary
       WHERE archetype_id = $1
       ORDER BY confidence_score DESC, estimated_count_base DESC, domain_context_id`,
      [id],
    ),
  ]);

  return {
    ...mapArchetype(row),
    rule: optionalJson(row.rule_json, "rule_json"),
    ruleHash: row.rule_hash ?? null,
    ruleKind: row.deterministic_or_probabilistic ?? null,
    observableTraits: optionalJson(row.observable_traits, "observable_traits"),
    inferredNeeds: optionalJson(row.inferred_needs, "inferred_needs"),
    triggers: optionalJson(row.triggers, "triggers"),
    objections: optionalJson(row.objections, "objections"),
    channels: optionalJson(row.channels, "channels"),
    inferenceDisclosure: row.inference_disclosure ?? null,
    subtypeLinks: subtypeRows.map((subtype) => ({
      subtypeId: subtype.subtype_id,
      subtypeCode: subtype.subtype_code,
      subtypeNameKo: subtype.subtype_name_ko,
      domainId: subtype.domain_id,
      domainNameKo: subtype.domain_name_ko,
      segmentationModelId: subtype.segmentation_model_id,
      shareLow: toNumber(subtype.share_low, "share_low"),
      shareBase: toNumber(subtype.share_base, "share_base"),
      shareHigh: toNumber(subtype.share_high, "share_high"),
      countLow: toNumber(subtype.count_low, "count_low"),
      countBase: toNumber(subtype.count_base, "count_base"),
      countHigh: toNumber(subtype.count_high, "count_high"),
      modelVersion: subtype.model_version,
    })),
    representatives: representativeRows.map((representative) => ({
      sourceKind: representative.source_kind,
      rank: toNumber(representative.rank, "rank"),
      similarity: toNullableNumber(representative.distance_or_similarity, "distance_or_similarity"),
      summary: representative.representative_summary,
    })),
    validationGaps: gapRows.map((gap) => ({
      validationGapId: String(gap.validation_gap_id),
      gapType: gap.gap_type,
      description: gap.description,
      impact: gap.impact,
      verificationQuestion: gap.verification_question,
      recommendedSource: gap.recommended_source,
      expectedImprovement: gap.expected_improvement,
      priority: toNumber(gap.priority, "priority"),
      status: gap.status,
    })),
    marketContexts: marketContextRows.map((context) => ({
      domainContextId: context.domain_context_id,
      contextDomains: toJsonValue(context.context_domains, "context_domains"),
      countLow: toNumber(context.estimated_count_low, "estimated_count_low"),
      countBase: toNumber(context.estimated_count_base, "estimated_count_base"),
      countHigh: toNumber(context.estimated_count_high, "estimated_count_high"),
      shareLow: toNumber(context.estimated_share_low, "estimated_share_low"),
      shareBase: toNumber(context.estimated_share_base, "estimated_share_base"),
      shareHigh: toNumber(context.estimated_share_high, "estimated_share_high"),
      entityUnit: context.entity_unit,
      referenceYear: toNumber(context.reference_year, "reference_year"),
      geographyScope: context.geography_scope,
      confidenceScore: toNumber(context.confidence_score, "confidence_score"),
      estimateGrade: context.estimate_grade,
      calibrationVersion: context.calibration_version,
      calibrationMethod: context.calibration_method,
      supportingSources: toJsonValue(context.supporting_sources, "supporting_sources"),
    })),
  };
}

interface SearchRow extends QueryResultRow {
  object_type: CatalogObjectType;
  object_id: string;
  workspace_id: string | null;
  title: string;
  summary: string;
  entity_unit: EntityUnit | null;
  domain_id: string | null;
  relevance: string | number;
  updated_at: Date | string;
  route_path: string;
}

export async function searchCatalog(
  query: string,
  options: SearchCatalogOptions = {},
): Promise<CatalogSearchResult[]> {
  const term = query.trim();
  if (!term) return [];
  if (term.length > 300) throw new Error("catalog_query_too_long");

  return withWorkspaceTransaction(async (client) => {
    const params: SqlParameter[] = [term];
    const predicates = [`search_text ILIKE '%' || $1 || '%'`];
    if (options.objectTypes?.length) {
      params.push(options.objectTypes);
      predicates.push(`object_type = ANY($${params.length}::text[])`);
    }
    if (options.domainId) {
      params.push(requiredIdentifier(options.domainId, "domain_id"));
      predicates.push(`domain_id = $${params.length}`);
    }
    if (options.entityUnit) {
      params.push(options.entityUnit);
      predicates.push(`entity_unit = $${params.length}`);
    }
    params.push(pageValue(options.limit, 30, 100, "limit"));
    const limitParameter = params.length;
    params.push(pageValue(options.offset, 0, 10_000, "offset"));
    const offsetParameter = params.length;
    const result = await client.query<SearchRow>(
      `SELECT
         object_type,
         object_id,
         workspace_id,
         title,
         summary,
         entity_unit,
         domain_id,
         greatest(
           similarity(search_text, $1),
           CASE WHEN title ILIKE $1 || '%' THEN 1.0 ELSE 0.0 END
         ) AS relevance,
         updated_at,
         route_path
       FROM v_global_search
       WHERE ${predicates.join(" AND ")}
       ORDER BY relevance DESC, updated_at DESC, object_type, object_id
       LIMIT $${limitParameter} OFFSET $${offsetParameter}`,
      params,
    );
    return result.rows.map((row) => ({
      objectType: row.object_type,
      objectId: row.object_id,
      workspaceId: row.workspace_id,
      title: row.title,
      summary: row.summary,
      entityUnit: row.entity_unit,
      domainId: row.domain_id,
      relevance: toNumber(row.relevance, "relevance"),
      updatedAt: toIsoTimestamp(row.updated_at, "updated_at"),
      routePath: row.route_path,
    }));
  }, options.context);
}

interface ConditionRow extends QueryResultRow {
  catalog_id: string;
  source_kind: ConditionSourceKind;
  source_record_id: string;
  domain_id: string | null;
  dimension_id: string | null;
  source_code: string;
  label_ko: string;
  definition: string;
  entity_unit: CatalogEntityUnit;
  data_type: ConditionLibraryItem["dataType"];
  allowed_values: unknown;
  sensitive_class: string;
  queryable: boolean;
}

export async function getConditionLibrary(
  options: ConditionLibraryOptions = {},
): Promise<ConditionLibraryItem[]> {
  const params: SqlParameter[] = [];
  const predicates: string[] = [];
  if (options.catalogId?.trim()) {
    params.push(options.catalogId.trim());
    predicates.push(`catalog_id = $${params.length}`);
  }
  if (options.domainId) {
    params.push(requiredIdentifier(options.domainId, "domain_id"));
    predicates.push(`domain_id = $${params.length}`);
  }
  if (options.sourceKinds?.length) {
    params.push(options.sourceKinds);
    predicates.push(`source_kind = ANY($${params.length}::text[])`);
  }
  if (options.entityUnit) {
    params.push(options.entityUnit);
    predicates.push(
      options.entityUnit === "all"
        ? `entity_unit = $${params.length}`
        : `entity_unit IN ($${params.length}, 'all')`,
    );
  }
  if (options.query?.trim()) {
    params.push(options.query.trim());
    predicates.push(`search_text ILIKE '%' || $${params.length} || '%'`);
  }
  if (options.queryableOnly ?? true) predicates.push("queryable");
  params.push(pageValue(options.limit, 3_000, 5_000, "limit"));
  const limitParameter = params.length;
  params.push(pageValue(options.offset, 0, 100_000, "offset"));
  const offsetParameter = params.length;
  const where = predicates.length ? `WHERE ${predicates.join(" AND ")}` : "";

  const useBalancedDefault = (options.balancedSample ?? true)
    && !options.catalogId?.trim()
    && !options.domainId
    && !options.sourceKinds?.length
    && !options.entityUnit
    && !options.query?.trim();
  const balancedLimitPerKind = pageValue(options.balancedLimitPerKind, 20, 300, "balanced_limit_per_kind");
  const rows = await queryRows<ConditionRow>(
    `WITH ranked_catalog AS (
      SELECT
       catalog_id,
       source_kind,
       source_record_id,
       domain_id,
       dimension_id,
       source_code,
       label_ko,
       definition,
       entity_unit,
       data_type,
       allowed_values,
       sensitive_class,
       queryable,
       row_number() OVER (PARTITION BY source_kind ORDER BY domain_id NULLS FIRST, label_ko, catalog_id) AS source_rank
      FROM production.v_workbench_condition_catalog
      ${where}
     )
     SELECT
       catalog_id, source_kind, source_record_id, domain_id, dimension_id,
       source_code, label_ko, definition, entity_unit, data_type,
       allowed_values, sensitive_class, queryable
     FROM ranked_catalog
     ${useBalancedDefault ? `WHERE source_rank <= ${balancedLimitPerKind}` : ""}
     ORDER BY source_kind, domain_id NULLS FIRST, label_ko, catalog_id
     LIMIT $${limitParameter} OFFSET $${offsetParameter}`,
    params,
  );
  return rows.map((row) => ({
    catalogId: row.catalog_id,
    sourceKind: row.source_kind,
    sourceRecordId: row.source_record_id,
    domainId: row.domain_id,
    dimensionId: row.dimension_id,
    sourceCode: row.source_code,
    labelKo: row.label_ko,
    definition: row.definition,
    entityUnit: row.entity_unit,
    dataType: row.data_type,
    allowedValues: toJsonArray(row.allowed_values, "allowed_values"),
    sensitiveClass: row.sensitive_class,
    queryable: row.queryable,
  }));
}
