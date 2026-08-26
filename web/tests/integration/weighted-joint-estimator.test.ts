import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  closeDatabasePool,
  runWithRuntimeContext,
  withWorkspaceTransaction,
  type RuntimeContext,
} from "@/server/db";
import { interpretNaturalLanguage } from "@/server/services/segment-workflow";
import { calculateEstimate, saveSegment } from "@/server/services/segment-workflow";


const databaseEnabled = process.env.RUN_DATABASE_INTEGRATION === "1";

const TEST_CONTEXT: RuntimeContext = {
  workspaceId: "00000000-0000-4000-8000-0000000000e2",
  actorId: "00000000-0000-4000-8000-0000000000e3",
};

async function calibrationCondition(unit: string, dimension: string, value: string) {
  return withWorkspaceTransaction(async (client) => {
    const row = await client.query<{ catalog_id: string; display_value_ko: string }>(
      `SELECT catalog_id,display_value_ko
         FROM production.calibration_dimension_catalog
        WHERE target_unit=$1 AND dimension_code=$2 AND dimension_value=$3 AND queryable`,
      [unit, dimension, value],
    );
    if (!row.rows[0]) throw new Error(`calibration_condition_missing:${unit}:${dimension}:${value}`);
    return {
      sourceId: row.rows[0].catalog_id,
      sourceKind: "calibration_dimension",
      label: row.rows[0].display_value_ko,
      unit,
      operator: "eq",
      value,
      matchStatus: "exact",
      enabled: true,
    };
  }, TEST_CONTEXT);
}

