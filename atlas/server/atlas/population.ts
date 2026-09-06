import { Buffer } from 'node:buffer';
import { gunzipSync } from 'node:zlib';
import indexJson from '../data/atlas-index.json';
import calibratedIndex from '../data/atlas-calibrated-index.json';
import { conditionKey, canonicalIds } from '../../lib/atlas';
import { source, cubes, features, assertIds, type Cube } from './source';
import { AGE_UNIONS } from '../../lib/discovery';
const strings: Record<string, string> = { ...indexJson, ...calibratedIndex };
const observedStrings: Record<string, string> = indexJson;
const observedBitmaps = new Map<string, Uint32Array>();
const observedMasks = new Map<string, Uint32Array>();
const bitmaps = new Map<string, Uint32Array>();
const masks = new Map<string, Uint32Array>();
const counts = new Map<
  string,
  {
    population: number;
    support: number;
    weightSquareSum: number;
    observedPopulation: number;
    modelMembers: number;
  }
>();
const statsCache = new Map<string, Cube>();
export function bounded<T>(
  cache: Map<string, T>,
  key: string,
  value: T,
  limit: number,
) {
  if (cache.size >= limit) cache.delete(cache.keys().next().value!);
  cache.set(key, value);
  return value;
}
function bitmap(id: string, observed = false) {
  const cache = observed ? observedBitmaps : bitmaps;
  const cached = cache.get(id);
  if (cached) return cached;
  if (AGE_UNIONS[id]) {
    const result = new Uint32Array(source.wordLength);
    for (const member of AGE_UNIONS[id]) {
      const bits = bitmap(member, observed);
      for (let i = 0; i < result.length; i++) result[i] |= bits[i];
    }
    cache.set(id, result);
    return result;
  }
  const text = (observed ? observedStrings : strings)[id];
  if (!text) throw new Error('조건 인덱스가 없습니다: ' + id);
  const bytes = gunzipSync(Buffer.from(text, 'base64'));
  const result = new Uint32Array(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength / 4,
  );
  cache.set(id, result);
  return result;
}
function intersect(ids: string[], observed = false) {
  const key = conditionKey(ids);
  const cache = observed ? observedMasks : masks;
  const cached = cache.get(key);
  if (cached) return cached;
  const result = new Uint32Array(bitmap('universe', observed));
  for (const id of canonicalIds(ids)) {
    const b = bitmap(id, observed);
    for (let i = 0; i < result.length; i++) result[i] &= b[i];
  }
  return bounded(cache, key, result, 32);
}
function popcount(x: number) {
  x -= (x >>> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}
function count(a: Uint32Array, b?: Uint32Array) {
  let population = 0,
    support = 0,
    weightSquareSum = 0;
  for (const r of source.wordRanges) {
    let n = 0;
    for (let i = r.start; i < r.end; i++) n += popcount(b ? a[i] & b[i] : a[i]);
    support += n;
    population += n * r.weight;
    weightSquareSum += n * r.weight * r.weight;
  }
  return { population, support, weightSquareSum };
}
export function measure(ids: string[]) {
  assertIds(ids);
  const key = conditionKey(ids);
  const cached = counts.get(key);
  if (cached) return cached;
  const model = count(intersect(ids)),
    observed = measureObserved(ids);
  return bounded(
    counts,
    key,
    {
      ...model,
      support: observed.support,
      observedPopulation: observed.population,
      weightSquareSum: observed.weightSquareSum,
      modelMembers: model.support,
    },
    4096,
  );
}
export function measureObserved(ids: string[]) {
  assertIds(ids);
  return count(intersect(ids, true));
}
// A union is counted once; overlapping category audiences cannot be added.
export function measureUnion(ids: string[], alternatives: string[]) {
  assertIds(ids);
  assertIds(alternatives, 100);
  const union = new Uint32Array(source.wordLength);
  for (const id of new Set(alternatives)) {
    const bits = bitmap(id);
    for (let i = 0; i < union.length; i++) union[i] |= bits[i];
  }
  return count(intersect(ids), union);
}
export function statistics(ids: string[]): Cube {
  assertIds(ids);
  const key = conditionKey(ids);
  const cached = statsCache.get(key);
  if (cached) return cached;
  const artifact = cubes.data[key];
  if (
    artifact &&
    cubes.featureKeys.length === features.length &&
    cubes.featureKeys.every((id, i) => id === features[i].id) &&
    cubes.indexDigest === source.dataFingerprint
  )
    return artifact;
  const mask = intersect(ids),
    observedMask = intersect(ids, true),
    base = measure(ids),
    out: Cube = { ...base, counts: [], supports: [] };
  for (const f of features) {
    const joint = count(mask, bitmap(f.id));
    out.counts.push(joint.population);
    out.supports.push(count(observedMask, bitmap(f.id, true)).support);
  }
  return bounded(statsCache, key, out, 96);
}

// One bitmap pass per coefficient and calibration stratum; no raw persona scan.
const momentCache = new Map<
  string,
  { population: number; support: number; weightedSignalSum: number }[]
>();
export function linearMoments(
  ids: string[],
  coefficients: Record<string, number>,
) {
  assertIds(ids);
  const entries = Object.entries(coefficients),
    key = conditionKey(ids) + '|' + JSON.stringify(entries);
  const cached = momentCache.get(key);
  if (cached) return cached;
  const mask = intersect(ids),
    observedMask = intersect(ids, true),
    signals = entries.map(([id, coefficient]) => ({
      bits: bitmap(id),
      coefficient,
    }));
  const result = source.wordRanges.map((r) => {
    let n = 0,
      observedSupport = 0,
      signalCount = 0;
    for (let i = r.start; i < r.end; i++) {
      observedSupport += popcount(observedMask[i]);
      const bits = mask[i];
      if (!bits) continue;
      n += popcount(bits);
      for (const signal of signals)
        signalCount += popcount(bits & signal.bits[i]) * signal.coefficient;
    }
    return {
      population: n * r.weight,
      support: observedSupport,
      weightedSignalSum: (n + signalCount) * r.weight,
    };
  });
  return bounded(momentCache, key, result, 512);
}
