import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ComparisonView } from "@/components/workbench-views";
import { getComparison } from "@/server/repositories/workbench";

export const metadata: Metadata = { title: "저장된 비교" };

export default async function SavedComparisonPage({ params }: { params: Promise<{ comparisonId: string }> }) {
  const { comparisonId } = await params;
  const comparison = await getComparison(comparisonId);
  if (!comparison) notFound();
  return <ComparisonView value={comparison} comparisonId={comparisonId} />;
}
