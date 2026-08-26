import { describe, expect, it } from "vitest";

import {
  assertNoHighConfidencePersonalData,
  findHighConfidencePersonalData,
} from "@/domain/privacy";

describe("high-confidence personal-data guard", () => {
  it.each([
    ["contact me at person@example.com", "email_address"],
    ["주민번호 900101-1234567", "resident_registration_number"],
    ["전화 010-1234-5678", "phone_number"],
    ["account id: customer_123", "labeled_account_identifier"],
    ["계좌번호 123-456-789012", "labeled_financial_account"],
    ["서울특별시 강남구 테헤란로 123", "detailed_street_address"],
  ])("detects %s without echoing the value", (input, expected) => {
    expect(findHighConfidencePersonalData(input)).toContain(expected);
    expect(() => assertNoHighConfidencePersonalData(input)).toThrow(`personal_data_not_allowed:${expected}`);
  });

  it("allows aggregate market questions and ordinary numeric evidence", () => {
    const input = {
      researchQuestion: "대한민국 소상공인의 온라인 판매채널 보유율은 얼마인가?",
      targetSegment: "대한민국 소상공인",
      baseline: { low: 1_000_000, base: 1_250_000, high: 1_500_000 },
    };
    expect(findHighConfidencePersonalData(input)).toEqual([]);
    expect(() => assertNoHighConfidencePersonalData(input)).not.toThrow();
  });

  it("does not mistake a canonical UUID phone-shaped substring for a phone number", () => {
    const uuid = "aaaaaaaa-a010-1234-8678-aaaaaaaaaaaa";
    expect(findHighConfidencePersonalData(`research-requeue-${uuid}`)).toEqual([]);
    expect(findHighConfidencePersonalData(`account id: ${uuid}`)).toContain("labeled_account_identifier");
  });

  it("handles cyclic objects without losing the guard", () => {
    const input: Record<string, unknown> = { text: "aggregate only" };
    input.self = input;
    expect(findHighConfidencePersonalData(input)).toEqual([]);
  });
});
