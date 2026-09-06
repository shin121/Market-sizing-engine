import { Buffer } from 'node:buffer';
import { gunzipSync } from 'node:zlib';
import indexJson from '../data/atlas-index.json';
import { conditionKey, canonicalIds } from '../../lib/atlas';
import { source, cubes, features, assertIds, type Cube } from './source';
const strings: Record<string, string> = indexJson;
const bitmaps = new Map<string, Uint32Array>();
const masks = new Map<string, Uint32Array>();
const counts = new Map<
  string,
  { population: number; support: number; weightSquareSum: number }
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
function bitmap(id: string) {
  const cached = bitmaps.get(id);
  if (cached) return cached;
  const text = strings[id];
  if (!text) throw new Error('조건 인덱스가 없습니다: ' + id);
  const bytes = gunzipSync(Buffer.from(text, 'base64'));
  const result = new Uint32Array(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength / 4,
  );
  bitmaps.set(id, result);
  return result;
}
function intersect(ids: string[]) {
  const key = conditionKey(ids);
  const cached = masks.get(key);
  if (cached) return cached;
  const result = new Uint32Array(bitmap('universe'));
  for (const id of canonicalIds(ids)) {
    const b = bitmap(id);
    for (let i = 0; i < result.length; i++) result[i] &= b[i];
  }
  return bounded(masks, key, result, 32);
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
  return bounded(counts, key, count(intersect(ids)), 4096);
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
    base = count(mask),
    out: Cube = { ...base, counts: [], supports: [] };
  for (const f of features) {
    const joint = count(mask, bitmap(f.id));
    out.counts.push(joint.population);
    out.supports.push(joint.support);
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
    signals = entries.map(([id, coefficient]) => ({
      bits: bitmap(id),
      coefficient,
    }));
  const result = source.wordRanges.map((r) => {
    let n = 0,
      signalCount = 0;
    for (let i = r.start; i < r.end; i++) {
      const bits = mask[i];
      if (!bits) continue;
      n += popcount(bits);
      for (const signal of signals)
        signalCount += popcount(bits & signal.bits[i]) * signal.coefficient;
    }
    return {
      population: n * r.weight,
      support: n,
      weightedSignalSum: (n + signalCount) * r.weight,
    };
  });
  return bounded(momentCache, key, result, 512);
}
