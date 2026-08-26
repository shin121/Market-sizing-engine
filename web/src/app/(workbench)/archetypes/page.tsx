import type { Metadata } from "next";

import { ArchetypeDirectory } from "@/components/catalog-views";
import { getArchetypeRegistryCount, listArchetypes } from "@/server/repositories/catalog";

export const metadata: Metadata = { title: "Archetype 탐색" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

const SORT_OPTIONS = new Set(["name", "count", "confidence", "updated"] as const);

function archetypeSort(value: string | undefined): "name" | "count" | "confidence" | "updated" | undefined {
  return SORT_OPTIONS.has(value as "name" | "count" | "confidence" | "updated")
    ? (value as "name" | "count" | "confidence" | "updated")
    : undefined;
}

function minimumConfidence(value: string | undefined): number | undefined {
  if (value === undefined || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100 ? parsed : undefined;
}

export default async function ArchetypesPage({ searchParams }: { searchParams: SearchParams }) {
  const query = await searchParams;
  const filters = {
    q: first(query.q),
    domain: first(query.domain),
    subtype: first(query.subtype),
    axis: first(query.axis),
    feature: first(query.feature),
    behavior: first(query.behavior),
    unit: first(query.unit),
    age: first(query.age),
    region: first(query.region),
    household: first(query.household),
    occupation: first(query.occupation),
    income: first(query.income),
    business: first(query.business),
    estimateGrade: first(query.estimateGrade),
    minConfidence: first(query.minConfidence),
    sort: archetypeSort(first(query.sort)),
  };
  const page = Math.max(1, Number(first(query.page) ?? "1") || 1);
  const limit = 50;
  const [value, registryTotal] = await Promise.all([
    listArchetypes({
      q: filters.q,
      domainCode: filters.domain,
      subtypeId: filters.subtype,
      axisCode: filters.axis,
      feature: filters.feature,
      behavior: filters.behavior,
      unit: filters.unit,
      age: filters.age,
      region: filters.region,
      household: filters.household,
      occupation: filters.occupation,
      income: filters.income,
      business: filters.business,
      estimateGrade: (["A", "B", "C", "D", "E"] as const).find(
        (grade) => grade === filters.estimateGrade,
      ),
      minConfidence: minimumConfidence(filters.minConfidence),
      sort: filters.sort,
      limit: limit + 1,
      offset: (page - 1) * limit,
    }),
    getArchetypeRegistryCount(),
  ]);
  return <ArchetypeDirectory value={{ archetypes: value.slice(0, limit), page, pageSize: limit, hasNext: value.length > limit, registryTotal }} filters={filters} />;
}
