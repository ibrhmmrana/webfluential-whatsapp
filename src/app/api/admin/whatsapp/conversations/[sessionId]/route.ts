export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/server";
import { noIndexHeaders } from "@/lib/adminAuth";
import { getConversationBySessionId, getConversationRecent } from "@/lib/chatHistories";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const headers = new Headers();
  Object.entries(noIndexHeaders()).forEach(([k, v]) => headers.set(k, v));
  headers.set("Cache-Control", "no-store, no-cache, must-revalidate");

  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized", reason: "Not signed in" },
      { status: 401, headers }
    );
  }

  const { sessionId } = await params;
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId required" }, { status: 400, headers });
  }

  const recentParam = request.nextUrl.searchParams.get("recent");
  const useFastPath = recentParam !== null && recentParam !== "";
  const limit = useFastPath ? Math.min(500, Math.max(1, parseInt(recentParam, 10) || 100)) : 0;

  const { messages, error } = useFastPath
    ? await getConversationRecent(sessionId, limit)
    : await getConversationBySessionId(sessionId);

  if (error) {
    return NextResponse.json(
      { error: "Failed to load messages", reason: error },
      { status: 500, headers }
    );
  }

  return NextResponse.json({ messages }, { headers });
}
