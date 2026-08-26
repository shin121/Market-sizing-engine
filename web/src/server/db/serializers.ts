import "server-only";

export type JsonPrimitive = boolean | number | string | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export function toNumber(value: unknown, field: string): number {
  const result = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(result)) throw new Error(`${field}_is_not_a_finite_number`);
  return result;
}

export function toNullableNumber(value: unknown, field: string): number | null {
  return value === null || value === undefined ? null : toNumber(value, field);
}

export function toIsoTimestamp(value: unknown, field: string): string {
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.valueOf())) throw new Error(`${field}_is_not_a_timestamp`);
  return date.toISOString();
}

export function toNullableIsoTimestamp(value: unknown, field: string): string | null {
  return value === null || value === undefined ? null : toIsoTimestamp(value, field);
}

export function toDateString(value: unknown, field: string): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const result = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) throw new Error(`${field}_is_not_a_date`);
  return result;
}

export function toNullableDateString(value: unknown, field: string): string | null {
  return value === null || value === undefined ? null : toDateString(value, field);
}

export function toJsonValue(value: unknown, field = "json"): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`${field}_contains_a_non_finite_number`);
    return value;
  }
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item, index) => toJsonValue(item, `${field}[${index}]`));
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, toJsonValue(item, `${field}.${key}`)]),
    );
  }
  throw new Error(`${field}_is_not_json_serializable`);
}

export function toJsonArray(value: unknown, field = "json"): JsonValue[] {
  const result = toJsonValue(value, field);
  if (!Array.isArray(result)) throw new Error(`${field}_must_be_an_array`);
  return result;
}
