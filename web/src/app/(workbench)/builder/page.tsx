import type { Metadata } from "next";

import { SegmentBuilder } from "@/components/builder";
import { normalizeBuilderInitial, normalizeConditionLibrary } from "@/components/builder-data";
import { PageHeading } from "@/components/ui";
import { getConditionLibrary } from "@/server/repositories/catalog";

export const metadata: Metadata = { title: "세그먼트 빌더" };

export default async function BuilderPage({ searchParams }: { searchParams: Promise<{ condition?: string | string[] }> }) {
  const query = await searchParams;
  const requestedCondition = Array.isArray(query.condition) ? query.condition[0] : query.condition;
  const [initialLibrary, requestedLibrary] = await Promise.all([
    getConditionLibrary(),
    requestedCondition
      ? getConditionLibrary({ catalogId: requestedCondition, balancedSample: false, limit: 1 })
      : Promise.resolve([]),
  ]);
  const library = [...new Map([...initialLibrary, ...requestedLibrary].map((item) => [item.catalogId, item])).values()];
  const normalizedLibrary = normalizeConditionLibrary(library);
  const option = requestedCondition
    ? normalizedLibrary.find((item) => item.id === requestedCondition)
    : undefined;
  const initial = normalizeBuilderInitial();
  if (option) {
    initial.name = `${option.label} 세그먼트`;
    initial.entityUnit = option.unit && option.unit !== "all" ? option.unit : initial.entityUnit;
    initial.groups = [{
      id: "prefilled-group-root",
      logic: "AND",
      enabled: true,
      conditions: [{
        id: "prefilled-condition",
        sourceId: option.id,
        sourceKind: option.sourceKind,
        label: option.label,
        group: option.group,
        unit: option.unit,
        operator: option.values.length ? "eq" : "exists",
        value: option.values[0] ?? "",
        matchStatus: option.status ?? "exact",
        referenceYear: null,
        enabled: true,
      }],
      groups: [],
    }];
  }
  return (
    <div className="page-stack builder-page">
      <PageHeading eyebrow="COMPOUND SEGMENT BUILDER" title="관찰 단서를 조합해 새로운 시장을 만드세요" description="자연어 해석은 후보일 뿐입니다. 구조화 조건과 분모 단위를 확인한 뒤 서버 계산을 실행하세요." />
      <SegmentBuilder library={normalizedLibrary} initial={initial} />
    </div>
  );
}
