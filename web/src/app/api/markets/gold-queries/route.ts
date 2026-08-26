import { boundedJsonResponse } from "@/server/http/bounded-json";
import { listEstimates } from "@/server/repositories/workbench";

export const dynamic = "force-dynamic";

export async function GET() {
  const estimates = await listEstimates({ limit: 200 });
  const goldQueries = estimates.filter((estimate) => estimate.subject_type === "gold_query");
  return boundedJsonResponse({ goldQueries, count: goldQueries.length });
}
