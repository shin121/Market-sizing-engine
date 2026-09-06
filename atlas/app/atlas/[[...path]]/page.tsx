import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  resolveResearchContext,
  researchWorkspace,
} from '@/server/atlas/research-workspace';
import { ResearchWorkbench } from '@/components/atlas/research-workbench';
import { researchHref } from '@/lib/research-explorer';
export default async function AtlasPage({
  params,
  searchParams,
}: {
  params: Promise<{ path?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { path = [] } = await params,
    query = await searchParams;
  let resolved;
  try {
    resolved = resolveResearchContext(path, query);
  } catch {
    return (
      <main className="route-error">
        <h1>이 탐색 경로를 열 수 없습니다</h1>
        <p>
          조건이나 주소를 확인해 주세요. 최대 8개 조건을 조합할 수 있습니다.
        </p>
        <Link href="/atlas">전체 시장으로 돌아가기</Link>
      </main>
    );
  }
  if (
    !resolved.unresolved.length &&
    resolved.context.market &&
    (path.length === 2 || path[0] === 'relationship')
  ) {
    redirect(
      researchHref(
        resolved.context.market,
        resolved.context.node || '_root',
        resolved.context.age,
        resolved.context.compare,
        resolved.context.metric,
      ),
    );
  }
  return (
    <ResearchWorkbench
      key={JSON.stringify(resolved.context)}
      data={researchWorkspace(resolved.context, resolved.unresolved)}
    />
  );
}
