import { researchCatalog } from '@/server/atlas/research-workspace';
import { researchHref } from '@/lib/research-explorer';
export function GET(request: Request) {
  const url = new URL(request.url),
    q = (url.searchParams.get('q') ?? '').trim().slice(0, 200);
  try {
    const results = q
      ? researchCatalog()
          .filter((c) =>
            [c.label, c.marketLabel, c.scope, c.job]
              .join(' ')
              .toLowerCase()
              .includes(q.toLowerCase()),
          )
          .slice(0, 40)
          .map((c) => ({
            id: c.key,
            label: c.label,
            kind: c.level === 'market' ? 'market' : 'segment',
            market: c.market,
            node: c.node,
            population: c.population,
            populationUnit: c.unit,
            low: c.low,
            high: c.high,
            marketValue: c.marketValue,
            scope: c.scope,
            url: researchHref(c.market, c.node),
            evidenceGrade: c.grade,
          }))
      : [];
    return Response.json(
      { model: 'external-research-v1', results },
      { headers: { 'Cache-Control': 'private,max-age=60' } },
    );
  } catch {
    return Response.json(
      { error: '외부 근거 기반 검색 결과를 불러오지 못했습니다.' },
      { status: 400 },
    );
  }
}
