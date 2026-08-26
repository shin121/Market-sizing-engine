import type { Metadata } from "next";

import { SearchResults } from "@/components/catalog-views";
import { searchCatalog } from "@/server/repositories/catalog";

export const metadata: Metadata = { title: "통합 검색" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const params = await searchParams;
  const query = (Array.isArray(params.q) ? params.q[0] : params.q)?.trim() ?? "";
  const results = query ? await searchCatalog(query) : [];
  return <SearchResults value={results} query={query} />;
}
