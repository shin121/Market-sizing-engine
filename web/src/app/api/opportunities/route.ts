import { listOpportunities } from "@/server/repositories/workbench";
import { saveOpportunity } from "@/server/services/workbench-mutations";
import { boundedJsonResponse, parseBoundedJson, payloadErrorStatus } from "@/server/http/bounded-json";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  return boundedJsonResponse({ opportunities: await listOpportunities({
    boardId: url.searchParams.get("boardId") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
  }) });
}

export async function POST(request: Request) {
  try {
    const body = await parseBoundedJson(request) as Record<string, unknown>;
    for (const field of ["name", "problem", "hypothesis", "idea"] as const) {
      if (typeof body[field] !== "string" || !body[field].trim()) {
        return boundedJsonResponse({ error: `${field}_required` }, { status: 400 });
      }
    }
    if (typeof body.segmentId !== "string" || !body.segmentId.trim()) {
      return boundedJsonResponse({ error: "saved_segment_snapshot_required" }, { status: 400 });
    }
    const opportunityId = await saveOpportunity({
      boardId: typeof body.boardId === "string" ? body.boardId : null,
      segmentId: body.segmentId.trim(),
      name: String(body.name).trim(),
      problem: String(body.problem).trim(),
      hypothesis: String(body.hypothesis).trim(),
      idea: String(body.idea).trim(),
      revenueModel: typeof body.revenueModel === "string" ? body.revenueModel : null,
      price: typeof body.price === "string" ? body.price : null,
      channels: body.channels ?? [],
      competingAlternatives: body.competingAlternatives ?? body.competing_alternatives ?? [],
      assumptions: body.assumptions ?? [],
      nextExperiment: typeof body.nextExperiment === "string" ? body.nextExperiment : null,
      status: typeof body.status === "string" ? body.status : "discovered",
      notes: typeof body.notes === "string" ? body.notes : null,
      score: body.score ?? null,
      experiment: body.experiment ?? null,
    });
    return boundedJsonResponse({ opportunityId }, { status: 201 });
  } catch (error) {
    return boundedJsonResponse(
      { error: error instanceof Error ? error.message : "opportunity_request_failed" },
      { status: payloadErrorStatus(error) },
    );
  }
}
