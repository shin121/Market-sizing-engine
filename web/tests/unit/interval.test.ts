import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

import { decimalInterval, intervalSchema } from "@/domain/interval";

describe("interval validation", () => {
  it.each(["not-a-number", "--1", "1.2.3"])(
    "reports an invalid Decimal string through Zod without leaking a Decimal exception: %s",
    (invalid) => {
      const input = { low: invalid, base: 1, high: 2 };
      expect(() => intervalSchema.safeParse(input)).not.toThrow();
      expect(intervalSchema.safeParse(input).success).toBe(false);
      expect(() => decimalInterval(input)).toThrow(ZodError);
    },
  );
});
