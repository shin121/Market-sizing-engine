import { describe, expect, it } from "vitest";

import { DEFAULT_LOCAL_NEXT, normalizeLocalNext } from "@/lib/local-next";

describe("normalizeLocalNext", () => {
  it.each([
    "/\\evil.example",
    "/%5Cevil.example",
    "/%255Cevil.example",
    "//evil.example/path",
    "%2F%2Fevil.example/path",
    "/%2F%2Fevil.example/path",
    "/%252F%252Fevil.example/path",
    "https://evil.example/path",
    "http://market-atlas.local.evil.example/path",
    "/%0A//evil.example/path",
  ])("falls back for an unsafe target: %s", (target) => {
    expect(normalizeLocalNext(target)).toBe(DEFAULT_LOCAL_NEXT);
  });

  it("preserves a valid local pathname, search, and hash", () => {
    const target = "/builder/segment-123?tab=source%20ledger&view=detail#evidence";

    expect(normalizeLocalNext(target)).toBe(target);
  });

  it("normalizes local dot segments without changing origin", () => {
    expect(normalizeLocalNext("/builder/../explore?domain=health#results")).toBe(
      "/explore?domain=health#results",
    );
  });
});
