import { listResearchJobs } from "@/server/repositories/workbench";
import { createResearchJob } from "@/server/services/research-workflow";
import { boundedJsonResponse, parseBoundedJson, payloadErrorStatus } from "@/server/http/bounded-json";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  return boundedJsonResponse({ jobs: await listResearchJobs({ status: url.searchParams.get("status") ?? undefined }) });
}

export async function POST(request: Request) {
  try {
    const body = await parseBoundedJson(request) as Record<string, unknown>;
    const researchQuestion = typeof body.researchQuestion === "string" ? body.researchQuestion.trim() : "";
    const targetSegment = typeof body.targetSegment === "string" ? body.targetSegment.trim() : "";
    const targetVariable = typeof body.targetVariable === "string" ? body.targetVariable.trim() : "";
    if (!researchQuestion || !targetSegment || !targetVariable) {
      return boundedJsonResponse({ error: "research_question_target_segment_and_target_variable_required" }, { status: 400 });
    }
    const result = await createResearchJob({
      segmentId: typeof body.segmentId === "string" ? body.segmentId : null,
      researchQuestion,
      targetSegment,
      targetVariable,
      baseline: body.baseline,
    });
    return boundedJsonResponse(result, { status: 201 });
  } catch (error) {
    return boundedJsonResponse(
      { error: error instanceof Error ? error.message : "research_request_failed" },
      { status: payloadErrorStatus(error) },
    );
  }
}
