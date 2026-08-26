import { processNextResearchJob } from "@/server/services/research-workflow";
import { getResearchEnvironment } from "@/server/env";

const pollingMs = getResearchEnvironment().RESEARCH_POLL_INTERVAL_MS;
let stopping = false;

process.once("SIGINT", () => { stopping = true; });
process.once("SIGTERM", () => { stopping = true; });

async function main(): Promise<void> {
  while (!stopping) {
    const processed = await processNextResearchJob();
    if (!processed) await new Promise((resolve) => setTimeout(resolve, pollingMs));
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
