import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DomainOverview } from "@/components/catalog-views";
import { getDomain, listArchetypes } from "@/server/repositories/catalog";

export const metadata: Metadata = { title: "Domain 탐색" };

export default async function DomainPage({ params }: { params: Promise<{ domainCode: string }> }) {
  const { domainCode } = await params;
  const [domain, archetypes] = await Promise.all([
    getDomain(domainCode),
    listArchetypes({ domainCode, sort: "count", limit: 24 }),
  ]);
  if (!domain) notFound();
  return <DomainOverview value={domain} archetypesValue={{ archetypes }} />;
}
