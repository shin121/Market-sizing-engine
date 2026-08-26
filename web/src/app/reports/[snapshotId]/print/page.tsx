import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PrintableReport } from "@/components/workbench-views";
import { parseMarketScenarioSelection } from "@/domain/market-scenario-selection";
import { getReportSnapshot } from "@/server/repositories/workbench";

export const metadata: Metadata = { title: "인쇄 보고서" };

export default async function PrintReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ snapshotId: string }>;
  searchParams: Promise<{
    scenarioId?: string | string[];
    scenarioVersion?: string | string[];
    scenarioSelectionMode?: string | string[];
  }>;
}) {
  const { snapshotId } = await params;
  const query = await searchParams;
  const parsedSelection = parseMarketScenarioSelection({
    scenarioId: query.scenarioId,
    scenarioVersion: query.scenarioVersion,
    scenarioSelectionMode: query.scenarioSelectionMode,
  });
  if (!parsedSelection.ok) notFound();
  const snapshot = await getReportSnapshot("estimate", snapshotId, parsedSelection.selection);
  if (!snapshot) notFound();
  return <PrintableReport value={snapshot} />;
}
