import { NextRequest } from "next/server";

import { listSubtypes } from "@/server/repositories/catalog";
import { boundedJsonResponse } from "@/server/http/bounded-json";

export const dynamic = "force-dynamic";

function boundedInteger(value: string | null, fallback: number, maximum: number): number {
  const parsed = Number(value ?? fallback);
  return Number.isInteger(parsed) && parsed >= 0 ? Math.min(parsed, maximum) : fallback;
}

export async function GET(request: NextRequest) {
  const limit = boundedInteger(request.nextUrl.searchParams.get("limit"), 50, 200);
  const offset = boundedInteger(request.nextUrl.searchParams.get("offset"), 0, 100_000);
  const subtypes = await listSubtypes({
    domainCode: request.nextUrl.searchParams.get("domain") ?? undefined,
    query: request.nextUrl.searchParams.get("q") ?? undefined,
    limit,
    offset,
  });
  return boundedJsonResponse({ subtypes, limit, offset, hasMore: subtypes.length === limit });
}
