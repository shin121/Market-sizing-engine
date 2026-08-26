import { closeDatabasePool } from "@/server/db";
import { getResearchEnvironment } from "@/server/env";
import { processResearchJob } from "@/server/services/research-workflow";

async function main(): Promise<void> {
  const requestedJobId = getResearchEnvironment().RESEARCH_JOB_ID;
  if (!requestedJobId) throw new Error("RESEARCH_JOB_ID is required for one-shot processing");
  const processedJobId = await processResearchJob(requestedJobId);
  if (!processedJobId) throw new Error("research_job_not_ready_or_not_queued");
  process.stdout.write(`${JSON.stringify({ processedJobId })}\n`);
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabasePool();
  });
