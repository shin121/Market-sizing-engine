import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { closeDatabasePool } from "@/server/db";
import { listDomains } from "@/server/repositories/catalog";
import { listEstimates, listSavedSegments } from "@/server/repositories/workbench";

const databaseEnabled =
  process.env.RUN_DATABASE_INTEGRATION === "1" ||
  Boolean(process.env.MARKET_ENGINE_DATABASE_URL ?? process.env.DATABASE_URL ?? process.env.POSTGRES_URL);

describe.runIf(databaseEnabled)("Phase 2R-A production read models", () => {
  afterAll(async () => closeDatabasePool());

  it("serves sourced population envelopes for all 24 domains", async () => {
    const domains = await listDomains();

    expect(domains).toHaveLength(24);
    expect(domains.every((domain) => domain.populationStatus === "estimated")).toBe(true);
    expect(domains.every((domain) => domain.countLow > 0)).toBe(true);
    expect(domains.every((domain) => domain.countLow <= domain.countBase)).toBe(true);
    expect(domains.every((domain) => domain.countBase <= domain.countHigh)).toBe(true);
    expect(domains.every((domain) => domain.countStatusReason.includes("보정 시장 모집단"))).toBe(true);
  });

  it("serves named production estimates and excludes prototype fixtures", async () => {
    const [estimates, segments] = await Promise.all([
      // Coverage assertions span the full production baseline, not the
      // deliberately bounded first page used by the workbench directory.
      listEstimates({ limit: 200, status: "estimated" }),
      listSavedSegments({ limit: 200 }),
    ]);

    expect(estimates.length).toBeGreaterThanOrEqual(34);
    expect(estimates.filter((estimate) => estimate.estimate_id.startsWith("domain-market:DOM-"))).toHaveLength(24);
    expect(estimates.filter((estimate) => estimate.estimate_id.startsWith("gold-query:GOLD"))).toHaveLength(10);
    const goldEstimates = estimates.filter((estimate) => estimate.estimate_id.startsWith("gold-query:GOLD"));
    expect(goldEstimates.every((estimate) => {
      const spend = estimate.related_spend_json;
      return Boolean(spend && typeof spend === "object" && !Array.isArray(spend));
    })).toBe(true);
    expect(goldEstimates.find((estimate) => estimate.estimate_id === "gold-query:GOLD-10")?.related_spend_json).toMatchObject({
      metric_code: "monthly_willingness_to_pay_krw",
      value_low: 1000,
      value_base: 4900,
      value_high: 7900,
      unit: "KRW",
      reference_year: 2024,
    });
    expect(estimates.every((estimate) => ["estimated", "bounded_estimate"].includes(estimate.status))).toBe(true);
    expect(estimates.every((estimate) => typeof (estimate as { name?: unknown }).name === "string")).toBe(true);
    expect(estimates.every((estimate) => Number(estimate.count_base) > 0)).toBe(true);
    expect(estimates.every((estimate) => typeof estimate.formula === "string" && estimate.formula.length > 0)).toBe(true);
    expect(estimates.every((estimate) => !/(?:\[integration|\be2e\b|fixture|16-step|test user)/iu.test(
      String((estimate as { name?: unknown }).name),
    ))).toBe(true);
    expect(segments.every((segment) => !/(?:\[integration|\be2e\b|fixture|16-step|test user)/iu.test(segment.title))).toBe(true);
  });
});
