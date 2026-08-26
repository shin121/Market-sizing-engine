const { Client } = require("pg");
const { writeFileSync } = require("node:fs");

const databaseName = process.env.MARKET_ENGINE_PG_DATABASE;
if (!databaseName || databaseName === "market_engine") {
  throw new Error(
    "Set MARKET_ENGINE_PG_DATABASE to an explicit disposable populated clone; the canonical market_engine database is not an audit target.",
  );
}

const connection = {
  database: databaseName,
  host: process.env.MARKET_ENGINE_PG_SOCKET ?? `${process.cwd()}/data/local/socket`,
  port: Number(process.env.MARKET_ENGINE_PG_PORT ?? "55432"),
  user: process.env.MARKET_ENGINE_PG_USER,
  application_name: "workbench-performance-audit-001-018",
};

const workspaceId = process.env.WORKBENCH_DEFAULT_WORKSPACE_ID ?? "9f693300-49ad-5bd5-ad98-af4e225661ea";
const actorId = process.env.WORKBENCH_DEFAULT_ACTOR_ID ?? "314126eb-26a2-55fa-a613-28180096cbac";

const estimateLineageCandidatePageSql = `WITH candidates AS MATERIALIZED (
  SELECT estimate_row.estimate_id, estimate_row.updated_at
  FROM v_estimate_release_boundary estimate_row
  WHERE ($1::text IS NULL OR estimate_row.status = $1)
    AND ($2::uuid IS NULL OR estimate_row.estimate_id = $2)
  ORDER BY estimate_row.updated_at DESC, estimate_row.estimate_id
  LIMIT $3 OFFSET $4
)
SELECT lineage.*
FROM candidates candidate
CROSS JOIN LATERAL (
  SELECT *
  FROM v_estimate_lineage selected
  WHERE selected.estimate_id = candidate.estimate_id
  LIMIT 1
) lineage
ORDER BY candidate.updated_at DESC, candidate.estimate_id`;

const originalEstimateLineageListSql = `SELECT *
FROM v_estimate_lineage
WHERE ($1::text IS NULL OR status = $1)
ORDER BY updated_at DESC, estimate_id
LIMIT $2 OFFSET $3`;

