import { describe, expect, it } from "vitest";

import { calculateMarketSizing } from "@/domain/market-sizing";

function validInput() {
  return {
    entityUnit: "enterprise" as const,
    currency: "KRW",
    horizonMonths: 12,
    eligibleEntities: { low: 100, base: 100, high: 100 },
    annualSpendPerEntity: { low: 120, base: 120, high: 120 },
    serviceabilityRate: { low: 0.5, base: 0.5, high: 0.5 },
    attainableShare: { low: 0.2, base: 0.2, high: 0.2 },
    operationalCapacity: null,
    realizedArpu: null,
  };
}

describe("calculateMarketSizing", () => {
  it("keeps SOM ≤ SAM ≤ TAM and separates revenue assumptions", () => {
    const result = calculateMarketSizing({
      entityUnit: "enterprise",
      currency: "KRW",
      horizonMonths: 12,
      eligibleEntities: { low: 100, base: 120, high: 150 },
      annualSpendPerEntity: { low: 10, base: 20, high: 30 },
      serviceabilityRate: { low: 0.4, base: 0.5, high: 0.6 },
      attainableShare: { low: 0.05, base: 0.1, high: 0.15 },
      operationalCapacity: { low: 4, base: 5, high: 7 },
      realizedArpu: { low: 8, base: 18, high: 25 },
    });
    expect(Number(result.entities.som.base)).toBeLessThanOrEqual(Number(result.entities.sam.base));
    expect(Number(result.entities.sam.base)).toBeLessThanOrEqual(Number(result.entities.tam.base));
    expect(result.revenue).not.toBeNull();
  });

  it("rejects rates outside zero and one", () => {
    expect(() =>
      calculateMarketSizing({
        entityUnit: "person",
        currency: "KRW",
        horizonMonths: 12,
        eligibleEntities: { low: 10, base: 20, high: 30 },
        annualSpendPerEntity: null,
        serviceabilityRate: { low: 0.8, base: 1, high: 1.2 },
        attainableShare: { low: 0.1, base: 0.2, high: 0.3 },
        operationalCapacity: null,
        realizedArpu: null,
      }),
    ).toThrow("serviceability_rate_outside_zero_one");
  });

  it("keeps entity TAM/SAM/SOM when annual spend evidence is unavailable", () => {
    const result = calculateMarketSizing({
      entityUnit: "establishment",
      currency: "KRW",
      horizonMonths: 12,
      eligibleEntities: { low: 100, base: 120, high: 150 },
      annualSpendPerEntity: null,
      serviceabilityRate: { low: 0.4, base: 0.5, high: 0.6 },
      attainableShare: { low: 0.05, base: 0.1, high: 0.15 },
      operationalCapacity: null,
      realizedArpu: null,
    });
    expect(result.entities.tam).toEqual({ low: "100", base: "120", high: "150" });
    expect(result.revenue).toBeNull();
  });

  it("scales annual revenue to 6- and 24-month horizons, including the capacity/ARPU ceiling", () => {
    const factors = {
      ...validInput(),
      operationalCapacity: { low: 8, base: 8, high: 8 },
      realizedArpu: { low: 60, base: 60, high: 60 },
    };

    const sixMonths = calculateMarketSizing({ ...factors, horizonMonths: 6 });
    const twentyFourMonths = calculateMarketSizing({ ...factors, horizonMonths: 24 });

    expect(sixMonths.revenue).toEqual({
      tam: { low: "6000", base: "6000", high: "6000" },
      sam: { low: "3000", base: "3000", high: "3000" },
      som: { low: "240", base: "240", high: "240" },
    });
    expect(twentyFourMonths.revenue).toEqual({
      tam: { low: "24000", base: "24000", high: "24000" },
      sam: { low: "12000", base: "12000", high: "12000" },
      som: { low: "960", base: "960", high: "960" },
    });
    expect(sixMonths.formula).toContain("horizon_months/12");
  });

  it("uses SAM revenue × attainable share when a capacity ceiling is unavailable", () => {
    const result = calculateMarketSizing({
      ...validInput(),
      realizedArpu: { low: 30, base: 30, high: 30 },
    });

    expect(result.entities.som).toEqual({ low: "10", base: "10", high: "10" });
    expect(result.revenue?.tam.base).toBe("12000");
    expect(result.revenue?.sam.base).toBe("6000");
    expect(result.revenue?.som.base).toBe("1200");
    expect(result.formula).toContain("SOM_revenue=SAM_revenue×attainable_share");
  });

  it("keeps all revenue unavailable when annual spend is missing, even if realized ARPU is supplied", () => {
    const result = calculateMarketSizing({
      ...validInput(),
      annualSpendPerEntity: null,
      realizedArpu: { low: 30, base: 30, high: 30 },
    });

    expect(result.revenue).toBeNull();
    expect(result.formula).toContain("all_revenue=not_estimable_without_annual_spend_per_entity");
  });

  it("allows premium realized ARPU because it only defines the capacity ceiling", () => {
    const result = calculateMarketSizing({
      ...validInput(),
      annualSpendPerEntity: { low: 10, base: 10, high: 10 },
      attainableShare: { low: 0.5, base: 0.5, high: 0.5 },
      operationalCapacity: { low: 1, base: 1, high: 1 },
      realizedArpu: { low: 1_000, base: 1_000, high: 1_000 },
    });

    expect(result.revenue?.som.base).toBe("250");
    expect(result.formula).toContain("operational_capacity×realized_arpu");
  });

  it("rejects negative entity, money, and capacity inputs", () => {
    expect(() =>
      calculateMarketSizing({
        ...validInput(),
        eligibleEntities: { low: -1, base: 0, high: 1 },
      }),
    ).toThrow("eligible_entities_below_zero");

    expect(() =>
      calculateMarketSizing({
        ...validInput(),
        annualSpendPerEntity: { low: -1, base: 0, high: 1 },
      }),
    ).toThrow("annual_spend_per_entity_below_zero");

    expect(() =>
      calculateMarketSizing({
        ...validInput(),
        operationalCapacity: { low: -1, base: 0, high: 1 },
      }),
    ).toThrow("operational_capacity_below_zero");

    expect(() =>
      calculateMarketSizing({
        ...validInput(),
        realizedArpu: { low: -1, base: 0, high: 1 },
      }),
    ).toThrow("realized_arpu_below_zero");
  });
});
