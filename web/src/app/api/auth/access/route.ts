import { createHash, timingSafeEqual } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { normalizeLocalNext } from "@/lib/local-next";

const COOKIE_NAME = "market_atlas_access";

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const supplied = formData.get("secret");
  const configured = process.env.WORKBENCH_ACCESS_SECRET?.trim() ?? "";
  const next = normalizeLocalNext(formData.get("next"));
  if (typeof supplied !== "string" || configured.length < 32 || !timingSafeEqual(digest(supplied), digest(configured))) {
    const url = new URL("/access", request.url);
    url.searchParams.set("next", next);
    url.searchParams.set("error", "invalid_secret");
    return NextResponse.redirect(url, 303);
  }
  const response = NextResponse.redirect(new URL(next, request.url), 303);
  response.cookies.set(COOKIE_NAME, digest(configured).toString("hex"), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return response;
}
