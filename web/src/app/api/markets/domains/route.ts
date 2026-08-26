import { listDomains } from "@/server/repositories/catalog";
import { boundedJsonResponse } from "@/server/http/bounded-json";

export const dynamic = "force-dynamic";

export async function GET() {
  const domains = await listDomains();
  return boundedJsonResponse({ domains, count: domains.length });
}
