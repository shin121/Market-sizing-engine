import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/access", request.url), 303);
  response.cookies.set("market_atlas_access", "", { httpOnly: true, path: "/", maxAge: 0 });
  return response;
}
