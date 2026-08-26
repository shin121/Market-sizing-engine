import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { OpportunityDetail } from "@/components/workbench-views";
import { getOpportunity } from "@/server/repositories/workbench";

export const metadata: Metadata = { title: "Opportunity 상세" };

export default async function OpportunityPage({ params }: { params: Promise<{ opportunityId: string }> }) {
  const { opportunityId } = await params;
  const opportunity = await getOpportunity(opportunityId);
  if (!opportunity) notFound();
  return <OpportunityDetail value={opportunity} />;
}
