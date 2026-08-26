export const MARKET_SCENARIO_VERSION_MAX_LENGTH = 128;

export interface MarketScenarioSelection {
  scenarioId: string;
  scenarioVersion: string;
  selectionMode?: "explicit" | "unique_active";
}

export type MarketScenarioSelectionParseResult =
  | { ok: true; selection: MarketScenarioSelection | null }
  | { ok: false; selection: null };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const SIGNED_DECIMAL_VERSION_PATTERN = /^[+-]?\d+$/u;
const POSITIVE_DECIMAL_VERSION_PATTERN = /^[1-9]\d*$/u;
const UNSAFE_VERSION_CHARACTER_PATTERN = /\p{C}/u;

function isSingleString(value: unknown): value is string {
  return typeof value === "string";
}

function isSafeVersion(value: string): boolean {
  if (!value || value.length > MARKET_SCENARIO_VERSION_MAX_LENGTH || value.trim() !== value) return false;
  if (UNSAFE_VERSION_CHARACTER_PATTERN.test(value)) return false;
  // Numeric versions are canonical positive integers. The database also has
  // text versions such as `user-<hash>`, which are compared byte-for-byte.
  return !SIGNED_DECIMAL_VERSION_PATTERN.test(value) || POSITIVE_DECIMAL_VERSION_PATTERN.test(value);
}

export function parseMarketScenarioSelection(input: {
  scenarioId?: unknown;
  scenarioVersion?: unknown;
  scenarioSelectionMode?: unknown;
}): MarketScenarioSelectionParseResult {
  const idPresent = input.scenarioId !== undefined;
  const versionPresent = input.scenarioVersion !== undefined;
  const modePresent = input.scenarioSelectionMode !== undefined;

  if (!idPresent && !versionPresent && !modePresent) return { ok: true, selection: null };
  if (!idPresent || !versionPresent) return { ok: false, selection: null };
  if (!isSingleString(input.scenarioId) || !isSingleString(input.scenarioVersion)) {
    return { ok: false, selection: null };
  }
  if (!UUID_PATTERN.test(input.scenarioId) || !isSafeVersion(input.scenarioVersion)) {
    return { ok: false, selection: null };
  }
  if (modePresent && (
    !isSingleString(input.scenarioSelectionMode)
    || !["explicit", "unique_active"].includes(input.scenarioSelectionMode)
  )) return { ok: false, selection: null };

  return {
    ok: true,
    selection: {
      scenarioId: input.scenarioId.toLowerCase(),
      scenarioVersion: input.scenarioVersion,
      ...(modePresent ? { selectionMode: input.scenarioSelectionMode as "explicit" | "unique_active" } : {}),
    },
  };
}
