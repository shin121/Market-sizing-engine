import { listSavedSegments } from "@/server/repositories/workbench";
import { calculateEstimate, saveSegment } from "@/server/services/segment-workflow";
import { boundedJsonResponse, parseBoundedJson, payloadErrorStatus } from "@/server/http/bounded-json";

export const runtime = "nodejs";

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function GET() {
  return boundedJsonResponse({ segments: await listSavedSegments({ limit: 100, offset: 0 }) });
}

export async function POST(request: Request) {
  try {
    const body = await parseBoundedJson(request) as Record<string, unknown>;
    const name = text(body.name);
    const entityUnit = text(body.entityUnit ?? body.entity_unit);
    if (!name || !entityUnit || !Array.isArray(body.conditions)) {
      return boundedJsonResponse({ error: "name_entity_unit_and_conditions_required" }, { status: 400 });
    }
    const naturalLanguage = text(body.naturalLanguage ?? body.natural_language);
    const segmentId = await saveSegment({
      name,
      entityUnit,
      naturalLanguage,
      conditions: body.conditions,
    });
    const estimateId = body.calculate === false ? null : await calculateEstimate({
      segmentId,
      name,
      entityUnit,
      conditions: body.conditions,
    });
    return boundedJsonResponse({ segmentId, estimateId }, { status: 201 });
  } catch (error) {
    return boundedJsonResponse(
      { error: error instanceof Error ? error.message : "segment_request_failed" },
      { status: payloadErrorStatus(error) },
    );
  }
}
