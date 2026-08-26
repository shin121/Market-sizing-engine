import { NextRequest } from "next/server";

import type { EntityUnit } from "@/domain/entity-units";
import { encodeArchetypeCursor, listArchetypes } from "@/server/repositories/catalog";
import { boundedJsonResponse } from "@/server/http/bounded-json";

export const dynamic = "force-dynamic";

function minimumConfidence(value: string | null): number | undefined {
  if (value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100 ? parsed : undefined;
}

export async function GET(request: NextRequest) {
  const requestedLimit = Number(request.nextUrl.searchParams.get("limit") ?? 50);
  const limit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 200) : 50;
  const requestedUnit = request.nextUrl.searchParams.get("unit");
  const entityUnit = requestedUnit && ["person", "child_person", "household", "establishment", "enterprise"].includes(requestedUnit)
    ? requestedUnit as EntityUnit
    : undefined;
  const archetypes = await listArchetypes({
    domainCode: request.nextUrl.searchParams.get("domain") ?? undefined,
    subtypeId: request.nextUrl.searchParams.get("subtype") ?? undefined,
    entityUnit,
    query: request.nextUrl.searchParams.get("q") ?? undefined,
    feature: request.nextUrl.searchParams.get("feature") ?? undefined,
    behavior: request.nextUrl.searchParams.get("behavior") ?? undefined,
    region: request.nextUrl.searchParams.get("region") ?? undefined,
    household: request.nextUrl.searchParams.get("household") ?? undefined,
    occupation: request.nextUrl.searchParams.get("occupation") ?? undefined,
    income: request.nextUrl.searchParams.get("income") ?? undefined,
    business: request.nextUrl.searchParams.get("business") ?? undefined,
    estimateGrade: (["A", "B", "C", "D", "E"] as const).find(
      (grade) => grade === request.nextUrl.searchParams.get("estimateGrade"),
    ),
    minConfidence: minimumConfidence(request.nextUrl.searchParams.get("minConfidence")),
    sort: request.nextUrl.searchParams.get("sort") ?? "name",
    cursor: request.nextUrl.searchParams.get("cursor") ?? undefined,
    limit: limit + 1,
  });
  const hasMore = archetypes.length > limit;
  const page = archetypes.slice(0, limit);
  return boundedJsonResponse({
    archetypes: page,
    hasMore,
    nextCursor: hasMore && page.length ? encodeArchetypeCursor(page.at(-1)!) : null,
  });
}
