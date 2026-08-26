import { NextRequest } from "next/server";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { GET as exportSnapshot } from "@/app/api/exports/[snapshotId]/route";
import { POST as createEstimate } from "@/app/api/estimate/route";
import { POST as createSegmentApi } from "@/app/api/segments/route";
import { isResearchProviderConfigured } from "@/server/ai/openai-research-adapter";
import {
  closeDatabasePool,
  runWithRuntimeContext,
  withWorkspaceTransaction,
  type RuntimeContext,
} from "@/server/db";
import {
  compareSegments,
  getComparison,
  getEstimate,
  getOpportunity,
  getResearchJob,
  getSegment,
} from "@/server/repositories/workbench";
import { createResearchJob, requeueResearchJob, reviewRevision } from "@/server/services/research-workflow";
import { buildCanonicalResearchPayload } from "@/server/services/research-values";
import { calculateEstimate, contentHash, saveSegment } from "@/server/services/segment-workflow";
import {
  saveComparison,
  saveMarketScenario,
  saveOpportunity,
} from "@/server/services/workbench-mutations";

const databaseEnabled =
  process.env.RUN_DATABASE_INTEGRATION === "1" ||
  Boolean(process.env.MARKET_ENGINE_DATABASE_URL ?? process.env.DATABASE_URL ?? process.env.POSTGRES_URL);

const TEST_CONTEXT: RuntimeContext = {
  workspaceId: "00000000-0000-4000-8000-0000000000e2",
  actorId: "00000000-0000-4000-8000-0000000000e3",
};

const FIXTURE = {
  primarySegment: "[integration] durable parent/subtype segment",
  comparatorSegment: "[integration] durable exact comparator",
  rareSegment: "[integration:v2] rare runtime release",
  scenario: "[integration] durable TAM-SAM-SOM scenario",
  comparison: "[integration] durable comparison",
  opportunity: "[integration] durable opportunity",
  researchQuestion: "[integration:v2] disabled provider must preserve canonical input",
} as const;

const UUID_DIGIT_LETTERS = "ghijklmnop";

function fixtureLabelSuffix(): string {
  return crypto.randomUUID().replaceAll("-", "").replace(
    /[0-9]/gu,
    (digit) => UUID_DIGIT_LETTERS[Number(digit)],
  );
}

const primaryConditions = [{
  logic: "AND",
  conditions: [
    {
      sourceId: "archetype:ARC-06-001",
      sourceKind: "archetype",
      label: "ARC-06-001",
      unit: "enterprise",
      operator: "eq",
      value: "ARC-06-001",
      matchStatus: "exact",
      enabled: true,
    },
    {
      sourceId: "subtype:DOM-24-SUB-04",
      sourceKind: "subtype",
      label: "DOM-24-SUB-04",
      unit: "enterprise",
      operator: "eq",
      value: "small_business_digital.subtype_04",
      matchStatus: "exact",
      enabled: true,
    },
  ],
}];

const comparatorConditions = [{
  logic: "AND",
  conditions: [{
    sourceId: "archetype:ARC-06-001",
    sourceKind: "archetype",
    label: "ARC-06-001",
    unit: "enterprise",
    operator: "eq",
    value: "ARC-06-001",
    matchStatus: "exact",
    enabled: true,
  }],
}];

async function bootstrapTestWorkspace(): Promise<void> {
  await withWorkspaceTransaction(async (client) => {
    await client.query(
      `INSERT INTO workspace (workspace_id, workspace_key, name)
       VALUES ($1, 'integration-durable-workflow', 'Durable workflow integration test')
       ON CONFLICT (workspace_id) DO NOTHING`,
      [TEST_CONTEXT.workspaceId],
    );
    await client.query(
      `INSERT INTO workspace_member (workspace_id, actor_id, role)
       VALUES ($1,$2,'owner')
       ON CONFLICT (workspace_id, actor_id) DO NOTHING`,
      [TEST_CONTEXT.workspaceId, TEST_CONTEXT.actorId],
    );
  }, TEST_CONTEXT);
}

async function findSegment(title: string): Promise<{ saved_segment_id: string; current_version_no: number } | null> {
  return withWorkspaceTransaction(async (client) => {
    const result = await client.query<{ saved_segment_id: string; current_version_no: number }>(
      `SELECT saved_segment_id, current_version_no
       FROM saved_segment
       WHERE workspace_id=$1 AND title=$2
       ORDER BY created_at
       LIMIT 1`,
      [TEST_CONTEXT.workspaceId, title],
    );
    return result.rows[0] ?? null;
  });
}

async function findComparison(): Promise<string | null> {
  return withWorkspaceTransaction(async (client) => {
    const result = await client.query<{ comparison_id: string }>(
      `SELECT comparison_id FROM comparison_workspace
       WHERE workspace_id=$1 AND name=$2
       ORDER BY created_at LIMIT 1`,
      [TEST_CONTEXT.workspaceId, FIXTURE.comparison],
    );
    return result.rows[0]?.comparison_id ?? null;
  });
}

async function findOpportunity(name: string = FIXTURE.opportunity): Promise<{
  opportunity_id: string;
  status: string;
  optimistic_lock_version: string;
} | null> {
  return withWorkspaceTransaction(async (client) => {
    const result = await client.query<{ opportunity_id: string; status: string; optimistic_lock_version: string }>(
      `SELECT o.opportunity_id, o.status, o.optimistic_lock_version::text
       FROM opportunity o
       JOIN opportunity_board ob USING (opportunity_board_id)
       WHERE ob.workspace_id=$1 AND o.name=$2
       ORDER BY o.created_at LIMIT 1`,
      [TEST_CONTEXT.workspaceId, name],
    );
    return result.rows[0] ?? null;
  });
}

async function findResearchJob(segmentId: string): Promise<string | null> {
  return withWorkspaceTransaction(async (client) => {
    const result = await client.query<{ research_job_id: string }>(
      `SELECT research_job_id FROM research_job
       WHERE workspace_id=$1 AND saved_segment_id=$2
         AND research_question=$3 AND target_variable='joint_prevalence'
       ORDER BY created_at LIMIT 1`,
      [TEST_CONTEXT.workspaceId, segmentId, FIXTURE.researchQuestion],
    );
    return result.rows[0]?.research_job_id ?? null;
  });
}

async function ensurePrimarySegment(): Promise<string> {
  let row = await findSegment(FIXTURE.primarySegment);
  if (!row) {
    const id = await saveSegment({
      name: FIXTURE.primarySegment,
      entityUnit: "enterprise",
      naturalLanguage: "[integration:durable:v1] ARC-06-001 and DOM-24-SUB-04",
      conditions: primaryConditions,
    });
    row = { saved_segment_id: id, current_version_no: 1 };
  }
  // Always reconcile the deterministic fixture through the production save
  // path. saveSegment is definition-idempotent, while this also upgrades rows
  // left by older test versions whose subtype value used the display ID rather
  // than the current catalog's canonical allowed value.
  await saveSegment({
    segmentId: row.saved_segment_id,
    name: FIXTURE.primarySegment,
    entityUnit: "enterprise",
    naturalLanguage: "[integration:durable:v2] ARC-06-001 and DOM-24-SUB-04",
    conditions: primaryConditions,
  });
  return row.saved_segment_id;
}

async function ensureComparatorSegment(): Promise<string> {
  const existing = await findSegment(FIXTURE.comparatorSegment);
  if (existing) return existing.saved_segment_id;
  return saveSegment({
    name: FIXTURE.comparatorSegment,
    entityUnit: "enterprise",
    naturalLanguage: "[integration:durable:comparator] ARC-06-001",
    conditions: comparatorConditions,
  });
}

