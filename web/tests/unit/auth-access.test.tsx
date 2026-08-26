import { render } from "@testing-library/react";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AccessPage from "@/app/access/page";
import { POST } from "@/app/api/auth/access/route";

const ACCESS_SECRET = "unit-test-access-secret-that-is-long-enough";

function accessRequest(next: string, secret = ACCESS_SECRET): NextRequest {
  return new NextRequest("https://app.example/api/auth/access", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ next, secret }),
  });
}

describe("access redirect boundary", () => {
  beforeEach(() => {
    vi.stubEnv("WORKBENCH_ACCESS_SECRET", ACCESS_SECRET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    "/\\evil.example",
    "/%5Cevil.example",
    "/%255Cevil.example",
    "//evil.example/path",
    "/%2F%2Fevil.example/path",
    "/%252F%252Fevil.example/path",
    "https://evil.example/path",
  ])("redirects an unsafe POST target to the local fallback: %s", async (target) => {
    const response = await POST(accessRequest(target));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://app.example/explore");
  });

  it("preserves a valid local pathname, search, and hash in the POST route", async () => {
    const target = "/builder/segment-123?tab=sources&view=detail#evidence";
    const response = await POST(accessRequest(target));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`https://app.example${target}`);
  });

  it("stores only a normalized local target in the access form", async () => {
    const element = await AccessPage({
      searchParams: Promise.resolve({ next: "/%255Cevil.example" }),
    });
    const { container } = render(element);

    expect(container.querySelector<HTMLInputElement>('input[name="next"]')?.value).toBe("/explore");
  });

  it("keeps a valid local target in the access form", async () => {
    const target = "/sizing?status=approved#estimate";
    const element = await AccessPage({ searchParams: Promise.resolve({ next: target }) });
    const { container } = render(element);

    expect(container.querySelector<HTMLInputElement>('input[name="next"]')?.value).toBe(target);
  });
});
