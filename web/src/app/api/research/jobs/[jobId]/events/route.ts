import { NextRequest } from "next/server";

import { withWorkspaceTransaction } from "@/server/db";
import { boundedJsonResponse } from "@/server/http/bounded-json";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await context.params;
  const requestedAfter = Number(request.nextUrl.searchParams.get("after") ?? 0);
  const after = Number.isFinite(requestedAfter) && requestedAfter >= 0
    ? Math.floor(requestedAfter)
    : 0;
  const payload = await withWorkspaceTransaction(async (client) => {
    const job = await client.query<{ status: string; updated_at: string; error_code: string | null; error_message: string | null }>(
      "SELECT status,updated_at,error_code,error_message FROM research_job WHERE research_job_id=$1",
      [jobId],
    );
    if (!job.rows[0]) return null;
    const events = await client.query(
      `SELECT research_job_event_id,sequence_no,event_type,payload,occurred_at
       FROM research_job_event
       WHERE research_job_id=$1 AND sequence_no>$2
       ORDER BY sequence_no LIMIT 200`,
      [jobId, after],
    );
    return { ...job.rows[0], events: events.rows };
  });
  if (!payload) return boundedJsonResponse({ error: "research_job_not_found" }, { status: 404 });
  return boundedJsonResponse(payload, { headers: { "Cache-Control": "no-store" } });
}
