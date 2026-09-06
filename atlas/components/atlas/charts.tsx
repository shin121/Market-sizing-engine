'use client';
import Link from 'next/link';
import { formatKRW } from '@/lib/market-value';
import { useState } from 'react';
import {
  conditionKey,
  shortPopulation,
  pct,
  indexLabel,
  type Summary,
  type AtlasContext,
  type Stat,
} from '@/lib/atlas';
import { href, Entry, JointLink } from './common';
const colors: Record<string, string> = {
  trust: '#7152ae',
  engagement: '#286d79',
  channel: '#087b6b',
  purchase: '#48629a',
  premium: '#8c60a2',
  value: '#827047',
  pain: '#81636c',
};
export function color(f: string) {
  return colors[f] ?? '#527c76';
}
type Rect = { s: Summary; x: number; y: number; w: number; h: number };
function tile(items: Summary[], w = 1000, h = 380, monetary = false): Rect[] {
  const size = (s: Summary) =>
    monetary ? (s.marketValue?.base ?? 0) : s.estimate.population;
  let x = 0,
    y = 0;
  const total = items.reduce((v, s) => v + size(s), 0);
  if (!total) return [];
  const todo = items.map((s) => ({
    s,
    area: (size(s) / total) * w * h,
  }));
  const out: Rect[] = [];
  const worst = (r: typeof todo, side: number) => {
    const sum = r.reduce((v, x) => v + x.area, 0);
    return Math.max(
      (side * side * Math.max(...r.map((x) => x.area))) / (sum * sum),
      (sum * sum) / (side * side * Math.min(...r.map((x) => x.area))),
    );
  };
  while (todo.length) {
    const side = Math.min(w, h),
      row = [todo.shift()!];
    while (todo.length && worst([...row, todo[0]], side) <= worst(row, side))
      row.push(todo.shift()!);
    const a = row.reduce((s, v) => s + v.area, 0);
    let offset = 0;
    if (w >= h) {
      const rw = a / h;
      for (const r of row) {
        const rh = r.area / rw;
        out.push({ x, y: y + offset, w: rw, h: rh, s: r.s });
        offset += rh;
      }
      x += rw;
      w -= rw;
    } else {
      const rh = a / w;
      for (const r of row) {
        const rw = r.area / rh;
        out.push({ x: x + offset, y, w: rw, h: rh, s: r.s });
        offset += rw;
      }
      y += rh;
      h -= rh;
    }
  }
  return out;
}
export function MarketMap({
  items,
  context,
}: {
  items: Summary[];
  context: AtlasContext;
}) {
  const [hover, setHover] = useState<Summary | null>(null);
  const monetary = context.metric === 'marketValue';
  const available = monetary
    ? items
        .filter((s) => (s.marketValue?.base ?? 0) > 0)
        .sort((a, b) => b.marketValue!.base! - a.marketValue!.base!)
    : items;
  const tiles = tile(available, 1000, 380, monetary);
  return (
    <>
      <div
        className="atlas-map"
        aria-label={
          context.lens === 'people' ? '소비 유형 시장 지도' : '산업별 시장 지도'
        }
      >
        {tiles.map(({ s, x, y, w, h }) => (
          <Link
            prefetch={false}
            key={conditionKey(s.ids)}
            href={href(s.entity, context)}
            className="map-tile"
            style={{
              left: x / 10 + '%',
              top: y / 3.8 + '%',
              width: w / 10 + '%',
              height: h / 3.8 + '%',
              background: color(s.entity.family),
            }}
            onMouseEnter={() => setHover(s)}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(s)}
            onBlur={() => setHover(null)}
            title={`${s.entity.label} · 약 ${shortPopulation(s.estimate.population)}명 · ${formatKRW(s.marketValue?.base)} / 년 · ${s.marketValue?.scopeLabel}`}
            aria-label={`${s.entity.label} 대시보드, 약 ${shortPopulation(s.estimate.population)}명${monetary ? ', ' + formatKRW(s.marketValue?.base) + ' / 년' : ''}`}
          >
            {w > 95 && h > 57 && (
              <>
                <b>{s.entity.label.replaceAll(' × ', ' · ')}</b>
                {h > 88 && (
                  <span>
                    {monetary
                      ? formatKRW(s.marketValue?.base, false) + ' / 년'
                      : '≈ ' + shortPopulation(s.estimate.population) + '명'}
                  </span>
                )}
                {h > 110 && w > 140 && (
                  <small>
                    Opportunity {s.metrics.opportunity} ·{' '}
                    {s.metrics.crossIndustryBreadth}개 산업
                  </small>
                )}
              </>
            )}
          </Link>
        ))}
      </div>
      {monetary && !available.length && (
        <p className="empty money-empty">
          선택 범위에 지출 기준이 없습니다. 인구 Lens로 탐색하거나 지출 범위를
          변경하세요.
        </p>
      )}
      <div className="map-caption">
        <span>
          {hover
            ? `${hover.entity.label} · 약 ${shortPopulation(hover.estimate.population)}명 · 전체 ${pct(hover.estimate.share)}`
            : monetary
              ? '면적 = 확보 범위의 연간 소비액 · 유형은 중복되며, 전체 소비시장 합계가 아닙니다.'
              : '면적 = 유형별 추정 인구 / 유형 합계 · 유형과 시장은 서로 중복되며, 전체 인구의 분할이 아닙니다.'}
        </span>
        <span>
          {available.length}/{items.length}개 항목
          {monetary ? ' · 금액 미확보 항목 제외' : ''}
        </span>
      </div>
    </>
  );
}
export function AgeChart({
  stats,
  context,
}: {
  stats: Stat[];
  context: AtlasContext;
}) {
  const age = stats.filter((s) => s.entity.kind === 'age'),
    max = Math.max(0.01, ...age.map((s) => s.share));
  return (
    <div className="age-chart">
      {age.map((s) => (
        <JointLink
          key={s.entity.id}
          condition={s.entity.id}
          context={context}
          title={`${s.entity.label} · ${pct(s.share)} · 전체 대비 ${indexLabel(s.index)}`}
        >
          <strong>{pct(s.share, 0)}</strong>
          <span className="age-bar">
            <i style={{ height: (s.share / max) * 90 + '%' }} />
            <em style={{ bottom: (s.baseShare / max) * 90 + '%' }} />
          </span>
          <span>{s.entity.label}</span>
          <small>{indexLabel(s.index)}</small>
        </JointLink>
      ))}
    </div>
  );
}
export function RegionChart({
  stats,
  context,
}: {
  stats: Stat[];
  context: AtlasContext;
}) {
  const top = stats
    .filter((s) => s.entity.kind === 'region')
    .sort((a, b) => b.population - a.population)
    .slice(0, 6);
  const max = Math.max(0.01, ...top.map((s) => s.share));
  return (
    <div className="region-chart">
      {top.map((s) => (
        <JointLink condition={s.entity.id} context={context} key={s.entity.id}>
          <span>{s.entity.label}</span>
          <i>
            <em style={{ width: (s.share / max) * 100 + '%' }} />
          </i>
          <b>{pct(s.share)}</b>
          <small>{indexLabel(s.index)}</small>
        </JointLink>
      ))}
    </div>
  );
}
export function Composition({
  stats,
  context,
  kind = 'sex',
}: {
  stats: Stat[];
  context: AtlasContext;
  kind?: string;
}) {
  const list = stats.filter((s) => s.entity.kind === kind);
  return (
    <div className="composition">
      <div className="distribution-strip">
        {list.map((s, i) => (
          <JointLink
            key={s.entity.id}
            condition={s.entity.id}
            context={context}
            title={`${s.entity.label} ${pct(s.share)}`}
            style={{
              width: s.share * 100 + '%',
              background: ['#087967', '#7657a5', '#4f6e96', '#84703b'][i % 4],
            }}
          >
            <span>{s.share > 0.17 ? s.entity.label : ''}</span>
          </JointLink>
        ))}
      </div>
      <div>
        {list.map((s) => (
          <Entry key={s.entity.id} entity={s.entity} context={context}>
            {s.entity.label} <b>{pct(s.share)}</b>
          </Entry>
        ))}
      </div>
    </div>
  );
}
export function OpportunityChart({
  items,
  context,
  compact = false,
}: {
  items: Summary[];
  context: AtlasContext;
  compact?: boolean;
}) {
  const [hover, setHover] = useState<Summary | null>(null);
  const valid = items.filter(
      (s) => s.estimate.population > 0 && s.metrics.opportunity !== null,
    ),
    lo =
      Math.min(...valid.map((s) => Math.log10(s.estimate.population)), 4) -
      0.25,
    hi =
      Math.max(...valid.map((s) => Math.log10(s.estimate.population)), 5) +
      0.25;
  const width = compact ? 760 : 950,
    height = compact ? 280 : 390;
  return (
    <div className="opportunity-chart">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        aria-label="인구와 Opportunity 점수 비교"
      >
        <rect
          x={56}
          y={20}
          width={width - 80}
          height={height - 70}
          fill="#f8fafb"
        />
        {[20, 40, 60, 80, 100].map((v) => (
          <g key={v}>
            <line
              x1={56}
              x2={width - 24}
              y1={height - 50 - (v / 100) * (height - 80)}
              y2={height - 50 - (v / 100) * (height - 80)}
              stroke="#dfe7ed"
              strokeDasharray="3 4"
            />
            <text
              x={43}
              y={height - 47 - (v / 100) * (height - 80)}
              textAnchor="end"
            >
              {v}
            </text>
          </g>
        ))}
        {[10000, 100000, 1000000, 10000000]
          .filter((v) => Math.log10(v) >= lo && Math.log10(v) <= hi)
          .map((v) => (
            <text
              key={v}
              x={56 + ((Math.log10(v) - lo) / (hi - lo)) * (width - 80)}
              y={height - 27}
              textAnchor="middle"
            >
              {shortPopulation(v)}명
            </text>
          ))}
        <text x={56} y={12}>
          Opportunity
        </text>
        <text x={width - 24} y={height - 6} textAnchor="end">
          관련 인구 · 로그 눈금
        </text>
        {valid.map((s) => {
          const selected = conditionKey(s.ids) === conditionKey(context.ids),
            x =
              56 +
              ((Math.log10(s.estimate.population) - lo) / (hi - lo)) *
                (width - 80),
            y = height - 50 - (s.metrics.opportunity! / 100) * (height - 80);
          return (
            <a
              key={conditionKey(s.ids)}
              href={href(s.entity, context)}
              aria-label={`${s.entity.label} Opportunity ${s.metrics.opportunity}`}
              onMouseEnter={() => setHover(s)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(s)}
              onBlur={() => setHover(null)}
            >
              <title>{`${s.entity.label} · ${shortPopulation(s.estimate.population)}명 · Opportunity ${s.metrics.opportunity}`}</title>
              {selected && (
                <circle
                  cx={x}
                  cy={y}
                  r={14}
                  fill="none"
                  stroke="#142a4b"
                  strokeWidth={2}
                />
              )}
              <circle
                cx={x}
                cy={y}
                r={
                  selected
                    ? 8
                    : 5 + Math.min(6, s.metrics.consumptionIntensity! / 18)
                }
                fill={selected ? '#112b4c' : color(s.entity.family)}
                fillOpacity={selected ? 1 : 0.6}
                stroke="white"
                strokeWidth={1.5}
              />
              {selected && (
                <text x={x + 17} y={y - 13} className="current-point">
                  현재 선택
                </text>
              )}
            </a>
          );
        })}
      </svg>
      <div className="chart-caption">
        {hover
          ? `${hover.entity.label} · ${shortPopulation(hover.estimate.population)}명 · 소비 관여 ${hover.metrics.consumptionIntensity}`
          : '점 크기 = 소비 관여 proxy · 현재 선택은 진한 원과 테두리로 표시'}
      </div>
    </div>
  );
}
