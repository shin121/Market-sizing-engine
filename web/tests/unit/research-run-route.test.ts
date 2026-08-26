import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/server/ai/openai-research-adapter", () => ({
  isResearchProviderConfigured: vi.fn(),
}));
vi.mock("@/server/repositories/workbench", () => ({
  getResearchJob: vi.fn(),
}));
vi.mock("@/server/services/research-workflow", () => ({
  processResearchJob: vi.fn(),
  requeueResearchJob: vi.fn(),
  researchJobCanBeRequeued: (status: string) => status === "configuration_required" || status === "failed",
}));

import { POST } from "@/app/api/research/[jobId]/run/route";
import { isResearchProviderConfigured } from "@/server/ai/openai-research-adapter";
import { getResearchJob } from "@/server/repositories/workbench";
import { processResearchJob, requeueResearchJob } from "@/server/services/research-workflow";
import {
  RESEARCH_EXTERNAL_TRANSMISSION_CONFIRMED,
  RESEARCH_EXTERNAL_TRANSMISSION_HEADER,
} from "@/lib/research-execution-consent";

const JOB_ID = "11111111-1111-4111-8111-111111111111";
const providerConfiguredMock = vi.mocked(isResearchProviderConfigured);
const getResearchJobMock = vi.mocked(getResearchJob);
const processResearchJobMock = vi.mocked(processResearchJob);
const requeueResearchJobMock = vi.mocked(requeueResearchJob);

function request(confirmed = true) {
  return POST(new Request(`https://app.example/api/research/${JOB_ID}/run`, {
    method: "POST",
    headers: confirmed
      ? { [RESEARCH_EXTERNAL_TRANSMISSION_HEADER]: RESEARCH_EXTERNAL_TRANSMISSION_CONFIRMED }
      : undefined,
  }), {
    params: Promise.resolve({ jobId: JOB_ID }),
  });
}

describe("explicit Research execution route", () => {
  beforeEach(() => {
    providerConfiguredMock.mockReset();
    getResearchJobMock.mockReset();
    processResearchJobMock.mockReset();
    requeueResearchJobMock.mockReset();
  });

  afterEach(() => vi.restoreAllMocks());

  it("requires a deliberate external-transmission confirmation header", async () => {
    const response = await request(false);
    expect(response.status).toBe(428);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: "research_external_transmission_confirmation_required",
    });
    expect(providerConfiguredMock).not.toHaveBeenCalled();
    expect(getResearchJobMock).not.toHaveBeenCalled();
  });

  it("fails closed before reading a job when the provider is disabled", async () => {
    providerConfiguredMock.mockReturnValue(false);
    const response = await request();
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: "research_provider_configuration_required",
    });
    expect(getResearchJobMock).not.toHaveBeenCalled();
  });

  it("requeues a parked job, processes it once, and returns the governed status", async () => {
    providerConfiguredMock.mockReturnValue(true);
    getResearchJobMock
      .mockResolvedValueOnce({ research_status: "configuration_required" } as never)
      .mockResolvedValueOnce({ research_status: "needs_review" } as never);
    processResearchJobMock.mockResolvedValue(JOB_ID);

    const response = await request();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, processedJobId: JOB_ID, status: "needs_review" });
    expect(requeueResearchJobMock).toHaveBeenCalledWith(JOB_ID);
    expect(processResearchJobMock).toHaveBeenCalledWith(JOB_ID);
  });

  it("does not run a completed or already-running job", async () => {
    providerConfiguredMock.mockReturnValue(true);
    getResearchJobMock.mockResolvedValue({ research_status: "approved" } as never);
    const response = await request();
    expect(response.status).toBe(409);
    expect(processResearchJobMock).not.toHaveBeenCalled();
  });
});
