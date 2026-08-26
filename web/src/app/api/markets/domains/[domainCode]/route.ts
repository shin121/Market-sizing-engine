import { getDomain } from "@/server/repositories/catalog";
import { boundedJsonResponse } from "@/server/http/bounded-json";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ domainCode: string }> }) {
  const { domainCode } = await context.params;
  const domain = await getDomain(domainCode);
  return domain
    ? boundedJsonResponse({ domain })
    : boundedJsonResponse({ error: "domain_not_found" }, { status: 404 });
}
