import { NextResponse } from "next/server";

export const DEFAULT_EXPORT_RESPONSE_LIMIT_BYTES = 5 * 1024 * 1024;

const utf8Encoder = new TextEncoder();

function utf8ByteLength(value: string): number {
  return utf8Encoder.encode(value).byteLength;
}

export function boundedTextResponse(
  body: string,
  init?: ResponseInit,
  maxBytes = DEFAULT_EXPORT_RESPONSE_LIMIT_BYTES,
): NextResponse {
  const byteLength = utf8ByteLength(body);
  if (byteLength > maxBytes) {
    const errorBody = JSON.stringify({ error: "response_body_too_large" });
    return new NextResponse(errorBody, {
      status: 500,
      headers: {
        "Cache-Control": "no-store",
        "Content-Length": String(utf8ByteLength(errorBody)),
        "Content-Type": "application/json; charset=utf-8",
      },
    });
  }

  const headers = new Headers(init?.headers);
  headers.set("Content-Length", String(byteLength));
  return new NextResponse(body, { ...init, headers });
}
