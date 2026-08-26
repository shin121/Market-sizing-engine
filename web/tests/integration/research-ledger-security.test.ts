import crypto from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  closeDatabasePool,
  withWorkspaceTransaction,
  type RuntimeContext,
} from "@/server/db";
import { materializeApprovedResearchFactor } from "@/server/services/research-materialization";

const databaseEnabled =
  process.env.RUN_DATABASE_INTEGRATION === "1" ||
  Boolean(process.env.MARKET_ENGINE_DATABASE_URL ?? process.env.DATABASE_URL ?? process.env.POSTGRES_URL);

const fixture = {
  workspaceId: crypto.randomUUID(),
  crossWorkspaceId: crypto.randomUUID(),
  reviewerActorId: crypto.randomUUID(),
  editorActorId: crypto.randomUUID(),
  publicationVersionId: crypto.randomUUID(),
  crossPublicationVersionId: crypto.randomUUID(),
  proposedRevisionId: crypto.randomUUID(),
  incompleteProposedRevisionId: crypto.randomUUID(),
  retryProposedRevisionId: crypto.randomUUID(),
  crossProposedRevisionId: crypto.randomUUID(),
  factorId: crypto.randomUUID(),
  incompleteFactorId: crypto.randomUUID(),
} as const;

const retryProposal = {
  targetSegment: "Restricted ledger retry fixture",
  targetVariable: `fixture_rate_${crypto.randomUUID()}`,
  lowBaseHigh: { low: 0.3, base: 0.4, high: 0.5 },
  denominator: "대한민국 기업",
  geography: "KR",
  referenceYear: 2025,
  inferenceMethod: "restricted-role retry fixture",
  factors: [{ name: "fixture factor" }],
  limitations: ["Test-only fixture."],
  sources: [{
    institution: "Restricted Fixture Institute",
    title: "Test-only materialization source",
    url: "https://example.test/restricted-ledger-retry",
    publicationDate: "2026-01-01",
    referenceYear: 2025,
    accessedAt: "2026-08-25T00:00:00.000Z",
    locator: "fixture table 2",
    usedValue: 0.4,
    sourceTier: 1,
  }],
  citations: [{ sourceIndex: 0, claim: "The test-only fixture value is 0.4." }],
  confidenceComponents: {
    sourceQuality: 70,
    recency: 70,
    populationFit: 70,
    geographyMatch: 70,
    definitionMatch: 70,
    directObservation: 70,
    proxyStrength: 70,
    dependencySupport: 70,
    sourceConsistency: 70,
    inferenceDirectness: 70,
    modelStability: 70,
    allocationIntegrity: 70,
  },
  confidencePenalties: [],
  confidenceRuleVersion: "research-confidence-v1",
};

const reviewerContext: RuntimeContext = {
  workspaceId: fixture.workspaceId,
  actorId: fixture.reviewerActorId,
};

const editorContext: RuntimeContext = {
  workspaceId: fixture.workspaceId,
  actorId: fixture.editorActorId,
};

function insertFactorSql(): string {
  return `INSERT INTO approved_research_factor (
    approved_factor_id,workspace_id,publication_version_id,proposed_revision_id,
    target_segment,target_variable,entity_unit,denominator,geography,reference_year,
    value_low,value_base,value_high,inference_method,observation_summary,limitations,
    confidence_score,confidence_grade,confidence_components,confidence_penalties,
    confidence_rule_version,source_bundle_hash,source_count,created_by_actor_id
  ) VALUES (
    $1,$2,$3,$4,'Restricted ledger fixture','fixture_rate','enterprise',
    '대한민국 기업','KR',2025,0.3,0.4,0.5,'restricted-role fixture',
    '{}'::jsonb,'[]'::jsonb,50,'D','{}'::jsonb,'[]'::jsonb,
    'research-confidence-v1',repeat('a',64),$5,$6
  )`;
}

function insertSourceSql(): string {
  return `INSERT INTO approved_research_factor_source (
    approved_factor_id,source_index,institution,title,url,publication_date,
    reference_year,accessed_at,locator,used_value,source_tier,claims,source_hash
  ) VALUES (
    $1,$2,'Restricted Fixture Institute','Test-only cited source',
    'https://example.test/restricted-ledger','2026-01-01',2025,
    '2026-08-25T00:00:00.000Z','fixture table 1','0.4'::jsonb,1,
    '["test-only claim"]'::jsonb,$3
  )`;
}

