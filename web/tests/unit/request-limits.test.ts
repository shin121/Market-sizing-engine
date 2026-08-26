import { describe, expect, it } from "vitest";

import { assertSegmentConditionPayloadLimits, SEGMENT_CONDITION_LIMITS } from "@/domain/segment-limits";
import { boundedJsonResponse, parseBoundedJson } from "@/server/http/bounded-json";

describe("bounded workbench inputs", () => {
  it("parses a bounded JSON body and rejects actual bytes over the limit", async () => {
    await expect(parseBoundedJson(new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ ok: true }),
    }), 64)).resolves.toEqual({ ok: true });

    await expect(parseBoundedJson(new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ value: "한".repeat(40) }),
    }), 64)).rejects.toMatchObject({
      message: "request_body_too_large",
      status: 413,
    });
  });

  it("rejects an oversized declared body before parsing", async () => {
    await expect(parseBoundedJson(new Request("http://localhost", {
      method: "POST",
      headers: { "content-length": "9999" },
      body: "{}",
    }), 64)).rejects.toMatchObject({ message: "request_body_too_large", status: 413 });
  });

  it("stops reading a chunked body as soon as the byte limit is crossed", async () => {
    let pulls = 0;
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        controller.enqueue(new Uint8Array(40));
        if (pulls >= 10) controller.close();
      },
      cancel() {
        cancelled = true;
      },
    });
    const request = new Request("http://localhost", {
      method: "POST",
      body,
      duplex: "half",
    } as RequestInit & { duplex: "half" });

    await expect(parseBoundedJson(request, 64)).rejects.toMatchObject({
      message: "request_body_too_large",
      status: 413,
    });
    expect(cancelled).toBe(true);
    expect(pulls).toBeLessThan(10);
  });

  it("bounds condition depth, node count, arrays, and strings", () => {
    let nested: unknown = { sourceId: "feature:test" };
    for (let index = 0; index <= SEGMENT_CONDITION_LIMITS.maxDepth; index += 1) nested = { groups: [nested] };
    expect(() => assertSegmentConditionPayloadLimits(nested)).toThrow("segment_condition_depth_limit_exceeded");
    expect(() => assertSegmentConditionPayloadLimits(Array.from({ length: SEGMENT_CONDITION_LIMITS.maxArrayItems + 1 })))
      .toThrow("segment_condition_array_limit_exceeded");
    expect(() => assertSegmentConditionPayloadLimits("x".repeat(SEGMENT_CONDITION_LIMITS.maxStringCharacters + 1)))
      .toThrow("segment_condition_string_limit_exceeded");
  });

  it("emits JSON only within the configured response byte ceiling", async () => {
    const accepted = boundedJsonResponse({ value: "한" }, { status: 201 }, 32);
    expect(accepted.status).toBe(201);
    expect(accepted.headers.get("content-length")).toBe("15");
    await expect(accepted.json()).resolves.toEqual({ value: "한" });

    const rejected = boundedJsonResponse({ value: "한".repeat(40) }, undefined, 64);
    expect(rejected.status).toBe(500);
    await expect(rejected.json()).resolves.toEqual({ error: "response_body_too_large" });
  });
});
