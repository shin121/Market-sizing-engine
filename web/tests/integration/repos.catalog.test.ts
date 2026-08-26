import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { closeDatabasePool } from "@/server/db";
import {
  getArchetype,
  getAxis,
  getConditionLibrary,
  getDomain,
  getSubtype,
  encodeArchetypeCursor,
  listArchetypes,
  listDomains,
  listSubtypes,
  searchCatalog,
} from "@/server/repositories/catalog";

const databaseEnabled =
  process.env.RUN_DATABASE_INTEGRATION === "1" ||
  Boolean(process.env.MARKET_ENGINE_DATABASE_URL ?? process.env.DATABASE_URL ?? process.env.POSTGRES_URL);

describe.runIf(databaseEnabled)("catalog repository", () => {
  afterAll(async () => closeDatabasePool());

  it("loads the canonical domain hierarchy with sourced production population values", async () => {
    const domains = await listDomains();
    expect(domains).toHaveLength(24);
    expect(new Set(domains.map((domain) => domain.domainId)).size).toBe(24);

    const domain = await getDomain(domains[0].domainCode);
    expect(domain).not.toBeNull();
    expect(domain?.axes).toHaveLength(16);
    expect(domain?.populationStatus).toBe("estimated");
    expect(domain?.countLow).toBeGreaterThan(0);
    expect(domain?.countBase).toBeGreaterThan(0);
    expect(domain?.countHigh).toBeGreaterThan(0);
    expect(domain?.countLow).toBeLessThanOrEqual(domain?.countBase ?? 0);
    expect(domain?.countBase).toBeLessThanOrEqual(domain?.countHigh ?? 0);
    expect(domain?.countStatusReason).toContain("보정 시장 모집단");
    expect(domain?.shareLow).toBeLessThanOrEqual(domain?.shareBase ?? 0);
    expect(domain?.shareBase).toBeLessThanOrEqual(domain?.shareHigh ?? 0);
    expect(domain?.geographyDistribution).toHaveLength(17);
    expect(domain?.confidenceComponents).not.toBeNull();
    expect(() => JSON.stringify(domain)).not.toThrow();

    const axis = domain ? await getAxis(domain.domainCode, domain.axes[0].axisCode) : null;
    expect(axis?.domainId).toBe(domain?.domainId);
    expect(axis?.allowedValues).toEqual(axis?.values.map((value) => value.label));
    expect(axis?.distribution).toHaveLength(4);
    expect(axis?.distribution.every((value) => value.countLow <= value.countBase)).toBe(true);
    expect(axis?.distribution.every((value) => value.countBase <= value.countHigh)).toBe(true);
    expect(axis?.parentPopulation).toBeGreaterThan(0);
    expect(axis?.domainSubtypeCount).toBe(domain?.primarySubtypeCount);
    expect(axis?.subtypeCount).toBeNull();
    expect(domain ? await listSubtypes({ domainCode: domain.domainCode, axisCode: domain.axes[0].axisCode }) : [])
      .toEqual([]);

    const musicPaymentAxis = await getAxis("music_audio", "payment_monetization");
    expect(musicPaymentAxis?.distribution).toHaveLength(4);
    expect(musicPaymentAxis?.parentPopulation).toBeGreaterThan(30_000_000);
  });

  it("returns all primary subtypes and traces a subtype to parent allocations", async () => {
    const subtypes = await listSubtypes({ primaryOnly: true, limit: 500 });
    expect(subtypes).toHaveLength(90);
    const detail = await getSubtype(subtypes[0].subtypeId);
    expect(detail?.subtypeId).toBe(subtypes[0].subtypeId);
    expect(detail?.labelStatus).toBeTruthy();
    expect(detail?.evidenceBoundary).toBeTruthy();
    expect(detail?.populationCountStatus).toBe("estimated");
    expect(detail?.countLow).toBeLessThanOrEqual(detail?.countBase ?? 0);
    expect(detail?.countBase).toBeLessThanOrEqual(detail?.countHigh ?? 0);
    expect(detail?.featureDistribution).toHaveLength(20);
    expect(detail?.behaviorDistribution).toHaveLength(10);
    expect(detail?.regionDistribution).toHaveLength(17);
    expect(detail?.confidenceComponents).not.toBeNull();
    expect(detail?.allocations.length).toBeGreaterThan(0);
    expect(detail?.allocations.every((allocation) => allocation.countLow <= allocation.countBase)).toBe(true);
    expect(detail?.allocations.every((allocation) => allocation.countBase <= allocation.countHigh)).toBe(true);

    const profile = await getSubtype("DOM-24-SUB-04");
    expect(profile?.tags).toHaveLength(8);
    expect(profile?.tags.every((tag) => tag.prevalenceBase !== null)).toBe(true);
    expect(profile?.representatives.length).toBeGreaterThan(0);
    expect(profile?.inferredProfile).not.toBeNull();
    expect(profile?.jobsToBeDone).not.toBeNull();
    expect(profile?.triggers).not.toBeNull();
    expect(profile?.barriers).not.toBeNull();
    expect(profile?.engagementModes).not.toBeNull();
  });

  it("paginates all canonical archetypes and exposes subtype/model lineage", async () => {
    const pages = await Promise.all([
      listArchetypes({ limit: 500, offset: 0 }),
      listArchetypes({ limit: 500, offset: 500 }),
      listArchetypes({ limit: 500, offset: 1_000 }),
    ]);
    const archetypes = pages.flat();
    expect(archetypes).toHaveLength(1_440);
    expect(new Set(archetypes.map((archetype) => archetype.archetypeId)).size).toBe(1_440);
    expect(archetypes.every((archetype) => archetype.countBase !== null && archetype.countBase >= 0)).toBe(true);

    const detail = await getArchetype(archetypes[0].archetypeId);
    expect(detail?.subtypeLinks.length).toBeGreaterThan(0);
    expect(detail?.marketContexts.length).toBeGreaterThan(0);
    expect(detail?.representatives.every((representative) => !("sourcePersonaKey" in representative))).toBe(true);
    expect(() => JSON.stringify(detail)).not.toThrow();

    const firstCursorPage = await listArchetypes({ limit: 7 });
    const secondCursorPage = await listArchetypes({ limit: 7, cursor: encodeArchetypeCursor(firstCursorPage.at(-1)!) });
    expect(firstCursorPage).toHaveLength(7);
    expect(secondCursorPage).toHaveLength(7);
    expect(new Set([...firstCursorPage, ...secondCursorPage].map((item) => item.archetypeId)).size).toBe(14);
    expect(secondCursorPage[0].nameKo.localeCompare(firstCursorPage.at(-1)!.nameKo, "ko")).toBeGreaterThanOrEqual(0);

    const filtered = await listArchetypes({ region: "수도권", limit: 51 });
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.length).toBeLessThanOrEqual(51);

    const calibratedGrade = await listArchetypes({ estimateGrade: "C", minConfidence: 80, limit: 100 });
    expect(calibratedGrade).toHaveLength(80);
    expect(calibratedGrade.every((archetype) => archetype.confidenceGrade === "C" && archetype.confidenceScore === 80)).toBe(true);

    const ageRule = await listArchetypes({ age: "60-69", limit: 20 });
    expect(ageRule.map((archetype) => archetype.archetypeId)).toContain("ARC-06-001");

    const businessRule = await listArchetypes({ business: "has_website", limit: 20 });
    expect(businessRule.map((archetype) => archetype.archetypeId)).toContain("ARC-06-001");

    const profile = await getArchetype("ARC-06-001");
    expect(profile?.inferredNeeds).not.toBeNull();
    expect(profile?.channels).not.toBeNull();
    expect(profile?.representatives).toHaveLength(1);
  });

  it("builds conditions and search results only from database records", async () => {
    const domains = await listDomains();
    const conditions = await getConditionLibrary({ domainId: domains[0].domainId, limit: 1_000 });
    expect(conditions.length).toBeGreaterThan(0);
    expect(conditions.every((condition) => condition.catalogId && condition.sourceRecordId)).toBe(true);

    const initialConditions = await getConditionLibrary();
    expect(initialConditions.length).toBeLessThanOrEqual(200);
    expect(new Set(initialConditions.map((condition) => condition.sourceKind)).size).toBe(10);
    const completeRegistry = await getConditionLibrary({ balancedSample: false, limit: 5_000 });
    expect(completeRegistry).toHaveLength(4_086);
    expect(new Set(completeRegistry.map((condition) => condition.catalogId)).size).toBe(4_086);
    expect(completeRegistry.every((condition) => (
      condition.queryable
      && !["minor_protected", "restricted_targeting"].includes(condition.sensitiveClass)
    ))).toBe(true);
    const fullPolicyRegistry = await getConditionLibrary({
      balancedSample: false,
      queryableOnly: false,
      limit: 5_000,
    });
    const protectedConditions = fullPolicyRegistry.filter((condition) => (
      ["minor_protected", "restricted_targeting"].includes(condition.sensitiveClass)
    ));
    expect(protectedConditions.length).toBeGreaterThan(0);
    expect(protectedConditions.every((condition) => !condition.queryable)).toBe(true);
    expect(protectedConditions.some((condition) => condition.sensitiveClass === "minor_protected")).toBe(true);
    expect(protectedConditions.some((condition) => condition.sensitiveClass === "restricted_targeting")).toBe(true);
    const lateCatalogMatch = await getConditionLibrary({ query: "ARC-18-080", limit: 20 });
    expect(lateCatalogMatch.some((condition) => condition.catalogId === "archetype:ARC-18-080")).toBe(true);
    const exactSubtypeMatch = await getConditionLibrary({
      catalogId: "subtype:DOM-24-SUB-04",
      balancedSample: false,
      limit: 1,
    });
    expect(exactSubtypeMatch).toHaveLength(1);
    expect(exactSubtypeMatch[0]).toMatchObject({
      catalogId: "subtype:DOM-24-SUB-04",
      sourceKind: "subtype",
    });

    const results = await searchCatalog(domains[0].nameKo, { limit: 20 });
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((result) => result.objectId === domains[0].domainId)).toBe(true);
    expect(() => JSON.stringify(results)).not.toThrow();
  });
});
