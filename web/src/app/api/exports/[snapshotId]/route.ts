import { NextRequest, NextResponse } from "next/server";

import { parseMarketScenarioSelection } from "@/domain/market-scenario-selection";
import { boundedTextResponse } from "@/server/http/bounded-text";
import { getReportSnapshot } from "@/server/repositories/workbench";

export const dynamic = "force-dynamic";

export function escapeCsv(value: unknown): string {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  const text = serialized ?? "";
  // Spreadsheet applications may execute cells beginning with these formula
  // sigils, including after leading whitespace/control characters. A plain
  // negative numeric literal remains numeric evidence; expressions beginning
  // with '-' are still neutralized. Prefixing an apostrophe forces text mode.
  const negativeNumericLiteral = /^\s*-(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?\s*$/u.test(text);
  const safeText = (/^\s*[=+@]/u.test(text) || (/^\s*-/u.test(text) && !negativeNumericLiteral) || /^[\t\r\n]/u.test(text))
    ? `'${text}`
    : text;
  return `"${safeText.replaceAll('"', '""')}"`;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export interface ExportRow {
  section: string;
  path: string;
  value: string;
}

function printableScalar(value: unknown): string {
  if (value === null) return "unavailable";
  if (typeof value === "boolean" || typeof value === "number" || typeof value === "bigint") return String(value);
  return typeof value === "string" ? value : "";
}

function appendRows(rows: ExportRow[], section: string, path: string, value: unknown): void {
  if (value === null || ["string", "number", "boolean", "bigint"].includes(typeof value)) {
    rows.push({ section, path, value: printableScalar(value) });
    return;
  }
  if (Array.isArray(value)) {
    if (!value.length) rows.push({ section, path, value: "unavailable" });
    value.forEach((item, index) => appendRows(rows, section, `${path}[${index}]`, item));
    return;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (!entries.length) rows.push({ section, path, value: "unavailable" });
    entries.forEach(([key, item]) => appendRows(rows, section, path ? `${path}.${key}` : key, item));
    return;
  }
  rows.push({ section, path, value: String(value) });
}

const SECTION_LABELS: Record<string, string> = {
  metadata: "Snapshot metadata",
  factors: "시장규모 산식과 Factor",
  components_json: "시장규모 산식과 Factor",
  sources_json: "출처 목록",
  estimate_snapshot: "Estimate snapshot",
  estimate_snapshots: "Estimate snapshots",
  conditions: "세그먼트 정의",
  filter_json: "세그먼트 정의",
  members: "비교 보고서",
  segment_snapshots: "근거 세그먼트",
  score_components: "Opportunity score",
  experiments: "Opportunity 실험",
  current_content: "Opportunity Brief",
  market_scenarios: "TAM / SAM / SOM 시나리오",
  confidence_json: "신뢰도",
};

export function flattenSnapshotRows(snapshot: unknown): ExportRow[] {
  const rows: ExportRow[] = [];
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    appendRows(rows, "metadata", "value", snapshot);
    return rows;
  }
  for (const [key, value] of Object.entries(snapshot as Record<string, unknown>)) {
    const section = SECTION_LABELS[key] ?? (value !== null && typeof value === "object" ? key : "metadata");
    appendRows(rows, section, key, value);
  }
  return rows;
}

export function renderPrintReport(input: {
  kind: string;
  snapshotId: string;
  generatedAt: string;
  rows: ExportRow[];
}): string {
  const grouped = new Map<string, ExportRow[]>();
  for (const row of input.rows) grouped.set(row.section, [...(grouped.get(row.section) ?? []), row]);
  const sections = [...grouped.entries()].map(([section, rows]) => `
    <section><h2>${escapeHtml(SECTION_LABELS[section] ?? section)}</h2>
      <table><thead><tr><th>필드</th><th>값</th></tr></thead><tbody>${rows.map((row) =>
        `<tr><td>${escapeHtml(row.path)}</td><td>${escapeHtml(row.value)}</td></tr>`).join("")}</tbody></table>
    </section>`).join("");
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${escapeHtml(`${input.kind}-${input.snapshotId}`)}</title>
  <style>body{font:14px/1.6 Pretendard,system-ui,sans-serif;max-width:1080px;margin:40px auto;color:#173a32}h1{font-size:24px}h2{font-size:17px;margin-top:28px;border-bottom:2px solid #173a32;padding-bottom:6px}table{border-collapse:collapse;width:100%;table-layout:fixed}th,td{border:1px solid #d9d6ca;padding:7px 9px;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#f5f3ec}th:first-child,td:first-child{width:38%}.meta{color:#52645f}@media print{body{margin:12mm}section{break-inside:avoid-page}}</style>
  </head><body><h1>Market Atlas · ${escapeHtml(input.kind)} snapshot</h1><p class="meta">Snapshot ${escapeHtml(input.snapshotId)} · 생성 시각 ${escapeHtml(input.generatedAt)}</p>${sections}</body></html>`;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ snapshotId: string }> },
) {
  const { snapshotId } = await context.params;
  const kind = request.nextUrl.searchParams.get("kind") ?? "estimate";
  const format = request.nextUrl.searchParams.get("format") ?? "json";
  if (!["estimate", "segment", "comparison", "opportunity"].includes(kind)) {
    return NextResponse.json({ error: "unsupported_snapshot_kind" }, { status: 400 });
  }
  if (!["json", "csv", "print"].includes(format)) {
    return NextResponse.json({ error: "unsupported_export_format" }, { status: 400 });
  }
  const scenarioIds = request.nextUrl.searchParams.getAll("scenarioId");
  const scenarioVersions = request.nextUrl.searchParams.getAll("scenarioVersion");
  const scenarioSelectionModes = request.nextUrl.searchParams.getAll("scenarioSelectionMode");
  const parsedSelection = parseMarketScenarioSelection({
    scenarioId: scenarioIds.length === 0 ? undefined : scenarioIds.length === 1 ? scenarioIds[0] : scenarioIds,
    scenarioVersion: scenarioVersions.length === 0
      ? undefined
      : scenarioVersions.length === 1
        ? scenarioVersions[0]
        : scenarioVersions,
    scenarioSelectionMode: scenarioSelectionModes.length === 0
      ? undefined
      : scenarioSelectionModes.length === 1
        ? scenarioSelectionModes[0]
        : scenarioSelectionModes,
  });
  if (!parsedSelection.ok || (kind !== "estimate" && parsedSelection.selection)) {
    return NextResponse.json({ error: "snapshot_not_found" }, { status: 404 });
  }
  const snapshot = await getReportSnapshot(kind, snapshotId, parsedSelection.selection);
  if (!snapshot) return NextResponse.json({ error: "snapshot_not_found" }, { status: 404 });
  const envelope = {
    schemaVersion: "workbench-export-v1",
    kind,
    snapshotId,
    generatedAt: new Date().toISOString(),
    immutableSnapshot: snapshot,
  };
  const filename = `${kind}-${snapshotId}`.replaceAll(/[^a-zA-Z0-9_-]/g, "_");
  const exportRows = flattenSnapshotRows(snapshot);

  if (format === "json") {
    return boundedTextResponse(JSON.stringify(envelope, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}.json"`,
      },
    });
  }
  if (format === "csv") {
    const headers = ["schemaVersion", "kind", "snapshotId", "generatedAt", "section", "path", "value"];
    const csvRows = exportRows.map((row) => [
      envelope.schemaVersion,
      envelope.kind,
      envelope.snapshotId,
      envelope.generatedAt,
      row.section,
      row.path,
      row.value,
    ]);
    const csv = `${headers.map(escapeCsv).join(",")}\r\n${csvRows.map((row) => row.map(escapeCsv).join(",")).join("\r\n")}\r\n`;
    return boundedTextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}.csv"`,
      },
    });
  }
  const html = renderPrintReport({ kind, snapshotId, generatedAt: envelope.generatedAt, rows: exportRows });
  return boundedTextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
