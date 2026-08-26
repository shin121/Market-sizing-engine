export const DEFAULT_LOCAL_NEXT = "/explore";

const LOCAL_NEXT_ORIGIN = "https://market-atlas.local";
const CONTROL_CHARACTER_OR_BACKSLASH = /[\u0000-\u001f\u007f\\]/;
const PERCENT_ENCODED_BYTE = /%([0-9a-f]{2})/gi;

function decodePercentEncodedBytes(value: string): string {
  return value.replace(PERCENT_ENCODED_BYTE, (_match, hex: string) =>
    String.fromCharCode(Number.parseInt(hex, 16)),
  );
}

function hasUnsafeRepresentation(value: string): boolean {
  let representation = value;

  while (true) {
    if (CONTROL_CHARACTER_OR_BACKSLASH.test(representation) || representation.startsWith("//")) {
      return true;
    }

    const decoded = decodePercentEncodedBytes(representation);
    if (decoded === representation) return false;
    representation = decoded;
  }
}

/**
 * Returns a normalized local redirect target, or the workbench landing route.
 * Absolute URLs and browser URL-parser ambiguities never cross this boundary.
 */
export function normalizeLocalNext(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || hasUnsafeRepresentation(value)) {
    return DEFAULT_LOCAL_NEXT;
  }

  try {
    const parsed = new URL(value, LOCAL_NEXT_ORIGIN);
    if (parsed.origin !== LOCAL_NEXT_ORIGIN) return DEFAULT_LOCAL_NEXT;

    const normalized = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    if (!normalized.startsWith("/") || hasUnsafeRepresentation(normalized)) {
      return DEFAULT_LOCAL_NEXT;
    }
    return normalized;
  } catch {
    return DEFAULT_LOCAL_NEXT;
  }
}
