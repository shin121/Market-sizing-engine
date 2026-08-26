import { describe, expect, it } from "vitest";

import {
  MARKET_SCENARIO_VERSION_MAX_LENGTH,
  parseMarketScenarioSelection,
} from "@/domain/market-scenario-selection";

const SCENARIO_ID = "10000000-0000-4000-8000-000000000001";

describe("market scenario URL selection", () => {
  it("keeps the no-query case as automatic selection", () => {
    expect(parseMarketScenarioSelection({})).toEqual({ ok: true, selection: null });
  });

  it.each(["1", "27", "v1", "user-a1b2c3d4e5f6", "릴리스-1"])(
    "accepts an exact safe database version: %s",
    (scenarioVersion) => {
      expect(parseMarketScenarioSelection({ scenarioId: SCENARIO_ID.toUpperCase(), scenarioVersion }))
        .toEqual({
          ok: true,
          selection: { scenarioId: SCENARIO_ID, scenarioVersion },
        });
    },
  );

  it.each([
    { scenarioId: SCENARIO_ID },
    { scenarioVersion: "user-a1b2c3d4e5f6" },
    { scenarioId: [SCENARIO_ID], scenarioVersion: "user-a1b2c3d4e5f6" },
    { scenarioId: SCENARIO_ID, scenarioVersion: ["user-a1b2c3d4e5f6"] },
    { scenarioId: SCENARIO_ID, scenarioVersion: "user-a1b2c3d4e5f6", scenarioSelectionMode: ["explicit"] },
    { scenarioId: SCENARIO_ID, scenarioVersion: "user-a1b2c3d4e5f6", scenarioSelectionMode: "automatic" },
    { scenarioSelectionMode: "unique_active" },
    { scenarioId: "not-a-uuid", scenarioVersion: "user-a1b2c3d4e5f6" },
    { scenarioId: SCENARIO_ID, scenarioVersion: "" },
    { scenarioId: SCENARIO_ID, scenarioVersion: " user-a1b2c3d4e5f6" },
    { scenarioId: SCENARIO_ID, scenarioVersion: "user-a1b2\nc3" },
    { scenarioId: SCENARIO_ID, scenarioVersion: "user-a1b2\u200dc3" },
    { scenarioId: SCENARIO_ID, scenarioVersion: "0" },
    { scenarioId: SCENARIO_ID, scenarioVersion: "00" },
    { scenarioId: SCENARIO_ID, scenarioVersion: "+1" },
    { scenarioId: SCENARIO_ID, scenarioVersion: "-1" },
    { scenarioId: SCENARIO_ID, scenarioVersion: "x".repeat(MARKET_SCENARIO_VERSION_MAX_LENGTH + 1) },
  ])("fails closed for an incomplete, repeated, malformed, blank, control, or overlong pair", (input) => {
    expect(parseMarketScenarioSelection(input)).toEqual({ ok: false, selection: null });
  });
});
