import {
  resolveResearchContext,
  researchWorkspace,
} from '@/server/atlas/research-workspace';
export function GET(request: Request) {
  try {
    const u = new URL(request.url);
    const query = Object.fromEntries(u.searchParams);
    const view = query.view ?? 'overview';
    const resolved = resolveResearchContext(
      view === 'overview' ? [] : [view],
      query,
    );
    if (resolved.unresolved.length)
      return Response.json(
        { status: 'not_estimable', unresolved: resolved.unresolved },
        { status: 422 },
      );
    return Response.json(researchWorkspace(resolved.context));
  } catch {
    return Response.json(
      { error: '지원하지 않는 분석 조건입니다.' },
      { status: 400 },
    );
  }
}
