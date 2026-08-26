import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DomainOverview } from "@/components/catalog-views";
import { getDomain } from "@/server/repositories/catalog";

export const metadata: Metadata = { title: "Domain 탐색" };

export default async function DomainPage({ params }: { params: Promise<{ domainCode: string }> }) {
  const { domainCode } = await params;
  const domain = await getDomain(domainCode);
  if (!domain) notFound();
  return <DomainOverview value={domain} />;
}
