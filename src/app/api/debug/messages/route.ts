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

  // 2a. Exact match WITH heavy JSONB columns (same as prod query)
  const { data: exactRows, error: exactErr } = await supabaseAdmin
    .from("chatbot_history")
    .select("id, session_id, message, customer, date_time")
    .eq("session_id", sessionId)
    .order("date_time", { ascending: true })
    .limit(10000);

  // 2b. Exact match WITHOUT JSONB columns (lightweight)
  const { data: exactLightRows, error: exactLightErr } = await supabaseAdmin
    .from("chatbot_history")
    .select("id, session_id, date_time")
    .eq("session_id", sessionId)
    .order("date_time", { ascending: true })
    .limit(10000);

  // 2c. Count using Supabase head count
  const { count: exactCount, error: countErr } = await supabaseAdmin
    .from("chatbot_history")
    .select("*", { count: "exact", head: true })
    .eq("session_id", sessionId);

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

  // 5. Find rows in ILIKE but not in exact match
  const exactIds = new Set((exactRows ?? []).map((r: Record<string, unknown>) => r.id));
  const missingFromExact = (likeRows ?? [])
    .filter((r: Record<string, unknown>) => !exactIds.has(r.id))
    .slice(0, 10)
    .map((r: Record<string, unknown>) => ({
      id: r.id,
      session_id_value: r.session_id,
      session_id_length: typeof r.session_id === "string" ? (r.session_id as string).length : null,
      session_id_charCodes: typeof r.session_id === "string"
        ? Array.from(r.session_id as string).map((c) => c.charCodeAt(0))
        : null,
      date_time: r.date_time,
    }));

  // 6. Also show length and char codes of the queried session ID
  const queriedCharCodes = Array.from(sessionId).map((c) => c.charCodeAt(0));

  return NextResponse.json({
    queriedSessionId: sessionId,
    queriedSessionIdLength: sessionId.length,
    queriedCharCodes,
    allDistinctSessionIds: allSessionIds,
    allDistinctSessionIdLengths: allSessionIds.map((s: unknown) => typeof s === "string" ? (s as string).length : null),
    exactMatchWithJsonb: exactRows?.length ?? 0,
    exactMatchWithoutJsonb: exactLightRows?.length ?? 0,
    exactHeadCount: exactCount,
    exactError: exactErr?.message ?? null,
    exactLightError: exactLightErr?.message ?? null,
    countError: countErr?.message ?? null,
    exactWithJsonbIds: (exactRows ?? []).map((r: Record<string, unknown>) => r.id),
    exactWithoutJsonbIds: (exactLightRows ?? []).map((r: Record<string, unknown>) => r.id),
    sampleRawRows: sampleRaw,
    likeMatchBaseNumber: baseNumber,
    likeMatchCount: likeRows?.length ?? 0,
    likeError: likeErr?.message ?? null,
    likeMatchSessionIds: likeSessionIds,
    missingFromExactMatch: missingFromExact,
  });
}