async function readMarketScenario(scenarioId: string) {
  return withWorkspaceTransaction(async (client) => {
    const result = await client.query<{
      scenario_id: string;
      status: string;
      base_query_result_id: string;
      saved_segment_id: string | null;
      saved_segment_version_no: number | null;
      supersedes_scenario_id: string | null;
      market_unit: string;
      currency: string;
      horizon_months: number;
      formula: string;
      tam_entities_low: string;
      tam_entities_base: string;
      tam_entities_high: string;
      sam_entities_low: string;
      sam_entities_base: string;
      sam_entities_high: string;
      som_entities_low: string;
      som_entities_base: string;
      som_entities_high: string;
      tam_revenue_base: string;
      sam_revenue_base: string;
      som_revenue_base: string;
      factor_count: number;
    }>(
      `SELECT ms.scenario_id,ms.status,ms.base_query_result_id,
              ms.saved_segment_id,ms.saved_segment_version_no,ms.supersedes_scenario_id,
              ms.market_unit, ms.currency, ms.horizon_months,
              me.formula,
              me.tam_entities_low, me.tam_entities_base, me.tam_entities_high,
              me.sam_entities_low, me.sam_entities_base, me.sam_entities_high,
              me.som_entities_low, me.som_entities_base, me.som_entities_high,
              me.tam_revenue_base, me.sam_revenue_base, me.som_revenue_base,
              (SELECT count(*)::integer FROM scenario_factor_override sfo
               WHERE sfo.scenario_id=ms.scenario_id) AS factor_count
       FROM market_scenario ms
       JOIN market_estimate me USING (scenario_id)
       WHERE ms.scenario_id=$1`,
      [scenarioId],
    );
    return result.rows[0] ?? null;
  });
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

describe.runIf(databaseEnabled)("durable workbench workflow", () => {
  afterAll(async () => closeDatabasePool());

  it("persists human rare outputs only as redacted suppressed snapshots", async () => {
    await bootstrapTestWorkspace();
    await runWithRuntimeContext(TEST_CONTEXT, async () => {
      // Reuse a canonical person archetype instead of adding a global catalog
      // row. The workspace-owned source estimate is promoted only for the
      // duration of this test and is rejected again in the finally block.
      const sourceSubjectId = "ARC-14-022";
      const sourceExternalKey = `integration:rare-runtime-source:v2:${TEST_CONTEXT.workspaceId}`;
      const sourceEstimateId = await withWorkspaceTransaction(async (client) => {
        const references = await client.query<{
          geography_id: string;
          period_id: string;
          model_version_id: string;
          run_id: string;
          evidence_id: string | null;
        }>(
          `SELECT
             (SELECT geography_id FROM geography WHERE code='KR' ORDER BY valid_from DESC LIMIT 1) AS geography_id,
             (SELECT period_id FROM time_period ORDER BY end_date DESC LIMIT 1) AS period_id,
             mv.model_version_id,
             pr.run_id,
             (SELECT evidence_id::text FROM evidence
               WHERE reviewer_status <> 'rejected' ORDER BY evidence_id LIMIT 1) AS evidence_id
           FROM model_version mv
           JOIN pipeline_run pr ON pr.model_version_id=mv.model_version_id AND pr.status='success'
           WHERE mv.version=coalesce(nullif(current_setting('market_engine.test_model_version', true),''),'kr-v0.2.1')
           ORDER BY pr.finished_at DESC NULLS LAST LIMIT 1`,
        );
        const reference = references.rows[0];
        if (!reference?.geography_id || !reference.period_id || !reference.model_version_id || !reference.run_id) {
          throw new Error("rare_output_test_references_missing");
        }
        const sourceHash = contentHash({ fixture: sourceSubjectId, version: 2 });
        await client.query(
          `INSERT INTO estimate (
             external_estimate_key,workspace_id,subject_type,subject_id,entity_unit,
             geography_id,period_id,denominator_definition,
             count_low,count_base,count_high,share_low,share_base,share_high,
             method_code,formula,precision_rule,model_version_id,run_id,status,
             data_version,data_layer,approval_status,calculation_input_hash,
             dependency_fingerprint,created_by_actor_id
           ) VALUES (
             $1,$2,'archetype',$3,'person',$4,$5,
             'Integration-only weighted source cell',4,5,6,0.04,0.05,0.06,
             'weighted_microdata_fixture','registered conditional weighted cell',
             'whole_entity_round_half_up',$6,$7,'estimated',
             'integration-rare-output-v2','approved_version','approved',$8,$8,$9
           ) ON CONFLICT (external_estimate_key) WHERE external_estimate_key IS NOT NULL
           DO UPDATE SET
             subject_id=EXCLUDED.subject_id,
             geography_id=EXCLUDED.geography_id,
             period_id=EXCLUDED.period_id,
             count_low=EXCLUDED.count_low,
             count_base=EXCLUDED.count_base,
             count_high=EXCLUDED.count_high,
             share_low=EXCLUDED.share_low,
             share_base=EXCLUDED.share_base,
             share_high=EXCLUDED.share_high,
             status='estimated',
             data_version=EXCLUDED.data_version,
             data_layer='approved_version',
             approval_status='approved',
             calculation_input_hash=EXCLUDED.calculation_input_hash,
             dependency_fingerprint=EXCLUDED.dependency_fingerprint,
             updated_at=now()`,
          [sourceExternalKey, TEST_CONTEXT.workspaceId,
            sourceSubjectId, reference.geography_id, reference.period_id,
            reference.model_version_id, reference.run_id, sourceHash, TEST_CONTEXT.actorId],
        );
        const source = await client.query<{ estimate_id: string }>(
          "SELECT estimate_id FROM estimate WHERE external_estimate_key=$1 AND workspace_id=$2",
          [sourceExternalKey, TEST_CONTEXT.workspaceId],
        );
        const id = source.rows[0]?.estimate_id;
        if (!id) throw new Error("rare_output_source_fixture_missing");
        await client.query(
          `INSERT INTO confidence_assessment (
             estimate_id,source_quality_score,recency_score,directness_score,
             joint_observation_score,model_reliance_score,total_score,grade,
             rationale,data_version,validation_gap_reviewed_at
           ) VALUES ($1,15,10,10,5,10,50,'E',$2,'integration-rare-output-v2',now())
           ON CONFLICT (estimate_id) DO NOTHING`,
          [id, "Integration fixture confidence; runtime release policy is tested separately."],
        );
        if (reference.evidence_id) {
          await client.query(
            `INSERT INTO estimate_component (
               estimate_id,component_code,component_type,value_low,value_base,value_high,
               unit,evidence_id,operation,sequence,data_version,denominator_definition,
               reference_period_id,directness_class,model_version_id,adjustment_reason,metadata_json
             ) VALUES (
               $1,'fixture_weighted_cell','conditional_probability',0.04,0.05,0.06,
               'ratio',$2,'input',1,'integration-rare-output-v2',
               'Integration-only weighted source cell',$3,'proxy',$4,
               'Integration fixture for runtime release-policy verification.','{}'::jsonb
             ) ON CONFLICT DO NOTHING`,
            [id, reference.evidence_id, reference.period_id, reference.model_version_id],
          );
        }
        return id;
      });

      const name = FIXTURE.rareSegment;
      const conditions = [{
        logic: "AND",
        conditions: [{
          sourceId: `archetype:${sourceSubjectId}`,
          sourceKind: "archetype",
          label: sourceSubjectId,
          unit: "person",
          operator: "eq",
          value: sourceSubjectId,
          matchStatus: "exact",
          enabled: true,
        }],
      }];
      try {
        const existing = await findSegment(name);
        const segmentId = await saveSegment({
          ...(existing ? { segmentId: existing.saved_segment_id } : {}),
          name,
          entityUnit: "person",
          naturalLanguage: name,
          conditions,
        });
        const estimateId = await calculateEstimate({ segmentId, name, entityUnit: "person", conditions });
        const [estimate, segment, source] = await Promise.all([
          getEstimate(estimateId),
          getSegment(segmentId),
          withWorkspaceTransaction(async (client) => (
            await client.query<{
              status: string;
              count_low: string;
              count_base: string;
              count_high: string;
            }>("SELECT status,count_low,count_base,count_high FROM estimate WHERE estimate_id=$1", [sourceEstimateId])
          ).rows[0]),
        ]);

        expect(estimateId).not.toBe(sourceEstimateId);
        expect(source).toMatchObject({ status: "estimated", count_low: "4", count_base: "5", count_high: "6" });
        expect(estimate).toMatchObject({
          status: "suppressed",
          count_low: null,
          count_base: null,
          count_high: null,
          share_low: null,
          share_base: null,
          share_high: null,
          precision_rule: "suppressed_below_minimum_weighted_entities",
        });
        const summary = asObject(segment?.result_summary);
        expect(summary).toMatchObject({
          status: "suppressed",
          reason: "rare_output_below_release_threshold",
          threshold: 10,
          values_withheld: true,
        });
        expect(summary).not.toHaveProperty("count_low");
        expect(summary).not.toHaveProperty("count_base");
        expect(summary).not.toHaveProperty("count_high");
        expect(summary).not.toHaveProperty("share_low");
        expect(summary).not.toHaveProperty("share_base");
        expect(summary).not.toHaveProperty("share_high");
        for (const component of estimate?.components_json ?? []) {
          const row = asObject(component);
          expect(row.value_low).toBeNull();
          expect(row.value_base).toBeNull();
          expect(row.value_high).toBeNull();
          expect(row.conditional_probability).toBeNull();
        }
        expect((estimate?.validation_gaps_json ?? []).map(asObject)).toEqual(
          expect.arrayContaining([expect.objectContaining({ gap_type: "small_sample" })]),
        );
        expect((estimate?.dependencies_json ?? []).map(asObject)).toEqual(
          expect.arrayContaining([expect.objectContaining({
            dependency_kind: "parent_estimate",
            record_key: null,
            version: null,
            content_hash: null,
          })]),
        );
        expect(JSON.stringify(estimate?.dependencies_json ?? [])).not.toContain(sourceEstimateId);
      } finally {
        await withWorkspaceTransaction((client) => client.query(
          `UPDATE estimate
              SET approval_status='rejected',data_layer='proposed_revision',updated_at=now()
            WHERE estimate_id=$1 AND workspace_id=$2 AND external_estimate_key=$3`,
          [sourceEstimateId, TEST_CONTEXT.workspaceId, sourceExternalKey],
        ));
      }
    });
  }, 60_000);

  it("rejects direct API attempts to persist unregistered or non-queryable conditions", async () => {
    await bootstrapTestWorkspace();
    await runWithRuntimeContext(TEST_CONTEXT, async () => {
      const suffix = fixtureLabelSuffix();
      const blockedArchetypeId = "ARC-INTEGRATION-NONQUERYABLE-V1";
      const removeBlockedFixture = () => withWorkspaceTransaction((client) => client.query(
        `DELETE FROM archetype
          WHERE archetype_id=$1 AND data_version='integration-catalog-policy-v1'`,
        [blockedArchetypeId],
      ));
      // Recover from an interrupted prior run without touching any non-test
      // catalog row. The rejected save never creates a downstream reference.
      await removeBlockedFixture();
      const unknownName = `[integration] unknown catalog condition ${suffix}`;
      const unknownResponse = await createSegmentApi(new NextRequest("http://localhost/api/segments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: unknownName,
          entityUnit: "enterprise",
          calculate: false,
          conditions: [{
            logic: "AND",
            enabled: true,
            conditions: [{
              sourceId: `custom:unregistered-${suffix}`,
              sourceKind: "custom",
              unit: "enterprise",
              operator: "eq",
              value: true,
              matchStatus: "exact",
              enabled: true,
            }],
          }],
        }),
      }));
      expect(unknownResponse.status).toBe(422);
      await expect(unknownResponse.json()).resolves.toEqual({ error: "condition_catalog_entry_not_found" });

      try {
        const blocked = await withWorkspaceTransaction(async (client) => {
          await client.query(
            `INSERT INTO archetype (
               archetype_id,category_id,name_ko,name_en,one_line_definition,
               primary_entity_unit,status,version,data_version
             )
             SELECT $1,category_id,'비조회 조건 검증 유형','Non-queryable fixture',
                    'Direct API catalog-policy integration fixture.','person','deprecated',
                    'integration-v1','integration-catalog-policy-v1'
               FROM category ORDER BY category_id LIMIT 1`,
            [blockedArchetypeId],
          );
          return (await client.query<{
            catalog_id: string;
            source_kind: string;
            entity_unit: string;
          }>(
            `SELECT catalog_id,source_kind,entity_unit
               FROM v_condition_catalog
              WHERE catalog_id=$1 AND NOT queryable
              ORDER BY catalog_id LIMIT 1`,
            [`archetype:${blockedArchetypeId}`],
          )
          ).rows[0];
        });
        expect(blocked).toBeDefined();
        const blockedUnit = blocked.entity_unit === "all" ? "person" : blocked.entity_unit;
        const blockedName = `[integration] blocked catalog condition ${suffix}`;
        const blockedResponse = await createSegmentApi(new NextRequest("http://localhost/api/segments", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: blockedName,
            entityUnit: blockedUnit,
            calculate: false,
            conditions: [{
              logic: "AND",
              enabled: true,
              conditions: [{
                sourceId: blocked.catalog_id,
                sourceKind: blocked.source_kind,
                unit: blockedUnit,
                operator: "exists",
                value: true,
                matchStatus: "exact",
                enabled: true,
              }],
            }],
          }),
        }));
        expect(blockedResponse.status).toBe(422);
        await expect(blockedResponse.json()).resolves.toEqual({ error: "condition_catalog_entry_not_queryable" });

        const persisted = await withWorkspaceTransaction(async (client) => (
          await client.query<{ count: string }>(
            "SELECT count(*)::text AS count FROM saved_segment WHERE workspace_id=$1 AND title=ANY($2::text[])",
            [TEST_CONTEXT.workspaceId, [unknownName, blockedName]],
          )
        ).rows[0]);
        expect(persisted.count).toBe("0");
      } finally {
        await removeBlockedFixture();
      }
    });
  }, 60_000);

  it("keeps raw catalog comparisons as explicitly non-persisted previews", async () => {
    await bootstrapTestWorkspace();
    await runWithRuntimeContext(TEST_CONTEXT, async () => {
      const preview = await compareSegments(["ARC-06-001", "DOM-24-SUB-04"]);
      expect(preview.items).toHaveLength(2);
      expect(preview.items.map((item) => item.source_kind)).toEqual(["archetype", "subtype"]);
      expect(preview.items.map((item) => item.id)).toEqual(["ARC-06-001", "DOM-24-SUB-04"]);
      const estimatedMetrics = asObject(preview.items[0].normalized_metrics);
      const subtypeMetrics = asObject(preview.items[1].normalized_metrics);
      expect(estimatedMetrics).toMatchObject({
        raw_entity_unit: "enterprise",
        raw_count_base: expect.any(String),
        normalized_count_score: 0,
        count_status: "available",
        active_market_scenario_count: 0,
        annual_spend_per_entity: null,
        growth_rate: null,
      });
      expect(Number(estimatedMetrics.raw_count_base)).toBeCloseTo(81_767.3887876928, 6);
      expect(asObject(estimatedMetrics.metric_unavailable_reasons)).toMatchObject({
        annual_spend_per_entity: "active_market_scenario_not_available",
        growth_rate: "time_series_evidence_not_available",
        target_accessibility: "target_accessibility_evidence_not_available",
        digital_reachability: "digital_reachability_evidence_not_available",
        competition_intensity: "competition_evidence_not_available",
        purchase_frequency: "purchase_frequency_evidence_not_available",
        willingness_to_pay: "willingness_to_pay_evidence_not_available",
      });
      expect(estimatedMetrics.estimate_updated_at).toEqual(expect.any(String));
      expect(subtypeMetrics).toMatchObject({
        raw_entity_unit: "enterprise",
        raw_count_base: expect.any(String),
        normalized_count_score: 100,
        count_status: "available",
        active_market_scenario_count: 0,
      });
      expect(Number(subtypeMetrics.raw_count_base)).toBeCloseTo(730_903.679493186, 6);
      expect(asObject(subtypeMetrics.metric_unavailable_reasons)).toMatchObject({
        annual_spend_per_entity: "active_market_scenario_not_available",
        growth_rate: "time_series_evidence_not_available",
      });
      expect(preview.items[0].confidence_score).not.toBeNull();
      expect(preview.items[1].confidence_score).not.toBeNull();
    });
  });

  it("keeps unsaved comparison market scenarios unambiguous, explicit, and decimal-exact", async () => {
    await bootstrapTestWorkspace();
    await runWithRuntimeContext(TEST_CONTEXT, async () => {
      const suffix = fixtureLabelSuffix();
      const primaryName = `[integration] unsaved comparison primary ${suffix}`;
      const comparatorName = `[integration] unsaved comparison comparator ${suffix}`;
      const primarySegmentId = await saveSegment({
        name: primaryName,
        entityUnit: "enterprise",
        naturalLanguage: primaryName,
        conditions: comparatorConditions,
      });
      const comparatorSegmentId = await saveSegment({
        name: comparatorName,
        entityUnit: "enterprise",
        naturalLanguage: comparatorName,
        conditions: comparatorConditions,
      });
      const primaryEstimateId = await calculateEstimate({
        segmentId: primarySegmentId,
        name: primaryName,
        entityUnit: "enterprise",
        conditions: comparatorConditions,
      });
      const comparatorEstimateId = await calculateEstimate({
        segmentId: comparatorSegmentId,
        name: comparatorName,
        entityUnit: "enterprise",
        conditions: comparatorConditions,
      });
      const [primarySegment, comparatorSegment] = await Promise.all([
        getSegment(primarySegmentId),
        getSegment(comparatorSegmentId),
      ]);
      const primaryResultId = primarySegment?.result_id;
      const comparatorResultId = comparatorSegment?.result_id;
      expect(primaryResultId).toMatch(/^[0-9a-f-]{36}$/);
      expect(comparatorResultId).toMatch(/^[0-9a-f-]{36}$/);

      const metricsFor = (
        preview: Awaited<ReturnType<typeof compareSegments>>,
        resultId: string | null | undefined,
      ) => asObject(preview.items.find((item) => item.id === resultId)?.normalized_metrics);

      const zeroPreview = await compareSegments([primarySegmentId, comparatorSegmentId]);
      const zeroMetrics = metricsFor(zeroPreview, primaryResultId);
      expect(zeroMetrics).toMatchObject({
        active_market_scenario_count: 0,
        market_scenario_id: null,
        tam_entities_base: null,
        annual_spend_per_entity: null,
      });
      expect(asObject(zeroMetrics.metric_unavailable_reasons)).toMatchObject({
        market_scenario_id: "active_market_scenario_not_available",
        tam_entities_base: "active_market_scenario_not_available",
        tam_revenue_base: "active_market_scenario_not_available",
        annual_spend_per_entity: "active_market_scenario_not_available",
      });

      const exactAnnualSpend = "9007199254740993";
      const selectedScenarioName = `[integration] unsaved selected scenario ${suffix}`;
      const selectedScenarioId = await saveMarketScenario({
        estimateId: primaryEstimateId,
        queryResultId: primaryResultId,
        name: selectedScenarioName,
        factors: {
          currency: "KRW",
          horizonMonths: 6,
          annualSpendPerEntity: {
            low: "9007199254740991",
            base: exactAnnualSpend,
            high: "9007199254740995",
          },
          serviceabilityRate: { low: 0.2, base: 0.3, high: 0.4 },
          attainableShare: { low: 0.05, base: 0.1, high: 0.15 },
        },
      });
      const onePreview = await compareSegments([primarySegmentId, comparatorSegmentId]);
      const onePrimary = onePreview.items.find((item) => item.id === primaryResultId);
      const oneMetrics = asObject(onePrimary?.normalized_metrics);
      expect(onePrimary?.market_estimate_id).toMatch(/^[0-9a-f-]{36}$/);
      expect(oneMetrics).toMatchObject({
        active_market_scenario_count: 1,
        market_scenario_id: selectedScenarioId,
        market_scenario_name: selectedScenarioName,
        market_horizon_months: 6,
        raw_count_base: expect.any(String),
        tam_entities_base: expect.any(String),
        tam_revenue_base: expect.any(String),
        annual_spend_per_entity: exactAnnualSpend,
        annual_spend_per_entity_unit: "KRW/entity/year",
      });
      expect(oneMetrics.market_scenario_version).toEqual(expect.stringMatching(/^user-/));
      expect(onePrimary?.annual_spend).toBe(exactAnnualSpend);
      expect(onePrimary?.spend_unit).toBe("KRW/entity/year");
      expect(Number(oneMetrics.tam_revenue_base) / Number(oneMetrics.tam_entities_base)).not.toBe(Number(exactAnnualSpend));
      expect(asObject(oneMetrics.metric_unavailable_reasons)).toMatchObject({
        market_scenario_id: null,
        tam_entities_base: null,
        tam_revenue_base: null,
        annual_spend_per_entity: null,
      });

      await saveMarketScenario({
        estimateId: primaryEstimateId,
        queryResultId: primaryResultId,
        name: `[integration] unsaved second scenario ${suffix}`,
        factors: {
          currency: "KRW",
          horizonMonths: 24,
          annualSpendPerEntity: { low: 180_000, base: 240_000, high: 300_000 },
          serviceabilityRate: { low: 0.25, base: 0.35, high: 0.45 },
          attainableShare: { low: 0.06, base: 0.11, high: 0.16 },
        },
      });
      const ambiguousMetrics = metricsFor(
        await compareSegments([primarySegmentId, comparatorSegmentId]),
        primaryResultId,
      );
      expect(ambiguousMetrics).toMatchObject({
        active_market_scenario_count: 2,
        market_scenario_id: null,
        market_scenario_name: null,
        market_scenario_version: null,
        market_horizon_months: null,
        tam_entities_base: null,
        tam_revenue_base: null,
        annual_spend_per_entity: null,
      });
      expect(asObject(ambiguousMetrics.metric_unavailable_reasons)).toMatchObject({
        market_scenario_id: "multiple_active_market_scenarios_require_explicit_selection",
        tam_entities_base: "multiple_active_market_scenarios_require_explicit_selection",
        tam_revenue_base: "multiple_active_market_scenarios_require_explicit_selection",
        annual_spend_per_entity: "multiple_active_market_scenarios_require_explicit_selection",
      });

      const entityOnlyScenarioId = await saveMarketScenario({
        estimateId: comparatorEstimateId,
        queryResultId: comparatorResultId,
        name: `[integration] unsaved entity-only scenario ${suffix}`,
        factors: {
          currency: "KRW",
          horizonMonths: 12,
          annualSpendPerEntity: null,
          serviceabilityRate: { low: 0.2, base: 0.3, high: 0.4 },
          attainableShare: { low: 0.05, base: 0.1, high: 0.15 },
        },
      });
      const entityOnlyMetrics = metricsFor(
        await compareSegments([primarySegmentId, comparatorSegmentId]),
        comparatorResultId,
      );
      expect(entityOnlyMetrics).toMatchObject({
        active_market_scenario_count: 1,
        market_scenario_id: entityOnlyScenarioId,
        tam_entities_base: expect.any(String),
        tam_revenue_base: null,
        sam_revenue_base: null,
        som_revenue_base: null,
        annual_spend_per_entity: null,
      });
      expect(asObject(entityOnlyMetrics.metric_unavailable_reasons)).toMatchObject({
        tam_entities_base: null,
        tam_revenue_base: "annual_spend_evidence_not_available",
        sam_revenue_base: "annual_spend_evidence_not_available",
        som_revenue_base: "annual_spend_evidence_not_available",
        annual_spend_per_entity: "annual_spend_evidence_not_available",
      });

      await withWorkspaceTransaction(async (client) => {
        await client.query("DELETE FROM market_estimate WHERE scenario_id=$1", [entityOnlyScenarioId]);
      });
      const missingEstimateMetrics = metricsFor(
        await compareSegments([primarySegmentId, comparatorSegmentId]),
        comparatorResultId,
      );
      expect(missingEstimateMetrics).toMatchObject({
        active_market_scenario_count: 1,
        market_scenario_id: entityOnlyScenarioId,
        market_scenario_name: expect.any(String),
        market_scenario_version: expect.stringMatching(/^user-/),
        market_horizon_months: 12,
        tam_entities_base: null,
        tam_revenue_base: null,
      });
      expect(asObject(missingEstimateMetrics.metric_unavailable_reasons)).toMatchObject({
        tam_entities_base: "active_market_estimate_not_available",
        tam_revenue_base: "active_market_estimate_not_available",
        annual_spend_per_entity: "active_market_estimate_not_available",
      });
    });
  }, 60_000);

  it("resolves an exact active market scenario on estimate detail and exports without fallback", async () => {
    const suffix = fixtureLabelSuffix();
    const scenarioContext: RuntimeContext = {
      workspaceId: crypto.randomUUID(),
      actorId: crypto.randomUUID(),
    };
    await withWorkspaceTransaction(async (client) => {
      await client.query(
        `INSERT INTO workspace (workspace_id, workspace_key, name)
         VALUES ($1,$2,$3)`,
        [scenarioContext.workspaceId, `integration-scenario-${suffix}`, "Explicit scenario integration test"],
      );
      await client.query(
        `INSERT INTO workspace_member (workspace_id, actor_id, role)
         VALUES ($1,$2,'owner')`,
        [scenarioContext.workspaceId, scenarioContext.actorId],
      );
    }, scenarioContext);
    await runWithRuntimeContext(scenarioContext, async () => {
      const primaryName = `[integration] explicit detail primary ${suffix}`;
      const otherName = `[integration] explicit detail other ${suffix}`;
      const primarySegmentId = await saveSegment({
        name: primaryName,
        entityUnit: "enterprise",
        naturalLanguage: primaryName,
        conditions: comparatorConditions,
      });
      const otherSegmentId = await saveSegment({
        name: otherName,
        entityUnit: "enterprise",
        naturalLanguage: otherName,
        conditions: primaryConditions,
      });
      const primaryEstimateId = await calculateEstimate({
        segmentId: primarySegmentId,
        name: primaryName,
        entityUnit: "enterprise",
        conditions: comparatorConditions,
      });
      const otherEstimateId = await calculateEstimate({
        segmentId: otherSegmentId,
        name: otherName,
        entityUnit: "enterprise",
        conditions: primaryConditions,
      });
      const primaryResultId = (await getSegment(primarySegmentId))?.result_id;
      expect(primaryResultId).toMatch(/^[0-9a-f-]{36}$/u);

      const firstScenarioId = await saveMarketScenario({
        estimateId: primaryEstimateId,
        queryResultId: primaryResultId,
        name: `[integration] explicit first ${suffix}`,
        factors: {
          currency: "KRW",
          horizonMonths: 12,
          annualSpendPerEntity: { low: 90_000, base: 100_000, high: 110_000 },
          serviceabilityRate: { low: 0.2, base: 0.3, high: 0.4 },
          attainableShare: { low: 0.05, base: 0.1, high: 0.15 },
        },
      });
      const automatic = await getEstimate(primaryEstimateId);
      const firstVersion = automatic?.selected_market_scenario_version;
      expect(automatic).toMatchObject({
        selected_market_scenario_id: firstScenarioId,
        market_scenario_selection_mode: "unique_active",
      });
      expect(firstVersion).toMatch(/^user-/u);

      const uniqueExportQuery = new URLSearchParams({
        kind: "estimate",
        format: "json",
        scenarioId: firstScenarioId,
        scenarioVersion: firstVersion!,
        scenarioSelectionMode: "unique_active",
      });
      const uniqueExportResponse = await exportSnapshot(
        new NextRequest(`http://localhost/api/exports/${primaryEstimateId}?${uniqueExportQuery.toString()}`),
        { params: Promise.resolve({ snapshotId: primaryEstimateId }) },
      );
      expect(uniqueExportResponse.status).toBe(200);
      expect((await uniqueExportResponse.json()).immutableSnapshot).toMatchObject({
        selected_market_scenario_id: firstScenarioId,
        selected_market_scenario_version: firstVersion,
        market_scenario_selection_mode: "unique_active",
      });

      await saveMarketScenario({
        estimateId: primaryEstimateId,
        queryResultId: primaryResultId,
        name: `[integration] explicit second ${suffix}`,
        factors: {
          currency: "KRW",
          horizonMonths: 24,
          annualSpendPerEntity: { low: 180_000, base: 200_000, high: 220_000 },
          serviceabilityRate: { low: 0.25, base: 0.35, high: 0.45 },
          attainableShare: { low: 0.06, base: 0.11, high: 0.16 },
        },
      });

      const ambiguous = await getEstimate(primaryEstimateId);
      expect(ambiguous).toMatchObject({
        active_market_scenario_count: 2,
        selected_market_scenario_id: null,
        market_scenario_selection_mode: "none",
        tam: null,
        market_metric_unavailable_reason: "multiple_active_market_scenarios_require_explicit_selection",
      });
      const staleUniqueExport = await exportSnapshot(
        new NextRequest(`http://localhost/api/exports/${primaryEstimateId}?${uniqueExportQuery.toString()}`),
        { params: Promise.resolve({ snapshotId: primaryEstimateId }) },
      );
      expect(staleUniqueExport.status).toBe(404);

      const selection = { scenarioId: firstScenarioId, scenarioVersion: firstVersion! };
      const explicit = await getEstimate(primaryEstimateId, selection);
      expect(explicit).toMatchObject({
        active_market_scenario_count: 2,
        selected_market_scenario_id: firstScenarioId,
        selected_market_scenario_version: firstVersion,
        market_scenario_selection_mode: "explicit",
        tam: expect.any(String),
        market_metric_unavailable_reason: null,
      });

      await expect(getEstimate(primaryEstimateId, {
        scenarioId: firstScenarioId,
        scenarioVersion: `${firstVersion}-wrong`,
      })).resolves.toBeNull();
      await expect(getEstimate(otherEstimateId, selection)).resolves.toBeNull();

      const exportQuery = new URLSearchParams({
        kind: "estimate",
        format: "json",
        scenarioId: firstScenarioId,
        scenarioVersion: firstVersion!,
        scenarioSelectionMode: "explicit",
      });
      const exportResponse = await exportSnapshot(
        new NextRequest(`http://localhost/api/exports/${primaryEstimateId}?${exportQuery.toString()}`),
        { params: Promise.resolve({ snapshotId: primaryEstimateId }) },
      );
      expect(exportResponse.status).toBe(200);
      const exported = await exportResponse.json();
      expect(exported.immutableSnapshot).toMatchObject({
        selected_market_scenario_id: firstScenarioId,
        selected_market_scenario_version: firstVersion,
        market_scenario_selection_mode: "explicit",
      });

      await saveMarketScenario({
        scenarioId: firstScenarioId,
        estimateId: primaryEstimateId,
        queryResultId: primaryResultId,
        name: `[integration] explicit first revision ${suffix}`,
        factors: {
          currency: "KRW",
          horizonMonths: 18,
          annualSpendPerEntity: { low: 100_000, base: 115_000, high: 130_000 },
          serviceabilityRate: { low: 0.22, base: 0.32, high: 0.42 },
          attainableShare: { low: 0.05, base: 0.1, high: 0.15 },
        },
      });
      await expect(getEstimate(primaryEstimateId, selection)).resolves.toBeNull();
    });
  }, 60_000);

  it("rejects a client entity unit that conflicts with the saved query unit", async () => {
    await bootstrapTestWorkspace();
    await runWithRuntimeContext(TEST_CONTEXT, async () => {
      const suffix = fixtureLabelSuffix();
      const name = `[integration] saved unit contract ${suffix}`;
      const segmentId = await saveSegment({
        name,
        entityUnit: "enterprise",
        naturalLanguage: `[integration:unit-contract:${suffix}] ARC-06-001`,
        conditions: comparatorConditions,
      });
      const before = await getSegment(segmentId);

      await expect(calculateEstimate({
        segmentId,
        name,
        entityUnit: "household",
        conditions: [],
      })).rejects.toThrow("saved_segment_entity_unit_mismatch:enterprise:household");

      const response = await createEstimate(new NextRequest("http://localhost/api/estimate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          segmentId,
          name,
          entityUnit: "household",
          conditions: [],
        }),
      }));
      expect(response.status).toBe(422);
      await expect(response.json()).resolves.toEqual({
        error: "saved_segment_entity_unit_mismatch:enterprise:household",
      });

      const after = await getSegment(segmentId);
      expect(after?.query_id).toBe(before?.query_id);
      expect(after?.current_version_no).toBe(before?.current_version_no);
      expect(after?.pinned_result_id).toBe(before?.pinned_result_id);
    });
  }, 60_000);

  it("rejects unknown Boolean tokens and preserves case-insensitive known operator semantics", async () => {
    await bootstrapTestWorkspace();
    await runWithRuntimeContext(TEST_CONTEXT, async () => {
      const suffix = fixtureLabelSuffix();
      await expect(saveSegment({
        name: `[integration] invalid logic ${suffix}`,
        entityUnit: "enterprise",
        naturalLanguage: null,
        conditions: [{
          logic: "XOR",
          enabled: true,
          conditions: comparatorConditions[0].conditions,
        }],
      })).rejects.toThrow("invalid_condition_group_logic:XOR");

      await expect(saveSegment({
        name: `[integration] invalid operator ${suffix}`,
        entityUnit: "enterprise",
        naturalLanguage: null,
        conditions: [{
          logic: "AND",
          enabled: true,
          conditions: [{ ...comparatorConditions[0].conditions[0], operator: "EQUALS" }],
        }],
      })).rejects.toThrow("condition_1_invalid_operator:EQUALS");

      await expect(saveSegment({
        name: `[integration] null logic token ${suffix}`,
        entityUnit: "enterprise",
        naturalLanguage: null,
        conditions: [{
          logic: null,
          enabled: true,
          conditions: comparatorConditions[0].conditions,
        }],
      })).rejects.toThrow("invalid_condition_group_logic_token");

      await expect(saveSegment({
        name: `[integration] numeric operator token ${suffix}`,
        entityUnit: "enterprise",
        naturalLanguage: null,
        conditions: [{
          logic: "AND",
          enabled: true,
          conditions: [{ ...comparatorConditions[0].conditions[0], operator: 0 }],
        }],
      })).rejects.toThrow("condition_1_invalid_operator_token");

      await expect(saveSegment({
        name: `[integration] string enabled token ${suffix}`,
        entityUnit: "enterprise",
        naturalLanguage: null,
        conditions: [{
          logic: "AND",
          enabled: "false",
          conditions: comparatorConditions[0].conditions,
        }],
      })).rejects.toThrow("invalid_condition_group_enabled_token");

      await expect(saveSegment({
        name: `[integration] primitive condition ${suffix}`,
        entityUnit: "enterprise",
        naturalLanguage: null,
        conditions: [{ logic: "AND", enabled: true, conditions: [42] }],
      })).rejects.toThrow("conditions_1_must_be_an_object");

      await expect(saveSegment({
        name: `[integration] condition enabled token ${suffix}`,
        entityUnit: "enterprise",
        naturalLanguage: null,
        conditions: [{
          logic: "AND",
          enabled: true,
          conditions: [{ ...comparatorConditions[0].conditions[0], enabled: "false" }],
        }],
      })).rejects.toThrow("condition_1_invalid_enabled_token");

      const name = `[integration] uppercase neq ${suffix}`;
      const segmentId = await saveSegment({
        name,
        entityUnit: "enterprise",
        naturalLanguage: null,
        conditions: [{
          logic: "and",
          enabled: true,
          conditions: [{ ...comparatorConditions[0].conditions[0], operator: "NEQ" }],
        }],
      });
      const estimateId = await calculateEstimate({
        segmentId,
        name,
        entityUnit: "enterprise",
        conditions: [],
      });
      const estimate = await getEstimate(estimateId);
      expect(estimate?.status).toBe("not_estimable");
      expect(estimate?.count_base).toBeNull();
    });
  }, 60_000);

  it("never reuses positive estimates for negated or disjunctive condition contexts", async () => {
    await bootstrapTestWorkspace();
    await runWithRuntimeContext(TEST_CONTEXT, async () => {
      const cases = [
        {
          label: "neq archetype",
          conditions: [{
            logic: "AND",
            enabled: true,
            conditions: [{ ...comparatorConditions[0].conditions[0], operator: "neq" }],
          }],
        },
        {
          label: "NOT archetype",
          conditions: [{
            logic: "NOT",
            enabled: true,
            conditions: comparatorConditions[0].conditions,
          }],
        },
        {
          label: "OR parent subtype",
          conditions: [{
            logic: "OR",
            enabled: true,
            conditions: primaryConditions[0].conditions,
          }],
        },
        {
          label: "not_in subtype",
          conditions: [{
            logic: "AND",
            enabled: true,
            conditions: [
              primaryConditions[0].conditions[0],
              { ...primaryConditions[0].conditions[1], operator: "not_in" },
            ],
          }],
        },
        {
          label: "similar archetype",
          conditions: [{
            logic: "AND",
            enabled: true,
            conditions: [{ ...comparatorConditions[0].conditions[0], matchStatus: "similar" }],
          }],
        },
        {
          label: "proxy archetype",
          conditions: [{
            logic: "AND",
            enabled: true,
            conditions: [{ ...comparatorConditions[0].conditions[0], matchStatus: "proxy" }],
          }],
        },
        {
          label: "archetype source/value mismatch",
          conditions: [{
            logic: "AND",
            enabled: true,
            conditions: [{ ...comparatorConditions[0].conditions[0], value: "ARC-06-002" }],
          }],
        },
        {
          label: "archetype in arbitrary value",
          conditions: [{
            logic: "AND",
            enabled: true,
            conditions: [{ ...comparatorConditions[0].conditions[0], operator: "in", value: "ARC-06-002" }],
          }],
        },
      ];

      for (const testCase of cases) {
        const suffix = fixtureLabelSuffix();
        const name = `[integration] boolean guard ${testCase.label} ${suffix}`;
        if (["archetype source/value mismatch", "archetype in arbitrary value"].includes(testCase.label)) {
          await expect(saveSegment({
            name,
            entityUnit: "enterprise",
            naturalLanguage: name,
            conditions: testCase.conditions,
          })).rejects.toThrow("condition_catalog_value_not_allowed");
          continue;
        }
        const segmentId = await saveSegment({
          name,
          entityUnit: "enterprise",
          naturalLanguage: name,
          conditions: testCase.conditions,
        });
        const estimateId = await calculateEstimate({
          segmentId,
          name,
          entityUnit: "enterprise",
          conditions: testCase.conditions,
        });
        const estimate = await getEstimate(estimateId);
        expect(estimate?.status, testCase.label).toBe("not_estimable");
        expect(estimate?.count_base, testCase.label).toBeNull();
      }
    });
  }, 60_000);

  it("does not reuse the latest archetype estimate for a mismatched explicit reference year", async () => {
    await bootstrapTestWorkspace();
    await runWithRuntimeContext(TEST_CONTEXT, async () => {
      const period = await withWorkspaceTransaction(async (client) => (
        await client.query<{ start_year: number; end_year: number }>(
          `SELECT extract(year FROM tp.start_date)::integer AS start_year,
                  extract(year FROM tp.end_date)::integer AS end_year
             FROM estimate e
             JOIN time_period tp USING (period_id)
            WHERE e.subject_type='archetype' AND e.subject_id='ARC-06-001'
              AND e.approval_status IN ('approved','not_required')
            ORDER BY CASE e.data_layer WHEN 'approved_version' THEN 0 WHEN 'baseline' THEN 1 ELSE 2 END,
                     e.created_at DESC
            LIMIT 1`,
        )
      ).rows[0]);
      expect(period).toBeDefined();
      const referenceYear = [1900, 2200].find((year) => year < period.start_year || year > period.end_year);
      expect(referenceYear).toBeDefined();
      const matchingName = `[integration] matching reference year ${crypto.randomUUID()}`;
      const matchingConditions = [{
        ...comparatorConditions[0],
        conditions: [{ ...comparatorConditions[0].conditions[0], referenceYear: period.end_year }],
      }];
      const matchingSegmentId = await saveSegment({
        name: matchingName,
        entityUnit: "enterprise",
        naturalLanguage: matchingName,
        conditions: matchingConditions,
      });
      const matchingEstimateId = await calculateEstimate({
        segmentId: matchingSegmentId,
        name: matchingName,
        entityUnit: "enterprise",
        conditions: matchingConditions,
      });
      expect((await getEstimate(matchingEstimateId))?.status).toBe("estimated");

      const name = `[integration] mismatched reference year ${crypto.randomUUID()}`;
      const conditions = [{
        ...comparatorConditions[0],
        conditions: [{ ...comparatorConditions[0].conditions[0], referenceYear }],
      }];
      const segmentId = await saveSegment({
        name,
        entityUnit: "enterprise",
        naturalLanguage: name,
        conditions,
      });
      const estimateId = await calculateEstimate({ segmentId, name, entityUnit: "enterprise", conditions });
      const [estimate, segment] = await Promise.all([getEstimate(estimateId), getSegment(segmentId)]);
      expect(estimate?.status).toBe("not_estimable");
      expect(estimate?.count_base).toBeNull();
      expect(asObject(segment?.result_summary)).toMatchObject({
        reason: "matching_archetype_has_no_approved_estimate_for_reference_year",
        reference_year: referenceYear,
      });
    });
  }, 60_000);

  it("supports an explicit nested NOT subtype only as a registered parent complement", async () => {
    await bootstrapTestWorkspace();
    await runWithRuntimeContext(TEST_CONTEXT, async () => {
      const suffix = fixtureLabelSuffix();
      const name = `[integration] subtype complement ${suffix}`;
      const conditions = [{
        logic: "AND",
        enabled: true,
        conditions: [primaryConditions[0].conditions[0]],
        groups: [{
          logic: "NOT",
          enabled: true,
          conditions: [primaryConditions[0].conditions[1]],
        }],
      }];
      const segmentId = await saveSegment({ name, entityUnit: "enterprise", naturalLanguage: name, conditions });
      const estimateId = await calculateEstimate({ segmentId, name, entityUnit: "enterprise", conditions });
      const estimate = await getEstimate(estimateId);
      expect(estimate?.status).toBe("estimated");
      expect(Number(estimate?.count_base)).toBeGreaterThan(0);
      expect(estimate?.method_code).toBe("phase2_parent_subtype_complement");
    });
  }, 60_000);

  it("persists versioned segments through sizing, comparison, opportunity, research boundary, and exports", async () => {
    await bootstrapTestWorkspace();

    await runWithRuntimeContext(TEST_CONTEXT, async () => {
      const primarySegmentId = await ensurePrimarySegment();
      const primaryEstimateId = await calculateEstimate({
        segmentId: primarySegmentId,
        name: FIXTURE.primarySegment,
        entityUnit: "enterprise",
        conditions: primaryConditions,
      });
      const firstPinnedPrimary = await getSegment(primarySegmentId);
      expect(firstPinnedPrimary?.pinned_result_id).toBe(firstPinnedPrimary?.result_id);
      expect(firstPinnedPrimary?.resolved_version_no).toBe(firstPinnedPrimary?.current_version_no);
      const pinnedVersionBeforeRepeat = firstPinnedPrimary?.current_version_no;
      const repeatedEstimateId = await calculateEstimate({
        segmentId: primarySegmentId,
        name: FIXTURE.primarySegment,
        entityUnit: "enterprise",
        conditions: primaryConditions,
      });
      const repeatedPinnedPrimary = await getSegment(primarySegmentId);
      expect(repeatedEstimateId).toBe(primaryEstimateId);
      expect(repeatedPinnedPrimary?.current_version_no).toBe(pinnedVersionBeforeRepeat);
      expect(repeatedPinnedPrimary?.pinned_result_id).toBe(firstPinnedPrimary?.pinned_result_id);

      const scenarioId = await saveMarketScenario({
        estimateId: primaryEstimateId,
        queryResultId: repeatedPinnedPrimary?.result_id,
        name: FIXTURE.scenario,
        factors: {
          currency: "KRW",
          horizonMonths: 12,
          annualSpendPerEntity: { low: 100_000, base: 120_000, high: 150_000 },
          serviceabilityRate: { low: 0.2, base: 0.3, high: 0.4 },
          attainableShare: { low: 0.05, base: 0.1, high: 0.15 },
        },
      });

      const comparatorSegmentId = await ensureComparatorSegment();
      await calculateEstimate({
        segmentId: comparatorSegmentId,
        name: FIXTURE.comparatorSegment,
        entityUnit: "enterprise",
        conditions: comparatorConditions,
      });

      let comparisonId = await findComparison();
      const existingComparison = comparisonId ? await getComparison(comparisonId) : null;
      if (!comparisonId || existingComparison?.members.length !== 2) {
        comparisonId = await saveComparison({
          comparisonId,
          name: FIXTURE.comparison,
          segmentIds: [primarySegmentId, comparatorSegmentId],
        });
      }

      const primaryBeforeOpportunity = await getSegment(primarySegmentId);
      expect(primaryBeforeOpportunity?.estimate_id).toBe(primaryEstimateId);
      const opportunityName = `${FIXTURE.opportunity} · v${primaryBeforeOpportunity?.resolved_version_no ?? "unknown"} · ${primaryBeforeOpportunity?.result_id ?? "missing-result"}`;

      let opportunity = await findOpportunity(opportunityName);
      if (!opportunity) {
        const opportunityId = await saveOpportunity({
          segmentId: primarySegmentId,
          estimateSnapshotId: primaryEstimateId,
          name: opportunityName,
          problem: "검증 가능한 시장 스냅샷 없이 우선순위를 정하기 어렵다.",
          hypothesis: "버전이 고정된 세그먼트와 시장규모를 연결하면 검토 가능성이 높아진다.",
          idea: "세그먼트 근거와 TAM/SAM/SOM을 함께 제공하는 내부 워크벤치",
          revenueModel: "annual_subscription",
          price: "1200000",
          channels: ["direct_sales", "partner"],
          competingAlternatives: ["spreadsheet", "generic dashboard"],
          assumptions: ["enterprise unit only", "KR denominator"],
          nextExperiment: "내부 사용자 5명과 스냅샷 검토 테스트",
          status: "discovered",
          notes: "integration note v1",
        });
        opportunity = { opportunity_id: opportunityId, status: "discovered", optimistic_lock_version: "1" };
      }
      await saveOpportunity({
          opportunityId: opportunity.opportunity_id,
          expectedLockVersion: opportunity.optimistic_lock_version,
          segmentId: primarySegmentId,
          estimateSnapshotId: primaryEstimateId,
          name: opportunityName,
          problem: "검증 가능한 시장 스냅샷 없이 우선순위를 정하기 어렵다.",
          hypothesis: "버전이 고정된 세그먼트와 시장규모를 연결하면 검토 가능성이 높아진다.",
          idea: "세그먼트 근거와 TAM/SAM/SOM을 함께 제공하는 내부 워크벤치",
          revenueModel: "annual_subscription",
          price: "1200000",
          channels: ["direct_sales", "partner"],
          competingAlternatives: ["spreadsheet", "generic dashboard"],
          assumptions: ["enterprise unit only", "KR denominator"],
          nextExperiment: "내부 사용자 5명과 스냅샷 검토 테스트",
          status: "validating",
          notes: "integration note v2",
          score: {
            values: {
              market_size: 80,
              growth: 70,
              willingness_to_pay: 65,
              problem_intensity: 85,
              target_accessibility: 75,
              competition_intensity: 55,
              data_confidence: 80,
              implementation_difficulty: 60,
              capability_fit: 75,
            },
            weights: {
              market_size: 15,
              growth: 10,
              willingness_to_pay: 10,
              problem_intensity: 15,
              target_accessibility: 10,
              competition_intensity: 10,
              data_confidence: 10,
              implementation_difficulty: 10,
              capability_fit: 10,
            },
          },
          experiment: {
            name: "[integration] snapshot review experiment",
            hypothesis: "Snapshot lineage increases review agreement.",
            method: "Five-reviewer structured comparison",
            primaryMetric: "agreement_rate",
            successCriteria: "agreement_rate >= 0.8",
            status: "planned",
          },
      });

      const previousResearchEnabled = process.env.OPENAI_RESEARCH_ENABLED;
      const previousApiKey = process.env.OPENAI_API_KEY;
      let researchJobId = await findResearchJob(primarySegmentId);
      try {
        process.env.OPENAI_RESEARCH_ENABLED = "false";
        delete process.env.OPENAI_API_KEY;
        expect(isResearchProviderConfigured()).toBe(false);
        if (!researchJobId) {
          const research = await createResearchJob({
            segmentId: primarySegmentId,
            targetSegment: FIXTURE.primarySegment,
            targetVariable: "joint_prevalence",
            researchQuestion: FIXTURE.researchQuestion,
            baseline: {
              status: "not_estimable",
              denominator: "대한민국 enterprise",
              definition: "공동분포 근거가 아직 없어 산정할 수 없음",
            },
          });
          expect(research.configurationRequired).toBe(true);
          researchJobId = research.id;
        }
      } finally {
        if (previousResearchEnabled === undefined) delete process.env.OPENAI_RESEARCH_ENABLED;
        else process.env.OPENAI_RESEARCH_ENABLED = previousResearchEnabled;
        if (previousApiKey === undefined) delete process.env.OPENAI_API_KEY;
        else process.env.OPENAI_API_KEY = previousApiKey;
      }

      expect(scenarioId).toBeTruthy();
      expect(comparisonId).toBeTruthy();
      expect(researchJobId).toBeTruthy();

      // Force all verification reads through a fresh PostgreSQL pool. This
      // distinguishes committed, durable state from process-local state.
      await closeDatabasePool();

      const [primary, comparator, estimate, scenario, comparison, persistedOpportunity, researchJob] = await Promise.all([
        getSegment(primarySegmentId),
        getSegment(comparatorSegmentId),
        getEstimate(primaryEstimateId),
        readMarketScenario(scenarioId),
        getComparison(comparisonId),
        getOpportunity(opportunity.opportunity_id),
        getResearchJob(researchJobId),
      ]);
      const persistedResearchInput = await withWorkspaceTransaction(async (client) => (
        await client.query<{
          input_payload: Record<string, unknown>;
          input_hash: string;
          target_segment: string;
          output_schema_version: string;
        }>(
          `SELECT input_payload,input_hash,target_segment,output_schema_version
             FROM research_job WHERE research_job_id=$1`,
          [researchJobId],
        )
      ).rows[0]);

      expect(primary).not.toBeNull();
      expect(primary?.current_version_no).toBeGreaterThanOrEqual(2);
      expect(primary?.versions.length).toBeGreaterThanOrEqual(2);
      expect(primary?.primary_entity_unit).toBe("enterprise");
      expect(primary?.result_id).toMatch(/^[0-9a-f-]{36}$/);
      expect(primary?.estimate_id).toBe(primaryEstimateId);

      expect(comparator?.primary_entity_unit).toBe("enterprise");
      expect(comparator?.result_id).toMatch(/^[0-9a-f-]{36}$/);
      expect(comparator?.result_id).not.toBe(primary?.result_id);
      expect(comparator?.estimate_id).not.toBeNull();

      expect(estimate?.status).toBe("estimated");
      expect(estimate?.entity_unit).toBe("enterprise");
      expect(estimate?.denominator_definition).toBeTruthy();
      expect(estimate?.reference_period).toBeTruthy();
      expect(estimate?.method_code).toBeTruthy();
      expect(estimate?.data_version).toBeTruthy();
      expect(estimate?.confidence_json).not.toBeNull();
      const derivedConfidence = asObject(estimate?.confidence_json);
      expect(["D", "E"]).toContain(derivedConfidence.grade);
      expect(Number(derivedConfidence.total_score)).toBeLessThanOrEqual(48);
      expect(Number(derivedConfidence.joint_observation_score)).toBeLessThanOrEqual(3);
      expect(estimate?.dependencies_json.some((item) => asObject(item).dependency_kind === "subtype_allocation")).toBe(true);
      expect(estimate?.dependencies_json.some((item) => asObject(item).dependency_kind === "source_release")).toBe(true);
      expect(estimate?.dependencies_json.some((item) => asObject(item).dependency_kind === "evidence")).toBe(true);
      expect(estimate?.components_json.length).toBeGreaterThanOrEqual(3);
      expect(estimate?.sources_json.length).toBeGreaterThan(0);
      expect(estimate?.validation_gaps_json.length).toBeGreaterThan(0);
      const displayFactors = Array.isArray(asObject(estimate).factors)
        ? (asObject(estimate).factors as unknown[]).map(asObject)
        : [];
      expect(displayFactors).toHaveLength(estimate?.components_json.length ?? 0);
      expect(displayFactors.every((factor) => factor.evidence_id !== null)).toBe(true);
      expect(displayFactors.every((factor) => typeof factor.directness_class === "string")).toBe(true);
      expect(displayFactors.every((factor) => typeof factor.reference_period === "string")).toBe(true);
      expect(displayFactors.every((factor) => typeof factor.adjustment_reason === "string")).toBe(true);
      const lineageReview = await withWorkspaceTransaction(async (client) => (
        await client.query<{
          validation_gap_reviewed_at: Date | null;
          component_count: number;
          component_without_evidence_count: number;
        }>(
          `SELECT ca.validation_gap_reviewed_at,
                  count(ec.component_id)::integer AS component_count,
                  count(ec.component_id) FILTER (WHERE ec.evidence_id IS NULL)::integer
                    AS component_without_evidence_count
             FROM confidence_assessment ca
             JOIN estimate_component ec USING (estimate_id)
            WHERE ca.estimate_id=$1
            GROUP BY ca.validation_gap_reviewed_at`,
          [primaryEstimateId],
        )
      ).rows[0]);
      expect(lineageReview?.validation_gap_reviewed_at).not.toBeNull();
      expect(lineageReview?.component_count).toBeGreaterThanOrEqual(3);
      expect(lineageReview?.component_without_evidence_count).toBe(0);

      expect(scenario).not.toBeNull();
      expect(scenario).toMatchObject({
        scenario_id: scenarioId,
        base_query_result_id: primary?.result_id,
        saved_segment_id: primarySegmentId,
        saved_segment_version_no: primary?.resolved_version_no,
        market_unit: "enterprise",
        currency: "KRW",
        horizon_months: 12,
        factor_count: 3,
      });
      expect(Number(scenario?.tam_entities_low)).toBeLessThanOrEqual(Number(scenario?.tam_entities_base));
      expect(Number(scenario?.tam_entities_base)).toBeLessThanOrEqual(Number(scenario?.tam_entities_high));
      expect(Number(scenario?.sam_entities_base)).toBeCloseTo(Number(scenario?.tam_entities_base) * 0.3, 6);
      expect(Number(scenario?.som_entities_base)).toBeCloseTo(Number(scenario?.sam_entities_base) * 0.1, 6);
      expect(Number(scenario?.tam_revenue_base)).toBeCloseTo(Number(scenario?.tam_entities_base) * 120_000, 2);
      expect(Number(scenario?.sam_revenue_base)).toBeLessThan(Number(scenario?.tam_revenue_base));
      expect(Number(scenario?.som_revenue_base)).toBeLessThan(Number(scenario?.sam_revenue_base));
      expect(scenario?.formula).toContain("TAM=eligible_entities");

      expect(comparison?.status).toBe("saved");
      expect(comparison?.members).toHaveLength(2);
      expect(new Set(comparison?.members.map((member) => member.query_result_id)).size).toBe(2);
      expect(comparison?.members.every((member) => member.primary_entity_unit === "enterprise")).toBe(true);
      expect(comparison?.members.every((member) => asObject(member.normalized_metrics).raw_entity_unit === "enterprise")).toBe(true);

      expect(persistedOpportunity?.status).toBe("validating");
      expect(persistedOpportunity?.segment_snapshots).toHaveLength(1);
      const opportunitySnapshot = asObject(persistedOpportunity?.segment_snapshots[0]);
      expect(opportunitySnapshot.saved_segment_id).toBe(primarySegmentId);
      expect(opportunitySnapshot.saved_segment_version_no).toBe(primary?.current_version_no);
      expect(opportunitySnapshot.query_result_id).toBe(primary?.result_id);
      expect(opportunitySnapshot.estimate_id).toBe(primaryEstimateId);
      const latestNote = asObject(persistedOpportunity?.current_content[0]);
      expect(latestNote.version_no).toBeGreaterThanOrEqual(2);
      expect(Number(persistedOpportunity?.overall_score)).toBeCloseTo(69.75, 6);
      expect(persistedOpportunity?.score_components).toHaveLength(9);
      expect(persistedOpportunity?.score_components?.every((item) => asObject(item).source_kind === "user_input")).toBe(true);
      expect((persistedOpportunity?.experiments?.length ?? 0)).toBeGreaterThanOrEqual(1);
      expect((persistedOpportunity?.status_history?.length ?? 0)).toBeGreaterThanOrEqual(1);

      expect(researchJob?.research_status).toBe("configuration_required");
      expect(researchJob?.provider).toBe("openai");
      expect(researchJob?.attempt_count).toBe(0);
      expect(researchJob?.artifacts).toEqual([]);
      expect(researchJob?.steps.some((item) => asObject(item).status === "skipped")).toBe(true);
      expect(researchJob?.events.some((item) => asObject(item).event_type === "configuration_required")).toBe(true);
      expect(persistedResearchInput.target_segment).toBe(FIXTURE.primarySegment);
      expect(persistedResearchInput.output_schema_version).toBe("research-result-v2");
      expect(persistedResearchInput.input_payload).toMatchObject({
        researchQuestion: FIXTURE.researchQuestion,
        targetSegment: FIXTURE.primarySegment,
        targetVariable: "joint_prevalence",
        baseline: {
          status: "not_estimable",
          denominator: "대한민국 enterprise",
          definition: "공동분포 근거가 아직 없어 산정할 수 없음",
        },
      });
      expect(persistedResearchInput.input_hash).toBe(contentHash(persistedResearchInput.input_payload));

      const jsonResponse = await exportSnapshot(
        new NextRequest(`http://localhost/api/exports/${primaryEstimateId}?kind=estimate&format=json`),
        { params: Promise.resolve({ snapshotId: primaryEstimateId }) },
      );
      expect(jsonResponse.status).toBe(200);
      expect(jsonResponse.headers.get("content-type")).toContain("application/json");
      expect(jsonResponse.headers.get("content-disposition")).toContain(`${primaryEstimateId}.json`);
      const jsonExport = await jsonResponse.json();
      expect(jsonExport).toMatchObject({
        schemaVersion: "workbench-export-v1",
        kind: "estimate",
        snapshotId: primaryEstimateId,
        generatedAt: expect.any(String),
        immutableSnapshot: {
          estimate_id: primaryEstimateId,
          entity_unit: "enterprise",
          reference_period: expect.any(String),
          denominator_definition: expect.any(String),
          method_code: expect.any(String),
          data_version: expect.any(String),
          confidence_json: expect.any(Object),
          validation_gaps_json: expect.any(Array),
          sources_json: expect.any(Array),
        },
      });

      const csvResponse = await exportSnapshot(
        new NextRequest(`http://localhost/api/exports/${comparisonId}?kind=comparison&format=csv`),
        { params: Promise.resolve({ snapshotId: comparisonId }) },
      );
      expect(csvResponse.status).toBe(200);
      expect(csvResponse.headers.get("content-type")).toContain("text/csv");
      const csvExport = await csvResponse.text();
      expect(csvExport).toContain(comparisonId);
      expect(csvExport).toContain("estimate_snapshots[0].reference_period");
      expect(csvExport).toContain("estimate_snapshots[0].denominator_definition");
      expect(csvExport).toContain("estimate_snapshots[0].method_code");
      expect(csvExport).toContain("estimate_snapshots[0].data_version");
      expect(csvExport).toContain("estimate_snapshots[0].confidence_json");
      expect(csvExport).toContain("estimate_snapshots[0].validation_gaps_json");
      expect(csvExport).toContain("estimate_snapshots[0].sources_json");

      const printResponse = await exportSnapshot(
        new NextRequest(`http://localhost/api/exports/${opportunity.opportunity_id}?kind=opportunity&format=print`),
        { params: Promise.resolve({ snapshotId: opportunity.opportunity_id }) },
      );
      expect(printResponse.status).toBe(200);
      expect(printResponse.headers.get("content-type")).toContain("text/html");
      const printHtml = await printResponse.text();
      expect(printHtml).toContain("Market Atlas · opportunity snapshot");
      expect(printHtml).toContain(FIXTURE.opportunity);
      expect(printHtml).toContain("estimate_snapshots[0].reference_period");
      expect(printHtml).toContain("estimate_snapshots[0].denominator_definition");
      expect(printHtml).toContain("estimate_snapshots[0].method_code");
      expect(printHtml).toContain("estimate_snapshots[0].confidence_json");
      expect(printHtml).toContain("estimate_snapshots[0].sources_json");
    });
  }, 60_000);

  it("persists full operators and ignores disabled nested groups during exact calculation", async () => {
    await bootstrapTestWorkspace();
    await runWithRuntimeContext(TEST_CONTEXT, async () => {
      const suffix = fixtureLabelSuffix();
      const evidenceId = await withWorkspaceTransaction(async (client) => (
        await client.query<{ evidence_id: number }>(
          "SELECT evidence_id FROM evidence WHERE reviewer_status<>'rejected' ORDER BY evidence_id LIMIT 1",
        )
      ).rows[0]?.evidence_id);
      expect(evidenceId).toBeTruthy();
      const conditions = [
        {
          logic: "AND",
          enabled: true,
          conditions: comparatorConditions[0].conditions,
          groups: [{
            logic: "OR",
            enabled: false,
            conditions: [{
              sourceId: "feature:age",
              sourceKind: "core_feature",
              label: "disabled age range",
              unit: "enterprise",
              operator: "between",
              value: "20, 39",
              matchStatus: "exact",
              referenceYear: 2024,
              evidenceId,
              enabled: true,
            }],
          }],
        },
      ];
      const segmentId = await saveSegment({
        name: `[integration] operators ${suffix}`,
        entityUnit: "enterprise",
        naturalLanguage: "exact archetype with a disabled nested range",
        conditions,
      });
      const estimateId = await calculateEstimate({
        segmentId,
        name: `[integration] operators ${suffix}`,
        entityUnit: "enterprise",
        conditions,
      });
      const [estimate, segment] = await Promise.all([getEstimate(estimateId), getSegment(segmentId)]);
      expect(estimate?.status).toBe("estimated");
      const groups = segment?.conditions.map(asObject) ?? [];
      const disabledGroup = groups.find((group) => group.enabled === false);
      expect(disabledGroup?.logic).toBe("OR");
      const storedRange = Array.isArray(disabledGroup?.conditions)
        ? asObject(disabledGroup.conditions[0]) : {};
      expect(storedRange.operator).toBe("between");
      expect(storedRange.value).toEqual(["20", "39"]);
      expect(storedRange.reference_year).toBe(2024);
      expect(Number(storedRange.evidence_id)).toBe(Number(evidenceId));
      expect(storedRange.enabled).toBe(true);
      expect(disabledGroup?.parent_group_id).toBeTruthy();
    });
  }, 60_000);

  it("creates a fresh valid result after an identical cached snapshot is invalidated", async () => {
    await bootstrapTestWorkspace();
    await runWithRuntimeContext(TEST_CONTEXT, async () => {
      const suffix = fixtureLabelSuffix();
      const segmentId = await saveSegment({
        name: `[integration] cache regeneration ${suffix}`,
        entityUnit: "enterprise",
        naturalLanguage: `[integration:cache:${suffix}] ARC-06-001`,
        conditions: comparatorConditions,
      });
      await calculateEstimate({
        segmentId,
        name: `[integration] cache regeneration ${suffix}`,
        entityUnit: "enterprise",
        conditions: comparatorConditions,
      });
      const first = await getSegment(segmentId);
      expect(first?.result_id).toMatch(/^[0-9a-f-]{36}$/);
      expect(first?.pinned_result_id).toBe(first?.result_id);
      const firstPinnedVersion = first?.current_version_no;

      await withWorkspaceTransaction(async (client) => {
        const invalidated = await client.query(
          `UPDATE segment_query_result
              SET cache_status='invalidated',invalidated_at=now()
            WHERE result_id=$1 AND cache_status='valid'`,
          [first?.result_id],
        );
        expect(invalidated.rowCount).toBe(1);
      });

      await calculateEstimate({
        segmentId,
        name: `[integration] cache regeneration ${suffix}`,
        entityUnit: "enterprise",
        conditions: comparatorConditions,
      });
      const second = await getSegment(segmentId);
      expect(second?.result_id).toMatch(/^[0-9a-f-]{36}$/);
      expect(second?.result_id).not.toBe(first?.result_id);
      expect(second?.estimate_id).toBe(first?.estimate_id);
      expect(second?.pinned_result_id).toBe(second?.result_id);
      expect(second?.current_version_no).toBe((firstPinnedVersion ?? 0) + 1);
      const historicalVersions = (second?.versions ?? []).map(asObject);
      expect(historicalVersions.some((version) => version.pinned_result_id === first?.result_id)).toBe(true);
      expect(historicalVersions.some((version) => version.pinned_result_id === second?.result_id)).toBe(true);

      const snapshots = await withWorkspaceTransaction(async (client) => (
        await client.query<{ result_id: string; cache_status: string; result_hash: string }>(
          `SELECT result_id,cache_status,result_hash
             FROM segment_query_result
            WHERE query_id=$1
            ORDER BY executed_at`,
          [second?.query_id],
        )
      ).rows);
      expect(snapshots.filter((row) => row.cache_status === "valid")).toHaveLength(1);
      expect(snapshots.find((row) => row.result_id === first?.result_id)?.cache_status).toBe("invalidated");
      expect(new Set(snapshots.map((row) => row.result_hash))).toHaveLength(1);
    });
  }, 60_000);

  it("appends one immutable scenario revision and preserves its pinned segment lineage", async () => {
    await bootstrapTestWorkspace();
    await runWithRuntimeContext(TEST_CONTEXT, async () => {
      const suffix = fixtureLabelSuffix();
      const segmentId = await saveSegment({
        name: `[integration] scenario revision segment ${suffix}`,
        entityUnit: "enterprise",
        naturalLanguage: `[integration:scenario-revision:${suffix}] ARC-06-001`,
        conditions: comparatorConditions,
      });
      const estimateId = await calculateEstimate({
        segmentId,
        name: `[integration] scenario revision segment ${suffix}`,
        entityUnit: "enterprise",
        conditions: comparatorConditions,
      });
      const segment = await getSegment(segmentId);
      expect(segment?.pinned_result_id).toBe(segment?.result_id);

      const rootScenarioId = await saveMarketScenario({
        estimateId,
        queryResultId: segment?.result_id,
        name: `[integration] scenario revision ${suffix}`,
        factors: {
          currency: "KRW",
          horizonMonths: 12,
          annualSpendPerEntity: { low: 90_000, base: 100_000, high: 120_000 },
          serviceabilityRate: { low: 0.2, base: 0.3, high: 0.4 },
          attainableShare: { low: 0.05, base: 0.1, high: 0.15 },
        },
      });
      const revisedInput = {
        scenarioId: rootScenarioId,
        estimateId,
        queryResultId: segment?.result_id,
        name: `[integration] scenario revision ${suffix}`,
        factors: {
          currency: "KRW",
          horizonMonths: 12,
          annualSpendPerEntity: { low: 100_000, base: 130_000, high: 160_000 },
          serviceabilityRate: { low: 0.25, base: 0.35, high: 0.45 },
          attainableShare: { low: 0.06, base: 0.11, high: 0.16 },
        },
      };
      const revisedScenarioId = await saveMarketScenario(revisedInput);
      expect(await saveMarketScenario(revisedInput)).toBe(revisedScenarioId);

      const [rootScenario, revisedScenario] = await Promise.all([
        readMarketScenario(rootScenarioId),
        readMarketScenario(revisedScenarioId),
      ]);
      expect(rootScenario?.status).toBe("superseded");
      expect(revisedScenario).toMatchObject({
        status: "active",
        supersedes_scenario_id: rootScenarioId,
        base_query_result_id: segment?.result_id,
        saved_segment_id: segmentId,
        saved_segment_version_no: segment?.resolved_version_no,
      });
      await expect(saveMarketScenario({
        ...revisedInput,
        factors: {
          ...revisedInput.factors,
          annualSpendPerEntity: { low: 110_000, base: 140_000, high: 170_000 },
        },
      })).rejects.toThrow("market_scenario_revision_conflict");
    });
  }, 60_000);

  it("persists an entity-only TAM/SAM/SOM scenario without inventing revenue", async () => {
    await bootstrapTestWorkspace();
    await runWithRuntimeContext(TEST_CONTEXT, async () => {
      const suffix = fixtureLabelSuffix();
      const name = `[integration] entity-only scenario ${suffix}`;
      const segmentId = await saveSegment({
        name,
        entityUnit: "enterprise",
        naturalLanguage: name,
        conditions: comparatorConditions,
      });
      const estimateId = await calculateEstimate({ segmentId, name, entityUnit: "enterprise", conditions: comparatorConditions });
      const segment = await getSegment(segmentId);
      const scenarioId = await saveMarketScenario({
        estimateId,
        queryResultId: segment?.result_id,
        name,
        factors: {
          currency: "KRW",
          horizonMonths: 12,
          annualSpendPerEntity: null,
          serviceabilityRate: { low: 0.2, base: 0.3, high: 0.4 },
          attainableShare: { low: 0.05, base: 0.1, high: 0.15 },
        },
      });
      const persisted = await withWorkspaceTransaction(async (client) => (
        await client.query<{
          tam_entities_base: string;
          sam_entities_base: string;
          som_entities_base: string;
          tam_revenue_base: string | null;
          spend_factor_count: number;
        }>(
          `SELECT me.tam_entities_base,me.sam_entities_base,me.som_entities_base,
                  me.tam_revenue_base,
                  (SELECT count(*)::integer FROM scenario_factor_override sfo
                    WHERE sfo.scenario_id=me.scenario_id
                      AND sfo.factor_code='annual_spend_per_entity') AS spend_factor_count
             FROM market_estimate me WHERE me.scenario_id=$1`,
          [scenarioId],
        )
      ).rows[0]);
      expect(Number(persisted?.tam_entities_base)).toBeGreaterThan(0);
      expect(Number(persisted?.som_entities_base)).toBeLessThanOrEqual(Number(persisted?.sam_entities_base));
      expect(Number(persisted?.sam_entities_base)).toBeLessThanOrEqual(Number(persisted?.tam_entities_base));
      expect(persisted?.tam_revenue_base).toBeNull();
      expect(persisted?.spend_factor_count).toBe(0);
    });
  }, 60_000);

  it("pins market metrics only for one active scenario and records zero, multiple, and entity-only states", async () => {
    await bootstrapTestWorkspace();
    await runWithRuntimeContext(TEST_CONTEXT, async () => {
      const suffix = fixtureLabelSuffix();
      const primaryName = `[integration] comparison scenario primary ${suffix}`;
      const comparatorName = `[integration] comparison scenario comparator ${suffix}`;
      const primarySegmentId = await saveSegment({
        name: primaryName,
        entityUnit: "enterprise",
        naturalLanguage: primaryName,
        conditions: comparatorConditions,
      });
      const comparatorSegmentId = await saveSegment({
        name: comparatorName,
        entityUnit: "enterprise",
        naturalLanguage: comparatorName,
        conditions: comparatorConditions,
      });
      const primaryEstimateId = await calculateEstimate({
        segmentId: primarySegmentId,
        name: primaryName,
        entityUnit: "enterprise",
        conditions: comparatorConditions,
      });
      const comparatorEstimateId = await calculateEstimate({
        segmentId: comparatorSegmentId,
        name: comparatorName,
        entityUnit: "enterprise",
        conditions: comparatorConditions,
      });
      const [primarySegment, comparatorSegment] = await Promise.all([
        getSegment(primarySegmentId),
        getSegment(comparatorSegmentId),
      ]);
      expect(primarySegment?.result_id).toMatch(/^[0-9a-f-]{36}$/);
      expect(comparatorSegment?.result_id).toMatch(/^[0-9a-f-]{36}$/);

      const zeroScenarioComparisonId = await saveComparison({
        name: `[integration] zero active scenario ${suffix}`,
        segmentIds: [primarySegmentId, comparatorSegmentId],
      });
      const zeroScenarioComparison = await getComparison(zeroScenarioComparisonId);
      const zeroPrimary = zeroScenarioComparison?.members.find(
        (member) => member.query_result_id === primarySegment?.result_id,
      );
      expect(zeroPrimary?.market_estimate_id).toBeNull();
      expect(asObject(zeroPrimary?.normalized_metrics)).toMatchObject({
        active_market_scenario_count: 0,
        market_scenario_id: null,
      });
      expect(asObject(asObject(zeroPrimary?.normalized_metrics).metric_unavailable_reasons)).toMatchObject({
        market_scenario_id: "active_market_scenario_not_available",
        tam_entities_base: "active_market_scenario_not_available",
        annual_spend_per_entity: "active_market_scenario_not_available",
      });

      const selectedScenarioName = `[integration] selected comparison scenario ${suffix}`;
      const selectedScenarioId = await saveMarketScenario({
        estimateId: primaryEstimateId,
        queryResultId: primarySegment?.result_id,
        name: selectedScenarioName,
        factors: {
          currency: "KRW",
          horizonMonths: 6,
          annualSpendPerEntity: { low: 100_000, base: 120_000, high: 150_000 },
          serviceabilityRate: { low: 0.2, base: 0.3, high: 0.4 },
          attainableShare: { low: 0.05, base: 0.1, high: 0.15 },
        },
      });
      const selectedMarketEstimateId = await withWorkspaceTransaction(async (client) => (
        await client.query<{ market_estimate_id: string }>(
          "SELECT market_estimate_id FROM market_estimate WHERE scenario_id=$1",
          [selectedScenarioId],
        )
      ).rows[0]?.market_estimate_id);

      const pinnedComparisonId = await saveComparison({
        name: `[integration] one active scenario ${suffix}`,
        segmentIds: [primarySegmentId, comparatorSegmentId],
      });
      const pinnedComparison = await getComparison(pinnedComparisonId);
      const pinnedPrimary = pinnedComparison?.members.find(
        (member) => member.query_result_id === primarySegment?.result_id,
      );
      const pinnedMetrics = asObject(pinnedPrimary?.normalized_metrics);
      expect(pinnedPrimary?.market_estimate_id).toBe(selectedMarketEstimateId);
      expect(pinnedMetrics).toMatchObject({
        active_market_scenario_count: 1,
        market_scenario_id: selectedScenarioId,
        market_scenario_name: selectedScenarioName,
        market_horizon_months: 6,
        annual_spend_per_entity: "120000",
        annual_spend_per_entity_unit: "KRW/entity/year",
      });
      expect(pinnedMetrics.market_scenario_version).toEqual(expect.stringMatching(/^user-/));

      await saveMarketScenario({
        estimateId: primaryEstimateId,
        queryResultId: primarySegment?.result_id,
        name: `[integration] second active comparison scenario ${suffix}`,
        factors: {
          currency: "KRW",
          horizonMonths: 24,
          annualSpendPerEntity: { low: 180_000, base: 240_000, high: 300_000 },
          serviceabilityRate: { low: 0.25, base: 0.35, high: 0.45 },
          attainableShare: { low: 0.06, base: 0.11, high: 0.16 },
        },
      });

      const stillPinnedComparison = await getComparison(pinnedComparisonId);
      const stillPinnedPrimary = stillPinnedComparison?.members.find(
        (member) => member.query_result_id === primarySegment?.result_id,
      );
      expect(stillPinnedPrimary?.market_estimate_id).toBe(selectedMarketEstimateId);
      expect(asObject(stillPinnedPrimary?.normalized_metrics)).toMatchObject({
        market_scenario_id: selectedScenarioId,
        annual_spend_per_entity: "120000",
      });

      const ambiguousComparisonId = await saveComparison({
        name: `[integration] multiple active scenarios ${suffix}`,
        segmentIds: [primarySegmentId, comparatorSegmentId],
      });
      const ambiguousComparison = await getComparison(ambiguousComparisonId);
      const ambiguousPrimary = ambiguousComparison?.members.find(
        (member) => member.query_result_id === primarySegment?.result_id,
      );
      const ambiguousMetrics = asObject(ambiguousPrimary?.normalized_metrics);
      expect(ambiguousPrimary?.market_estimate_id).toBeNull();
      expect(ambiguousMetrics).toMatchObject({
        active_market_scenario_count: 2,
        market_scenario_id: null,
        market_scenario_name: null,
        market_scenario_version: null,
        market_horizon_months: null,
        annual_spend_per_entity: null,
      });
      expect(asObject(ambiguousMetrics.metric_unavailable_reasons)).toMatchObject({
        market_scenario_id: "multiple_active_market_scenarios_require_explicit_selection",
        tam_entities_base: "multiple_active_market_scenarios_require_explicit_selection",
        tam_revenue_base: "multiple_active_market_scenarios_require_explicit_selection",
        annual_spend_per_entity: "multiple_active_market_scenarios_require_explicit_selection",
      });

      const entityOnlyScenarioId = await saveMarketScenario({
        estimateId: comparatorEstimateId,
        queryResultId: comparatorSegment?.result_id,
        name: `[integration] entity-only comparison scenario ${suffix}`,
        factors: {
          currency: "KRW",
          horizonMonths: 12,
          annualSpendPerEntity: null,
          serviceabilityRate: { low: 0.2, base: 0.3, high: 0.4 },
          attainableShare: { low: 0.05, base: 0.1, high: 0.15 },
        },
      });
      const entityOnlyComparisonId = await saveComparison({
        name: `[integration] entity-only comparison ${suffix}`,
        segmentIds: [primarySegmentId, comparatorSegmentId],
      });
      const entityOnlyComparison = await getComparison(entityOnlyComparisonId);
      const entityOnlyMember = entityOnlyComparison?.members.find(
        (member) => member.query_result_id === comparatorSegment?.result_id,
      );
      const entityOnlyMetrics = asObject(entityOnlyMember?.normalized_metrics);
      expect(entityOnlyMember?.market_estimate_id).toMatch(/^[0-9a-f-]{36}$/);
      expect(entityOnlyMetrics).toMatchObject({
        active_market_scenario_count: 1,
        market_scenario_id: entityOnlyScenarioId,
        market_horizon_months: 12,
        annual_spend_per_entity: null,
        tam_revenue_base: null,
        sam_revenue_base: null,
        som_revenue_base: null,
      });
      expect(Number(entityOnlyMetrics.tam_entities_base)).toBeGreaterThan(0);
      expect(asObject(entityOnlyMetrics.metric_unavailable_reasons)).toMatchObject({
        tam_entities_base: null,
        tam_revenue_base: "annual_spend_evidence_not_available",
        sam_revenue_base: "annual_spend_evidence_not_available",
        som_revenue_base: "annual_spend_evidence_not_available",
        annual_spend_per_entity: "annual_spend_evidence_not_available",
      });
    });
  }, 60_000);

  it("keeps a direct estimate scenario reproducible without inventing saved-segment lineage", async () => {
    await bootstrapTestWorkspace();
    await runWithRuntimeContext(TEST_CONTEXT, async () => {
      const suffix = fixtureLabelSuffix();
      const queryName = `[integration] direct estimate scenario ${suffix}`;
      const directConditions = [{
        logic: "AND",
        enabled: true,
        conditions: comparatorConditions[0].conditions,
        groups: [{
          logic: "OR",
          enabled: false,
          conditions: [{
            sourceId: `custom:direct-scenario-${suffix}`,
            sourceKind: "custom",
            label: "disabled direct-scenario discriminator",
            unit: "enterprise",
            operator: "eq",
            value: true,
            matchStatus: "exact",
            enabled: true,
          }],
        }],
      }];
      const estimateId = await calculateEstimate({
        name: queryName,
        entityUnit: "enterprise",
        conditions: directConditions,
      });
      const queryResultId = await withWorkspaceTransaction(async (client) => (
        await client.query<{ result_id: string }>(
          `SELECT sqr.result_id
             FROM segment_query_result sqr
             JOIN segment_query sq USING (query_id)
            WHERE sqr.estimate_id=$1 AND sq.name=$2 AND sqr.cache_status='valid'
            ORDER BY sqr.executed_at DESC LIMIT 1`,
          [estimateId, queryName],
        )
      ).rows[0]?.result_id);
      expect(queryResultId).toMatch(/^[0-9a-f-]{36}$/);

      const scenarioId = await saveMarketScenario({
        estimateId,
        queryResultId,
        name: queryName,
        factors: {
          currency: "KRW",
          horizonMonths: 12,
          annualSpendPerEntity: { low: 80_000, base: 100_000, high: 120_000 },
          serviceabilityRate: { low: 0.2, base: 0.3, high: 0.4 },
          attainableShare: { low: 0.04, base: 0.08, high: 0.12 },
        },
      });
      expect(await readMarketScenario(scenarioId)).toMatchObject({
        base_query_result_id: queryResultId,
        saved_segment_id: null,
        saved_segment_version_no: null,
      });
    });
  }, 60_000);

  it("attaches the real saved-segment version and all normalized Opportunity condition classes", async () => {
    await bootstrapTestWorkspace();
    await runWithRuntimeContext(TEST_CONTEXT, async () => {
      const suffix = fixtureLabelSuffix();
      const contextualConditions = [{
        logic: "AND",
        conditions: [
          ...primaryConditions[0].conditions,
          {
            sourceId: "core_feature:has_online_sales",
            sourceKind: "core_feature",
            label: "온라인 판매 채널 보유",
            unit: "enterprise",
            operator: "eq",
            value: true,
            matchStatus: "exact",
            enabled: true,
          },
          {
            sourceId: "behavior:DOM-24-BEH-01",
            sourceKind: "behavior",
            label: "거의 매일 이용 행동",
            unit: "enterprise",
            operator: "exists",
            value: true,
            matchStatus: "exact",
            enabled: true,
          },
          {
            sourceId: "tag:DOM-24-TAG-01",
            sourceKind: "tag",
            label: "동기 태그 01",
            unit: "enterprise",
            operator: "eq",
            value: "small_business_digital.motivation_01",
            matchStatus: "exact",
            enabled: true,
          },
        ],
        groups: [{
          logic: "AND",
          enabled: false,
          conditions: [{
            sourceId: `feature:disabled_ancestor:${suffix}`,
            sourceKind: "feature",
            label: "비활성 상위 그룹 조건",
            unit: "enterprise",
            operator: "eq",
            value: true,
            matchStatus: "exact",
            enabled: true,
          }],
        }],
      }];
      const segmentId = await saveSegment({
        name: `[integration] research context ${suffix}`,
        entityUnit: "enterprise",
        naturalLanguage: `[integration:research-context:${suffix}] feature behavior subtype archetype`,
        conditions: contextualConditions,
      });
      await calculateEstimate({
        segmentId,
        name: `[integration] research context ${suffix}`,
        entityUnit: "enterprise",
        conditions: contextualConditions,
      });
      const segment = await getSegment(segmentId);
      expect(segment?.query_id).toMatch(/^[0-9a-f-]{36}$/);
      expect(segment?.result_id).toMatch(/^[0-9a-f-]{36}$/);
      expect(segment?.pinned_result_id).toBe(segment?.result_id);

      const previousResearchEnabled = process.env.OPENAI_RESEARCH_ENABLED;
      const previousApiKey = process.env.OPENAI_API_KEY;
      let researchJobId: string;
      try {
        process.env.OPENAI_RESEARCH_ENABLED = "false";
        delete process.env.OPENAI_API_KEY;
        const research = await createResearchJob({
          segmentId,
          targetSegment: `[integration] research context ${suffix}`,
          targetVariable: "research_context_condition_review",
          researchQuestion: "저장된 세그먼트 조건 문맥을 보존해 검토 가능한 아이디어를 제안하라.",
        });
        expect(research.configurationRequired).toBe(true);
        researchJobId = research.id;
      } finally {
        if (previousResearchEnabled === undefined) delete process.env.OPENAI_RESEARCH_ENABLED;
        else process.env.OPENAI_RESEARCH_ENABLED = previousResearchEnabled;
        if (previousApiKey === undefined) delete process.env.OPENAI_API_KEY;
        else process.env.OPENAI_API_KEY = previousApiKey;
      }

      const inputPayload = await withWorkspaceTransaction(async (client) => (
        await client.query<{ input_payload: Record<string, unknown> }>(
          "SELECT input_payload FROM research_job WHERE research_job_id=$1",
          [researchJobId],
        )
      ).rows[0].input_payload);
      const baseline = asObject(inputPayload.baseline);
      const provenance = asObject(inputPayload.snapshotProvenance);
      const classes = asObject(provenance.normalizedConditionClasses);
      const sourceCodes = (conditionClass: string) => (
        Array.isArray(classes[conditionClass]) ? classes[conditionClass] : []
      ).map((condition) => asObject(condition).sourceCode);

      expect(Object.keys(baseline).sort()).toEqual([
        "definition",
        "denominator",
        "estimateId",
        "lowBaseHigh",
        "sourceTitle",
        "status",
        "unit",
        "value",
        "version",
      ]);
      expect(provenance).toMatchObject({
        savedSegmentId: segmentId,
        savedSegmentVersionNo: segment?.resolved_version_no,
        queryId: segment?.query_id,
        resultId: segment?.result_id,
        pinnedResultId: segment?.pinned_result_id,
        filterDefinition: segment?.filter_json,
      });
      expect(sourceCodes("feature")).toContain("core_feature:has_online_sales");
      expect(sourceCodes("behavior")).toContain("behavior:DOM-24-BEH-01");
      expect(sourceCodes("behavior")).toContain("tag:DOM-24-TAG-01");
      expect(sourceCodes("feature")).not.toContain("tag:DOM-24-TAG-01");
      const featureConditions = Array.isArray(classes.feature) ? classes.feature.map(asObject) : [];
      expect(featureConditions.find((condition) => condition.sourceCode === `feature:disabled_ancestor:${suffix}`))
        .toMatchObject({ groupEnabled: false, enabled: false });
      expect(sourceCodes("subtype")).toContain("subtype:DOM-24-SUB-04");
      expect(sourceCodes("archetype")).toContain("archetype:ARC-06-001");
    });
  }, 60_000);

  it("keeps the Opportunity snapshot pinned while resolving the current segment result", async () => {
    await bootstrapTestWorkspace();
    await runWithRuntimeContext(TEST_CONTEXT, async () => {
      const suffix = fixtureLabelSuffix();
      const segmentId = await saveSegment({
        name: `[integration] opportunity current result ${suffix}`,
        entityUnit: "enterprise",
        naturalLanguage: `[integration:opportunity-current:${suffix}:v1] ARC-06-001`,
        conditions: comparatorConditions,
      });
      await calculateEstimate({
        segmentId,
        name: `[integration] opportunity current result ${suffix}`,
        entityUnit: "enterprise",
        conditions: comparatorConditions,
      });
      const pinnedSegment = await getSegment(segmentId);
      expect(pinnedSegment?.result_id).toMatch(/^[0-9a-f-]{36}$/);

      const opportunityId = await saveOpportunity({
        segmentId,
        estimateSnapshotId: pinnedSegment?.estimate_id ?? null,
        name: `[integration] opportunity current result ${suffix}`,
        problem: "저장 시점과 현재 계산을 구분해야 한다.",
        hypothesis: "새 세그먼트 버전은 현재 값에만 반영된다.",
        idea: "고정 snapshot 대비 현재 결과 비교",
        status: "researching",
      });

      await saveSegment({
        segmentId,
        name: `[integration] opportunity current result ${suffix}`,
        entityUnit: "enterprise",
        naturalLanguage: `[integration:opportunity-current:${suffix}:v2] ARC-06-001 and DOM-24-SUB-04`,
        conditions: primaryConditions,
      });
      await calculateEstimate({
        segmentId,
        name: `[integration] opportunity current result ${suffix}`,
        entityUnit: "enterprise",
        conditions: primaryConditions,
      });
      const currentSegment = await getSegment(segmentId);
      expect(currentSegment?.result_id).toMatch(/^[0-9a-f-]{36}$/);
      expect(currentSegment?.result_id).not.toBe(pinnedSegment?.result_id);
      expect(currentSegment?.estimate_id).not.toBe(pinnedSegment?.estimate_id);

      await saveOpportunity({
        opportunityId,
        expectedLockVersion: "1",
        segmentId,
        estimateSnapshotId: pinnedSegment?.estimate_id ?? null,
        name: `[integration] opportunity current result ${suffix} updated`,
        problem: "저장 시점과 현재 계산을 계속 구분해야 한다.",
        hypothesis: "같은 세그먼트의 수정은 생성 당시 snapshot을 유지한다.",
        idea: "고정 snapshot 대비 현재 결과 비교",
        status: "researching",
      });

      await expect(saveOpportunity({
        opportunityId,
        expectedLockVersion: "1",
        segmentId,
        estimateSnapshotId: pinnedSegment?.estimate_id ?? null,
        name: `[integration] stale opportunity edit ${suffix}`,
        problem: "오래된 편집 화면은 최신 저장을 덮어쓰면 안 된다.",
        hypothesis: "optimistic lock version이 충돌을 탐지한다.",
        idea: "stale edit rejection",
        status: "researching",
      })).rejects.toThrow("opportunity_edit_conflict");

      await expect(saveOpportunity({
        opportunityId,
        expectedLockVersion: "2",
        segmentId,
        estimateSnapshotId: currentSegment?.estimate_id ?? null,
        name: `[integration] forbidden result retarget ${suffix}`,
        problem: "같은 세그먼트의 최신 결과로 바꾸면 안 된다.",
        hypothesis: "생성 당시 query result는 immutable하다.",
        idea: "허용되지 않는 result retarget",
        status: "researching",
      })).rejects.toThrow("opportunity_primary_snapshot_is_immutable");

      const alternateSegmentId = await ensurePrimarySegment();
      expect(alternateSegmentId).not.toBe(segmentId);
      await expect(saveOpportunity({
        opportunityId,
        expectedLockVersion: "2",
        segmentId: alternateSegmentId,
        name: `[integration] forbidden opportunity retarget ${suffix}`,
        problem: "다른 세그먼트로 바꾸면 안 된다.",
        hypothesis: "primary snapshot은 immutable하다.",
        idea: "허용되지 않는 retarget",
        status: "researching",
      })).rejects.toThrow("opportunity_primary_snapshot_is_immutable");

      const opportunity = await getOpportunity(opportunityId);
      const estimateSnapshot = asObject(asObject(opportunity).estimate_snapshot);
      const currentEstimate = asObject(opportunity?.current_estimate);
      expect(opportunity?.name).toBe(`[integration] opportunity current result ${suffix} updated`);
      expect(opportunity?.segment_snapshots).toHaveLength(1);
      expect(estimateSnapshot.query_result_id).toBe(pinnedSegment?.result_id);
      expect(estimateSnapshot.saved_segment_version_no).toBe(pinnedSegment?.resolved_version_no);
      expect(currentEstimate.result_id).toBe(currentSegment?.result_id);
      expect(currentEstimate.resolved_version_no).toBe(currentSegment?.resolved_version_no);
      expect(currentEstimate.result_id).not.toBe(estimateSnapshot.query_result_id);
    });
  }, 60_000);

  it("rehashes reviewer feedback and materializes an approved Opportunity idea as a pinned AI hypothesis", async () => {
    await bootstrapTestWorkspace();
    await runWithRuntimeContext(TEST_CONTEXT, async () => {
      const suffix = fixtureLabelSuffix();
      const ideaConditions = [{
        logic: "AND",
        conditions: [
          ...primaryConditions[0].conditions,
          {
            sourceId: "core_feature:has_online_sales",
            sourceKind: "core_feature",
            label: "온라인 판매 채널 보유",
            unit: "enterprise",
            operator: "eq",
            value: true,
            matchStatus: "exact",
            referenceYear: 2025,
            enabled: true,
          },
          {
            sourceId: "behavior:DOM-24-BEH-01",
            sourceKind: "behavior",
            label: "거의 매일 이용 행동",
            unit: "enterprise",
            operator: "exists",
            value: true,
            matchStatus: "exact",
            referenceYear: 2025,
            enabled: true,
          },
        ],
        groups: [{
          logic: "AND",
          enabled: false,
          conditions: [{
            sourceId: "tag:DOM-24-TAG-01",
            sourceKind: "tag",
            label: "비활성 동기 태그",
            unit: "enterprise",
            operator: "eq",
            value: "small_business_digital.motivation_01",
            matchStatus: "exact",
            referenceYear: 2025,
            enabled: true,
          }],
        }],
      }];
      const segmentId = await saveSegment({
        name: `[integration] AI idea segment ${suffix}`,
        entityUnit: "enterprise",
        naturalLanguage: `[integration:ai-idea:${suffix}] subtype, archetype, feature and behavior`,
        conditions: ideaConditions,
      });
      await calculateEstimate({
        segmentId,
        name: `[integration] AI idea segment ${suffix}`,
        entityUnit: "enterprise",
        conditions: ideaConditions,
      });
      const segment = await getSegment(segmentId);
      expect(segment?.query_id).toMatch(/^[0-9a-f-]{36}$/);
      expect(segment?.result_id).toMatch(/^[0-9a-f-]{36}$/);

      const opportunityId = await saveOpportunity({
        segmentId,
        estimateSnapshotId: segment?.estimate_id ?? null,
        name: `[integration] AI idea opportunity ${suffix}`,
        problem: "근거가 연결된 아이디어 초안이 필요하다.",
        hypothesis: "검토 후에만 AI 가설을 노출하면 사실과 분리할 수 있다.",
        idea: "리서치 검토 Queue와 연결된 아이디어 brief",
        status: "researching",
      });
      const targetVariable = `opportunity_idea_brief:${opportunityId}`;
      const inputPayload = buildCanonicalResearchPayload({
        researchQuestion: "공식 근거와 명시적 불확실성으로 아이디어 초안을 작성하라.",
        targetSegment: `[integration] AI idea segment ${suffix}`,
        targetVariable,
        explicitBaseline: {
          estimateId: segment?.estimate_id,
          status: segment?.estimate_status ?? "not_estimable",
          value: segment?.count_base ?? null,
          lowBaseHigh: !segment || segment.count_low === null || segment.count_base === null || segment.count_high === null
            ? null
            : { low: segment.count_low, base: segment.count_base, high: segment.count_high },
          unit: "enterprise",
          denominator: "대한민국 기업",
          definition: "통합 테스트 estimate snapshot",
          version: "kr-v0.2.1",
          filter: [{ sourceId: "subtype:DOM-24-SUB-04" }, { sourceId: "archetype:ARC-06-001" }],
        },
        attachedBaseline: {
          savedSegmentId: segmentId,
          queryId: segment?.query_id,
          resultId: segment?.result_id,
          normalizedConditionClasses: {
            subtype: [
              {
                conditionClass: "subtype", sourceCode: "subtype:DOM-24-SUB-04",
                groupEnabled: true, enabled: true,
              },
              {
                conditionClass: "subtype", sourceCode: "subtype:DOM-24-SUB-03",
                groupEnabled: false, enabled: false,
              },
              {
                conditionClass: "subtype", sourceCode: "subtype:DOM-24-SUB-05",
                groupEnabled: true, enabled: true,
              },
            ],
            archetype: [
              {
                conditionClass: "archetype", sourceCode: "archetype:ARC-06-001",
                groupEnabled: true, enabled: true,
              },
              {
                conditionClass: "archetype", sourceCode: "archetype:ARC-06-002",
                groupEnabled: true, enabled: true,
              },
            ],
            feature: [{
              conditionClass: "feature", sourceCode: "core_feature:has_online_sales",
              groupEnabled: true, enabled: true,
            }],
            behavior: [
              {
                conditionClass: "behavior", sourceCode: "behavior:DOM-24-BEH-01",
                groupEnabled: true, enabled: true,
              },
              {
                conditionClass: "behavior", sourceCode: "tag:DOM-24-TAG-01",
                groupEnabled: false, enabled: false,
              },
            ],
          },
        },
      });
      const inputHash = contentHash(inputPayload);
      const fixtureConfidenceComponents = {
        sourceQuality: 50, recency: 50, populationFit: 50, geographyMatch: 50,
        definitionMatch: 50, directObservation: 50, proxyStrength: 50,
        dependencySupport: 50, sourceConsistency: 50, inferenceDirectness: 50,
        modelStability: 50, allocationIntegrity: 50,
      };
      const proposedPayload = {
        researchQuestion: inputPayload.researchQuestion,
        targetSegment: inputPayload.targetSegment,
        targetVariable,
        factors: [],
        lowBaseHigh: null,
        denominator: "대한민국 기업",
        geography: "KR",
        referenceYear: null,
        sources: [{
          institution: "Integration Fixture Institute",
          title: "Test-only cited opportunity evidence",
          url: "https://example.test/opportunity-idea-evidence",
          publicationDate: "2026-01-01",
          referenceYear: 2025,
          accessedAt: "2026-08-25T00:00:00.000Z",
          locator: "fixture interview summary 1",
          usedValue: "테스트 전용 문제 가설",
          sourceTier: 1,
        }],
        citations: [{ sourceIndex: 0, claim: "테스트 전용 인터뷰 요약이 문제 가설을 뒷받침한다." }],
        inferenceMethod: "fixture-only review contract",
        limitations: ["외부 provider를 호출하지 않은 통합 fixture"],
        providerConfidenceComponents: fixtureConfidenceComponents,
        serverConfidenceAssessment: {
          ruleVersion: "research-confidence-v1",
          score: 50,
          grade: "D",
          components: fixtureConfidenceComponents,
          penalties: [],
          signals: {
            sourceCount: 1, referencedSourceCount: 1, citationCount: 1, factorCount: 0,
            directFactorCount: 0, proxyFactorCount: 0, inferredFactorCount: 0,
            numericProposal: false, resultReferenceYear: null, asOfYear: 2026,
          },
        },
        confidenceComponents: fixtureConfidenceComponents,
        confidencePenalties: [],
        confidenceScore: 50,
        confidenceGrade: "D",
        confidenceRuleVersion: "research-confidence-v1",
        variablesToVerify: ["실제 고객 문제 강도"],
        opportunityIdeaBrief: {
          problemHypothesis: "수작업 근거 검토가 의사결정을 늦춘다.",
          solutionIdea: "근거가 연결된 검토 워크벤치",
          valueProposition: "검토 시간을 단축한다.",
          productPackage: null,
          pricingHypothesis: null,
          channels: ["산업 협회"],
          messageDraft: null,
          landingPageOutline: null,
          interviewGuide: ["현재 근거 검토에는 얼마나 걸리는가?"],
          experimentPlan: null,
          risks: ["내부 표본 편향"],
          evidenceSourceIndexes: [0],
          sourceFeatureIds: ["core_feature:has_online_sales"],
          sourceBehaviorIds: ["behavior:DOM-24-BEH-01"],
        },
      };

      const fixture = await withWorkspaceTransaction(async (client) => {
        const job = await client.query<{ research_job_id: string }>(
          `INSERT INTO research_job (
             workspace_id,saved_segment_id,query_id,research_question,target_segment,target_variable,
             provider,provider_model,output_schema_version,input_payload,input_hash,status,
             attempt_count,created_by_actor_id,finished_at
           ) VALUES ($1,$2,$3,$4,$5,$6,'openai','fixture-model','research-result-v2',$7::jsonb,$8,
                     'needs_review',1,$9,now()) RETURNING research_job_id`,
          [TEST_CONTEXT.workspaceId, segmentId, segment?.query_id, inputPayload.researchQuestion,
            inputPayload.targetSegment, targetVariable, JSON.stringify(inputPayload), inputHash, TEST_CONTEXT.actorId],
        );
        await client.query(
          `INSERT INTO research_job_step (research_job_id,step_no,step_name,status,input_hash)
           VALUES ($1,1,'provider_research','succeeded',$2)`,
          [job.rows[0].research_job_id, inputHash],
        );
        const revision = await client.query<{ proposed_revision_id: string }>(
          `INSERT INTO proposed_revision (
             workspace_id,research_job_id,target_kind,target_record_key,baseline_data_version,
             baseline_content_hash,baseline_payload,proposed_content_hash,proposed_payload,
             delta_summary,affected_segments,expected_recalculation,recommended_action,status,created_by_actor_id
           ) VALUES ($1,$2,'other',$3,'kr-v0.2.1',$4,$5::jsonb,$6,$7::jsonb,'{}'::jsonb,'[]'::jsonb,
                     '{}'::jsonb,'approve','pending_review',$8) RETURNING proposed_revision_id`,
          [TEST_CONTEXT.workspaceId, job.rows[0].research_job_id, targetVariable,
            contentHash(inputPayload.baseline), JSON.stringify(inputPayload.baseline),
            contentHash(proposedPayload), JSON.stringify(proposedPayload), TEST_CONTEXT.actorId],
        );
        const review = await client.query<{ review_item_id: string }>(
          `INSERT INTO review_item (workspace_id,proposed_revision_id,status,priority,created_by_actor_id)
           VALUES ($1,$2,'pending',2,$3) RETURNING review_item_id`,
          [TEST_CONTEXT.workspaceId, revision.rows[0].proposed_revision_id, TEST_CONTEXT.actorId],
        );
        return {
          jobId: job.rows[0].research_job_id,
          reviewId: review.rows[0].review_item_id,
          revisionId: revision.rows[0].proposed_revision_id,
        };
      });

      const feedbackNote = "분모를 enterprise로 고정하고 반증 질문을 보강하라.";
      await reviewRevision({
        reviewId: fixture.reviewId,
        decision: "request_more_research",
        note: feedbackNote,
      });
      const requeued = await withWorkspaceTransaction(async (client) => (
        await client.query<{
          status: string;
          input_payload: Record<string, unknown>;
          input_hash: string;
          step_input_hash: string;
        }>(
          `SELECT rj.status,rj.input_payload,rj.input_hash,rjs.input_hash AS step_input_hash
             FROM research_job rj JOIN research_job_step rjs USING (research_job_id)
            WHERE rj.research_job_id=$1`,
          [fixture.jobId],
        )
      ).rows[0]);
      expect(requeued.status).toBe("queued");
      expect(requeued.input_hash).toBe(contentHash(requeued.input_payload));
      expect(requeued.step_input_hash).toBe(requeued.input_hash);
      expect(requeued.input_payload).toMatchObject({
        reviewFeedback: [expect.objectContaining({ reviewId: fixture.reviewId, note: feedbackNote })],
      });

      const mismatchedInput = structuredClone(requeued.input_payload);
      const mismatchedSnapshot = asObject(asObject(mismatchedInput.snapshotProvenance).segmentContext);
      mismatchedSnapshot.resultId = crypto.randomUUID();
      const mismatchedHash = contentHash(mismatchedInput);
      await withWorkspaceTransaction(async (client) => {
        await client.query(
          "UPDATE research_job SET status='needs_review',input_payload=$2::jsonb,input_hash=$3 WHERE research_job_id=$1",
          [fixture.jobId, JSON.stringify(mismatchedInput), mismatchedHash],
        );
        await client.query(
          "UPDATE research_job_step SET input_hash=$2 WHERE research_job_id=$1 AND step_no=1",
          [fixture.jobId, mismatchedHash],
        );
        await client.query("UPDATE review_item SET status='pending' WHERE review_item_id=$1", [fixture.reviewId]);
      });
      await expect(reviewRevision({
        reviewId: fixture.reviewId,
        decision: "approve",
        note: "잘못 연결된 snapshot은 승인되어서는 안 된다.",
      })).rejects.toThrow("opportunity_idea_research_snapshot_mismatch");

      const restoredHash = contentHash(requeued.input_payload);
      await withWorkspaceTransaction(async (client) => {
        await client.query(
          "UPDATE research_job SET status='needs_review',input_payload=$2::jsonb,input_hash=$3 WHERE research_job_id=$1",
          [fixture.jobId, JSON.stringify(requeued.input_payload), restoredHash],
        );
        await client.query(
          "UPDATE research_job_step SET input_hash=$2 WHERE research_job_id=$1 AND step_no=1",
          [fixture.jobId, restoredHash],
        );
        await client.query("UPDATE review_item SET status='pending' WHERE review_item_id=$1", [fixture.reviewId]);
      });

      const updateIdeaSourceIds = async (sourceFeatureIds: string[], sourceBehaviorIds: string[]) => {
        const nextProposal = {
          ...proposedPayload,
          opportunityIdeaBrief: {
            ...proposedPayload.opportunityIdeaBrief,
            sourceFeatureIds,
            sourceBehaviorIds,
          },
        };
        await withWorkspaceTransaction(async (client) => {
          await client.query(
            `UPDATE proposed_revision
                SET proposed_payload=$2::jsonb,proposed_content_hash=$3
              WHERE proposed_revision_id=$1`,
            [fixture.revisionId, JSON.stringify(nextProposal), contentHash(nextProposal)],
          );
          await client.query("UPDATE review_item SET status='pending' WHERE review_item_id=$1", [fixture.reviewId]);
        });
      };

      await updateIdeaSourceIds(
        [`core_feature:not_registered_${suffix}`],
        ["behavior:DOM-24-BEH-01"],
      );
      await expect(reviewRevision({
        reviewId: fixture.reviewId,
        decision: "approve",
        note: "registry에 없는 feature 참조는 승인하지 않는다.",
      })).rejects.toThrow("approved_opportunity_idea_feature_reference_invalid");

      await updateIdeaSourceIds(
        ["core_feature:has_online_sales"],
        ["tag:DOM-24-TAG-01"],
      );
      await expect(reviewRevision({
        reviewId: fixture.reviewId,
        decision: "approve",
        note: "비활성 상위 그룹의 behavior 참조는 승인하지 않는다.",
      })).rejects.toThrow("approved_opportunity_idea_behavior_reference_invalid");

      const snapshotMismatchFeatureId = await withWorkspaceTransaction(async (client) => (
        await client.query<{ catalog_id: string }>(
          `SELECT catalog_id
             FROM v_condition_catalog
            WHERE queryable
              AND source_kind=ANY($1::text[])
              AND catalog_id<>$2
            ORDER BY catalog_id
            LIMIT 1`,
          [["core_feature", "domain_feature", "dimension_value"], "core_feature:has_online_sales"],
        )
      ).rows[0]?.catalog_id);
      expect(snapshotMismatchFeatureId).toMatch(/^(?:core_feature|domain_feature|dimension_value):/u);
      if (!snapshotMismatchFeatureId) throw new Error("integration_queryable_feature_fixture_missing");
      await updateIdeaSourceIds(
        [snapshotMismatchFeatureId],
        ["behavior:DOM-24-BEH-01"],
      );
      await expect(reviewRevision({
        reviewId: fixture.reviewId,
        decision: "approve",
        note: "다른 snapshot에만 존재하는 feature 참조는 승인하지 않는다.",
      })).rejects.toThrow("approved_opportunity_idea_feature_reference_invalid");

      await updateIdeaSourceIds(
        ["core_feature:has_online_sales"],
        ["behavior:DOM-24-BEH-01"],
      );
      await reviewRevision({
        reviewId: fixture.reviewId,
        decision: "approve",
        note: "통합 fixture의 AI 가설과 provenance를 승인한다.",
      });

      const approved = await withWorkspaceTransaction(async (client) => (
        await client.query<{
          source_kind: string;
          source_query_result_id: string | null;
          provider_model: string | null;
          source_subtype_ids: unknown;
          source_archetype_ids: unknown;
          content: Record<string, unknown>;
          job_status: string;
          review_status: string;
        }>(
          `SELECT ocv.source_kind,ocv.source_query_result_id,ocv.provider_model,
                  ocv.source_subtype_ids,ocv.source_archetype_ids,ocv.content,
                  rj.status AS job_status,ri.status AS review_status
             FROM opportunity_content_version ocv
             JOIN research_job rj ON rj.research_job_id=$2
             JOIN proposed_revision pr ON pr.research_job_id=rj.research_job_id
             JOIN review_item ri USING (proposed_revision_id)
            WHERE ocv.opportunity_id=$1 AND ocv.content_key='idea_brief'
            ORDER BY ocv.version_no DESC LIMIT 1`,
          [opportunityId, fixture.jobId],
        )
      ).rows[0]);
      expect(approved).toMatchObject({
        source_kind: "ai_hypothesis",
        source_query_result_id: segment?.result_id,
        provider_model: "fixture-model",
        job_status: "approved",
        review_status: "approved",
      });
      expect(approved.source_subtype_ids).toEqual(["DOM-24-SUB-04"]);
      expect(approved.source_archetype_ids).toEqual(["ARC-06-001"]);
      expect(asObject(approved.content).classification).toBe("ai_hypothesis");
      const approvedIdeaBrief = asObject(asObject(approved.content).ideaBrief);
      const approvedProvenance = asObject(asObject(approved.content).provenance);
      expect(approvedIdeaBrief.solutionIdea).toBe("근거가 연결된 검토 워크벤치");
      expect(approvedIdeaBrief.sourceFeatureIds).toEqual(["core_feature:has_online_sales"]);
      expect(approvedIdeaBrief.sourceBehaviorIds).toEqual(["behavior:DOM-24-BEH-01"]);
      expect(approvedProvenance.sourceIdVerification).toEqual({
        subtype: {
          candidates: ["DOM-24-SUB-04", "DOM-24-SUB-05"],
          verified: ["DOM-24-SUB-04"],
          rejected: ["DOM-24-SUB-05"],
        },
        archetype: {
          candidates: ["ARC-06-001", "ARC-06-002"],
          verified: ["ARC-06-001"],
          rejected: ["ARC-06-002"],
        },
      });
      const conditionVerification = asObject(approvedProvenance.sourceConditionVerification);
      const verifiedFeatures = Array.isArray(asObject(conditionVerification.feature).verified)
        ? (asObject(conditionVerification.feature).verified as unknown[]).map(asObject)
        : [];
      const verifiedBehaviors = Array.isArray(asObject(conditionVerification.behavior).verified)
        ? (asObject(conditionVerification.behavior).verified as unknown[]).map(asObject)
        : [];
      expect(asObject(conditionVerification.feature)).toMatchObject({
        candidates: ["core_feature:has_online_sales"],
        rejected: [],
      });
      expect(verifiedFeatures).toEqual([expect.objectContaining({
        conditionNamespace: "core_feature",
        sourceCode: "core_feature:has_online_sales",
        operator: "eq",
        value: true,
        entityUnit: "enterprise",
        referenceYear: 2025,
        catalogSourceKind: "core_feature",
      })]);
      expect(asObject(conditionVerification.behavior)).toMatchObject({
        candidates: ["behavior:DOM-24-BEH-01"],
        rejected: [],
      });
      expect(verifiedBehaviors).toEqual([expect.objectContaining({
        conditionNamespace: "domain_feature",
        sourceCode: "behavior:DOM-24-BEH-01",
        operator: "exists",
        value: true,
        entityUnit: "enterprise",
        referenceYear: 2025,
        catalogSourceKind: "behavior",
      })]);
    });
  }, 60_000);

  it("keeps approval, modified approval, rejection, and baseline retention transactionally distinct", async () => {
    await bootstrapTestWorkspace();
    await runWithRuntimeContext(TEST_CONTEXT, async () => {
      const suffix = fixtureLabelSuffix();
      const proposal = (label: string, withAggregate: boolean) => ({
        researchQuestion: `통합 테스트 숫자 제안 ${label}`,
        targetSegment: "통합 테스트 기업",
        targetVariable: `fixture_rate_${label}_${suffix}`,
        factors: [{
          name: "fixture rate",
          interval: { low: 0.1, base: 0.2, high: 0.3 },
          denominator: "통합 테스트 기업 전체",
          observationClass: "direct",
          sourceIndexes: [0],
        }],
        lowBaseHigh: withAggregate ? { low: 0.1, base: 0.2, high: 0.3 } : null,
        denominator: "통합 테스트 기업 전체",
        geography: "대한민국",
        referenceYear: 2025,
        sources: [{
          institution: "Integration Fixture Institute",
          title: `Decision fixture ${label}`,
          url: `https://example.test/decision-${label}`,
          publicationDate: "2026-01-01",
          referenceYear: 2025,
          accessedAt: "2026-08-25T00:00:00.000Z",
          locator: "table 1",
          usedValue: 0.2,
          sourceTier: 1,
        }],
        citations: [{ sourceIndex: 0, claim: "통합 fixture의 기준 비율은 0.2다." }],
        inferenceMethod: "test-only direct fixture",
        limitations: ["통합 테스트 전용 fixture"],
        providerConfidenceComponents: {
          sourceQuality: 80, recency: 80, populationFit: 80, geographyMatch: 80,
          definitionMatch: 80, directObservation: 80, proxyStrength: 80,
          dependencySupport: 80, sourceConsistency: 80, inferenceDirectness: 80,
          modelStability: 80, allocationIntegrity: 80,
        },
        variablesToVerify: [],
        recommendedAction: "approve",
        opportunityIdeaBrief: null,
      });
      const createReview = async (label: string) => withWorkspaceTransaction(async (client) => {
        const proposedPayload = proposal(label, false);
        const proposed = await client.query<{ proposed_revision_id: string }>(
          `INSERT INTO proposed_revision (
             workspace_id,target_kind,target_record_key,baseline_data_version,
             baseline_content_hash,baseline_payload,proposed_content_hash,proposed_payload,
             delta_summary,affected_segments,expected_recalculation,recommended_action,
             status,created_by_actor_id
           ) VALUES ($1,'other',$2,'kr-v0.2.1',$3,$4::jsonb,$5,$6::jsonb,'{}'::jsonb,'[]'::jsonb,
                     '{}'::jsonb,'approve','pending_review',$7)
           RETURNING proposed_revision_id`,
          [TEST_CONTEXT.workspaceId, `decision-fixture:${label}:${suffix}`, "b".repeat(64),
            JSON.stringify({
              estimateId: null, status: "not_estimable", value: null, lowBaseHigh: null,
              unit: "enterprise", denominator: "통합 테스트 기업 전체",
              definition: "통합 테스트 기준선", sourceTitle: null, version: "kr-v0.2.1",
            }), contentHash(proposedPayload), JSON.stringify(proposedPayload), TEST_CONTEXT.actorId],
        );
        const review = await client.query<{ review_item_id: string }>(
          `INSERT INTO review_item (workspace_id,proposed_revision_id,status,priority,created_by_actor_id)
           VALUES ($1,$2,'pending',2,$3) RETURNING review_item_id`,
          [TEST_CONTEXT.workspaceId, proposed.rows[0].proposed_revision_id, TEST_CONTEXT.actorId],
        );
        return { proposedRevisionId: proposed.rows[0].proposed_revision_id, reviewId: review.rows[0].review_item_id };
      });

      const approve = await createReview("approve");
      await expect(reviewRevision({
        reviewId: approve.reviewId,
        decision: "approve",
        note: "aggregate가 없는 숫자 제안은 승인하지 않는다.",
      })).rejects.toThrow("approved_research_proposal_invalid");

      const modified = await createReview("modified");
      await reviewRevision({
        reviewId: modified.reviewId,
        decision: "approve_modified",
        modification: proposal("modified", true),
        note: "aggregate를 명시한 수정안만 승인한다.",
      });

      const rejected = await createReview("reject");
      await reviewRevision({
        reviewId: rejected.reviewId,
        decision: "reject",
        note: "근거가 불충분해 거절한다.",
      });

      const kept = await createReview("keep");
      await reviewRevision({
        reviewId: kept.reviewId,
        decision: "keep_baseline",
        note: "기존 기준선을 유지한다.",
      });

      const states = await withWorkspaceTransaction(async (client) => (
        await client.query<{
          proposed_revision_id: string;
          revision_status: string;
          review_status: string;
          action: string | null;
          materialized_factor_id: string | null;
          decision_count: number;
        }>(
          `SELECT pr.proposed_revision_id,pr.status AS revision_status,ri.status AS review_status,
                  max(rd.action::text) AS action,pr.materialized_factor_id,
                  count(rd.sequence_no)::integer AS decision_count
             FROM proposed_revision pr
             JOIN review_item ri USING (proposed_revision_id)
             LEFT JOIN review_decision rd USING (review_item_id)
            WHERE pr.proposed_revision_id=ANY($1::uuid[])
            GROUP BY pr.proposed_revision_id,pr.status,ri.status,pr.materialized_factor_id`,
          [[approve.proposedRevisionId, modified.proposedRevisionId, rejected.proposedRevisionId, kept.proposedRevisionId]],
        )
      ).rows);
      const state = (id: string) => states.find((row) => row.proposed_revision_id === id);
      expect(state(approve.proposedRevisionId)).toMatchObject({
        revision_status: "pending_review", review_status: "pending", action: null, decision_count: 0,
      });
      expect(state(modified.proposedRevisionId)).toMatchObject({
        revision_status: "approved", review_status: "approved", action: "modify_and_approve", decision_count: 1,
        materialized_factor_id: expect.stringMatching(/^[0-9a-f-]{36}$/u),
      });
      expect(state(rejected.proposedRevisionId)).toMatchObject({
        revision_status: "rejected", review_status: "rejected", action: "reject", decision_count: 1,
        materialized_factor_id: null,
      });
      expect(state(kept.proposedRevisionId)).toMatchObject({
        revision_status: "rejected", review_status: "closed", action: "keep_existing", decision_count: 1,
        materialized_factor_id: null,
      });
    });
  }, 60_000);

  it("materializes a reviewed research factor without mutating baseline rows or invalidating an unbound dependency", async () => {
    await bootstrapTestWorkspace();
    await runWithRuntimeContext(TEST_CONTEXT, async () => {
      const suffix = fixtureLabelSuffix();
      const affectedSegmentId = await saveSegment({
        name: `[integration] review affected ${suffix}`,
        entityUnit: "enterprise",
        naturalLanguage: `[integration:review:${suffix}] ARC-06-001`,
        conditions: comparatorConditions,
      });
      await calculateEstimate({
        segmentId: affectedSegmentId,
        name: `[integration] review affected ${suffix}`,
        entityUnit: "enterprise",
        conditions: comparatorConditions,
      });
      const affected = await getSegment(affectedSegmentId);
      expect(affected?.result_id).toMatch(/^[0-9a-f-]{36}$/);

      const baselineBefore = await withWorkspaceTransaction(async (client) => (
        await client.query<{ count: string; fingerprint: string }>(
          `SELECT count(*)::text AS count,
                  md5(string_agg(estimate_id::text || ':' || coalesce(count_base::text,'null'), '|' ORDER BY estimate_id)) AS fingerprint
             FROM estimate WHERE data_layer='baseline' AND workspace_id IS NULL`,
        )
      ).rows[0]);
      const unrelatedBefore = await withWorkspaceTransaction(async (client) => (
        await client.query<{ result_id: string; cache_status: string }>(
          `SELECT result_id,cache_status FROM segment_query_result
            WHERE cache_status='valid' AND result_id<>$1 ORDER BY executed_at DESC LIMIT 1`,
          [affected?.result_id],
        )
      ).rows[0] ?? null);

      const fixture = await withWorkspaceTransaction(async (client) => {
        const proposedPayload = {
          researchQuestion: "통합 테스트의 인용된 직접 관측 비율을 검토하라.",
          targetSegment: "통합 테스트 소상공인",
          targetVariable: `fixture_prevalence_${suffix}`,
          factors: [{
            name: "fixture prevalence",
            interval: { low: 0.35, base: 0.4, high: 0.45 },
            denominator: "통합 테스트 소상공인 전체",
            observationClass: "direct",
            sourceIndexes: [0],
          }],
          lowBaseHigh: { low: 0.35, base: 0.4, high: 0.45 },
          denominator: "통합 테스트 소상공인 전체",
          geography: "대한민국",
          referenceYear: 2025,
          sources: [{
            institution: "Integration Fixture Institute",
            title: "Test-only reviewed source",
            url: "https://example.test/reviewed-factor",
            publicationDate: "2026-01-01",
            referenceYear: 2025,
            accessedAt: "2026-08-25T00:00:00.000Z",
            locator: "table 1",
            usedValue: 0.4,
            sourceTier: 1,
          }],
          citations: [{ sourceIndex: 0, claim: "통합 fixture의 기준 비율은 0.4다." }],
          inferenceMethod: "test-only direct fixture",
          limitations: ["Production provider output이 아닌 통합 테스트 전용 fixture다."],
          providerConfidenceComponents: {
            sourceQuality: 99, recency: 99, populationFit: 99, geographyMatch: 99,
            definitionMatch: 99, directObservation: 99, proxyStrength: 99,
            dependencySupport: 99, sourceConsistency: 99, inferenceDirectness: 99,
            modelStability: 99, allocationIntegrity: 99,
          },
          confidenceComponents: {
            sourceQuality: 100,
            recency: 100,
            populationFit: 100,
            geographyMatch: 100,
            definitionMatch: 100,
            directObservation: 100,
            proxyStrength: 100,
            dependencySupport: 100,
            sourceConsistency: 100,
            inferenceDirectness: 100,
            modelStability: 100,
            allocationIntegrity: 100,
          },
          confidencePenalties: [],
          confidenceScore: 100,
          confidenceGrade: "A",
          confidenceRuleVersion: "attacker-rule-v999",
          serverConfidenceAssessment: {
            ruleVersion: "attacker-rule-v999",
            score: 100,
            grade: "A",
            components: {
              sourceQuality: 100, recency: 100, populationFit: 100, geographyMatch: 100,
              definitionMatch: 100, directObservation: 100, proxyStrength: 100,
              dependencySupport: 100, sourceConsistency: 100, inferenceDirectness: 100,
              modelStability: 100, allocationIntegrity: 100,
            },
            penalties: [],
            signals: {
              sourceCount: 1, referencedSourceCount: 1, citationCount: 1, factorCount: 1,
              directFactorCount: 1, proxyFactorCount: 0, inferredFactorCount: 0,
              numericProposal: true, resultReferenceYear: 2025, asOfYear: 2026,
            },
          },
        };
        const proposed = await client.query<{ proposed_revision_id: string }>(
          `INSERT INTO proposed_revision (
             workspace_id,target_kind,target_record_key,baseline_data_version,
             baseline_content_hash,baseline_payload,proposed_content_hash,proposed_payload,
             delta_summary,affected_segments,expected_recalculation,recommended_action,
             status,created_by_actor_id
           ) VALUES ($1,'other',$2,'kr-v0.2.1',$3,$4::jsonb,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb,
                     'approve','pending_review',$10)
           RETURNING proposed_revision_id`,
          [TEST_CONTEXT.workspaceId, `fixture-review:${suffix}`, "b".repeat(64),
            JSON.stringify({ value: "baseline fixture", unit: "enterprise" }), contentHash(proposedPayload),
            JSON.stringify(proposedPayload), JSON.stringify({ changed: ["fixture_prevalence"] }),
            JSON.stringify([affectedSegmentId]), JSON.stringify({ invalidateSnapshots: true }), TEST_CONTEXT.actorId],
        );
        const review = await client.query<{ review_item_id: string }>(
          `INSERT INTO review_item (workspace_id,proposed_revision_id,status,priority,created_by_actor_id)
           VALUES ($1,$2,'pending',2,$3) RETURNING review_item_id`,
          [TEST_CONTEXT.workspaceId, proposed.rows[0].proposed_revision_id, TEST_CONTEXT.actorId],
        );
        return { proposedRevisionId: proposed.rows[0].proposed_revision_id, reviewId: review.rows[0].review_item_id };
      });

      await reviewRevision({
        reviewId: fixture.reviewId,
        decision: "approve",
        note: "Integration fixture: approve a cited numeric factor; no provider call.",
      });

      const verification = await withWorkspaceTransaction(async (client) => {
        const approved = (await client.query<{
          revision_status: string;
          review_status: string;
          action: string;
          publication_status: string;
          cache_status: string;
          invalidated_at: Date | null;
          audit_count: number;
          materialized_factor_id: string;
          value_base: string;
          source_count: number;
          confidence_score: number;
          confidence_grade: string;
          confidence_rule_version: string;
        }>(
          `SELECT pr.status AS revision_status,ri.status AS review_status,rd.action,
                  drv.status AS publication_status,sqr.cache_status,sqr.invalidated_at,
                  factor.approved_factor_id AS materialized_factor_id,
                  factor.value_base::text,
                  factor.confidence_score::integer,
                  factor.confidence_grade::text,
                  factor.confidence_rule_version,
                  (SELECT count(*)::integer FROM approved_research_factor_source source
                    WHERE source.approved_factor_id=factor.approved_factor_id) AS source_count,
                  (SELECT count(*)::integer FROM audit_event ae
                    WHERE ae.aggregate_type='review_item' AND ae.aggregate_id=ri.review_item_id::text) AS audit_count
             FROM proposed_revision pr
             JOIN review_item ri USING (proposed_revision_id)
             JOIN review_decision rd USING (review_item_id)
             JOIN data_release_version drv ON drv.publication_version_id=pr.approved_publication_version_id
             JOIN approved_research_factor factor ON factor.approved_factor_id=pr.materialized_factor_id
             JOIN segment_query_result sqr ON sqr.result_id=$2
            WHERE pr.proposed_revision_id=$1`,
          [fixture.proposedRevisionId, affected?.result_id],
        )).rows[0];
        const baselineAfter = (await client.query<{ count: string; fingerprint: string }>(
          `SELECT count(*)::text AS count,
                  md5(string_agg(estimate_id::text || ':' || coalesce(count_base::text,'null'), '|' ORDER BY estimate_id)) AS fingerprint
             FROM estimate WHERE data_layer='baseline' AND workspace_id IS NULL`,
        )).rows[0];
        const unrelatedAfter = unrelatedBefore ? (await client.query<{ cache_status: string }>(
          "SELECT cache_status FROM segment_query_result WHERE result_id=$1",
          [unrelatedBefore.result_id],
        )).rows[0]?.cache_status : null;
        return { approved, baselineAfter, unrelatedAfter };
      });

      expect(verification.approved).toMatchObject({
        revision_status: "approved",
        review_status: "approved",
        action: "approve",
        publication_status: "approved",
        cache_status: "valid",
        audit_count: 1,
        value_base: "0.4",
        source_count: 1,
      });
      expect(verification.approved.materialized_factor_id).toMatch(/^[0-9a-f-]{36}$/);
      expect(verification.approved.confidence_score).toBeLessThan(100);
      expect(verification.approved.confidence_grade).not.toBe("A");
      expect(verification.approved.confidence_rule_version).toBe("research-confidence-v1");
      expect(verification.approved.invalidated_at).toBeNull();
      expect(verification.baselineAfter).toEqual(baselineBefore);
      if (unrelatedBefore) expect(verification.unrelatedAfter).toBe(unrelatedBefore.cache_status);
    });
  }, 60_000);

  it("requeues a configuration-required job only after provider configuration is present", async () => {
    const context: RuntimeContext = {
      workspaceId: crypto.randomUUID(),
      actorId: crypto.randomUUID(),
    };
    await withWorkspaceTransaction(async (client) => {
      await client.query(
        `INSERT INTO workspace (workspace_id,workspace_key,name)
         VALUES ($1,$2,'Research requeue integration test')`,
        [context.workspaceId, `research-requeue-${context.workspaceId}`],
      );
      await client.query(
        `INSERT INTO workspace_member (workspace_id,actor_id,role)
         VALUES ($1,$2,'owner')`,
        [context.workspaceId, context.actorId],
      );
    }, context);

    try {
      vi.stubEnv("OPENAI_RESEARCH_ENABLED", "false");
      vi.stubEnv("OPENAI_API_KEY", "");
      await runWithRuntimeContext(context, async () => {
        const created = await createResearchJob({
          targetSegment: "대한민국 집계 시장",
          targetVariable: `requeue_contract_${crypto.randomUUID()}`,
          researchQuestion: "설정 완료 후 동일한 canonical payload를 외부 조사 Queue에 다시 등록한다.",
          baseline: {
            status: "unavailable",
            value: null,
            definition: "직접 Baseline 없음",
            denominator: "대한민국 집계 시장",
          },
        });
        expect(created.configurationRequired).toBe(true);
        await expect(requeueResearchJob(created.id)).rejects.toThrow(/OPENAI_RESEARCH_ENABLED=true/u);

        vi.stubEnv("OPENAI_RESEARCH_ENABLED", "true");
        vi.stubEnv("OPENAI_API_KEY", "integration-key-present-but-never-called");
        await requeueResearchJob(created.id);

        const state = await withWorkspaceTransaction(async (client) => (
          await client.query<{
            status: string;
            step_status: string;
            event_count: number;
          }>(
            `SELECT job.status,step.status AS step_status,
                    (SELECT count(*)::integer FROM research_job_event event
                      WHERE event.research_job_id=job.research_job_id
                        AND event.event_type='requeued_after_configuration') AS event_count
               FROM research_job job
               JOIN research_job_step step USING (research_job_id)
              WHERE job.research_job_id=$1 AND step.step_no=1`,
            [created.id],
          )
        ).rows[0]);
        expect(state).toEqual({ status: "queued", step_status: "queued", event_count: 1 });
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