const queries = [
  {
    id: "WB-PERF-01",
    name: "explorer_domain_list",
    source: "web/src/server/repositories/catalog.ts:listDomains",
    scope: "explorer/domain",
    sql: `SELECT *
FROM v_explorer_domain_summary
WHERE ($1::boolean OR active)
ORDER BY category_code, domain_code`,
    params: [false],
  },
  {
    id: "WB-PERF-02",
    name: "catalog_global_search",
    source: "web/src/server/repositories/catalog.ts:searchCatalog",
    scope: "search",
    sql: `SELECT
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
  updated_at
FROM v_global_search
WHERE search_text ILIKE '%' || $1 || '%'
ORDER BY relevance DESC, updated_at DESC, object_type, object_id
LIMIT $2 OFFSET $3`,
    params: ["교육", 30, 0],
  },
  {
    id: "WB-PERF-03",
    name: "subtype_list_by_domain",
    source: "web/src/server/repositories/catalog.ts:listSubtypes",
    scope: "subtype explorer",
    sql: `SELECT
  detail.subtype_id,
  detail.subtype_code,
  detail.name_ko,
  detail.definition,
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
  detail.domain_share_low,
  detail.domain_share_base,
  detail.domain_share_high,
  detail.effective_sample_size,
  detail.stability_score,
  detail.confidence_score,
  detail.confidence_grade,
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
  detail.population_count_status
FROM v_subtype_explorer_detail detail
JOIN subtype_definition sd USING (subtype_id)
WHERE detail.domain_code = $1 AND sd.is_primary
ORDER BY detail.domain_name_ko, detail.name_ko, detail.subtype_id
LIMIT $2 OFFSET $3`,
    params: ["education_learning", 100, 0],
  },
  {
    id: "WB-PERF-04",
    name: "archetype_list_by_domain",
    source: "web/src/server/repositories/catalog.ts:listArchetypes",
    scope: "archetype explorer",
    sql: `WITH candidates AS MATERIALIZED (
  SELECT a.archetype_id, a.name_ko
  FROM archetype a
  JOIN category c USING (category_id)
  WHERE EXISTS (
    SELECT 1
    FROM subtype_allocation sa
    JOIN subtype_definition sd USING (subtype_id)
    JOIN domain_registry dr USING (domain_id)
    WHERE sa.phase1_archetype_id = a.archetype_id
      AND dr.domain_code = $1
  )
  AND a.status <> 'deprecated'
  ORDER BY a.name_ko, a.archetype_id
  LIMIT $2 OFFSET $3
)
SELECT
  search.archetype_id,
  search.name_ko,
  search.name_en,
  search.one_line_definition,
  search.primary_entity_unit,
  search.age_min,
  search.age_max,
  search.archetype_status,
  search.archetype_version,
  search.category_code,
  search.category_name_ko,
  coalesce(relations.related_domain_ids, ARRAY[]::text[]) AS related_domain_ids,
  search.estimate_id,
  search.estimate_entity_unit,
  search.estimate_status,
  search.count_low,
  search.count_base,
  search.count_high,
  search.share_low,
  search.share_base,
  search.share_high,
  search.denominator_definition,
  search.method_code,
  search.formula,
  search.data_layer,
  search.approval_status,
  search.confidence_score,
  search.confidence_grade,
  search.validation_gap_count,
  search.updated_at
FROM candidates candidate
CROSS JOIN LATERAL (
  SELECT *
  FROM v_archetype_search selected
  WHERE selected.archetype_id = candidate.archetype_id
  LIMIT 1
) search
LEFT JOIN LATERAL (
  SELECT array_agg(DISTINCT sd.domain_id ORDER BY sd.domain_id) AS related_domain_ids
  FROM subtype_allocation sa
  JOIN subtype_definition sd USING (subtype_id)
  WHERE sa.phase1_archetype_id = search.archetype_id
) relations ON true
ORDER BY candidate.name_ko, candidate.archetype_id`,
    params: ["education_learning", 100, 0],
  },
  {
    id: "WB-PERF-05",
    name: "subtype_parent_allocation_lineage",
    source: "web/src/server/repositories/catalog.ts:getSubtype allocation query",
    scope: "subtype/archetype lineage",
    sql: `SELECT
  a.archetype_id,
  a.name_ko AS archetype_name_ko,
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
    params: ["DOM-16-SUB-01"],
  },
  {
    id: "WB-PERF-06",
    name: "archetype_subtype_lineage",
    source: "web/src/server/repositories/catalog.ts:getArchetype subtype query",
    scope: "subtype/archetype lineage",
    sql: `SELECT
  sd.subtype_id,
  sd.subtype_code,
  sd.name_ko AS subtype_name_ko,
  dr.domain_id,
  dr.name_ko AS domain_name_ko,
  sa.share_low,
  sa.share_base,
  sa.share_high,
  sa.count_low,
  sa.count_base,
  sa.count_high,
  mv.version AS model_version
FROM subtype_allocation sa
JOIN subtype_definition sd USING (subtype_id)
JOIN domain_registry dr USING (domain_id)
JOIN model_version mv USING (model_version_id)
WHERE sa.phase1_archetype_id = $1
ORDER BY dr.name_ko, sa.count_base DESC, sd.name_ko`,
    params: ["ARC-16-001"],
  },
  {
    id: "WB-PERF-07",
    name: "comparison_resolve_two_query_results_release_safe",
    source: "web/src/server/repositories/workbench.ts:compareSegments",
    scope: "comparison/release-safe unsaved resolver",
    sql: `WITH requested AS (
  SELECT value AS requested_id, ordinality::smallint AS position
  FROM unnest($1::text[]) WITH ORDINALITY AS input(value, ordinality)
)
SELECT
  NULL::uuid AS comparison_id,
  NULL::uuid AS workspace_id,
  'Unsaved comparison'::text AS comparison_name,
  'draft'::text AS comparison_status,
  requested.position,
  matched.segment_name AS display_label,
  matched.object_id AS query_result_id,
  matched.segment_name,
  matched.primary_entity_unit,
  matched.estimate_id,
  matched.estimate_status,
  matched.count_low,
  matched.count_base,
  matched.count_high,
  matched.share_base,
  matched.source_kind,
  matched.confidence_score,
  matched.confidence_grade,
  matched.validation_gap_count,
  matched.direct_observation_share,
  matched.estimate_updated_at,
  matched.active_market_scenario_count,
  matched.market_scenario_id,
  matched.market_scenario_name,
  matched.market_scenario_version,
  matched.market_horizon_months,
  matched.market_estimate_id,
  matched.tam_entities_base,
  matched.sam_entities_base,
  matched.som_entities_base,
  matched.tam_revenue_base,
  matched.sam_revenue_base,
  matched.som_revenue_base,
  matched.market_currency,
  matched.annual_spend_per_entity,
  matched.annual_spend_per_entity_unit,
  '{}'::jsonb AS normalized_metrics
FROM requested
JOIN LATERAL (
  SELECT * FROM (
    SELECT sqr.result_id::text AS object_id, sq.name AS segment_name,
           sq.primary_entity_unit, e.estimate_id::text AS estimate_id,
           e.status AS estimate_status,
           e.count_low,e.count_base,e.count_high,e.share_base,
           CASE WHEN e.release_suppressed THEN NULL::double precision
                ELSE ca.total_score::double precision END AS confidence_score,
           CASE WHEN e.release_suppressed THEN NULL::text
                ELSE ca.grade::text END AS confidence_grade,
           CASE WHEN e.release_suppressed THEN NULL::integer
                ELSE (SELECT count(*)::integer FROM validation_gap gap
                       WHERE gap.estimate_id=e.estimate_id) END AS validation_gap_count,
           (SELECT CASE WHEN e.release_suppressed OR count(*)=0 THEN NULL
                        ELSE count(*) FILTER (WHERE ec.directness_class='direct_observation')::numeric / count(*) END
              FROM v_estimate_component_release_boundary ec
             WHERE ec.estimate_id=e.estimate_id)::double precision AS direct_observation_share,
           CASE WHEN e.release_suppressed THEN NULL::text
                ELSE e.updated_at::text END AS estimate_updated_at,
           market_state.active_market_scenario_count,
           market.market_scenario_id,
           market.market_scenario_name,
           market.market_scenario_version,
           market.market_horizon_months,
           market.market_estimate_id::text,
           market.tam_entities_base,market.sam_entities_base,market.som_entities_base,
           market.tam_revenue_base,market.sam_revenue_base,market.som_revenue_base,
           market.market_currency,
           market.annual_spend_per_entity,
           market.annual_spend_per_entity_unit,
           'query_result'::text AS source_kind,0 AS rank
    FROM v_segment_query_result_release_boundary sqr
    JOIN segment_query sq USING (query_id)
    JOIN v_estimate_release_boundary e USING (estimate_id)
    LEFT JOIN confidence_assessment ca USING (estimate_id)
    LEFT JOIN v_saved_segment_latest saved ON saved.result_id=sqr.result_id
    LEFT JOIN LATERAL (
      SELECT count(*)::integer AS active_market_scenario_count
      FROM market_scenario ms
      WHERE ms.base_query_result_id=sqr.result_id AND ms.status='active'
        AND NOT e.release_suppressed
    ) market_state ON true
    LEFT JOIN LATERAL (
      SELECT ms.scenario_id::text AS market_scenario_id,
             ms.name AS market_scenario_name,
             ms.version AS market_scenario_version,
             ms.horizon_months AS market_horizon_months,
             me.market_estimate_id,me.tam_entities_base,me.sam_entities_base,
             me.som_entities_base,me.tam_revenue_base,me.sam_revenue_base,
             me.som_revenue_base,ms.currency::text AS market_currency,
             spend.value_base AS annual_spend_per_entity,
             spend.unit AS annual_spend_per_entity_unit
      FROM market_scenario ms
      LEFT JOIN market_estimate me USING (scenario_id)
      LEFT JOIN scenario_factor_override spend
        ON spend.scenario_id=ms.scenario_id
       AND spend.factor_code='annual_spend_per_entity'
      WHERE ms.base_query_result_id=sqr.result_id AND ms.status='active'
        AND NOT e.release_suppressed
        AND market_state.active_market_scenario_count=1
      ORDER BY me.created_at DESC NULLS LAST
      LIMIT 1
    ) market ON true
    WHERE sqr.result_id::text=requested.requested_id
       OR e.estimate_id::text=requested.requested_id
       OR saved.saved_segment_id::text=requested.requested_id

    UNION ALL

    SELECT archetype.archetype_id, archetype.name_ko,
           archetype.primary_entity_unit, archetype.estimate_id::text,
           archetype.estimate_status,
           archetype.count_low,archetype.count_base,archetype.count_high,
           archetype.share_base,archetype.confidence_score,archetype.confidence_grade,
           archetype.validation_gap_count,
           (SELECT CASE WHEN archetype.estimate_status='suppressed' OR count(*)=0 THEN NULL
                        ELSE count(*) FILTER (WHERE ec.directness_class='direct_observation')::numeric / count(*) END
              FROM v_estimate_component_release_boundary ec
             WHERE ec.estimate_id=archetype.estimate_id)::double precision,
           (SELECT e.updated_at::text FROM v_estimate_release_boundary e
             WHERE e.estimate_id=archetype.estimate_id),
           0::integer,NULL::text,NULL::text,NULL::text,NULL::integer,
           NULL::text,NULL::numeric,NULL::numeric,NULL::numeric,
           NULL::numeric,NULL::numeric,NULL::numeric,NULL::text,
           NULL::numeric,NULL::text,
           'archetype'::text,1
    FROM v_archetype_search archetype
    WHERE archetype.archetype_id=requested.requested_id

    UNION ALL

    SELECT subtype.subtype_id, subtype.name_ko,
           subtype.primary_entity_unit, NULL::text,
           NULL::text,
           subtype.count_low,subtype.count_base,subtype.count_high,
           subtype.domain_share_base,subtype.confidence_score,subtype.confidence_grade,
           CASE WHEN jsonb_typeof(subtype.confidence_gaps)='array'
                THEN jsonb_array_length(subtype.confidence_gaps)
                ELSE 0 END,
           NULL::double precision,NULL::text,
           0::integer,NULL::text,NULL::text,NULL::text,NULL::integer,
           NULL::text,NULL::numeric,NULL::numeric,NULL::numeric,
           NULL::numeric,NULL::numeric,NULL::numeric,NULL::text,
           NULL::numeric,NULL::text,
           'subtype'::text,2
    FROM v_subtype_explorer_detail subtype
    WHERE subtype.subtype_id=requested.requested_id
  ) candidates ORDER BY rank LIMIT 1
) matched ON true
ORDER BY requested.position`,
    params: [[
      "4e356807-46ca-43a0-81e9-e5ece6837bd3",
      "5694fcd3-c6bc-4e00-8bfc-19f8f6631276",
    ]],
  },
  {
    id: "WB-PERF-08",
    name: "persisted_comparison_detail_empty_baseline",
    source: "web/src/server/repositories/workbench.ts:getComparison",
    scope: "comparison",
    sql: `SELECT *
FROM v_comparison_detail
WHERE comparison_id = $1
ORDER BY position`,
    params: ["00000000-0000-0000-0000-000000000000"],
  },
  {
    id: "WB-PERF-09",
    name: "estimate_lineage_list_default",
    source: "web/src/server/repositories/workbench.ts:listEstimates",
    scope: "estimate list",
    sql: estimateLineageCandidatePageSql,
    params: [null, null, 50, 0],
  },
  {
    id: "WB-PERF-10",
    name: "estimate_lineage_list_estimated_status",
    source: "web/src/server/repositories/workbench.ts:listEstimates",
    scope: "estimate list",
    sql: estimateLineageCandidatePageSql,
    params: ["estimated", null, 50, 0],
  },
];

const originalArchetypeListSql = `SELECT
  search.archetype_id,
  search.name_ko,
  search.name_en,
  search.one_line_definition,
  search.primary_entity_unit,
  search.age_min,
  search.age_max,
  search.archetype_status,
  search.archetype_version,
  search.category_code,
  search.category_name_ko,
  coalesce(relations.related_domain_ids, ARRAY[]::text[]) AS related_domain_ids,
  search.estimate_id,
  search.estimate_entity_unit,
  search.estimate_status,
  search.count_low,
  search.count_base,
  search.count_high,
  search.share_low,
  search.share_base,
  search.share_high,
  search.denominator_definition,
  search.method_code,
  search.formula,
  search.data_layer,
  search.approval_status,
  search.confidence_score,
  search.confidence_grade,
  search.validation_gap_count,
  search.updated_at
FROM v_archetype_search search
LEFT JOIN LATERAL (
  SELECT array_agg(DISTINCT sd.domain_id ORDER BY sd.domain_id) AS related_domain_ids
  FROM subtype_allocation sa
  JOIN subtype_definition sd USING (subtype_id)
  WHERE sa.phase1_archetype_id = search.archetype_id
) relations ON true
WHERE EXISTS (
  SELECT 1
  FROM subtype_allocation sa
  JOIN subtype_definition sd USING (subtype_id)
  JOIN domain_registry dr USING (domain_id)
  WHERE sa.phase1_archetype_id = search.archetype_id
    AND dr.domain_code = $1
)
AND search.archetype_status <> 'deprecated'
ORDER BY search.name_ko, search.archetype_id
LIMIT $2 OFFSET $3`;

// Frozen WB-PERF-07 measurements used the pre-018 raw-ledger resolver below.
// Keep it only as historical provenance; the executable current-stage query
// above uses the release-safe projections.
const originalComparisonResolveSql = `WITH requested AS (
  SELECT value AS requested_id, ordinality::smallint AS position
  FROM unnest($1::text[]) WITH ORDINALITY AS input(value, ordinality)
)
SELECT
  NULL::uuid AS comparison_id,
  NULL::uuid AS workspace_id,
  'Unsaved comparison'::text AS comparison_name,
  'draft'::text AS comparison_status,
  requested.position,
  matched.segment_name AS display_label,
  matched.object_id AS query_result_id,
  matched.segment_name,
  matched.primary_entity_unit,
  matched.estimate_id,
  matched.count_low,
  matched.count_base,
  matched.count_high,
  matched.share_base,
  '{}'::jsonb AS normalized_metrics
FROM requested
JOIN LATERAL (
  SELECT * FROM (
    SELECT sqr.result_id::text AS object_id, sq.name AS segment_name,
           sq.primary_entity_unit, e.estimate_id::text AS estimate_id,
           e.count_low,e.count_base,e.count_high,e.share_base,0 AS rank
    FROM segment_query_result sqr
    JOIN segment_query sq USING (query_id)
    JOIN estimate e USING (estimate_id)
    LEFT JOIN v_saved_segment_latest saved ON saved.result_id=sqr.result_id
    WHERE sqr.result_id::text=requested.requested_id
       OR e.estimate_id::text=requested.requested_id
       OR saved.saved_segment_id::text=requested.requested_id

    UNION ALL

    SELECT archetype.archetype_id, archetype.name_ko,
           archetype.primary_entity_unit, archetype.estimate_id::text,
           archetype.count_low,archetype.count_base,archetype.count_high,
           archetype.share_base,1
    FROM v_archetype_search archetype
    WHERE archetype.archetype_id=requested.requested_id

    UNION ALL

    SELECT subtype.subtype_id, subtype.name_ko,
           subtype.primary_entity_unit, NULL::text,
           subtype.count_low,subtype.count_base,subtype.count_high,
           subtype.domain_share_base,2
    FROM v_subtype_explorer_detail subtype
    WHERE subtype.subtype_id=requested.requested_id
  ) candidates ORDER BY rank LIMIT 1
) matched ON true
ORDER BY requested.position`;

const frozenStages = {
  baseline: {
    generatedAt: "2026-08-24T23:45:51.199Z",
    databaseState: "Before migration 006; saved_segment had zero rows.",
    queryShape: "Original repository SQL for all ten queries.",
    measurements: {
      "WB-PERF-01": [24, 1.471, 1.314, 387],
      "WB-PERF-02": [30, 0.589, 1.413, 137],
      "WB-PERF-03": [6, 0.918, 0.372, 133],
      "WB-PERF-04": [5, 0.682, 117.163, 166651],
      "WB-PERF-05": [5, 0.108, 0.062, 66],
      "WB-PERF-06": [6, 0.114, 0.047, 28],
      "WB-PERF-07": [2, 1.260, 0.407, 163],
      "WB-PERF-08": [0, 0.290, 0.023, 2],
      "WB-PERF-09": [50, 1.281, 122.842, 202741],
      "WB-PERF-10": [17, 1.156, 2.128, 2719],
    },
  },
  indexesOnly: {
    generatedAt: "2026-08-24T23:56:58.448Z",
    databaseState: "Final migration-006 index bundle installed; saved_segment had one concurrently-created test row.",
    queryShape: "Original repository SQL retained in the audit harness, including the pre-rewrite WB-PERF-04 query.",
    measurements: {
      "WB-PERF-01": [24, 1.337, 1.210, 384],
      "WB-PERF-02": [30, 0.472, 1.381, 147],
      "WB-PERF-03": [6, 0.884, 0.544, 149],
      "WB-PERF-04": [5, 0.566, 11.009, 19483],
      "WB-PERF-05": [5, 0.127, 0.031, 22],
      "WB-PERF-06": [6, 0.130, 0.060, 28],
      "WB-PERF-07": [2, 1.100, 0.367, 175],
      "WB-PERF-08": [0, 0.286, 0.023, 2],
      "WB-PERF-09": [50, 1.825, 1.479, 762],
      "WB-PERF-10": [17, 1.259, 0.772, 454],
    },
  },
};

function expandFrozenMeasurements(measurements) {
  return Object.fromEntries(Object.entries(measurements).map(([id, values]) => [id, {
    resultRows: values[0],
    planningTimeMs: values[1],
    executionTimeMs: values[2],
    sharedHitBlocks: values[3],
    sharedReadBlocks: 0,
    tempReadBlocks: 0,
    tempWrittenBlocks: 0,
  }]));
}

function percentChange(before, after) {
  if (before === 0) return after === 0 ? 0 : null;
  return Number((((after - before) / before) * 100).toFixed(1));
}

function visit(node, out, depth = 0) {
  const item = {
    depth,
    nodeType: node["Node Type"],
    relation: node["Relation Name"] ?? null,
    alias: node.Alias ?? null,
    index: node["Index Name"] ?? null,
    joinType: node["Join Type"] ?? null,
    scanDirection: node["Scan Direction"] ?? null,
    actualRows: node["Actual Rows"] ?? null,
    actualLoops: node["Actual Loops"] ?? null,
    actualStartupTimeMs: node["Actual Startup Time"] ?? null,
    actualTotalTimeMs: node["Actual Total Time"] ?? null,
    planRows: node["Plan Rows"] ?? null,
    rowsRemovedByFilter: node["Rows Removed by Filter"] ?? 0,
    rowsRemovedByJoinFilter: node["Rows Removed by Join Filter"] ?? 0,
    sharedHitBlocks: node["Shared Hit Blocks"] ?? 0,
    sharedReadBlocks: node["Shared Read Blocks"] ?? 0,
    tempReadBlocks: node["Temp Read Blocks"] ?? 0,
    tempWrittenBlocks: node["Temp Written Blocks"] ?? 0,
    sortMethod: node["Sort Method"] ?? null,
    sortSpaceUsedKb: node["Sort Space Used"] ?? null,
    sortSpaceType: node["Sort Space Type"] ?? null,
  };
  out.push(item);
  for (const child of node.Plans ?? []) visit(child, out, depth + 1);
}

function summarize(explain) {
  const root = explain.Plan;
  const nodes = [];
  visit(root, nodes);
  const scanNodes = nodes.filter((n) => /Scan$/.test(n.nodeType));
  const sortNodes = nodes.filter((n) => n.nodeType === "Sort" || n.nodeType === "Incremental Sort");
  const nodeCounts = {};
  for (const node of nodes) nodeCounts[node.nodeType] = (nodeCounts[node.nodeType] ?? 0) + 1;
  const executed = nodes.filter((n) => (n.actualLoops ?? 0) > 0);
  const compactNode = (node) => ({
    nodeType: node.nodeType,
    relation: node.relation,
    index: node.index,
    actualRowsPerLoop: node.actualRows,
    actualLoops: node.actualLoops,
    approximateRowsProcessed: (node.actualRows ?? 0) * (node.actualLoops ?? 0),
    approximateTotalTimeMs: (node.actualTotalTimeMs ?? 0) * (node.actualLoops ?? 0),
    rowsRemovedByFilter: (node.rowsRemovedByFilter ?? 0) * (node.actualLoops ?? 0),
    rowsRemovedByJoinFilter: (node.rowsRemovedByJoinFilter ?? 0) * (node.actualLoops ?? 0),
    sharedHitBlocks: node.sharedHitBlocks,
    sharedReadBlocks: node.sharedReadBlocks,
    tempReadBlocks: node.tempReadBlocks,
    tempWrittenBlocks: node.tempWrittenBlocks,
    sortMethod: node.sortMethod,
    sortSpaceUsedKb: node.sortSpaceUsedKb,
    sortSpaceType: node.sortSpaceType,
  });
  const slowestNodes = [...executed]
    .sort((a, b) => ((b.actualTotalTimeMs ?? 0) * (b.actualLoops ?? 1)) - ((a.actualTotalTimeMs ?? 0) * (a.actualLoops ?? 1)))
    .slice(0, 5)
    .map(compactNode);
  const scanHotspots = [...scanNodes]
    .filter((node) => (node.actualLoops ?? 0) > 0)
    .sort((a, b) => {
      const bWork = ((b.actualTotalTimeMs ?? 0) * (b.actualLoops ?? 1)) + ((b.sharedHitBlocks ?? 0) / 10000);
      const aWork = ((a.actualTotalTimeMs ?? 0) * (a.actualLoops ?? 1)) + ((a.sharedHitBlocks ?? 0) / 10000);
      return bWork - aWork;
    })
    .slice(0, 8)
    .map(compactNode);
  const seqScans = scanNodes
    .filter((node) => node.nodeType === "Seq Scan" && (node.actualLoops ?? 0) > 0)
    .map((node) => ({
      relation: node.relation,
      actualRowsPerLoop: node.actualRows,
      actualLoops: node.actualLoops,
      approximateRowsProcessed: (node.actualRows ?? 0) * (node.actualLoops ?? 0),
      rowsRemovedByFilter: (node.rowsRemovedByFilter ?? 0) * (node.actualLoops ?? 0),
      approximateTotalTimeMs: (node.actualTotalTimeMs ?? 0) * (node.actualLoops ?? 0),
      sharedHitBlocks: node.sharedHitBlocks,
    }));
  const indexesUsed = [...new Set(scanNodes.map((node) => node.index).filter(Boolean))].sort();
  const sortSummary = {
    count: sortNodes.length,
    methods: [...new Set(sortNodes.map((node) => node.sortMethod).filter(Boolean))].sort(),
    maxSpaceUsedKb: Math.max(0, ...sortNodes.map((node) => node.sortSpaceUsedKb ?? 0)),
    diskSpillCount: sortNodes.filter((node) => node.sortSpaceType === "Disk").length,
    tempReadBlocks: Math.max(0, ...sortNodes.map((node) => node.tempReadBlocks ?? 0)),
    tempWrittenBlocks: Math.max(0, ...sortNodes.map((node) => node.tempWrittenBlocks ?? 0)),
  };
  return {
    planningTimeMs: explain["Planning Time"],
    executionTimeMs: explain["Execution Time"],
    resultRows: root["Actual Rows"],
    rootActualLoops: root["Actual Loops"],
    buffers: {
      sharedHitBlocks: root["Shared Hit Blocks"] ?? 0,
      sharedReadBlocks: root["Shared Read Blocks"] ?? 0,
      sharedDirtiedBlocks: root["Shared Dirtied Blocks"] ?? 0,
      sharedWrittenBlocks: root["Shared Written Blocks"] ?? 0,
      localHitBlocks: root["Local Hit Blocks"] ?? 0,
      localReadBlocks: root["Local Read Blocks"] ?? 0,
      tempReadBlocks: root["Temp Read Blocks"] ?? 0,
      tempWrittenBlocks: root["Temp Written Blocks"] ?? 0,
    },
    nodeCount: nodes.length,
    nodeCounts,
    scanNodeCount: scanNodes.length,
    seqScans,
    indexesUsed,
    scanHotspots: scanHotspots.slice(0, 3),
    sorts: sortSummary,
  };
}

async function scalarRows(client, sql) {
  const result = await client.query(sql);
  return result.rows;
}

async function main() {
  const client = new Client(connection);
  await client.connect();
  try {
    const server = (await scalarRows(client, `SELECT
      current_database() AS database,
      current_user AS session_user,
      current_setting('server_version') AS server_version,
      current_setting('block_size')::integer AS block_size_bytes,
      current_setting('shared_buffers') AS shared_buffers,
      current_setting('work_mem') AS work_mem,
      current_setting('effective_cache_size') AS effective_cache_size`))[0];
    const schemaState = (await scalarRows(client, `SELECT
      (SELECT count(*)::integer
         FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE') AS public_base_table_count,
      (SELECT count(*)::integer
         FROM information_schema.views
        WHERE table_schema = 'public') AS public_view_count,
      to_regclass('public.v_estimate_release_boundary') IS NOT NULL
        AS estimate_release_boundary_present,
      to_regclass('public.v_segment_query_result_release_boundary') IS NOT NULL
        AS query_result_release_boundary_present,
      to_regclass('public.v_comparison_detail') IS NOT NULL
        AS comparison_detail_present`))[0];
    const expectedSchemaState = {
      public_base_table_count: 90,
      public_view_count: 17,
      estimate_release_boundary_present: true,
      query_result_release_boundary_present: true,
      comparison_detail_present: true,
    };
    const schemaMatchesCurrentStage = Object.entries(expectedSchemaState)
      .every(([key, expected]) => schemaState[key] === expected);
    if (!schemaMatchesCurrentStage) {
      throw new Error(
        `Expected the migration 001-018 schema (90 public base tables, 17 public views, and release-safe read boundaries); received ${JSON.stringify(schemaState)}.`,
      );
    }
    const tableCounts = await scalarRows(client, `SELECT * FROM (VALUES
      ('domain_registry', (SELECT count(*)::bigint FROM domain_registry)),
      ('domain_dimension', (SELECT count(*)::bigint FROM domain_dimension)),
      ('domain_feature', (SELECT count(*)::bigint FROM domain_feature)),
      ('subtype_definition', (SELECT count(*)::bigint FROM subtype_definition)),
      ('subtype_allocation', (SELECT count(*)::bigint FROM subtype_allocation)),
      ('archetype', (SELECT count(*)::bigint FROM archetype)),
      ('estimate', (SELECT count(*)::bigint FROM estimate)),
      ('segment_query_result', (SELECT count(*)::bigint FROM segment_query_result)),
      ('comparison_workspace', (SELECT count(*)::bigint FROM comparison_workspace)),
      ('comparison_member', (SELECT count(*)::bigint FROM comparison_member)),
      ('saved_segment', (SELECT count(*)::bigint FROM saved_segment)),
      ('market_estimate', (SELECT count(*)::bigint FROM market_estimate))
    ) AS counts(table_name, exact_row_count)`);

    await client.query("BEGIN READ ONLY");
    await client.query("SET LOCAL ROLE market_engine_app");
    await client.query("SELECT set_config('market_engine.workspace_id', $1, true)", [workspaceId]);
    await client.query("SELECT set_config('market_engine.actor_id', $1, true)", [actorId]);

    const requestedIds = new Set((process.env.AUDIT_IDS ?? "").split(",").filter(Boolean));
    const selectedQueries = requestedIds.size ? queries.filter((query) => requestedIds.has(query.id)) : queries;
    const results = [];
    for (const query of selectedQueries) {
      const explainSql = `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON, TIMING TRUE, SUMMARY TRUE) ${query.sql}`;
      await client.query(explainSql, query.params); // warm-up, intentionally discarded
      const measured = await client.query(explainSql, query.params);
      const explain = measured.rows[0]["QUERY PLAN"][0];
      results.push({
        id: query.id,
        name: query.name,
        source: query.source,
        scope: query.scope,
        sql: query.sql,
        params: query.params,
        metrics: summarize(explain),
      });
    }
    await client.query("ROLLBACK");

    const executionTimes = results.map((query) => query.metrics.executionTimeMs ?? 0);
    const maximumExecutionTimeMs = Math.max(0, ...executionTimes);
    const passed = results.length === queries.length
      && results.every((query) => (query.metrics.executionTimeMs ?? Infinity) < 50)
      && results.every((query) => (query.metrics.buffers.sharedReadBlocks ?? 0) === 0)
      && results.every((query) => (query.metrics.sorts.diskSpillCount ?? 0) === 0);
    const baselineMeasurements = expandFrozenMeasurements(frozenStages.baseline.measurements);
    const indexesOnlyMeasurements = expandFrozenMeasurements(frozenStages.indexesOnly.measurements);
    const queryComparison = results.map((query) => {
      const baseline = baselineMeasurements[query.id];
      const indexesOnly = indexesOnlyMeasurements[query.id];
      const current = {
        resultRows: query.metrics.resultRows,
        planningTimeMs: query.metrics.planningTimeMs,
        executionTimeMs: query.metrics.executionTimeMs,
        sharedHitBlocks: query.metrics.buffers.sharedHitBlocks,
        sharedReadBlocks: query.metrics.buffers.sharedReadBlocks,
        tempReadBlocks: query.metrics.buffers.tempReadBlocks,
        tempWrittenBlocks: query.metrics.buffers.tempWrittenBlocks,
      };
      return {
        id: query.id,
        baseline,
        indexesOnly,
        currentRepositoryAndIndexes: current,
        baselineToIndexesOnly: {
          executionTimePercentChange: percentChange(baseline.executionTimeMs, indexesOnly.executionTimeMs),
          sharedHitBlocksPercentChange: percentChange(baseline.sharedHitBlocks, indexesOnly.sharedHitBlocks),
        },
        indexesOnlyToCurrentRepository: {
          executionTimePercentChange: percentChange(indexesOnly.executionTimeMs, current.executionTimeMs),
          sharedHitBlocksPercentChange: percentChange(indexesOnly.sharedHitBlocks, current.sharedHitBlocks),
        },
        baselineToCurrentRepository: {
          executionTimePercentChange: percentChange(baseline.executionTimeMs, current.executionTimeMs),
          sharedHitBlocksPercentChange: percentChange(baseline.sharedHitBlocks, current.sharedHitBlocks),
        },
      };
    });
    const document = {
      schemaVersion: 3,
      generatedAt: new Date().toISOString(),
      status: passed ? "remediated_with_remaining_risks" : "risks_found",
      assessment: passed
        ? `On the disposable populated migration 001-018 clone, the historical migration-006 index bundle remains effective for both measured validation_gap hotspots, the current candidate-page rewrites bound archetype and estimate-lineage enrichment to their selected pages, and WB-PERF-07 exercises the release-safe unsaved comparison resolver. ${executionTimes.every((value) => value < 3) ? "All ten" : `${executionTimes.filter((value) => value < 3).length} of ten`} current repository queries completed below 3 ms in this warm-cache run; search and polymorphic comparison remain scan-bound growth risks.`
        : "One or more representative queries exceeded the local performance gate or used physical/temp I/O.",
      mode: "two frozen historical stages plus current migration 001-018 disposable-clone read-only warm-cache audit",
      command: "MARKET_ENGINE_PG_DATABASE=<disposable-populated-clone> NODE_PATH=web/node_modules node scripts/audit_workbench_performance.cjs",
      explainOptions: "ANALYZE, BUFFERS, FORMAT JSON, TIMING TRUE, SUMMARY TRUE",
      targetContract: {
        databaseKind: "explicit disposable populated clone; canonical market_engine is rejected",
        migrations: "001-018",
        publicBaseTables: 90,
        publicViews: 17,
        comparisonReadBoundary: "release-safe unsaved resolver",
      },
      transaction: {
        readOnly: true,
        role: "market_engine_app",
        workspaceId,
        actorId,
      },
      server,
      schemaState,
      tableCounts,
      stages: {
        baseline: {
          generatedAt: frozenStages.baseline.generatedAt,
          databaseState: frozenStages.baseline.databaseState,
          queryShape: frozenStages.baseline.queryShape,
          measurements: baselineMeasurements,
        },
        indexesOnly: {
          generatedAt: frozenStages.indexesOnly.generatedAt,
          databaseState: frozenStages.indexesOnly.databaseState,
          queryShape: frozenStages.indexesOnly.queryShape,
          measurements: indexesOnlyMeasurements,
        },
        currentRepositoryAndIndexes: {
          generatedAt: new Date().toISOString(),
          databaseState: "Migrations 001-018 are installed on an explicitly named disposable populated clone: the migration-006 index bundle; 011/012 lineage and snapshot guards; 013 entity-only revenue constraint; 014 interval and source-lineage checks; 015 numeric-domain checks; 016 condition-catalog privacy and finite-numeric checks; 017 opportunity-snapshot invariants; and 018 release-safe read boundaries. The current repository includes the archetype and estimate-lineage candidate-page rewrites and release-safe unsaved comparison resolver. Clone population is recorded in tableCounts. The clean/full-reapply harness passed at 90 tables/17 views through migration 018 and its release-boundary fixture.",
          queryShape: "Current repository SQL is stored in queries[].sql; WB-PERF-07 is the current release-safe unsaved comparison resolver, while WB-PERF-09/10 page release-safe estimate identifiers before lineage enrichment. Frozen stages use the historicalSql overrides where their query shape differed.",
        },
      },
      summary: {
        queryCount: results.length,
        queriesUnder3Ms: executionTimes.filter((value) => value < 3).length,
        queriesOver50Ms: executionTimes.filter((value) => value >= 50).length,
        maximumExecutionTimeMs,
        physicalReadBlocks: results.reduce((total, query) => total + (query.metrics.buffers.sharedReadBlocks ?? 0), 0),
        tempSpillQueries: results.filter((query) => (query.metrics.sorts.diskSpillCount ?? 0) > 0).length,
      },
      remediations: [
        {
          queryId: "WB-PERF-04",
          migration006Change: "Partial covering validation-gap indexes led by archetype_id and estimate_id.",
          indexesOnlyResult: "Original SQL improved from 117.163 ms/166,651 hits to 11.009 ms/19,483 hits.",
          concurrentRepositoryChange: "A separately-authored, preserved MATERIALIZED candidate-page rewrite reduced enrichment from 1,206 candidates to five for this name-sorted domain query.",
          currentResult: "Current repository SQL and indexes are measured dynamically in queryComparison and queries[].",
        },
        {
          queryId: "WB-PERF-09",
          migration006Change: "Estimate freshness/status page indexes plus the estimate-led partial covering validation-gap index.",
          indexesOnlyResult: "The historical unchanged SQL improved from 122.842 ms/202,741 hits to 1.479 ms/762 hits.",
          concurrentRepositoryChange: "The current MATERIALIZED candidate-page rewrite selects release-safe estimate identifiers before expanding v_estimate_lineage, so enrichment is bounded to the requested page.",
          currentResult: "Current repository SQL and indexes are measured dynamically in queryComparison and queries[].",
        },
      ],
      migration006: {
        file: "migrations/006_workbench_performance.sql",
        indexes: [
          "validation_gap_estimate_lineage_idx",
          "validation_gap_archetype_lineage_idx",
          "estimate_updated_page_idx",
          "estimate_status_updated_page_idx",
          "subtype_allocation_subtype_count_idx",
        ],
        definitions: {
          validation_gap_estimate_lineage_idx: "CREATE INDEX validation_gap_estimate_lineage_idx ON validation_gap (estimate_id, priority, validation_gap_id) INCLUDE (gap_type, description, impact, verification_question, recommended_source, expected_improvement, status) WHERE estimate_id IS NOT NULL",
          validation_gap_archetype_lineage_idx: "CREATE INDEX validation_gap_archetype_lineage_idx ON validation_gap (archetype_id, priority, validation_gap_id) INCLUDE (gap_type, description, impact, verification_question, recommended_source, expected_improvement, status) WHERE archetype_id IS NOT NULL",
          estimate_updated_page_idx: "CREATE INDEX estimate_updated_page_idx ON estimate (updated_at DESC, estimate_id)",
          estimate_status_updated_page_idx: "CREATE INDEX estimate_status_updated_page_idx ON estimate (status, updated_at DESC, estimate_id)",
          subtype_allocation_subtype_count_idx: "CREATE INDEX subtype_allocation_subtype_count_idx ON subtype_allocation (subtype_id, count_base DESC, phase1_archetype_id)",
        },
        idempotence: "Finalized migration reapplied successfully; all five CREATE INDEX IF NOT EXISTS statements skipped existing objects and comments reapplied.",
        cleanMigrationTest: "scripts/test_postgres.sh passed clean 001-018 application and complete reapplication, including the stateful migration-010 fixture, migration-013 entity-only scenario constraint, nine migration-014 interval/source-lineage constraints, five migration-015 numeric-domain constraints, four migration-016 finite-numeric constraints plus the policy-projected condition catalog, migration-017 opportunity-snapshot invariants, and the migration-018 release-safe read-boundary fixture: Phase 1=30 tables, Phase 2 additive=58, workbench=90 tables/17 views.",
        provenance: "The three estimate/subtype indexes appeared concurrently in the local database without an owning task. Each matched a frozen measured risk and its exact definition was adopted into migration 006; attribution of their initial ad-hoc creation is unavailable.",
      },
      historicalSql: {
        unchangedAcrossAllStages: queries
          .filter((query) => !["WB-PERF-04", "WB-PERF-07", "WB-PERF-09", "WB-PERF-10"].includes(query.id))
          .map((query) => query.id),
        overrides: [
          {
            queryId: "WB-PERF-04",
            appliesToStages: ["baseline", "indexesOnly"],
            sql: originalArchetypeListSql,
            params: ["education_learning", 100, 0],
            reason: "Frozen stages predate the current candidate-page repository rewrite.",
          },
          {
            queryId: "WB-PERF-07",
            appliesToStages: ["baseline", "indexesOnly"],
            sql: originalComparisonResolveSql,
            params: [[
              "4e356807-46ca-43a0-81e9-e5ece6837bd3",
              "5694fcd3-c6bc-4e00-8bfc-19f8f6631276",
            ]],
            reason: "Frozen stages used the pre-018 raw-ledger resolver; the current stage uses release-safe projections.",
          },
          {
            queryId: "WB-PERF-09",
            appliesToStages: ["baseline", "indexesOnly"],
            sql: originalEstimateLineageListSql,
            params: [null, 50, 0],
            reason: "Frozen stages enriched the complete estimate-lineage view before LIMIT; the current repository pages release-safe estimate identifiers first.",
          },
          {
            queryId: "WB-PERF-10",
            appliesToStages: ["baseline", "indexesOnly"],
            sql: originalEstimateLineageListSql,
            params: ["estimated", 50, 0],
            reason: "Frozen stages enriched the complete status-filtered estimate-lineage view before LIMIT; the current repository pages release-safe estimate identifiers first.",
          },
        ],
      },
      queryComparison,
      remainingRisks: [
        "WB-PERF-02 global search still scans the full archetype branch because the view expression does not match an installed text-search index.",
        "WB-PERF-07's release-safe polymorphic resolver still compares result, estimate, and saved-segment identifiers through text-cast OR predicates; the hard five-input bound limits loops, not release-view corpus growth.",
        "WB-PERF-08 deliberately retains the frozen nonexistent UUID for three-stage comparability. Concurrent workflow tests have since populated comparison tables, but this exact ten-query series still measures the miss path rather than a populated comparison detail.",
        "Advanced-text and non-name archetype sorts deliberately bypass candidate-page optimization to preserve semantics; their scale behavior was not separately benchmarked in this ten-query set.",
      ],
      limitations: [
        "This is a single-user local PostgreSQL warm-cache audit, not a throughput or concurrency benchmark.",
        "Absolute timings include EXPLAIN ANALYZE overhead; scan amplification and access paths are the durable signals.",
        "The frozen WB-PERF-07 baseline/index-only measurements used the pre-018 raw-ledger SQL, while the current stage uses the release-safe resolver. Their percentages provide historical shape-change context and must not be interpreted as pure index attribution.",
        "The current stage requires an explicitly named disposable populated clone, rejects the canonical market_engine database, and verifies the 90-table/17-view release-boundary schema before benchmarking.",
        "Workflow fixtures changed saved-segment, result, estimate, comparison, and market-estimate cardinalities between the frozen historical stages and the current populated clone. See tableCounts; absolute timing/buffer deltas outside the two original hotspots therefore have attribution limits.",
        "The current archetype and estimate-lineage repository rewrites were concurrent and outside the bounded migration task. They are reported as a separate third stage and not attributed to migration 006.",
        "The frozen WB-PERF-09/10 measurements used the pre-candidate-page lineage list SQL. Their percentages provide historical shape-change context and must not be interpreted as pure index attribution.",
        "The exact WB-PERF-08 parameter remains a miss even though persisted comparisons are now populated by concurrent tests; populated-hit performance is outside this frozen ten-query comparison.",
      ],
      queries: results,
    };
    if (process.env.OUTPUT_SUMMARY === "1") {
      document.queries = results.map((query) => ({
        id: query.id,
        name: query.name,
        source: query.source,
        scope: query.scope,
        params: query.params,
        metrics: query.metrics,
      }));
    }
    const serialized = `${JSON.stringify(document, null, 2)}\n`;
    const outputPath = process.env.PERFORMANCE_REPORT_PATH;
    if (outputPath) {
      writeFileSync(outputPath, serialized, "utf8");
      process.stdout.write(JSON.stringify({ outputPath, queryCount: results.length, generatedAt: document.generatedAt }));
    } else {
      process.stdout.write(serialized);
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
