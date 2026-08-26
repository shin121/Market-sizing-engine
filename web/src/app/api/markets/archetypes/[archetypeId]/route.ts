import { getArchetype } from "@/server/repositories/catalog";
import { boundedJsonResponse } from "@/server/http/bounded-json";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ archetypeId: string }> }) {
  const { archetypeId } = await context.params;
  const archetype = await getArchetype(archetypeId);
  return archetype
    ? boundedJsonResponse({ archetype })
    : boundedJsonResponse({ error: "archetype_not_found" }, { status: 404 });
}
