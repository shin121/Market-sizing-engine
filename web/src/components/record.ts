export type DataRecord = Record<string, unknown>;

export function asRecord(value: unknown): DataRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as DataRecord)
    : {};
}

export function records(value: unknown, keys: string[] = []): DataRecord[] {
  if (Array.isArray(value)) {
    return value.map(asRecord).filter((item) => Object.keys(item).length > 0);
  }

  const record = asRecord(value);
  for (const key of [...keys, "items", "results", "rows", "data"]) {
    const candidate = record[key];
    if (Array.isArray(candidate)) {
      return candidate
        .map(asRecord)
        .filter((item) => Object.keys(item).length > 0);
    }
  }
  return [];
}

export function nested(record: DataRecord, ...keys: string[]): DataRecord {
  for (const key of keys) {
    const candidate = asRecord(record[key]);
    if (Object.keys(candidate).length > 0) return candidate;
  }
  return {};
}

export function text(record: DataRecord, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

export function number(record: DataRecord, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value.replaceAll(",", ""));
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

export function boolean(record: DataRecord, ...keys: string[]): boolean | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") return value;
    if (value === "true") return true;
    if (value === "false") return false;
  }
  return null;
}

export function stringList(record: DataRecord, ...keys: string[]): string[] {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value.filter((item): item is string => typeof item === "string");
    }
    if (typeof value === "string" && value.trim()) {
      try {
        const parsed: unknown = JSON.parse(value);
        if (Array.isArray(parsed)) {
          return parsed.filter((item): item is string => typeof item === "string");
        }
      } catch {
        return value.split(",").map((item) => item.trim()).filter(Boolean);
      }
    }
  }
  return [];
}

export function recordList(record: DataRecord, ...keys: string[]): DataRecord[] {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) return records(value);
  }
  return [];
}

export function identifier(record: DataRecord): string | null {
  return text(
    record,
    "id",
    "objectId",
    "object_id",
    "domainId",
    "domain_id",
    "subtypeId",
    "subtype_id",
    "archetypeId",
    "archetype_id",
    "estimateId",
    "estimate_id",
    "segmentId",
    "segment_id",
    "opportunityId",
    "opportunity_id",
    "jobId",
    "job_id",
    "researchJobId",
    "research_job_id",
    "reviewItemId",
    "review_item_id",
    "resultId",
    "result_id",
    "sourceId",
    "source_id",
    "releaseId",
    "release_id",
    "modelVersionId",
    "model_version_id",
    "publicationVersionId",
    "publication_version_id",
    "auditEventId",
    "audit_event_id",
  );
}

export function label(record: DataRecord): string {
  return (
    text(
      record,
      "nameKo",
      "name_ko",
      "archetypeNameKo",
      "archetype_name_ko",
      "domainNameKo",
      "domain_name_ko",
      "name",
      "labelKo",
      "label_ko",
      "label",
      "title",
      "versionLabel",
      "version_label",
      "version",
      "code",
    ) ?? "표시명 확인 필요"
  );
}

export function entityUnit(record: DataRecord): string | null {
  return text(
    record,
    "entityUnit",
    "entity_unit",
    "primaryEntityUnit",
    "primary_entity_unit",
    "unit",
  );
}

export function unitLabel(unit: string | null): string {
  const labels: Record<string, string> = {
    person: "사람",
    child_person: "아동·청소년",
    household: "가구",
    establishment: "사업체",
    enterprise: "기업",
    annual_spend: "연간 지출",
    annual_revenue: "연간 매출 잠재치",
  };
  return unit ? labels[unit] ?? unit : "단위 미확인";
}

export function formatCount(value: number | null, unit: string | null): string {
  if (value === null) return "현재 자료로 산출 어려움";
  return `${new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 }).format(value)} ${unitLabel(unit)}`;
}

export function formatCompact(value: number | null): string {
  if (value === null) return "현재 자료로 산출 어려움";
  return new Intl.NumberFormat("ko-KR", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatPercent(value: number | null): string {
  if (value === null) return "데이터 없음";
  const normalized = Math.abs(value) <= 1 ? value * 100 : value;
  return `${new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 1 }).format(normalized)}%`;
}

export function description(record: DataRecord): string | null {
  return text(record, "description", "definition", "summary", "evidenceBoundary", "evidence_boundary");
}

export function countInterval(record: DataRecord): {
  low: number | null;
  base: number | null;
  high: number | null;
} {
  return {
    low: number(record, "countLow", "count_low", "low", "weightedCountLow"),
    base: number(record, "countBase", "count_base", "base", "weightedCountBase"),
    high: number(record, "countHigh", "count_high", "high", "weightedCountHigh"),
  };
}

export function status(record: DataRecord): string | null {
  return text(
    record,
    "status",
    "estimateStatus",
    "estimate_status",
    "dataStatus",
    "data_status",
    "coverageStatus",
    "coverage_status",
    "approvalStatus",
    "approval_status",
    "labelStatus",
    "label_status",
    "evidenceBoundary",
    "evidence_boundary",
  );
}

export function hrefId(record: DataRecord, keys: string[]): string | null {
  return text(record, ...keys) ?? identifier(record);
}
