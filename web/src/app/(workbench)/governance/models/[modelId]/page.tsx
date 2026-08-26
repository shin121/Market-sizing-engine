import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { GovernanceRecordDetail } from "@/components/workbench-views";
import { getModel } from "@/server/repositories/governance";

export const metadata: Metadata = { title: "모델 상세" };

export default async function ModelPage({ params }: { params: Promise<{ modelId: string }> }) {
  const { modelId } = await params;
  const model = await getModel(modelId);
  if (!model) notFound();
  return <GovernanceRecordDetail value={model} kind="model" />;
}
