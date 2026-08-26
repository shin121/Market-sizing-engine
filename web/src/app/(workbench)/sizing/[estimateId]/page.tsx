import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { EstimateDetail } from "@/components/workbench-views";
import { parseMarketScenarioSelection } from "@/domain/market-scenario-selection";
import { getEstimate } from "@/server/repositories/workbench";

export const metadata: Metadata = { title: "Estimate 상세" };

export default async function EstimatePage({
  params,
  searchParams,
}: {
  params: Promise<{ estimateId: string }>;
  searchParams: Promise<{
    scenarioId?: string | string[];
    scenarioVersion?: string | string[];
  }>;
}) {
  const { estimateId } = await params;
  const query = await searchParams;
  const parsedSelection = parseMarketScenarioSelection({
    scenarioId: query.scenarioId,
    scenarioVersion: query.scenarioVersion,
  });
  if (!parsedSelection.ok) notFound();
  const estimate = await getEstimate(estimateId, parsedSelection.selection);
  if (!estimate) notFound();
  return <EstimateDetail value={estimate} />;
}
