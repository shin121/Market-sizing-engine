import { NextRequest } from "next/server";

import {
  getConditionLibrary,
  type CatalogEntityUnit,
  type ConditionSourceKind,
} from "@/server/repositories/catalog";
import { boundedJsonResponse } from "@/server/http/bounded-json";

export const dynamic = "force-dynamic";

const SOURCE_KINDS = new Set<ConditionSourceKind>([
  "core_feature",
  "domain_feature",
  "dimension_value",
  "behavior",
  "tag",
  "subtype",
  "archetype",
  "geography",
]);
const ENTITY_UNITS = new Set<CatalogEntityUnit>([
  "person",
  "child_person",
  "household",
  "establishment",
  "enterprise",
  "all",
]);

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const browse = request.nextUrl.searchParams.get("browse") === "true";
  if (!browse && query.length < 2) {
    return boundedJsonResponse({ conditions: [], error: "query_too_short" }, { status: 400 });
  }
  if (query.length > 200) {
    return boundedJsonResponse({ conditions: [], error: "query_too_long" }, { status: 400 });
  }

  const requestedKinds = (request.nextUrl.searchParams.get("kinds") ?? "")
    .split(",")
    .filter((kind): kind is ConditionSourceKind => SOURCE_KINDS.has(kind as ConditionSourceKind));
  const requestedUnit = request.nextUrl.searchParams.get("unit") ?? "";
  const entityUnit = ENTITY_UNITS.has(requestedUnit as CatalogEntityUnit)
    ? requestedUnit as CatalogEntityUnit
    : undefined;
  const limit = Math.min(Math.max(Number(request.nextUrl.searchParams.get("limit") ?? 80) || 80, 1), 100);
  const offset = Math.min(Math.max(Number(request.nextUrl.searchParams.get("offset") ?? 0) || 0, 0), 100_000);
  const registryPage = await getConditionLibrary({
    query: query || undefined,
    sourceKinds: requestedKinds.length ? requestedKinds : undefined,
    entityUnit,
    balancedSample: !browse,
    limit: limit + 1,
    offset,
  });
  const hasMore = registryPage.length > limit;
  const conditions = registryPage.slice(0, limit);

  return boundedJsonResponse(
    {
      mode: browse ? "browse" : "search",
      query,
      offset,
      conditions,
      hasMore,
      nextOffset: hasMore ? offset + conditions.length : null,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
