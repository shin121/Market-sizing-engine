import Link from 'next/link';
import { getResearchExplorer } from '@/server/atlas/research-explorer';
import { ResearchFlow } from '@/components/atlas/research-flow';
import type { MoneyMetric } from '@/lib/market-value';
export default async function ResearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ market: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { market } = await params,
    query = await searchParams;
  const age = typeof query.age === 'string' ? query.age : '';
  const data = getResearchExplorer(market, age);
  const rawNode = typeof query.node === 'string' ? query.node : '';
  const node =
    data && rawNode === market && !data.branches.some((b) => b.id === rawNode)
      ? '_root'
      : rawNode;
  const invalidNode =
    data &&
    node &&
    ![
      data.root.id,
      ...data.branches.flatMap((b) => [b.id, ...b.children.map((c) => c.id)]),
    ].includes(node);
  if (
    !data ||
    invalidNode ||
    (age && !['20', '30', '40', '50', '60', '70'].includes(age))
  )
    return (
      <main className="route-error">
        <h1>시장 또는 선택 조건을 찾을 수 없습니다</h1>
        <Link href="/atlas">전체 시장</Link>
      </main>
    );
  return (
    <ResearchFlow
      key={market + String(query.node) + age}
      data={data}
      node={node}
      age={age}
      metric={
        typeof query.metric === 'string' &&
        ['population', 'marketValue', 'spendPerUnit', 'index'].includes(
          query.metric,
        )
          ? (query.metric as MoneyMetric)
          : 'population'
      }
      compare={
        typeof query.compare === 'string'
          ? query.compare.split('|').slice(0, 3)
          : []
      }
    />
  );
}
