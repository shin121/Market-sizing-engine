import type { Metadata } from "next";

import { ComparisonView } from "@/components/workbench-views";
import { compareSegments } from "@/server/repositories/workbench";

export const metadata: Metadata = { title: "세그먼트 비교" };

export default async function ComparePage({ searchParams }: { searchParams: Promise<{ ids?: string | string[] }> }) {
  const query = await searchParams;
  const raw = Array.isArray(query.ids) ? query.ids.join(",") : query.ids ?? "";
  const ids = [...new Set(raw.split(",").map((item) => item.trim()).filter(Boolean))].slice(0, 5);
  const comparison = ids.length >= 2 ? await compareSegments(ids) : { items: [] };
  return <ComparisonView value={comparison} selectedIds={ids} />;
}
