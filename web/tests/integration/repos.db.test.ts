import { afterAll, describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";
import crypto from "node:crypto";

vi.mock("server-only", () => ({}));

import {
  closeDatabasePool,
  deterministicLocalRuntimeContext,
  getRuntimeContext,
  queryRows,
  runWithRuntimeContext,
  withWorkspaceTransaction,
} from "@/server/db";

const databaseEnabled =
  process.env.RUN_DATABASE_INTEGRATION === "1" ||
  Boolean(process.env.MARKET_ENGINE_DATABASE_URL ?? process.env.DATABASE_URL ?? process.env.POSTGRES_URL);

const SECURITY_FIXTURE = {
  hiddenWorkspaceId: crypto.randomUUID(),
  currentEstimateId: crypto.randomUUID(),
  hiddenEstimateId: crypto.randomUUID(),
  queryId: crypto.randomUUID(),
  alternateQueryId: crypto.randomUUID(),
  mismatchedUnitQueryId: crypto.randomUUID(),
  hiddenQueryId: crypto.randomUUID(),
  currentGroupId: crypto.randomUUID(),
  hiddenGroupId: crypto.randomUUID(),
  currentConditionId: crypto.randomUUID(),
  hiddenConditionId: crypto.randomUUID(),
  currentResultId: crypto.randomUUID(),
  alternateResultId: crypto.randomUUID(),
  hiddenResultId: crypto.randomUUID(),
  currentSavedSegmentId: crypto.randomUUID(),
  hiddenScenarioId: crypto.randomUUID(),
} as const;

async function expectRestrictedSqlFailure(
  client: PoolClient,
  savepoint: string,
  sql: string,
  params: readonly unknown[] = [],
  expectedError: RegExp = /permission denied|row-level security|append-only|immutable|lineage/iu,
): Promise<void> {
  await client.query(`SAVEPOINT ${savepoint}`);
  try {
    await expect(client.query(sql, [...params])).rejects.toThrow(expectedError);
  } finally {
    await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
    await client.query(`RELEASE SAVEPOINT ${savepoint}`);
  }
}

describe.runIf(databaseEnabled)("server database boundary", () => {
  afterAll(async () => closeDatabasePool());

  it("uses parameterized global reads", async () => {
    const rows = await queryRows<{ value: string }>("SELECT $1::text AS value", ["real-postgres"]);
    expect(rows).toEqual([{ value: "real-postgres" }]);
  });

  it("sets transaction-local workspace and actor context", async () => {
    const context = getRuntimeContext();
    const settings = await withWorkspaceTransaction(async (client) => {
      const result = await client.query<{ workspace_id: string; actor_id: string }>(`
        SELECT
          current_setting('market_engine.workspace_id', true) AS workspace_id,
          current_setting('market_engine.actor_id', true) AS actor_id
      `);
      return result.rows[0];
    });
    expect(settings).toEqual({ workspace_id: context.workspaceId, actor_id: context.actorId });
  });

  it("uses a request-scoped verified context without leaking it", async () => {
    const scoped = {
      workspaceId: deterministicLocalRuntimeContext.workspaceId,
      actorId: deterministicLocalRuntimeContext.actorId,
    };
    const observed = await runWithRuntimeContext(scoped, async () => getRuntimeContext());
    expect(observed).toEqual(scoped);
    expect(getRuntimeContext()).toEqual(deterministicLocalRuntimeContext);
  });

  it("does not silently use local auth context in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("WORKBENCH_AUTH_MODE", "");
    vi.stubEnv("WORKBENCH_ACCESS_SECRET", "");
    try {
      expect(() => getRuntimeContext()).toThrow("verified_runtime_context_required_in_production");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("permits only an explicitly configured production secret-session context", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("WORKBENCH_AUTH_MODE", "secret");
    vi.stubEnv("WORKBENCH_ACCESS_SECRET", "integration-only-secret-that-is-long-enough");
    vi.stubEnv("WORKBENCH_DEFAULT_WORKSPACE_ID", deterministicLocalRuntimeContext.workspaceId);
    vi.stubEnv("WORKBENCH_DEFAULT_ACTOR_ID", deterministicLocalRuntimeContext.actorId);
    try {
      expect(getRuntimeContext()).toEqual(deterministicLocalRuntimeContext);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("enforces parent-owned RLS and immutable snapshots under the restricted app role", async () => {
    await withWorkspaceTransaction(async (client) => {
      await client.query(
        `INSERT INTO workspace (workspace_id,workspace_key,name)
         VALUES
           ($1::uuid,'local-default','Local default workspace'),
           ($2::uuid,'integration-hidden-security-' || ($2::uuid)::text,'Hidden security fixture')
         ON CONFLICT (workspace_id) DO NOTHING`,
        [deterministicLocalRuntimeContext.workspaceId, SECURITY_FIXTURE.hiddenWorkspaceId],
      );
      const baseline = (await client.query<{ estimate_id: string }>(
        `SELECT estimate_id FROM estimate
          WHERE workspace_id IS NULL AND data_layer='baseline' AND status='estimated'
          ORDER BY estimate_id LIMIT 1`,
      )).rows[0];
      expect(baseline?.estimate_id).toBeTruthy();

      await client.query(
        `WITH baseline AS (
           SELECT * FROM estimate WHERE estimate_id=$1
         ), fixture(estimate_id,workspace_id,external_key,subject_id) AS (
           VALUES
             ($2::uuid,$3::uuid,'security-fixture-current-' || $2::text,'security-current'),
             ($4::uuid,$5::uuid,'security-fixture-hidden-' || $4::text,'security-hidden')
         )
         INSERT INTO estimate (
           estimate_id,external_estimate_key,workspace_id,subject_type,subject_id,entity_unit,
           geography_id,period_id,denominator_definition,
           count_low,count_base,count_high,share_low,share_base,share_high,
           method_code,formula,precision_rule,model_version_id,run_id,status,data_version,
           data_layer,approval_status,calculation_input_hash,dependency_fingerprint,
           created_by_actor_id
         )
         SELECT fixture.estimate_id,fixture.external_key,fixture.workspace_id,'query',fixture.subject_id,
                baseline.entity_unit,baseline.geography_id,baseline.period_id,
                'Restricted-role fixture preserving the copied baseline entity unit and denominator.',
                baseline.count_low,baseline.count_base,baseline.count_high,
                baseline.share_low,baseline.share_base,baseline.share_high,
                'security_fixture','copied approved interval for an RLS-only fixture',baseline.precision_rule,
                baseline.model_version_id,baseline.run_id,'estimated','security-fixture-v1',
                'user_scenario','not_required',repeat('a',64),repeat('a',64),$6
           FROM baseline CROSS JOIN fixture
         ON CONFLICT (estimate_id) DO NOTHING`,
        [baseline.estimate_id, SECURITY_FIXTURE.currentEstimateId,
          deterministicLocalRuntimeContext.workspaceId, SECURITY_FIXTURE.hiddenEstimateId,
          SECURITY_FIXTURE.hiddenWorkspaceId, deterministicLocalRuntimeContext.actorId],
      );
      await client.query(
        `INSERT INTO segment_query (
           query_id,workspace_id,created_by_actor_id,name,filter_json,primary_entity_unit,
           geography_scope,as_of_date,query_hash,data_version
         ) SELECT $1,$3,$4,'Restricted-role fixture','{}'::jsonb,e.entity_unit,
                  '{"level":"country","codes":["KR"]}'::jsonb,current_date,
                  $5,'security-fixture-v1'
             FROM estimate e WHERE e.estimate_id=$2
         ON CONFLICT (query_id) DO NOTHING`,
        [SECURITY_FIXTURE.queryId, SECURITY_FIXTURE.currentEstimateId,
          deterministicLocalRuntimeContext.workspaceId, deterministicLocalRuntimeContext.actorId,
          crypto.createHash("sha256").update(SECURITY_FIXTURE.queryId).digest("hex")],
      );
      await client.query(
        `INSERT INTO segment_query (
           query_id,workspace_id,created_by_actor_id,name,filter_json,primary_entity_unit,
           geography_scope,as_of_date,query_hash,data_version
         ) SELECT $1,$3,$4,'Hidden restricted-role fixture','{}'::jsonb,e.entity_unit,
                  '{"level":"country","codes":["KR"]}'::jsonb,current_date,
                  $5,'security-fixture-v1'
             FROM estimate e WHERE e.estimate_id=$2
         ON CONFLICT (query_id) DO NOTHING`,
        [SECURITY_FIXTURE.hiddenQueryId, SECURITY_FIXTURE.hiddenEstimateId,
          SECURITY_FIXTURE.hiddenWorkspaceId, deterministicLocalRuntimeContext.actorId,
          crypto.createHash("sha256").update(SECURITY_FIXTURE.hiddenQueryId).digest("hex")],
      );
      await client.query(
        `INSERT INTO segment_query (
           query_id,workspace_id,created_by_actor_id,name,filter_json,primary_entity_unit,
           geography_scope,as_of_date,query_hash,data_version
         ) SELECT $1,$3,$4,'Alternate restricted-role fixture','{}'::jsonb,e.entity_unit,
                  '{"level":"country","codes":["KR"]}'::jsonb,current_date,
                  $5,'security-fixture-v1'
             FROM estimate e WHERE e.estimate_id=$2
         ON CONFLICT (query_id) DO NOTHING`,
        [SECURITY_FIXTURE.alternateQueryId, SECURITY_FIXTURE.currentEstimateId,
          deterministicLocalRuntimeContext.workspaceId, deterministicLocalRuntimeContext.actorId,
          crypto.createHash("sha256").update(SECURITY_FIXTURE.alternateQueryId).digest("hex")],
      );
      await client.query(
        `INSERT INTO segment_query (
           query_id,workspace_id,created_by_actor_id,name,filter_json,primary_entity_unit,
           geography_scope,as_of_date,query_hash,data_version
         ) SELECT
           $1,$2,$3,'Mismatched-unit restricted-role fixture','{}'::jsonb,
           CASE WHEN e.entity_unit='household' THEN 'person' ELSE 'household' END,
           '{"level":"country","codes":["KR"]}'::jsonb,current_date,$4,'security-fixture-v1'
           FROM estimate e WHERE e.estimate_id=$5
         ON CONFLICT (query_id) DO NOTHING`,
        [SECURITY_FIXTURE.mismatchedUnitQueryId, deterministicLocalRuntimeContext.workspaceId,
          deterministicLocalRuntimeContext.actorId,
          crypto.createHash("sha256").update(SECURITY_FIXTURE.mismatchedUnitQueryId).digest("hex"),
          SECURITY_FIXTURE.currentEstimateId],
      );
      await client.query(
        `INSERT INTO segment_condition_group (
           group_id,query_id,parent_group_id,logical_operator,ordinal,enabled
         ) VALUES
           ($1,$2,NULL,'AND',0,true),
           ($3,$4,NULL,'AND',0,true)
         ON CONFLICT (group_id) DO NOTHING`,
        [SECURITY_FIXTURE.currentGroupId, SECURITY_FIXTURE.queryId,
          SECURITY_FIXTURE.hiddenGroupId, SECURITY_FIXTURE.hiddenQueryId],
      );
      await client.query(
        `INSERT INTO segment_condition (
           condition_id,query_id,group_id,condition_namespace,source_code,
           operator,value_json,entity_unit,resolution_status,source_text,ordinal,enabled
         ) SELECT $1::uuid,$2::uuid,$3::uuid,'custom','security-current','eq','true'::jsonb,
                  sq.primary_entity_unit,'exact','current workspace visibility fixture',0,true
             FROM segment_query sq WHERE sq.query_id=$2::uuid
         UNION ALL
         SELECT $4::uuid,$5::uuid,$6::uuid,'custom','security-hidden','eq','true'::jsonb,
                  sq.primary_entity_unit,'exact','hidden workspace visibility fixture',0,true
             FROM segment_query sq WHERE sq.query_id=$5::uuid
         ON CONFLICT (condition_id) DO NOTHING`,
        [SECURITY_FIXTURE.currentConditionId, SECURITY_FIXTURE.queryId, SECURITY_FIXTURE.currentGroupId,
          SECURITY_FIXTURE.hiddenConditionId, SECURITY_FIXTURE.hiddenQueryId, SECURITY_FIXTURE.hiddenGroupId],
      );
      await client.query(
        `WITH fixture(result_id,query_id,estimate_id,result_hash) AS (
           VALUES
             ($1::uuid,$2::uuid,$3::uuid,repeat('1',64)),
             ($4::uuid,$5::uuid,$6::uuid,repeat('2',64)),
             ($7::uuid,$8::uuid,$3::uuid,repeat('3',64))
         )
         INSERT INTO segment_query_result (
           result_id,query_id,estimate_id,model_version_id,executed_at,result_summary,
           data_version,result_hash,dependency_fingerprint,cache_status
         )
         SELECT fixture.result_id,fixture.query_id,fixture.estimate_id,e.model_version_id,now(),
                jsonb_build_object('fixture',fixture.result_id),'security-fixture-v1',
                fixture.result_hash,fixture.result_hash,'valid'
           FROM fixture JOIN estimate e USING (estimate_id)
         ON CONFLICT (result_id) DO NOTHING`,
        [SECURITY_FIXTURE.currentResultId, SECURITY_FIXTURE.queryId,
          SECURITY_FIXTURE.currentEstimateId, SECURITY_FIXTURE.hiddenResultId,
          SECURITY_FIXTURE.hiddenQueryId, SECURITY_FIXTURE.hiddenEstimateId,
          SECURITY_FIXTURE.alternateResultId, SECURITY_FIXTURE.alternateQueryId],
      );
      await client.query(
         `INSERT INTO saved_segment (
           saved_segment_id,workspace_id,title,created_by_actor_id
         ) VALUES (
           $1::uuid,$2,'Restricted-role saved lineage fixture ' || ($1::uuid)::text,$3
         )
         ON CONFLICT (saved_segment_id) DO NOTHING`,
        [SECURITY_FIXTURE.currentSavedSegmentId, deterministicLocalRuntimeContext.workspaceId,
          deterministicLocalRuntimeContext.actorId],
      );
      await client.query(
        `INSERT INTO saved_segment_version (
           saved_segment_id,version_no,query_id,pinned_result_id,
           parser_version,definition_hash,change_reason,created_by_actor_id
         ) VALUES ($1,1,$2,$3,'security-fixture-v1',repeat('b',64),'initial',$4)
         ON CONFLICT (saved_segment_id,version_no) DO NOTHING`,
        [SECURITY_FIXTURE.currentSavedSegmentId, SECURITY_FIXTURE.queryId,
          SECURITY_FIXTURE.currentResultId, deterministicLocalRuntimeContext.actorId],
      );
      await client.query(
        `INSERT INTO estimate_dependency (
           estimate_id,dependency_kind,dependency_record_key,dependency_version,
           dependency_content_hash,dependency_role
         ) VALUES ($1,'other','security-hidden-dependency','security-fixture-v1',repeat('d',64),'validation')
         ON CONFLICT DO NOTHING`,
        [SECURITY_FIXTURE.hiddenEstimateId],
      );
      await client.query(
        `INSERT INTO market_scenario (
           scenario_id,name,query_id,product_definition,market_unit,currency,
           horizon_months,assumptions,version,data_version,workspace_id,
           base_query_result_id,scenario_hash,status,created_by_actor_id
         ) SELECT $1::uuid,'Restricted-role hidden scenario ' || ($1::uuid)::text,
                  $2,'Security fixture',e.entity_unit,
                  'KRW',12,'{}'::jsonb,'security-fixture-v1','security-fixture-v1',$3,
                  $4,repeat('c',64),'active',$5
             FROM estimate e WHERE e.estimate_id=$6
         ON CONFLICT (scenario_id) DO NOTHING`,
        [SECURITY_FIXTURE.hiddenScenarioId, SECURITY_FIXTURE.hiddenQueryId,
          SECURITY_FIXTURE.hiddenWorkspaceId, SECURITY_FIXTURE.hiddenResultId,
          deterministicLocalRuntimeContext.actorId, SECURITY_FIXTURE.hiddenEstimateId],
      );
      await client.query(
        `INSERT INTO market_estimate (
           scenario_id,
           tam_entities_low,tam_entities_base,tam_entities_high,
           sam_entities_low,sam_entities_base,sam_entities_high,
           som_entities_low,som_entities_base,som_entities_high,
           tam_revenue_low,tam_revenue_base,tam_revenue_high,
           sam_revenue_low,sam_revenue_base,sam_revenue_high,
           som_revenue_low,som_revenue_base,som_revenue_high,
           formula,confidence_score,run_id,data_version
         ) SELECT $1,
                  e.count_low,e.count_base,e.count_high,
                  e.count_low*0.5,e.count_base*0.5,e.count_high*0.5,
                  e.count_low*0.1,e.count_base*0.1,e.count_high*0.1,
                  e.count_low*100,e.count_base*100,e.count_high*100,
                  e.count_low*50,e.count_base*50,e.count_high*50,
                  e.count_low*10,e.count_base*10,e.count_high*10,
                  'RLS visibility fixture only',50,e.run_id,'security-fixture-v1'
             FROM estimate e
            WHERE e.estimate_id=$2
              AND NOT EXISTS (SELECT 1 FROM market_estimate WHERE scenario_id=$1)`,
        [SECURITY_FIXTURE.hiddenScenarioId, SECURITY_FIXTURE.hiddenEstimateId],
      );

      await client.query("SET LOCAL ROLE market_engine_app");
      const visibility = (await client.query<{
        baseline_count: number;
        current_estimate_count: number;
        hidden_estimate_count: number;
        hidden_dependency_count: number;
        hidden_result_count: number;
        hidden_market_count: number;
        current_query_count: number;
        hidden_query_count: number;
        current_group_count: number;
        hidden_group_count: number;
        current_condition_count: number;
        hidden_condition_count: number;
      }>(
        `SELECT
           (SELECT count(*)::integer FROM estimate WHERE estimate_id=$1) AS baseline_count,
           (SELECT count(*)::integer FROM estimate WHERE estimate_id=$2) AS current_estimate_count,
           (SELECT count(*)::integer FROM estimate WHERE estimate_id=$3) AS hidden_estimate_count,
           (SELECT count(*)::integer FROM estimate_dependency WHERE estimate_id=$3) AS hidden_dependency_count,
           (SELECT count(*)::integer FROM segment_query_result WHERE result_id=$4) AS hidden_result_count,
           (SELECT count(*)::integer FROM market_estimate WHERE scenario_id=$5) AS hidden_market_count,
           (SELECT count(*)::integer FROM segment_query WHERE query_id=$6) AS current_query_count,
           (SELECT count(*)::integer FROM segment_query WHERE query_id=$7) AS hidden_query_count,
           (SELECT count(*)::integer FROM segment_condition_group WHERE group_id=$8) AS current_group_count,
           (SELECT count(*)::integer FROM segment_condition_group WHERE group_id=$9) AS hidden_group_count,
           (SELECT count(*)::integer FROM segment_condition WHERE condition_id=$10) AS current_condition_count,
           (SELECT count(*)::integer FROM segment_condition WHERE condition_id=$11) AS hidden_condition_count`,
        [baseline.estimate_id, SECURITY_FIXTURE.currentEstimateId,
          SECURITY_FIXTURE.hiddenEstimateId, SECURITY_FIXTURE.hiddenResultId,
          SECURITY_FIXTURE.hiddenScenarioId, SECURITY_FIXTURE.queryId,
          SECURITY_FIXTURE.hiddenQueryId, SECURITY_FIXTURE.currentGroupId,
          SECURITY_FIXTURE.hiddenGroupId, SECURITY_FIXTURE.currentConditionId,
          SECURITY_FIXTURE.hiddenConditionId],
      )).rows[0];
      expect(visibility).toEqual({
        baseline_count: 1,
        current_estimate_count: 1,
        hidden_estimate_count: 0,
        hidden_dependency_count: 0,
        hidden_result_count: 0,
        hidden_market_count: 0,
        current_query_count: 1,
        hidden_query_count: 0,
        current_group_count: 1,
        hidden_group_count: 0,
        current_condition_count: 1,
        hidden_condition_count: 0,
      });

      await expectRestrictedSqlFailure(
        client,
        "deny_baseline_update",
        "UPDATE estimate SET count_base=count_base WHERE estimate_id=$1",
        [baseline.estimate_id],
      );
      await expectRestrictedSqlFailure(
        client,
        "deny_baseline_child_insert",
        `INSERT INTO estimate_dependency (
           estimate_id,dependency_kind,dependency_record_key,dependency_version,
           dependency_content_hash,dependency_role
         ) VALUES ($1,'other','forbidden-baseline-child','security-fixture-v1',repeat('e',64),'validation')`,
        [baseline.estimate_id],
      );
      await expectRestrictedSqlFailure(
        client,
        "deny_snapshot_payload_update",
        `UPDATE segment_query_result
            SET result_summary=jsonb_build_object('tampered',true)
          WHERE result_id=$1`,
        [SECURITY_FIXTURE.currentResultId],
      );
      await expectRestrictedSqlFailure(
        client,
        "deny_global_release_forgery",
        `INSERT INTO data_release_version (
           workspace_id,version_label,baseline_model_version_id,status,rationale,
           approved_by_actor_id,approved_at,published_at
         ) SELECT NULL,'security-forged-global-' || gen_random_uuid()::text,
                  model_version_id,'published','must be rejected',$2,now(),now()
             FROM estimate WHERE estimate_id=$1`,
        [baseline.estimate_id, deterministicLocalRuntimeContext.actorId],
      );
      await expectRestrictedSqlFailure(
        client,
        "deny_result_unit_lineage",
        `INSERT INTO segment_query_result (
           result_id,query_id,estimate_id,model_version_id,executed_at,result_summary,
           data_version,result_hash,dependency_fingerprint,cache_status
        ) SELECT gen_random_uuid(),$1,$2,e.model_version_id,now(),
                  '{"fixture":"forbidden-unit-lineage"}'::jsonb,'security-fixture-v1',
                  repeat('4',64),repeat('4',64),'valid'
             FROM estimate e WHERE e.estimate_id=$2`,
        [SECURITY_FIXTURE.mismatchedUnitQueryId, SECURITY_FIXTURE.currentEstimateId],
        /segment_query_result lineage entity unit mismatch/iu,
      );
      await expectRestrictedSqlFailure(
        client,
        "deny_result_workspace_lineage",
        `INSERT INTO segment_query_result (
           result_id,query_id,estimate_id,model_version_id,executed_at,result_summary,
           data_version,result_hash,dependency_fingerprint,cache_status
         ) SELECT gen_random_uuid(),$1,$2,e.model_version_id,now(),
                  '{"fixture":"forbidden-workspace-lineage"}'::jsonb,'security-fixture-v1',
                  repeat('5',64),repeat('5',64),'valid'
             FROM estimate e WHERE e.estimate_id=$3`,
        [SECURITY_FIXTURE.queryId, SECURITY_FIXTURE.hiddenEstimateId,
          SECURITY_FIXTURE.currentEstimateId],
        /segment_query_result lineage estimate is not visible/iu,
      );
      await expectRestrictedSqlFailure(
        client,
        "deny_saved_pin_lineage",
        `INSERT INTO saved_segment_version (
           saved_segment_id,version_no,query_id,pinned_result_id,
           parser_version,definition_hash,change_reason,created_by_actor_id
         ) VALUES ($1,2,$2,$3,'security-fixture-v1',repeat('6',64),'forbidden_pin',$4)`,
        [SECURITY_FIXTURE.currentSavedSegmentId, SECURITY_FIXTURE.queryId,
          SECURITY_FIXTURE.alternateResultId, deterministicLocalRuntimeContext.actorId],
        /saved_segment_version lineage pinned result must belong to its query/iu,
      );
      await expectRestrictedSqlFailure(
        client,
        "deny_scenario_query_result_lineage",
        `INSERT INTO market_scenario (
           scenario_id,name,query_id,product_definition,market_unit,currency,
           horizon_months,assumptions,version,data_version,workspace_id,
           base_query_result_id,scenario_hash,status,created_by_actor_id
         ) SELECT gen_random_uuid(),'Forbidden query-result lineage',$1,'Security fixture',
                  e.entity_unit,'KRW',12,'{}'::jsonb,'security-fixture-v1','security-fixture-v1',$3,
                  $2,repeat('7',64),'active',$4
             FROM estimate e WHERE e.estimate_id=$5`,
        [SECURITY_FIXTURE.queryId, SECURITY_FIXTURE.alternateResultId,
          deterministicLocalRuntimeContext.workspaceId, deterministicLocalRuntimeContext.actorId,
          SECURITY_FIXTURE.currentEstimateId],
        /market_scenario lineage base result must belong to its query/iu,
      );
      await expectRestrictedSqlFailure(
        client,
        "deny_scenario_market_unit_lineage",
        `INSERT INTO market_scenario (
           scenario_id,name,query_id,product_definition,market_unit,currency,
           horizon_months,assumptions,version,data_version,workspace_id,
           base_query_result_id,scenario_hash,status,created_by_actor_id
         ) SELECT
           gen_random_uuid(),'Forbidden market-unit lineage',$1,'Security fixture',
           CASE WHEN q.primary_entity_unit='household' THEN 'person' ELSE 'household' END,
           'KRW',12,'{}'::jsonb,'security-fixture-v1','security-fixture-v1',$2,
           $3,repeat('8',64),'active',$4
           FROM segment_query q WHERE q.query_id=$1`,
        [SECURITY_FIXTURE.queryId, deterministicLocalRuntimeContext.workspaceId,
          SECURITY_FIXTURE.currentResultId, deterministicLocalRuntimeContext.actorId],
        /market_scenario lineage market unit must match its query/iu,
      );
      await expectRestrictedSqlFailure(
        client,
        "deny_scenario_saved_version_lineage",
        `INSERT INTO market_scenario (
           scenario_id,name,query_id,product_definition,market_unit,currency,
           horizon_months,assumptions,version,data_version,workspace_id,
           base_query_result_id,saved_segment_id,saved_segment_version_no,
           scenario_hash,status,created_by_actor_id
         ) SELECT gen_random_uuid(),'Forbidden saved-version lineage',$1,'Security fixture',
                  e.entity_unit,'KRW',12,'{}'::jsonb,'security-fixture-v1','security-fixture-v1',$3,
                  $2,$4,1,repeat('9',64),'active',$5
             FROM estimate e WHERE e.estimate_id=$6`,
        [SECURITY_FIXTURE.alternateQueryId, SECURITY_FIXTURE.alternateResultId,
          deterministicLocalRuntimeContext.workspaceId, SECURITY_FIXTURE.currentSavedSegmentId,
          deterministicLocalRuntimeContext.actorId, SECURITY_FIXTURE.currentEstimateId],
        /market_scenario lineage saved segment version must use its query/iu,
      );
      await expectRestrictedSqlFailure(
        client,
        "deny_scenario_workspace_lineage",
        `INSERT INTO market_scenario (
           scenario_id,name,query_id,product_definition,market_unit,currency,
           horizon_months,assumptions,version,data_version,workspace_id,
           base_query_result_id,scenario_hash,status,created_by_actor_id
         ) SELECT gen_random_uuid(),'Forbidden workspace lineage',$1,'Security fixture',
                  e.entity_unit,'KRW',12,'{}'::jsonb,'security-fixture-v1','security-fixture-v1',$3,
                  $2,repeat('a',64),'active',$4
             FROM estimate e WHERE e.estimate_id=$5`,
        [SECURITY_FIXTURE.queryId, SECURITY_FIXTURE.currentResultId,
          SECURITY_FIXTURE.hiddenWorkspaceId, deterministicLocalRuntimeContext.actorId,
          SECURITY_FIXTURE.currentEstimateId],
        /market_scenario lineage workspace must match its query/iu,
      );
      await expectRestrictedSqlFailure(
        client,
        "deny_scenario_cross_workspace_parent",
        `INSERT INTO market_scenario (
           scenario_id,name,query_id,product_definition,market_unit,currency,
           horizon_months,assumptions,version,data_version,workspace_id,
           base_query_result_id,scenario_hash,status,created_by_actor_id,
           supersedes_scenario_id
         ) SELECT gen_random_uuid(),'Forbidden cross-workspace revision parent',$1,
                  'Security fixture',e.entity_unit,'KRW',12,'{}'::jsonb,
                  'security-fixture-v1','security-fixture-v1',$3,$2,repeat('d',64),
                  'active',$4,$6
             FROM estimate e WHERE e.estimate_id=$5`,
        [SECURITY_FIXTURE.queryId, SECURITY_FIXTURE.currentResultId,
          deterministicLocalRuntimeContext.workspaceId, deterministicLocalRuntimeContext.actorId,
          SECURITY_FIXTURE.currentEstimateId, SECURITY_FIXTURE.hiddenScenarioId],
        /market_scenario revision parent must belong to its workspace/iu,
      );

      await client.query("SAVEPOINT allow_cache_invalidation");
      try {
        const allowed = await client.query(
          `UPDATE segment_query_result
              SET cache_status='invalidated',invalidated_at=now()
            WHERE result_id=$1
            RETURNING result_id`,
          [SECURITY_FIXTURE.currentResultId],
        );
        expect(allowed.rowCount).toBe(1);
        const hidden = await client.query(
          `UPDATE segment_query_result
              SET cache_status='invalidated',invalidated_at=now()
            WHERE result_id=$1
            RETURNING result_id`,
          [SECURITY_FIXTURE.hiddenResultId],
        );
        expect(hidden.rowCount).toBe(0);
      } finally {
        await client.query("ROLLBACK TO SAVEPOINT allow_cache_invalidation");
        await client.query("RELEASE SAVEPOINT allow_cache_invalidation");
      }
    });
  }, 60_000);
});
