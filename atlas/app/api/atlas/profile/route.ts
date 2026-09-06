import { resolveResearchContext } from '@/server/atlas/research-workspace';
import { getResearchExplorer } from '@/server/atlas/research-explorer';
export function GET(request: Request) {
  const query = Object.fromEntries(new URL(request.url).searchParams);
  const { context, unresolved } = resolveResearchContext([], query);
  if (unresolved.length || !context.market)
    return Response.json(
      {
        status: 'not_estimable',
        unresolved,
        error: '외부 근거가 연결된 시장과 조건을 선택하세요.',
      },
      { status: 422 },
    );
  const data = getResearchExplorer(context.market, context.age)!;
  const profile =
    !context.node || context.node === '_root'
      ? data.root
      : data.branches
          .flatMap((b) => [b.profile, ...b.children])
          .find((p) => p.id === context.node);
  return Response.json({ model: data.version, market: data.market, profile });
}
