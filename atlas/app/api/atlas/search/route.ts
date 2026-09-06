import { searchAtlas, measure } from '@/server/atlas/engine';
import { estimateMarketValue } from '@/server/atlas/market-value';
export function GET(request: Request) {
  const url = new URL(request.url),
    q = url.searchParams.get('q') ?? '',
    scope = url.searchParams.get('spend') ?? undefined;
  try {
    const results = searchAtlas(q).map((e) => {
      const ids =
        e.kind === 'segment' ? (e.definition ?? e.id.split('~')) : [e.id];
      return {
        ...e,
        population: measure(ids).population,
        marketValue: estimateMarketValue(
          ids,
          e.kind === 'market' ? e.id : scope,
        ),
      };
    });
    return Response.json(
      { results },
      { headers: { 'Cache-Control': 'private,max-age=60' } },
    );
  } catch {
    return Response.json(
      { error: '지원하지 않는 지출 범위입니다.' },
      { status: 400 },
    );
  }
}
