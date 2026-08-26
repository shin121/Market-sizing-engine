import Decimal from "decimal.js";
import { z } from "zod";

import { entityUnitSchema, type EntityUnit } from "@/domain/entity-units";
import { decimalInterval, intervalSchema, multiplyIntervals, serializeInterval, type DecimalInterval } from "@/domain/interval";

export const marketScenarioInputSchema = z.object({
  entityUnit: entityUnitSchema,
  currency: z.string().length(3).default("KRW"),
  horizonMonths: z.number().int().positive(),
  eligibleEntities: intervalSchema,
  annualSpendPerEntity: intervalSchema.nullable(),
  serviceabilityRate: intervalSchema,
  attainableShare: intervalSchema,
  operationalCapacity: intervalSchema.nullable().default(null),
  realizedArpu: intervalSchema.nullable().default(null),
});

export type MarketScenarioInput = z.infer<typeof marketScenarioInputSchema>;

export interface MarketSizingResult {
  entityUnit: EntityUnit;
  currency: string;
  horizonMonths: number;
  entities: {
    tam: ReturnType<typeof serializeInterval>;
    sam: ReturnType<typeof serializeInterval>;
    som: ReturnType<typeof serializeInterval>;
  };
  revenue: null | {
    tam: ReturnType<typeof serializeInterval>;
    sam: ReturnType<typeof serializeInterval>;
    som: ReturnType<typeof serializeInterval>;
  };
  formula: string;
}

function minInterval(left: DecimalInterval, right: DecimalInterval): DecimalInterval {
  return {
    low: Decimal.min(left.low, right.low),
    base: Decimal.min(left.base, right.base),
    high: Decimal.min(left.high, right.high),
  };
}

function assertRate(value: DecimalInterval, name: string): void {
  if (value.low.lt(0) || value.high.gt(1)) throw new Error(`${name}_outside_zero_one`);
}

function assertNonNegative(value: DecimalInterval, name: string): void {
  if (value.low.lt(0)) throw new Error(`${name}_below_zero`);
}

function scaleInterval(value: DecimalInterval, factor: Decimal): DecimalInterval {
  return {
    low: value.low.mul(factor),
    base: value.base.mul(factor),
    high: value.high.mul(factor),
  };
}

function assertRevenueOrder(som: DecimalInterval, sam: DecimalInterval, tam: DecimalInterval): void {
  const bounds = ["low", "base", "high"] as const;
  if (bounds.some((bound) => som[bound].gt(sam[bound]) || sam[bound].gt(tam[bound]))) {
    throw new Error("som_sam_tam_revenue_order_violation");
  }
}

export function calculateMarketSizing(raw: MarketScenarioInput): MarketSizingResult {
  const input = marketScenarioInputSchema.parse(raw);
  const tam = decimalInterval(input.eligibleEntities);
  const serviceability = decimalInterval(input.serviceabilityRate);
  const attainable = decimalInterval(input.attainableShare);
  const annualSpend = input.annualSpendPerEntity ? decimalInterval(input.annualSpendPerEntity) : null;
  const capacity = input.operationalCapacity ? decimalInterval(input.operationalCapacity) : null;
  const realizedArpu = input.realizedArpu ? decimalInterval(input.realizedArpu) : null;

  assertNonNegative(tam, "eligible_entities");
  assertRate(serviceability, "serviceability_rate");
  assertRate(attainable, "attainable_share");
  if (annualSpend) assertNonNegative(annualSpend, "annual_spend_per_entity");
  if (capacity) assertNonNegative(capacity, "operational_capacity");
  if (realizedArpu) assertNonNegative(realizedArpu, "realized_arpu");

  const sam = multiplyIntervals(tam, serviceability);
  const shareLimitedSom = multiplyIntervals(sam, attainable);
  const som = capacity ? minInterval(shareLimitedSom, capacity) : shareLimitedSom;

  if (som.base.gt(sam.base) || sam.base.gt(tam.base)) throw new Error("som_sam_tam_order_violation");

  let revenue: MarketSizingResult["revenue"] = null;
  const horizonScale = new Decimal(input.horizonMonths).div(12);
  if (annualSpend) {
    const tamRevenue = scaleInterval(multiplyIntervals(tam, annualSpend), horizonScale);
    const samRevenue = scaleInterval(multiplyIntervals(sam, annualSpend), horizonScale);
    const demandSomRevenue = multiplyIntervals(samRevenue, attainable);
    const somRevenue = realizedArpu && capacity
      ? minInterval(
          demandSomRevenue,
          scaleInterval(multiplyIntervals(capacity, realizedArpu), horizonScale),
        )
      : demandSomRevenue;
    assertRevenueOrder(somRevenue, samRevenue, tamRevenue);
    revenue = {
      tam: serializeInterval(tamRevenue),
      sam: serializeInterval(samRevenue),
      som: serializeInterval(somRevenue),
    };
  }

  return {
    entityUnit: input.entityUnit,
    currency: input.currency,
    horizonMonths: input.horizonMonths,
    entities: { tam: serializeInterval(tam), sam: serializeInterval(sam), som: serializeInterval(som) },
    revenue,
    formula: [
      "TAM=eligible_entities",
      "SAM=TAM×serviceability_rate",
      capacity ? "SOM=min(SAM×attainable_share, operational_capacity)" : "SOM=SAM×attainable_share",
      annualSpend
        ? [
            "TAM_revenue=TAM×annual_spend_per_entity×(horizon_months/12)",
            "SAM_revenue=SAM×annual_spend_per_entity×(horizon_months/12)",
            realizedArpu && capacity
              ? "SOM_revenue=min(SAM_revenue×attainable_share, operational_capacity×realized_arpu×(horizon_months/12))"
              : "SOM_revenue=SAM_revenue×attainable_share",
          ].join("; ")
        : "all_revenue=not_estimable_without_annual_spend_per_entity",
    ].join("; "),
  };
}
