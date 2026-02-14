export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getCookieName, noIndexHeaders } from "@/lib/adminAuth";

export async function GET(request: NextRequest) {
  const headers = new Headers();
  Object.entries(noIndexHeaders()).forEach(([k, v]) => headers.set(k, v));
  const name = getCookieName();
  headers.append(
    "Set-Cookie",
    `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`
  );
  const url = request.nextUrl;
  const origin = url.origin;
  return NextResponse.redirect(new URL("/", origin), { headers });
}
