import { ENTITY_UNIT_LABELS, type EntityUnit } from "@/lib/constants";

const numberFormatter = new Intl.NumberFormat("ko-KR", {
  maximumFractionDigits: 0,
});

const compactFormatter = new Intl.NumberFormat("ko-KR", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export function formatCount(value: number | null | undefined, unit?: string | null) {
  if (value == null || Number.isNaN(value)) return "추정 불가";
  const label = unit && unit in ENTITY_UNIT_LABELS
    ? ENTITY_UNIT_LABELS[unit as EntityUnit]
    : unit ?? "";
  return `${numberFormatter.format(Math.round(value))}${label ? ` ${label}` : ""}`;
}

export function formatCompact(value: number | null | undefined) {
  return value == null ? "—" : compactFormatter.format(value);
}

export function formatPercent(value: number | null | undefined, digits = 1) {
  return value == null ? "—" : `${(value * 100).toFixed(digits)}%`;
}

export function formatDate(value: string | Date | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium" }).format(
    new Date(value),
  );
}

export function confidenceLabel(score: number | null | undefined) {
  if (score == null) return "검토 필요";
  if (score >= 80) return "높음";
  if (score >= 60) return "보통";
  if (score >= 40) return "낮음";
  return "탐색적";
}

