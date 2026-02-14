export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { noIndexHeaders } from "@/lib/adminAuth";
import { getConversations } from "@/lib/chatHistories";

export async function GET() {
  const headers = new Headers();
  Object.entries(noIndexHeaders()).forEach(([k, v]) => headers.set(k, v));

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized", reason: "Not signed in" },
      { status: 401, headers }
    );
  }

  const { conversations, error } = await getConversations();
  if (error) {
    return NextResponse.json(
      { error: "Failed to load conversations" },
      { status: 500, headers }
    );
  }

  return NextResponse.json({ conversations }, { headers });
}
