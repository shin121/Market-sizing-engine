import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  RARE_OUTPUT_THRESHOLD,
  runtimeReleaseEnvelope,
} from "@/server/services/segment-workflow";

describe("runtime rare-output release envelope", () => {
  it.each(["person", "child_person", "household"])(
    "suppresses every persisted interval field for %s below ten",
    (entityUnit) => {
      const release = runtimeReleaseEnvelope(entityUnit, {
        low: 4,
        base: 5,
        high: 6,
        shareLow: 0.04,
        shareBase: 0.05,
        shareHigh: 0.06,
      });

      expect(release).toEqual({
        suppressed: true,
        status: "suppressed",
        countLow: null,
        countBase: null,
        countHigh: null,
        shareLow: null,
        shareBase: null,
        shareHigh: null,
        precisionRule: "suppressed_below_10_weighted_entities",
      });
    },
  );

  it("does not suppress the exact release threshold", () => {
    const release = runtimeReleaseEnvelope("person", {
      low: 8,
      base: RARE_OUTPUT_THRESHOLD,
      high: 12,
      shareLow: 0.08,
      shareBase: 0.1,
      shareHigh: 0.12,
    });

    expect(release).toMatchObject({
      suppressed: false,
      status: "estimated",
      countLow: 8,
      countBase: 10,
      countHigh: 12,
      shareLow: 0.08,
      shareBase: 0.1,
      shareHigh: 0.12,
    });
  });

  it.each(["establishment", "enterprise"])(
    "does not apply the human release policy to %s",
    (entityUnit) => {
      const release = runtimeReleaseEnvelope(entityUnit, {
        low: 4,
        base: 5,
        high: 6,
      });

      expect(release).toMatchObject({
        suppressed: false,
        status: "estimated",
        countLow: 4,
        countBase: 5,
        countHigh: 6,
      });
    },
  );
});

