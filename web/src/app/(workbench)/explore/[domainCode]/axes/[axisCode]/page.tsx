import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AxisOverview } from "@/components/catalog-views";
import { getAxis, listSubtypes } from "@/server/repositories/catalog";

export const metadata: Metadata = { title: "분류축 탐색" };

export default async function AxisPage({ params }: { params: Promise<{ domainCode: string; axisCode: string }> }) {
  const { domainCode, axisCode } = await params;
  const [axis, subtypes] = await Promise.all([
    getAxis(domainCode, axisCode),
    listSubtypes({ domainCode, axisCode, limit: 100, offset: 0 }),
  ]);
  if (!axis) notFound();
  return <AxisOverview axisValue={axis} subtypeValue={subtypes} domainCode={domainCode} />;
}
