import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ResearchJobDetail } from "@/components/workbench-views";
import { getResearchJob } from "@/server/repositories/workbench";

export const metadata: Metadata = { title: "Research Job 상세" };

export default async function ResearchJobPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const job = await getResearchJob(jobId);
  if (!job) notFound();
  return <ResearchJobDetail value={job} />;
}
