import type { Metadata } from "next";

import { ResearchQueueView } from "@/components/workbench-views";
import { listResearchJobsForRequest } from "@/components/server-data";
import { listReviewItems } from "@/server/repositories/workbench";

export const metadata: Metadata = { title: "리서치 작업" };

export default async function ResearchPage() {
  const [jobs, reviews] = await Promise.all([listResearchJobsForRequest(), listReviewItems()]);
  return <ResearchQueueView jobValue={jobs} reviewValue={reviews} />;
}
