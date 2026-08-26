import { afterAll, describe, expect, it } from "vitest";

import { getConditionLibrary, listDomains } from "@/server/repositories/catalog";
import { getGovernanceOverview } from "@/server/repositories/governance";
import { closeDatabasePool, queryRows } from "@/server/db";
import { isResearchProviderConfigured } from "@/server/ai/openai-research-adapter";

afterAll(async () => {
  await closeDatabasePool();
});

describe("production baseline PostgreSQL read models", () => {
  it("preserves the verified Phase 1–2 cardinalities", async () => {
    const [row] = await queryRows<{
      domains: number;
      axes: number;
      features: number;
      behaviors: number;
      models: number;
      subtypes: number;
      allocations: number;
      archetypes: number;
      activation: number;
    }>(`SELECT
      (SELECT count(*)::integer FROM domain_registry) AS domains,
      (SELECT count(*)::integer FROM domain_dimension) AS axes,
      (SELECT count(*)::integer FROM domain_feature) AS features,
      (SELECT count(*)::integer FROM domain_behavior_template) AS behaviors,
      (SELECT count(*)::integer FROM segmentation_model) AS models,
      (SELECT count(*)::integer FROM subtype_definition) AS subtypes,
      (SELECT count(*)::integer FROM subtype_allocation) AS allocations,
      (SELECT count(*)::integer FROM archetype) AS archetypes,
      (SELECT count(*)::integer FROM activation_mapping) AS activation`);

    expect(row).toEqual({
      domains: 24,
      axes: 384,
      features: 480,
      behaviors: 240,
      models: 24,
      subtypes: 90,
      allocations: 450,
      archetypes: 1440,
      activation: 90,
    });
  });

  it("serves all domain units and a balanced condition catalog", async () => {
    const [domains, conditions] = await Promise.all([listDomains(), getConditionLibrary()]);
    expect(domains).toHaveLength(24);
    expect(new Set(domains.map((domain) => domain.primaryEntityUnit))).toEqual(
      new Set(["person", "household", "enterprise"]),
    );
    expect(new Set(conditions.map((condition) => condition.sourceKind))).toEqual(
      new Set(["core_feature", "domain_feature", "dimension_value", "calibration_dimension", "behavior", "tag", "subtype", "archetype", "gold_query", "geography"]),
    );
  });

  it("reports verified governance without enabling research implicitly", async () => {
    const previous = process.env.OPENAI_RESEARCH_ENABLED;
    process.env.OPENAI_RESEARCH_ENABLED = "false";
    try {
      const [overview, [baseline]] = await Promise.all([
        getGovernanceOverview(),
        queryRows<{ present: boolean }>(
          `SELECT EXISTS (
             SELECT 1 FROM model_version WHERE version = 'kr-v0.2.1'
           ) AS present`,
        ),
      ]);
      expect(baseline?.present).toBe(true);
      expect(overview.currentVersion).toBeTruthy();
      expect(["publication", "model"]).toContain(overview.currentVersionKind);
      if (overview.currentVersionKind === "model") {
        expect(overview.currentVersion).toBe("kr-v0.2.1");
      }
      expect(overview.migrationStatus).toBe("ready");
      expect(overview.checksumStatus).toBe("verified");
      expect(isResearchProviderConfigured()).toBe(false);
    } finally {
      if (previous === undefined) delete process.env.OPENAI_RESEARCH_ENABLED;
      else process.env.OPENAI_RESEARCH_ENABLED = previous;
    }
  });
});
