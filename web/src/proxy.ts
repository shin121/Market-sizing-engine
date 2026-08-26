import { NextRequest, NextResponse } from "next/server";

import {
  bearerMatchesSecret,
  configuredResearchWorkerSecret,
  RESEARCH_WORKER_PATH,
} from "@/lib/research-worker-auth";

const COOKIE_NAME = "market_atlas_access";

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function isApi(pathname: string): boolean {
  return pathname.startsWith("/api/");
}

export async function proxy(request: NextRequest) {
  const authMode = process.env.WORKBENCH_AUTH_MODE ?? (process.env.NODE_ENV === "production" ? "secret" : "local");
  const localAllowed = authMode === "local" && process.env.NODE_ENV !== "production";
  if (localAllowed) return NextResponse.next();

  const pathname = request.nextUrl.pathname;
  if (pathname === "/access" || pathname.startsWith("/api/auth/")) return NextResponse.next();

  if (pathname === RESEARCH_WORKER_PATH) {
    const workerSecret = configuredResearchWorkerSecret();
    if (!workerSecret) {
      return NextResponse.json({ error: "research_worker_auth_configuration_required" }, { status: 503 });
    }
    if (!await bearerMatchesSecret(request, workerSecret)) {
      return NextResponse.json({ error: "research_worker_authentication_required" }, { status: 401 });
    }
    return NextResponse.next();
  }

  const secret = process.env.WORKBENCH_ACCESS_SECRET?.trim() ?? "";
  if (authMode !== "secret" || secret.length < 32) {
    const body = { error: "secure_workbench_auth_configuration_required" };
    return isApi(pathname)
      ? NextResponse.json(body, { status: 503 })
      : new NextResponse("Secure workbench authentication is not configured.", { status: 503 });
  }

  const expected = await sha256(secret);
  const cookie = request.cookies.get(COOKIE_NAME)?.value;
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const authenticated = cookie === expected || (bearer ? await sha256(bearer) === expected : false);
  if (authenticated) return NextResponse.next();

  if (isApi(pathname)) return NextResponse.json({ error: "authentication_required" }, { status: 401 });
  const accessUrl = new URL("/access", request.url);
  accessUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(accessUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
