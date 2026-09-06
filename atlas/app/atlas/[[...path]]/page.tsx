import Link from 'next/link';
import { analyzeAtlas, resolveContext } from '@/server/atlas/engine';
import { AtlasWorkbench } from '@/components/atlas/workbench';
export default async function AtlasPage({
  params,
  searchParams,
}: {
  params: Promise<{ path?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { path = [] } = await params,
    query = await searchParams;
  let context;
  try {
    context = resolveContext(path, query);
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
  return <AtlasWorkbench data={analyzeAtlas(context)} />;
}
