export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/server";
import { noIndexHeaders } from "@/lib/adminAuth";
import { getConversations } from "@/lib/chatHistories";

export async function GET(request: NextRequest) {
  const headers = new Headers();
  Object.entries(noIndexHeaders()).forEach(([k, v]) => headers.set(k, v));
  headers.set("Cache-Control", "no-store, no-cache, must-revalidate");

  // Debug: what did this request actually receive? (so we can see why auth fails)
  const allCookies = request.cookies.getAll();
  const sbCookies = allCookies.filter((c) => c.name.startsWith("sb-"));
  const hasBearer = !!request.headers.get("Authorization")?.startsWith("Bearer ");
  headers.set("x-debug-cookies-total", String(allCookies.length));
  headers.set("x-debug-cookies-sb", String(sbCookies.length));
  headers.set("x-debug-has-bearer", hasBearer ? "1" : "0");

  const user = await getAuthUser(request);
  if (!user) {
    headers.set("x-debug-auth", "no-user");
    return NextResponse.json(
      { error: "Unauthorized", reason: "Not signed in" },
      { status: 401, headers }
    );
  }
  headers.set("x-debug-auth", "ok");

  const { conversations, error } = await getConversations();
  if (error) {
    return NextResponse.json(
      { error: "Failed to load conversations", reason: error },
      { status: 500, headers }
    );
  }

  return NextResponse.json({ conversations }, { headers });
}
