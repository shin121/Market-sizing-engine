import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { GovernanceRecordDetail } from "@/components/workbench-views";
import { getSource } from "@/server/repositories/governance";

export const metadata: Metadata = { title: "출처 상세" };

export default async function SourcePage({ params }: { params: Promise<{ sourceId: string }> }) {
  const { sourceId } = await params;
  const source = await getSource(sourceId);
  if (!source) notFound();
  return <GovernanceRecordDetail value={source} kind="source" />;
}