describe.runIf(databaseEnabled)("weighted synthetic joint estimator", () => {
  beforeAll(async () => {
    await withWorkspaceTransaction(async (client) => {
      await client.query(
        `INSERT INTO workspace (workspace_id,workspace_key,name)
         VALUES ($1,'integration-weighted-joint','Weighted joint integration test')
         ON CONFLICT (workspace_id) DO NOTHING`,
        [TEST_CONTEXT.workspaceId],
      );
      await client.query(
        `INSERT INTO workspace_member (workspace_id,actor_id,role)
         VALUES ($1,$2,'owner')
         ON CONFLICT (workspace_id,actor_id) DO NOTHING`,
        [TEST_CONTEXT.workspaceId, TEST_CONTEXT.actorId],
      );
    });
  });
  afterAll(async () => closeDatabasePool());

  it("materializes a deterministic household joint with proxy disclosure and lineage", async () => {
    await runWithRuntimeContext(TEST_CONTEXT, async () => {
      const conditions = [{
        logic: "AND",
        conditions: await Promise.all([
          calibrationCondition("household", "region_group", "capital_region"),
          calibrationCondition("household", "children_presence", "true"),
          calibrationCondition("household", "dual_income_proxy", "true"),
        ]),
      }];
      const name = `[integration] weighted household joint ${crypto.randomUUID()}`;
      const segmentId = await saveSegment({
        name,
        entityUnit: "household",
        naturalLanguage: "수도권 자녀가 있는 맞벌이 가구",
        conditions,
      });
      const estimateId = await calculateEstimate({ segmentId, name, entityUnit: "household", conditions });
      const repeatedEstimateId = await calculateEstimate({ segmentId, name, entityUnit: "household", conditions });
      expect(repeatedEstimateId).toBe(estimateId);

      const persisted = await withWorkspaceTransaction(async (client) => {
        const estimate = await client.query<{
          status: string;
          method_code: string;
          count_low: string;
          count_base: string;
          count_high: string;
          share_low: string;
          share_base: string;
          share_high: string;
        }>("SELECT status,method_code,count_low,count_base,count_high,share_low,share_base,share_high FROM estimate WHERE estimate_id=$1", [estimateId]);
        const counts = await client.query<{
          components: number;
          dependencies: number;
          confidence: number;
          proxy_gaps: number;
        }>(
          `SELECT
             (SELECT count(*)::integer FROM estimate_component WHERE estimate_id=$1) AS components,
             (SELECT count(*)::integer FROM estimate_dependency WHERE estimate_id=$1) AS dependencies,
             (SELECT count(*)::integer FROM confidence_assessment WHERE estimate_id=$1) AS confidence,
             (SELECT count(*)::integer FROM validation_gap WHERE estimate_id=$1 AND gap_type='weak_proxy') AS proxy_gaps`,
          [estimateId],
        );
        return { estimate: estimate.rows[0], counts: counts.rows[0] };
      }, TEST_CONTEXT);
      expect(persisted.estimate.status).toBe("estimated");
      expect(persisted.estimate.method_code).toBe("weighted_synthetic_joint_with_proxy_fields");
      expect(Number(persisted.estimate.count_low)).toBeLessThanOrEqual(Number(persisted.estimate.count_base));
      expect(Number(persisted.estimate.count_base)).toBeLessThanOrEqual(Number(persisted.estimate.count_high));
      expect(Number(persisted.estimate.share_low)).toBeLessThanOrEqual(Number(persisted.estimate.share_base));
      expect(Number(persisted.estimate.share_base)).toBeLessThanOrEqual(Number(persisted.estimate.share_high));
      expect(Number(persisted.estimate.count_base)).toBeGreaterThan(0);
      expect(persisted.counts.components).toBeGreaterThanOrEqual(4);
      expect(persisted.counts.dependencies).toBeGreaterThanOrEqual(2);
      expect(persisted.counts.confidence).toBe(1);
      expect(persisted.counts.proxy_gaps).toBe(1);
    });
  });

  it("evaluates nested AND, OR, and NOT against the joint cells without multiplying marginals", async () => {
    await runWithRuntimeContext(TEST_CONTEXT, async () => {
      const sex = await calibrationCondition("person", "sex", "female");
      const age20s = await calibrationCondition("person", "age_band", "20-29");
      const age30s = await calibrationCondition("person", "age_band", "30-39");
      const seoul = await calibrationCondition("person", "region_code", "11");
      const conditions = [{
        logic: "AND",
        conditions: [sex],
        groups: [
          { logic: "OR", conditions: [age20s, age30s] },
          { logic: "NOT", conditions: [seoul] },
        ],
      }];
      const name = `[integration] nested joint logic ${crypto.randomUUID()}`;
      const segmentId = await saveSegment({
        name,
        entityUnit: "person",
        naturalLanguage: "서울 이외 지역의 20~30대 여성",
        conditions,
      });
      const estimateId = await calculateEstimate({ segmentId, name, entityUnit: "person", conditions });
      const comparison = await withWorkspaceTransaction(async (client) => {
        const estimate = await client.query<{ method_code: string; count_base: string; status: string }>(
          "SELECT method_code,count_base,status FROM estimate WHERE estimate_id=$1",
          [estimateId],
        );
        const expected = await client.query<{ weighted_count: string }>(
          `SELECT sum(weighted_count)::text AS weighted_count
             FROM production.v_weighted_joint_cell
            WHERE target_unit='person'
              AND dimension_values ->> 'sex'='female'
              AND dimension_values ->> 'age_band' IN ('20-29','30-39')
              AND dimension_values ->> 'region_code'<>'11'`,
        );
        return { estimate: estimate.rows[0], expected: expected.rows[0] };
      }, TEST_CONTEXT);
      expect(comparison.estimate.status).toBe("estimated");
      expect(comparison.estimate.method_code).toBe("weighted_synthetic_joint");
      expect(Number(comparison.estimate.count_base)).toBeCloseTo(Number(comparison.expected.weighted_count), 6);
    });
  });

  it("recognizes and reuses an exact registered Gold Query snapshot", async () => {
    await runWithRuntimeContext(TEST_CONTEXT, async () => {
      const phrase = "수도권 초등학생 자녀 맞벌이 가구";
      const interpretation = await interpretNaturalLanguage(phrase);
      expect(interpretation.conditions).toHaveLength(1);
      expect(interpretation.conditions[0]).toMatchObject({
        sourceKind: "gold_query",
        sourceId: "gold_query:GOLD-02",
        value: "GOLD-02",
        matchStatus: "exact",
        entityUnit: "household",
      });
      const condition = interpretation.conditions[0];
      const conditions = [{
        logic: "AND",
        conditions: [{
          sourceId: condition.sourceId,
          sourceKind: condition.sourceKind,
          label: condition.label,
          unit: condition.entityUnit,
          operator: condition.operator,
          value: condition.value,
          matchStatus: condition.matchStatus,
          enabled: true,
        }],
      }];
      const name = `[integration] registered gold query ${crypto.randomUUID()}`;
      const segmentId = await saveSegment({ name, entityUnit: "household", naturalLanguage: phrase, conditions });
      const estimateId = await calculateEstimate({ segmentId, name, entityUnit: "household", conditions });
      const comparison = await withWorkspaceTransaction(async (client) => {
        const estimate = await client.query<{ method_code: string; count_base: string }>(
          "SELECT method_code,count_base FROM estimate WHERE estimate_id=$1",
          [estimateId],
        );
        const gold = await client.query<{ count_base: string }>(
          "SELECT count_base FROM production.v_gold_query_result WHERE query_id='GOLD-02'",
        );
        return { estimate: estimate.rows[0], gold: gold.rows[0] };
      }, TEST_CONTEXT);
      expect(comparison.estimate.method_code).toBe("registered_gold_query_snapshot");
      expect(Number(comparison.estimate.count_base)).toBeCloseTo(Number(comparison.gold.count_base), 6);
    });
  });

  it("applies a registered Feature prevalence as an explicit bounded conditional Proxy", async () => {
    await runWithRuntimeContext(TEST_CONTEXT, async () => {
      const age = await calibrationCondition("person", "age_band", "20-29");
      const feature = await withWorkspaceTransaction(async (client) => {
        const row = await client.query<{
          catalog_id: string;
          label_ko: string;
          selected_value: string;
        }>(
          `SELECT catalog.catalog_id,catalog.label_ko,prevalence.selected_value
             FROM production.v_workbench_condition_catalog catalog
             JOIN production.v_feature_prevalence prevalence
               ON prevalence.domain_feature_id=catalog.source_record_id
            WHERE catalog.catalog_id='domain_feature:DOM-01-FEAT-01'`,
        );
        if (!row.rows[0]) throw new Error("conditional_feature_missing");
        return {
          sourceId: row.rows[0].catalog_id,
          sourceKind: "domain_feature",
          label: row.rows[0].label_ko,
          unit: "person",
          operator: "eq",
          value: row.rows[0].selected_value,
          matchStatus: "exact",
          enabled: true,
        };
      }, TEST_CONTEXT);
      const conditions = [{ logic: "AND", conditions: [age, feature] }];
      const name = `[integration] conditional prevalence ${crypto.randomUUID()}`;
      const segmentId = await saveSegment({
        name,
        entityUnit: "person",
        naturalLanguage: "20대 음악·오디오 팟캐스트·토크 이용자",
        conditions,
      });
      const estimateId = await calculateEstimate({ segmentId, name, entityUnit: "person", conditions });
      const persisted = await withWorkspaceTransaction(async (client) => {
        const estimate = await client.query<{ method_code: string; status: string; count_base: string }>(
          "SELECT method_code,status,count_base FROM estimate WHERE estimate_id=$1",
          [estimateId],
        );
        const factorCount = await client.query<{ count: number }>(
          "SELECT count(*)::integer AS count FROM estimate_component WHERE estimate_id=$1 AND component_type='conditional_prevalence'",
          [estimateId],
        );
        return { estimate: estimate.rows[0], factorCount: factorCount.rows[0].count };
      }, TEST_CONTEXT);
      expect(persisted.estimate.status).toBe("estimated");
      expect(persisted.estimate.method_code).toBe("weighted_synthetic_joint_with_conditional_proxy");
      expect(Number(persisted.estimate.count_base)).toBeGreaterThan(0);
      expect(persisted.factorCount).toBe(1);
    });
  });
});
