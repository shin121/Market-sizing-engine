import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  bearerMatchesSecret,
  configuredResearchWorkerSecret,
  RESEARCH_WORKER_PATH,
} from "@/lib/research-worker-auth";
import { proxy } from "@/proxy";

const WORKBENCH_SECRET = "unit-workbench-secret-that-is-long-enough";
const WORKER_SECRET = "unit-worker-secret-that-is-separate-and-long";

describe("research worker authentication boundary", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("requires a dedicated secret with at least 32 characters", () => {
    expect(configuredResearchWorkerSecret({ RESEARCH_WORKER_SECRET: "short", CRON_SECRET: undefined })).toBeNull();
    expect(configuredResearchWorkerSecret({ RESEARCH_WORKER_SECRET: WORKER_SECRET, CRON_SECRET: undefined }))
      .toBe(WORKER_SECRET);
    expect(configuredResearchWorkerSecret({ RESEARCH_WORKER_SECRET: undefined, CRON_SECRET: WORKER_SECRET }))
      .toBe(WORKER_SECRET);
  });

  it("compares only a Bearer credential", async () => {
    await expect(bearerMatchesSecret(new Request("https://app.example", {
      headers: { authorization: `Bearer ${WORKER_SECRET}` },
    }), WORKER_SECRET)).resolves.toBe(true);
    await expect(bearerMatchesSecret(new Request("https://app.example", {
      headers: { authorization: `Bearer ${WORKBENCH_SECRET}` },
    }), WORKER_SECRET)).resolves.toBe(false);
  });

  it("does not let the workbench access secret authorize the cron route", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("WORKBENCH_AUTH_MODE", "secret");
    vi.stubEnv("WORKBENCH_ACCESS_SECRET", WORKBENCH_SECRET);
    vi.stubEnv("RESEARCH_WORKER_SECRET", WORKER_SECRET);

    const rejected = await proxy(new NextRequest(`https://app.example${RESEARCH_WORKER_PATH}`, {
      headers: { authorization: `Bearer ${WORKBENCH_SECRET}` },
    }));
    expect(rejected.status).toBe(401);

    const accepted = await proxy(new NextRequest(`https://app.example${RESEARCH_WORKER_PATH}`, {
      headers: { authorization: `Bearer ${WORKER_SECRET}` },
    }));
    expect(accepted.status).toBe(200);
  });
});
