import { analyzeAtlas, resolveContext } from '@/server/atlas/engine';
export function GET(request: Request) {
  try {
    const u = new URL(request.url);
    const query = Object.fromEntries(u.searchParams);
    const view = query.view ?? 'overview';
    return Response.json(
      analyzeAtlas(resolveContext(view === 'overview' ? [] : [view], query)),
    );
  } catch {
    return Response.json(
      { error: '지원하지 않는 분석 조건입니다.' },
      { status: 400 },
    );
  }
}
