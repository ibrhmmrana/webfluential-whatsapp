export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/server";
import { noIndexHeaders } from "@/lib/adminAuth";
import { getConversationBySessionId } from "@/lib/chatHistories";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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

  // --- DEBUG: raw query to see exactly what Supabase returns ---
  const debug = request.nextUrl.searchParams.get("debug") === "1";
  if (debug && supabaseAdmin) {
    // 1. Exact match
    const { data: exactRows, error: exactErr } = await supabaseAdmin
      .from("chatbot_history")
      .select("id, session_id, message, customer, date_time")
      .eq("session_id", sessionId)
      .order("date_time", { ascending: true })
      .limit(10000);

    // 2. LIKE match (to catch prefix/suffix variants)
    const likePattern = `%${sessionId.replace("APP-", "").replace(/^%|%$/g, "")}%`;
    const { data: likeRows, error: likeErr } = await supabaseAdmin
      .from("chatbot_history")
      .select("id, session_id, message, date_time")
      .like("session_id", likePattern)
      .order("date_time", { ascending: true })
      .limit(100);

    // 3. All distinct session_ids
    const { data: allRows } = await supabaseAdmin
      .from("chatbot_history")
      .select("session_id")
      .limit(10000);
    const allSessionIds = [...new Set((allRows ?? []).map((r) => r.session_id))];

    return NextResponse.json({
      _debug: true,
      queriedSessionId: sessionId,
      exactMatchCount: exactRows?.length ?? 0,
      exactError: exactErr?.message ?? null,
      likePattern,
      likeMatchCount: likeRows?.length ?? 0,
      likeError: likeErr?.message ?? null,
      allSessionIds,
      rawFirstRow: exactRows?.[0] ?? null,
      rawLastRow: exactRows?.[(exactRows?.length ?? 1) - 1] ?? null,
      rawFirstLikeRow: likeRows?.[0] ?? null,
    }, { headers });
  }
  // --- END DEBUG ---

  const { messages, error } = await getConversationBySessionId(sessionId);
  if (error) {
    return NextResponse.json(
      { error: "Failed to load messages", reason: error },
      { status: 500, headers }
    );
  }

  return NextResponse.json({ messages }, { headers });
}
