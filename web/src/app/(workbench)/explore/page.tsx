import type { Metadata } from "next";

import { DomainExplorer } from "@/components/catalog-views";
import { listDomainsForRequest } from "@/components/server-data";

export const metadata: Metadata = { title: "세그먼트 탐색" };

export default async function ExplorePage() {
  const domains = await listDomainsForRequest();
  return <DomainExplorer value={domains} />;
}
