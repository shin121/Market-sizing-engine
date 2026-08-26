import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { GET } from "@/app/api/internal/research/run-once/route";
import { processNextResearchJob } from "@/server/services/research-workflow";

vi.mock("@/server/services/research-workflow", () => ({
  processNextResearchJob: vi.fn(),
}));

const WORKER_SECRET = "unit-worker-secret-for-route-that-is-long-enough";
const processNextResearchJobMock = vi.mocked(processNextResearchJob);

function request(secret?: string): Request {
  return new Request("https://app.example/api/internal/research/run-once", {
    headers: secret ? { authorization: `Bearer ${secret}` } : undefined,
  });
}

describe("research run-once cron route", () => {
  beforeEach(() => {
    vi.stubEnv("RESEARCH_WORKER_SECRET", WORKER_SECRET);
    vi.stubEnv("RESEARCH_CRON_MAX_JOBS", "2");
    processNextResearchJobMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects missing or unrelated credentials without claiming a job", async () => {
    expect((await GET(request())).status).toBe(401);
    expect((await GET(request("unrelated-secret-that-is-also-long-enough"))).status).toBe(401);
    expect(processNextResearchJobMock).not.toHaveBeenCalled();
  });

  it("claims only the configured bounded number of jobs", async () => {
    processNextResearchJobMock
      .mockResolvedValueOnce("11111111-1111-4111-8111-111111111111")
      .mockResolvedValueOnce("22222222-2222-4222-8222-222222222222");

    const response = await GET(request(WORKER_SECRET));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      processedJobIds: [
        "11111111-1111-4111-8111-111111111111",
        "22222222-2222-4222-8222-222222222222",
      ],
      processedCount: 2,
    });
    expect(processNextResearchJobMock).toHaveBeenCalledTimes(2);
  });

  it("stops immediately when the durable queue is empty", async () => {
    processNextResearchJobMock.mockResolvedValueOnce(null);
    const response = await GET(request(WORKER_SECRET));
    await expect(response.json()).resolves.toMatchObject({ ok: true, processedCount: 0 });
    expect(processNextResearchJobMock).toHaveBeenCalledTimes(1);
  });
});
