import { getResearchJob } from "@/server/repositories/workbench";
import { boundedJsonResponse } from "@/server/http/bounded-json";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await context.params;
  const job = await getResearchJob(jobId);
  return job
    ? boundedJsonResponse(job)
    : boundedJsonResponse({ error: "research_job_not_found" }, { status: 404 });
}
