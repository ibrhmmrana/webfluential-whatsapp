export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * Temporary debug endpoint — NO AUTH — to inspect chatbot_history rows.
 * DELETE THIS FILE after debugging.
 * Usage: GET /api/debug/messages?sessionId=APP-27693475825
 */
export async function GET(request: NextRequest) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Supabase not configured" });
  }

  const sessionId = request.nextUrl.searchParams.get("sessionId");

  // 1. All distinct session_ids in the table
  const { data: allRows } = await supabaseAdmin
    .from("chatbot_history")
    .select("session_id")
    .limit(50000);
  const allSessionIds = [...new Set((allRows ?? []).map((r: Record<string, unknown>) => r.session_id))];

  if (!sessionId) {
    return NextResponse.json({
      hint: "Pass ?sessionId=... to inspect messages for that session",
      totalRows: allRows?.length ?? 0,
      distinctSessionIds: allSessionIds,
    });
  }

  // 2. Exact match for the given sessionId
  const { data: exactRows, error: exactErr } = await supabaseAdmin
    .from("chatbot_history")
    .select("id, session_id, message, customer, date_time")
    .eq("session_id", sessionId)
    .order("date_time", { ascending: true })
    .limit(10000);

  // 3. Sample of first 3 raw rows
  const sampleRaw = (exactRows ?? []).slice(0, 3).map((r: Record<string, unknown>) => ({
    id: r.id,
    session_id: r.session_id,
    message_typeof: typeof r.message,
    message_raw: r.message,
    customer_typeof: typeof r.customer,
    customer_raw: r.customer,
    date_time: r.date_time,
  }));

  // 4. ILIKE match (broader, catches variants)
  const baseNumber = sessionId.replace(/^APP-/, "");
  const { data: likeRows, error: likeErr } = await supabaseAdmin
    .from("chatbot_history")
    .select("id, session_id, date_time")
    .ilike("session_id", `%${baseNumber}%`)
    .order("date_time", { ascending: true })
    .limit(100);

  const likeSessionIds = [...new Set((likeRows ?? []).map((r: Record<string, unknown>) => r.session_id))];

  return NextResponse.json({
    queriedSessionId: sessionId,
    allDistinctSessionIds: allSessionIds,
    exactMatchCount: exactRows?.length ?? 0,
    exactError: exactErr?.message ?? null,
    sampleRawRows: sampleRaw,
    likeMatchBaseNumber: baseNumber,
    likeMatchCount: likeRows?.length ?? 0,
    likeError: likeErr?.message ?? null,
    likeMatchSessionIds: likeSessionIds,
  });
}
