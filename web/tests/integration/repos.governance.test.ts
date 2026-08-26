import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { closeDatabasePool } from "@/server/db";
import {
  getGovernanceOverview,
  getModel,
  getSource,
  getVersion,
  listAuditLogs,
  listModels,
  listSources,
  listVersions,
} from "@/server/repositories/governance";

const databaseEnabled =
  process.env.RUN_DATABASE_INTEGRATION === "1" ||
  Boolean(process.env.MARKET_ENGINE_DATABASE_URL ?? process.env.DATABASE_URL ?? process.env.POSTGRES_URL);

describe.runIf(databaseEnabled)("governance repository", () => {
  afterAll(async () => closeDatabasePool());

  it("reports live baseline and operational health", async () => {
    const overview = await getGovernanceOverview();
    expect(overview.domainCount).toBe(24);
    expect(overview.subtypeCount).toBe(90);
    expect(overview.archetypeCount).toBe(1_440);
    expect(overview.modelCount).toBe(24);
    expect(overview.currentVersion).toBe("kr-v0.2.1");
    expect(overview.currentVersionKind).toBe("model");
    expect(overview.migrationStatus).toBe("ready");
    expect(["verified", "incomplete", "not_available"]).toContain(overview.checksumStatus);
    expect(() => JSON.stringify(overview)).not.toThrow();
  });

  it("traces source releases and evidence without exposing raw source files", async () => {
    const sources = await listSources({ limit: 500 });
    expect(sources).toHaveLength(8);
    const source = await getSource(sources[0].sourceId);
    expect(source?.releases.length).toBeGreaterThan(0);
    expect(source?.releases.every((release) => release.releaseId && release.versionLabel)).toBe(true);
    expect(() => JSON.stringify(source)).not.toThrow();
  });

  it("traces each selected segmentation model to clusters and subtypes", async () => {
    const models = await listModels({ status: "selected", limit: 500 });
    expect(models).toHaveLength(24);
    const model = await getModel(models[0].modelId);
    expect(model?.clusters.length).toBe(model?.selectedK);
    expect(model?.clusters.flatMap((cluster) => cluster.subtypes).length).toBeGreaterThan(0);
    expect(model?.pipelineRun.runId).toBeTruthy();
    expect(() => JSON.stringify(model)).not.toThrow();
  });

  it("returns workspace-scoped publication versions and append-only audit records", async () => {
    const [versions, missingVersion, auditLogs] = await Promise.all([
      listVersions(),
      getVersion("00000000-0000-0000-0000-000000000000"),
      listAuditLogs({ limit: 100 }),
    ]);
    expect(Array.isArray(versions)).toBe(true);
    expect(missingVersion).toBeNull();
    expect(Array.isArray(auditLogs)).toBe(true);
    expect(() => JSON.stringify({ versions, auditLogs })).not.toThrow();
  });
});
