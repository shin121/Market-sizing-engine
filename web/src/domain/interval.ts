import Decimal from "decimal.js";
import { z } from "zod";

export const intervalSchema = z
  .object({
    low: z.union([z.number(), z.string()]),
    base: z.union([z.number(), z.string()]),
    high: z.union([z.number(), z.string()]),
  })
  .superRefine((value, context) => {
    const parsed = new Map<"low" | "base" | "high", Decimal>();
    for (const key of ["low", "base", "high"] as const) {
      try {
        const decimal = new Decimal(value[key]);
        if (!decimal.isFinite()) {
          context.addIssue({ code: "custom", path: [key], message: "Interval values must be finite." });
        } else {
          parsed.set(key, decimal);
        }
      } catch {
        context.addIssue({ code: "custom", path: [key], message: "Interval values must be valid decimals." });
      }
    }
    const low = parsed.get("low");
    const base = parsed.get("base");
    const high = parsed.get("high");
    if (low && base && high && (low.gt(base) || base.gt(high))) {
      context.addIssue({ code: "custom", message: "Low ≤ Base ≤ High is required." });
    }
  });

export type IntervalInput = z.input<typeof intervalSchema>;

export interface DecimalInterval {
  low: Decimal;
  base: Decimal;
  high: Decimal;
}

export function decimalInterval(value: IntervalInput): DecimalInterval {
  const parsed = intervalSchema.parse(value);
  return {
    low: new Decimal(parsed.low),
    base: new Decimal(parsed.base),
    high: new Decimal(parsed.high),
  };
}

export function serializeInterval(value: DecimalInterval): { low: string; base: string; high: string } {
  return {
    low: value.low.toString(),
    base: value.base.toString(),
    high: value.high.toString(),
  };
}

export function multiplyIntervals(left: DecimalInterval, right: DecimalInterval): DecimalInterval {
  return {
    low: left.low.mul(right.low),
    base: left.base.mul(right.base),
    high: left.high.mul(right.high),
  };
}

export function complementInterval(value: DecimalInterval): DecimalInterval {
  const one = new Decimal(1);
  return {
    low: Decimal.max(0, one.minus(value.high)),
    base: Decimal.max(0, one.minus(value.base)),
    high: Decimal.max(0, one.minus(value.low)),
  };
}

export function addExclusiveIntervals(values: readonly DecimalInterval[]): DecimalInterval {
  return values.reduce<DecimalInterval>(
    (sum, value) => ({
      low: sum.low.plus(value.low),
      base: sum.base.plus(value.base),
      high: sum.high.plus(value.high),
    }),
    decimalInterval({ low: 0, base: 0, high: 0 }),
  );
}
