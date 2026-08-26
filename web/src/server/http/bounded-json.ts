import { NextResponse } from "next/server";

export const DEFAULT_JSON_BODY_LIMIT_BYTES = 128 * 1024;
export const DEFAULT_JSON_RESPONSE_LIMIT_BYTES = 512 * 1024;

export class RequestPayloadError extends Error {
  constructor(message: string, readonly status: 400 | 413) {
    super(message);
    this.name = "RequestPayloadError";
  }
}

export async function parseBoundedJson(
  request: Request,
  maxBytes = DEFAULT_JSON_BODY_LIMIT_BYTES,
): Promise<unknown> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength) {
    const parsedLength = Number(declaredLength);
    if (Number.isFinite(parsedLength) && parsedLength > maxBytes) {
      throw new RequestPayloadError("request_body_too_large", 413);
    }
  }
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  if (reader) {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        byteLength += value.byteLength;
        if (byteLength > maxBytes) {
          await reader.cancel("request_body_too_large");
          throw new RequestPayloadError("request_body_too_large", 413);
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
  }
  const source = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), byteLength).toString("utf8");
  try {
    return JSON.parse(source) as unknown;
  } catch {
    throw new RequestPayloadError("request_body_invalid_json", 400);
  }
}

export function payloadErrorStatus(error: unknown, fallback = 422): number {
  return error instanceof RequestPayloadError ? error.status : fallback;
}

export function boundedJsonResponse(
  value: unknown,
  init?: ResponseInit,
  maxBytes = DEFAULT_JSON_RESPONSE_LIMIT_BYTES,
): NextResponse {
  const serialized = JSON.stringify(value);
  const byteLength = Buffer.byteLength(serialized, "utf8");
  if (byteLength > maxBytes) {
    return NextResponse.json(
      { error: "response_body_too_large" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
  const headers = new Headers(init?.headers);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Content-Length", String(byteLength));
  return new NextResponse(serialized, { ...init, headers });
}
