import { listEstimates } from "@/server/repositories/workbench";
import { calculateEstimate } from "@/server/services/segment-workflow";
import { boundedJsonResponse, parseBoundedJson, payloadErrorStatus } from "@/server/http/bounded-json";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const PRODUCTION_ESTIMATE_ID = /^(?:domain-(?:universe|market):DOM-\d{2}|gold-query:GOLD\d{2})$/u;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? undefined;
  const estimateId = url.searchParams.get("estimateId") ?? undefined;
  if (estimateId && !UUID.test(estimateId) && !PRODUCTION_ESTIMATE_ID.test(estimateId)) {
    return boundedJsonResponse({ error: "invalid_estimate_id" }, { status: 400 });
  }
  return boundedJsonResponse({ estimates: await listEstimates({ status, estimateId }) });
}

export async function POST(request: Request) {
  try {
    const body = await parseBoundedJson(request) as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const entityUnit = typeof body.entityUnit === "string" ? body.entityUnit : "";
    if (!name || !entityUnit) {
      return boundedJsonResponse({ error: "name_and_entity_unit_required" }, { status: 400 });
    }
    const estimateId = await calculateEstimate({
      segmentId: typeof body.segmentId === "string" ? body.segmentId : null,
      name,
      entityUnit,
      conditions: body.conditions ?? [],
    });
    return boundedJsonResponse({ estimateId }, { status: 201 });
  } catch (error) {
    return boundedJsonResponse(
      { error: error instanceof Error ? error.message : "estimate_request_failed" },
      { status: payloadErrorStatus(error) },
    );
  }
}
