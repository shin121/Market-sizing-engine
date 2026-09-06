import { getProfile } from '@/server/atlas/engine';
import { assertIds, registry } from '@/server/atlas/source';
import { addEconomicScore } from '@/server/atlas/market-value-service';
import {
  estimateMarketValue,
  inferSpendScope,
} from '@/server/atlas/market-value';
import { canonicalIds } from '@/lib/atlas';

export function GET(request: Request) {
  try {
    const q = new URL(request.url).searchParams;
    const ids = canonicalIds((q.get('q') ?? '').split('~').filter(Boolean));
    assertIds(ids, 8);
    const scope = q.get('spend') || inferSpendScope(ids);
    if (scope !== 'covered' && registry.get(scope)?.kind !== 'market')
      throw Error('scope');
    const p = getProfile(ids, false);
    return Response.json({
      ...p,
      summary: {
        ...addEconomicScore(p.summary, scope),
        estimate: p.summary.estimate,
        marketValue: estimateMarketValue(ids, scope),
      },
    });
  } catch {
    return Response.json(
      {
        error:
          '저장된 조건을 불러올 수 없습니다. 조건과 지출 범위를 확인해 주세요.',
      },
      { status: 400 },
    );
  }
}
