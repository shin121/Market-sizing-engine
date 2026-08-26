import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ArchetypeProfile } from "@/components/catalog-views";
import { getArchetype } from "@/server/repositories/catalog";

export const metadata: Metadata = { title: "Archetype 상세" };

export default async function ArchetypePage({ params }: { params: Promise<{ archetypeId: string }> }) {
  const { archetypeId } = await params;
  const archetype = await getArchetype(archetypeId);
  if (!archetype) notFound();
  return <ArchetypeProfile value={archetype} />;
}
