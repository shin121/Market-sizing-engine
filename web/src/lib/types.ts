import type { EntityUnit } from "@/lib/constants";

export type DomainSummary = {
  domain_id: string;
  domain_code: string;
  name_ko: string;
  description: string;
  primary_entity_unit: EntityUnit;
  category_code: string;
  category_name_ko: string;
  coverage_status: string;
  axis_count: number;
  feature_count: number;
  behavior_count: number;
  primary_subtype_count: number;
  reusable_archetype_count: number;
  parent_allocation_count: number;
  average_confidence_score: number | null;
  coverage_score: number | null;
  coverage_gaps: unknown[];
  segmentation_algorithm: string | null;
  selected_k: number | null;
  effective_sample_size: number | null;
  model_version: string | null;
  reference_period: string | null;
  domain_population_status: string;
  count_low: number | null;
  count_base: number | null;
  count_high: number | null;
  count_status_reason: string | null;
  updated_at: string;
};

export type ConditionCatalogItem = {
  catalog_id: string;
  source_kind: string;
  source_record_id: string;
  domain_id: string | null;
  dimension_id: string | null;
  source_code: string;
  label_ko: string;
  definition: string;
  entity_unit: EntityUnit | "all";
  data_type: string;
  allowed_values: unknown[];
  sensitive_class: string;
  queryable: boolean;
};

export type SubtypeDetail = Record<string, unknown> & {
  subtype_id: string;
  subtype_code: string;
  name_ko: string;
  definition: string;
  domain_code: string;
  domain_name_ko: string;
  primary_entity_unit: EntityUnit;
  count_low: number | null;
  count_base: number | null;
  count_high: number | null;
  population_count_status: string;
};

export type ArchetypeSearchRow = Record<string, unknown> & {
  archetype_id: string;
  name_ko: string;
  one_line_definition: string;
  primary_entity_unit: EntityUnit;
  category_name_ko: string;
  estimate_status: string;
  count_low: number | null;
  count_base: number | null;
  count_high: number | null;
  confidence_score: number | null;
  confidence_grade: string | null;
  validation_gap_count: number;
};

