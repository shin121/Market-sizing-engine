#!/usr/bin/env node

import { writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import process from "node:process";

const baseUrl = (process.env.MARKET_ENGINE_PERFORMANCE_BASE_URL ?? "http://localhost:3000").replace(/\/$/u, "");
const accessSecret = process.env.WORKBENCH_ACCESS_SECRET?.trim() ?? "";
const outputPath = process.env.MARKET_ENGINE_PERFORMANCE_REPORT_PATH
  ?? "reports/phase3r_7r_runtime_performance.json";
const sampleCount = Number(process.env.MARKET_ENGINE_PERFORMANCE_SAMPLES ?? "5");

if (!/^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/u.test(baseUrl)) {
  throw new Error("Performance audit accepts only an explicit loopback Production URL.");
}
if (accessSecret.length < 32) {
  throw new Error("WORKBENCH_ACCESS_SECRET must be at least 32 characters.");
}
if (!Number.isInteger(sampleCount) || sampleCount < 3 || sampleCount > 20) {
  throw new Error("MARKET_ENGINE_PERFORMANCE_SAMPLES must be an integer from 3 to 20.");
}

const targets = [
  { id: "health", path: "/api/health", kind: "api", p95LimitMs: 500 },
  { id: "domain_directory", path: "/api/markets/domains", kind: "api", p95LimitMs: 750 },
  { id: "archetype_cursor_page", path: "/api/markets/archetypes?limit=50", kind: "api", p95LimitMs: 1000 },
  { id: "subtype_directory", path: "/api/markets/subtypes?limit=90", kind: "api", p95LimitMs: 750 },
  { id: "estimate_directory", path: "/api/estimate?status=estimated", kind: "api", p95LimitMs: 1000 },
  { id: "global_search", path: "/api/search?q=%EC%9D%8C%EC%95%85&limit=30", kind: "api", p95LimitMs: 1000 },
  { id: "explorer_ssr", path: "/explore", kind: "ssr", p95LimitMs: 1500 },
  { id: "archetype_ssr", path: "/archetypes", kind: "ssr", p95LimitMs: 1500 },
  { id: "sizing_ssr", path: "/sizing", kind: "ssr", p95LimitMs: 1500 },
  { id: "research_ssr", path: "/research", kind: "ssr", p95LimitMs: 1500 },
];

function percentile(values, ratio) {
  const ordered = values.toSorted((left, right) => left - right);
  return ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * ratio) - 1)];
}

function rounded(value) {
  return Math.round(value * 1000) / 1000;
}

async function requestTarget(target) {
  const startedAt = performance.now();
  const response = await fetch(`${baseUrl}${target.path}`, {
    headers: { Authorization: `Bearer ${accessSecret}` },
    redirect: "manual",
  });
  const body = await response.arrayBuffer();
  const elapsedMs = performance.now() - startedAt;
  if (response.status !== 200) {
    throw new Error(`${target.id} returned HTTP ${response.status}`);
  }
  if (body.byteLength === 0) {
    throw new Error(`${target.id} returned an empty response`);
  }
  return { elapsedMs, responseBytes: body.byteLength, contentType: response.headers.get("content-type") };
}

const healthResponse = await fetch(`${baseUrl}/api/health`, {
  headers: { Authorization: `Bearer ${accessSecret}` },
});
if (!healthResponse.ok) throw new Error(`Health preflight returned HTTP ${healthResponse.status}`);
const health = await healthResponse.json();
const database = health?.database;
if (!health?.ok || database?.domain_count !== 24 || database?.subtype_count !== 90 || database?.archetype_count !== 1440) {
  throw new Error("Health preflight does not match the Phase 3R–7R Production Data Mart contract.");
}
if (database.fixture_count !== 0 || database.missing_display_name_count !== 0) {
  throw new Error("Performance audit refuses a fixture-contaminated or unnamed Production read model.");
}

const measurements = [];
for (const target of targets) {
  await requestTarget(target);
  const samples = [];
  let responseBytes = 0;
  let contentType = null;
  for (let index = 0; index < sampleCount; index += 1) {
    const sample = await requestTarget(target);
    samples.push(sample.elapsedMs);
    responseBytes = sample.responseBytes;
    contentType = sample.contentType;
  }
  const p50Ms = percentile(samples, 0.5);
  const p95Ms = percentile(samples, 0.95);
  measurements.push({
    ...target,
    samplesMs: samples.map(rounded),
    minMs: rounded(Math.min(...samples)),
    averageMs: rounded(samples.reduce((total, value) => total + value, 0) / samples.length),
    p50Ms: rounded(p50Ms),
    p95Ms: rounded(p95Ms),
    maxMs: rounded(Math.max(...samples)),
    responseBytes,
    contentType,
    status: p95Ms <= target.p95LimitMs ? "passed" : "failed",
  });
}

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  status: measurements.every((measurement) => measurement.status === "passed") ? "passed" : "failed",
  mode: "authenticated loopback Production runtime; one warm-up plus repeated read-only requests",
  safety: {
    loopbackOnly: true,
    methods: ["GET"],
    workflowMutation: false,
    credentialsPersisted: false,
  },
  runtime: {
    baseUrl,
    sampleCount,
    modelVersion: "kr-v0.2.1",
    migrationBoundary: "001-024",
  },
  productionDataMart: database,
  measurements,
};

await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  status: report.status,
  outputPath,
  measurements: measurements.map(({ id, p50Ms, p95Ms, p95LimitMs, status }) => ({ id, p50Ms, p95Ms, p95LimitMs, status })),
}, null, 2));

if (report.status !== "passed") process.exitCode = 1;
