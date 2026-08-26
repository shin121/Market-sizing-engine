import { getSubtype } from "@/server/repositories/catalog";
import { boundedJsonResponse } from "@/server/http/bounded-json";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ subtypeId: string }> }) {
  const { subtypeId } = await context.params;
  const subtype = await getSubtype(subtypeId);
  return subtype
    ? boundedJsonResponse({ subtype })
    : boundedJsonResponse({ error: "subtype_not_found" }, { status: 404 });
}