describe.runIf(databaseEnabled)("approved research factor source snapshot security", () => {
  beforeAll(async () => {
    await withWorkspaceTransaction(async (client) => {
      await client.query(
        `INSERT INTO workspace (workspace_id,workspace_key,name)
         VALUES ($1::uuid,'restricted-ledger-' || $1::text,'Restricted ledger fixture')`,
        [fixture.workspaceId],
      );
      await client.query(
        `INSERT INTO workspace (workspace_id,workspace_key,name)
         VALUES ($1::uuid,'restricted-ledger-' || $1::text,'Cross-workspace ledger fixture')`,
        [fixture.crossWorkspaceId],
      );
      await client.query(
        `INSERT INTO workspace_member (workspace_id,actor_id,role)
         VALUES ($1,$2,'reviewer'),($1,$3,'editor')`,
        [fixture.workspaceId, fixture.reviewerActorId, fixture.editorActorId],
      );
      const model = (await client.query<{ model_version_id: string }>(
        "SELECT model_version_id FROM model_version ORDER BY created_at DESC LIMIT 1",
      )).rows[0];
      if (!model) throw new Error("research_ledger_security_model_fixture_missing");
      await client.query(
        `INSERT INTO data_release_version (
           publication_version_id,workspace_id,version_label,baseline_model_version_id,
           status,rationale,approved_by_actor_id,approved_at
         ) VALUES ($1,$2,$3,$4,'approved','Restricted ledger fixture',$5,now())`,
        [fixture.publicationVersionId, fixture.workspaceId,
          `restricted-ledger-${fixture.publicationVersionId}`, model.model_version_id,
          fixture.reviewerActorId],
      );
      await client.query(
        `INSERT INTO data_release_version (
           publication_version_id,workspace_id,version_label,baseline_model_version_id,
           status,rationale,approved_by_actor_id,approved_at
         ) VALUES ($1,$2,$3,$4,'approved','Cross-workspace ledger fixture',$5,now())`,
        [fixture.crossPublicationVersionId, fixture.crossWorkspaceId,
          `restricted-ledger-${fixture.crossPublicationVersionId}`, model.model_version_id,
          fixture.reviewerActorId],
      );
      for (const proposedRevisionId of [
        fixture.proposedRevisionId,
        fixture.incompleteProposedRevisionId,
        fixture.retryProposedRevisionId,
      ]) {
        await client.query(
          `INSERT INTO proposed_revision (
             proposed_revision_id,workspace_id,target_kind,target_record_key,
             baseline_data_version,baseline_content_hash,baseline_payload,
             proposed_content_hash,proposed_payload,delta_summary,affected_segments,
             expected_recalculation,recommended_action,status,
             approved_publication_version_id,created_by_actor_id
           ) VALUES (
             $1::uuid,$2,'other',$1::text,'security-fixture-v1',repeat('b',64),'{}'::jsonb,
             repeat('c',64),'{}'::jsonb,'{}'::jsonb,'[]'::jsonb,'{}'::jsonb,
             'approve','approved',$3,$4
           )`,
          [proposedRevisionId, fixture.workspaceId, fixture.publicationVersionId, fixture.reviewerActorId],
        );
      }
      await client.query(
        `INSERT INTO proposed_revision (
           proposed_revision_id,workspace_id,target_kind,target_record_key,
           baseline_data_version,baseline_content_hash,baseline_payload,
           proposed_content_hash,proposed_payload,delta_summary,affected_segments,
           expected_recalculation,recommended_action,status,
           approved_publication_version_id,created_by_actor_id
         ) VALUES (
           $1::uuid,$2,'other',$1::text,'security-fixture-v1',repeat('b',64),'{}'::jsonb,
           repeat('c',64),'{}'::jsonb,'{}'::jsonb,'[]'::jsonb,'{}'::jsonb,
           'approve','approved',$3,$4
         )`,
        [fixture.crossProposedRevisionId, fixture.crossWorkspaceId,
          fixture.crossPublicationVersionId, fixture.reviewerActorId],
      );
    }, reviewerContext);
  });

  afterAll(async () => closeDatabasePool());

  it("allows one complete reviewer snapshot and seals it after commit", async () => {
    await withWorkspaceTransaction(async (client) => {
      await client.query("SET LOCAL ROLE market_engine_app");
      await client.query(insertFactorSql(), [
        fixture.factorId,
        fixture.workspaceId,
        fixture.publicationVersionId,
        fixture.proposedRevisionId,
        1,
        fixture.reviewerActorId,
      ]);
      await client.query(insertSourceSql(), [fixture.factorId, 0, "1".repeat(64)]);
    }, reviewerContext);

    const snapshot = await withWorkspaceTransaction(async (client) => (
      await client.query<{ source_count: number; actual_count: number; indexes: number[] }>(
        `SELECT factor.source_count,
                count(source.source_index)::integer AS actual_count,
                array_agg(source.source_index ORDER BY source.source_index)::integer[] AS indexes
           FROM approved_research_factor factor
           JOIN approved_research_factor_source source USING (approved_factor_id)
          WHERE factor.approved_factor_id=$1
          GROUP BY factor.source_count`,
        [fixture.factorId],
      )
    ).rows[0], reviewerContext);
    expect(snapshot).toEqual({ source_count: 1, actual_count: 1, indexes: [0] });

    await expect(withWorkspaceTransaction(async (client) => {
      await client.query("SET LOCAL ROLE market_engine_app");
      await client.query(insertSourceSql(), [fixture.factorId, 0, "2".repeat(64)]);
    }, reviewerContext)).rejects.toThrow(/source snapshot is sealed/iu);
  });

  it("blocks ordinary app actors and source indexes outside the declared snapshot", async () => {
    await expect(withWorkspaceTransaction(async (client) => {
      await client.query("SET LOCAL ROLE market_engine_app");
      await client.query(insertSourceSql(), [fixture.factorId, 0, "3".repeat(64)]);
    }, editorContext)).rejects.toThrow(/requires the approving owner or reviewer|row-level security/iu);

    for (const [index, hashDigit] of [[-1, "4"], [1, "5"], [32, "6"]] as const) {
      await expect(withWorkspaceTransaction(async (client) => {
        await client.query("SET LOCAL ROLE market_engine_app");
        await client.query(insertSourceSql(), [fixture.factorId, index, hashDigit.repeat(64)]);
      }, reviewerContext)).rejects.toThrow(/outside the declared range|check constraint/iu);
    }

    await expect(withWorkspaceTransaction(async (client) => {
      await client.query("SET LOCAL ROLE market_engine_worker");
      await client.query(insertSourceSql(), [fixture.factorId, 0, "7".repeat(64)]);
    }, reviewerContext)).rejects.toThrow(/permission denied/iu);
  });

  it("rolls back a parent whose source snapshot is incomplete at commit", async () => {
    await expect(withWorkspaceTransaction(async (client) => {
      await client.query("SET LOCAL ROLE market_engine_app");
      await client.query(insertFactorSql(), [
        fixture.incompleteFactorId,
        fixture.workspaceId,
        fixture.publicationVersionId,
        fixture.incompleteProposedRevisionId,
        2,
        fixture.reviewerActorId,
      ]);
      await client.query(insertSourceSql(), [fixture.incompleteFactorId, 0, "8".repeat(64)]);
    }, reviewerContext)).rejects.toThrow(/source snapshot is incomplete/iu);

    const persisted = await withWorkspaceTransaction(async (client) => (
      await client.query<{ count: number }>(
        "SELECT count(*)::integer AS count FROM approved_research_factor WHERE approved_factor_id=$1",
        [fixture.incompleteFactorId],
      )
    ).rows[0].count, reviewerContext);
    expect(persisted).toBe(0);
  });

  it("rejects factor provenance that crosses proposal or publication workspaces", async () => {
    for (const [publicationVersionId, proposedRevisionId] of [
      [fixture.crossPublicationVersionId, fixture.incompleteProposedRevisionId],
      [fixture.publicationVersionId, fixture.crossProposedRevisionId],
    ] as const) {
      await expect(withWorkspaceTransaction(async (client) => {
        await client.query("SET LOCAL ROLE market_engine_app");
        await client.query(insertFactorSql(), [
          crypto.randomUUID(),
          fixture.workspaceId,
          publicationVersionId,
          proposedRevisionId,
          1,
          fixture.reviewerActorId,
        ]);
      }, reviewerContext)).rejects.toThrow(/proposal|publication|workspace|foreign key|not visible/iu);
    }
  });

  it("returns an identical materialization without appending to its sealed snapshot", async () => {
    const materialize = (proposed: typeof retryProposal = retryProposal) => withWorkspaceTransaction(async (client) => {
      await client.query("SET LOCAL ROLE market_engine_app");
      return materializeApprovedResearchFactor({
        client,
        workspaceId: fixture.workspaceId,
        proposedRevisionId: fixture.retryProposedRevisionId,
        publicationVersionId: fixture.publicationVersionId,
        proposed,
        baseline: { unit: "enterprise" },
        actorId: fixture.reviewerActorId,
      });
    }, reviewerContext);

    const firstFactorId = await materialize();
    const secondFactorId = await materialize();
    expect(secondFactorId).toBe(firstFactorId);

    await expect(materialize({
      ...retryProposal,
      lowBaseHigh: { low: 0.31, base: 0.41, high: 0.51 },
    })).rejects.toThrow(/approved_research_factor_materialization_conflict/iu);

    const sourceCount = await withWorkspaceTransaction(async (client) => (
      await client.query<{ count: number }>(
        "SELECT count(*)::integer AS count FROM approved_research_factor_source WHERE approved_factor_id=$1",
        [firstFactorId],
      )
    ).rows[0].count, reviewerContext);
    expect(sourceCount).toBe(1);
  });
});
