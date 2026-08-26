import { NextRequest } from "next/server";

import { searchCatalog } from "@/server/repositories/catalog";
import { boundedJsonResponse } from "@/server/http/bounded-json";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) return boundedJsonResponse({ results: [], error: "query_too_short" }, { status: 400 });
  const limit = Math.min(Math.max(Number(request.nextUrl.searchParams.get("limit") ?? 30), 1), 100);
  const results = await searchCatalog(query, { limit });
  return boundedJsonResponse({ query, results });
}
