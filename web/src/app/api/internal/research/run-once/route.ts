import { boundedJsonResponse } from "@/server/http/bounded-json";
import { configuredResearchWorkerSecret, bearerMatchesSecret } from "@/lib/research-worker-auth";
import { getResearchEnvironment } from "@/server/env";
import { processNextResearchJob } from "@/server/services/research-workflow";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

async function run(request: Request) {
  const workerSecret = configuredResearchWorkerSecret();
  if (!workerSecret) {
    return boundedJsonResponse(
      { ok: false, error: "research_worker_auth_configuration_required" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!await bearerMatchesSecret(request, workerSecret)) {
    return boundedJsonResponse(
      { ok: false, error: "research_worker_authentication_required" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const { RESEARCH_CRON_MAX_JOBS: maxJobs } = getResearchEnvironment();
  const processedJobIds: string[] = [];
  try {
    for (let index = 0; index < maxJobs; index += 1) {
      const processedJobId = await processNextResearchJob();
      if (!processedJobId) break;
      processedJobIds.push(processedJobId);
    }
    return boundedJsonResponse(
      { ok: true, processedJobIds, processedCount: processedJobIds.length },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "research_worker_invocation_failed";
    return boundedJsonResponse(
      { ok: false, error: message },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function GET(request: Request) {
  return run(request);
}

export async function POST(request: Request) {
  return run(request);
}
