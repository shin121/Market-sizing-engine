import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SubtypeProfile } from "@/components/catalog-views";
import { getSubtype } from "@/server/repositories/catalog";

export const metadata: Metadata = { title: "Subtype 상세" };

export default async function SubtypePage({ params }: { params: Promise<{ subtypeId: string }> }) {
  const { subtypeId } = await params;
  const subtype = await getSubtype(subtypeId);
  if (!subtype) notFound();
  return <SubtypeProfile value={subtype} />;
}
