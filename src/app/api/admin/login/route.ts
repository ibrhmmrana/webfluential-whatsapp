export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { hashToken, getCookieName, noIndexHeaders } from "@/lib/adminAuth";

export async function POST(request: NextRequest) {
  const headers = new Headers();
  Object.entries(noIndexHeaders()).forEach(([k, v]) => headers.set(k, v));

  const expectedPassword = process.env.ADMIN_DASH_PASSWORD;
  if (!expectedPassword) {
    return NextResponse.json(
      { error: "Admin login not configured" },
      { status: 500, headers }
    );
  }

  let body: { password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON" },
      { status: 400, headers }
    );
  }

  const password = body.password?.trim();
  if (!password) {
    return NextResponse.json(
      { error: "Password required" },
      { status: 400, headers }
    );
  }

  if (password !== expectedPassword) {
    return NextResponse.json(
      { error: "Invalid password" },
      { status: 401, headers }
    );
  }

  const token = hashToken(password);
  const cookieName = getCookieName();
  const maxAge = 30 * 24 * 60 * 60; // 30 days

  const cookieValue = `${cookieName}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
  headers.append("Set-Cookie", cookieValue);

  return NextResponse.json({ success: true }, { status: 200, headers });
}
