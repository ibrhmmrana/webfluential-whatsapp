export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/server";
import { noIndexHeaders } from "@/lib/adminAuth";
import { getConversationBySessionId } from "@/lib/chatHistories";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const headers = new Headers();
  Object.entries(noIndexHeaders()).forEach(([k, v]) => headers.set(k, v));

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

  const { messages, error } = await getConversationBySessionId(sessionId);
  if (error) {
    return NextResponse.json(
      { error: "Failed to load messages" },
      { status: 500, headers }
    );
  }

  return NextResponse.json({ messages }, { headers });
}
