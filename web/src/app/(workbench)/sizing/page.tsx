import type { Metadata } from "next";

import { EstimateDirectory } from "@/components/workbench-views";
import { listEstimates } from "@/server/repositories/workbench";

export const metadata: Metadata = { title: "시장규모 분석" };

export default async function SizingPage() {
  return <EstimateDirectory value={await listEstimates()} />;
}
