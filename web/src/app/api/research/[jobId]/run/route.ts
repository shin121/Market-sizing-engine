import { isResearchProviderConfigured } from "@/server/ai/openai-research-adapter";
import { boundedJsonResponse } from "@/server/http/bounded-json";
import {
  RESEARCH_EXTERNAL_TRANSMISSION_CONFIRMED,
  RESEARCH_EXTERNAL_TRANSMISSION_HEADER,
} from "@/lib/research-execution-consent";
import { getResearchJob } from "@/server/repositories/workbench";
import {
  processResearchJob,
  requeueResearchJob,
  researchJobCanBeRequeued,
} from "@/server/services/research-workflow";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(
  request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await context.params;
  if (request.headers.get(RESEARCH_EXTERNAL_TRANSMISSION_HEADER)
    !== RESEARCH_EXTERNAL_TRANSMISSION_CONFIRMED) {
    return boundedJsonResponse(
      { ok: false, error: "research_external_transmission_confirmation_required" },
      { status: 428, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!isResearchProviderConfigured()) {
    return boundedJsonResponse(
      { ok: false, error: "research_provider_configuration_required" },
      { status: 409, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const before = await getResearchJob(jobId);
    if (!before) {
      return boundedJsonResponse({ ok: false, error: "research_job_not_found" }, { status: 404 });
    }
    if (researchJobCanBeRequeued(before.research_status)) {
      await requeueResearchJob(jobId);
    } else if (before.research_status !== "queued") {
      return boundedJsonResponse(
        { ok: false, error: "research_job_is_not_runnable", status: before.research_status },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }

    const processedJobId = await processResearchJob(jobId);
    if (!processedJobId) {
      return boundedJsonResponse(
        { ok: false, error: "research_job_not_ready_or_already_claimed" },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }
    const after = await getResearchJob(jobId);
    return boundedJsonResponse(
      { ok: true, processedJobId, status: after?.research_status ?? null },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "research_job_run_failed";
    return boundedJsonResponse(
      { ok: false, error: message },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
