import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { explicitEntityUnit } from "@/server/services/natural-language-interpreter";

describe("natural-language entity-unit hints", () => {
  it("keeps the canonical business-establishment question on establishment", () => {
    expect(explicitEntityUnit("홈페이지가 없는 60대 음식점 사업체")).toBe("establishment");
  });

  it("distinguishes establishment from enterprise wording", () => {
    expect(explicitEntityUnit("온라인 판매채널이 있는 음식점 점포")).toBe("establishment");
    expect(explicitEntityUnit("온라인 판매채널이 있는 법인 기업")).toBe("enterprise");
  });
});
