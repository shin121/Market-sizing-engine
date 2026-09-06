import scoring from '../../config/scoring.json';
import type { DiscoveryMetrics } from '../../lib/atlas';
import { features, source, definitions } from './source';
const featureIndex = new Map(features.map((f, i) => [f.id, i]));
const clamp = (n: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, n));
const weights: Record<string, number> = scoring.weights;

export function deriveMetrics(
  ids: string[],
  population: number,
  support: number,
  rates: number[],
): DiscoveryMetrics {
  const excluded = definitions(ids);
  const nondef = features
    .map((f, i) => ({ f, i }))
    .filter(
      ({ f }) =>
        ['behavior', 'need', 'channel'].includes(f.kind) && !excluded.has(f.id),
    );
  const kl = (a: number, b: number) =>
    a * Math.log2(a / b) + (1 - a) * Math.log2((1 - a) / (1 - b));
  let js = 0;
  for (const { f, i } of nondef) {
    const p = clamp(rates[i], 1e-8, 1 - 1e-8),
      q = clamp(f.share, 1e-8, 1 - 1e-8),
      m = (p + q) / 2;
    js += (kl(p, m) + kl(q, m)) / 2;
  }
  js = nondef.length ? js / nondef.length : 0;
  const intensityIds = [
    'paid',
    'premium',
    'paid_subscription',
    'gear_upgrade',
    'repeat_purchase',
    'membership',
  ];
  const intensive = intensityIds.flatMap((id) => {
    const i = featureIndex.get(id);
    return i === undefined
      ? []
      : [clamp((50 * rates[i]) / Math.max(features[i].share, 1e-8))];
  });
  const rawIntensity = intensive.length
    ? intensive.reduce((a, b) => a + b, 0) / intensive.length
    : null;
  const intensity = rawIntensity === null ? null : Math.round(rawIntensity);
  const strong = features
    .map((f, i) => ({ f, i }))
    .filter(
      ({ f, i }) =>
        f.kind === 'market' && rates[i] > 0.01 && rates[i] / f.share >= 1.15,
    );
  const breadth = strong.length,
    strength = strong.reduce(
      (s, { f, i }) => s + Math.log2(rates[i] / f.share),
      0,
    );
  const distinct = clamp(Math.round(js * 1500));
  const small = Math.round(
    (1 - clamp(population / (source.population * 0.1), 0, 1)) *
      (0.55 * clamp(js * 1500) + 0.45 * (rawIntensity ?? 0)),
  );
  const pains = features
    .map((f, i) => ({ f, i }))
    .filter(({ f }) => f.family === 'pain');
  const pressure = pains.length
    ? clamp(
        pains.reduce(
          (s, { f, i }) => s + clamp((50 * rates[i]) / Math.max(f.share, 1e-8)),
          0,
        ) / pains.length,
      )
    : null;
  const digital = featureIndex.get('digital');
  const components: Record<string, number | null> = {
    size:
      population > 0
        ? clamp(100 * Math.sqrt(population / (source.population * 0.15)))
        : null,
    distinctiveness: population > 0 ? distinct : null,
    consumption: population > 0 ? intensity : null,
    need: population > 0 ? pressure : null,
    reach:
      population > 0 && digital !== undefined
        ? clamp(100 * rates[digital])
        : null,
    crossIndustry: population > 0 ? clamp((100 * breadth) / 8) : null,
    momentum: null,
    competition: null,
  };
  let numerator = 0,
    denominator = 0;
  for (const [id, w] of Object.entries(weights)) {
    const v = components[id];
    if (v !== null) {
      numerator += w * v;
      denominator += w;
    }
  }
  return {
    distinctiveness: js,
    distinctivenessScore: distinct,
    consumptionIntensity: population > 0 ? intensity : null,
    crossIndustryBreadth: breadth,
    crossIndustryStrength: strength,
    smallStrongScore: population > 0 ? small : 0,
    opportunity: denominator ? Math.round(numerator / denominator) : null,
    confidence: support >= 1000 ? 'Modeled' : 'Limited',
    completeness: Math.round(100 * denominator),
    components,
  };
}
