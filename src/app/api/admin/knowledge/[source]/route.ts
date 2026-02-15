export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/server";
import { noIndexHeaders } from "@/lib/adminAuth";
import { deleteKnowledgeBySource } from "@/lib/knowledge/ingest";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ source: string }> }
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

  const { source } = await params;
  const decoded = decodeURIComponent(source ?? "").trim();
  if (!decoded) {
    return NextResponse.json(
      { error: "source is required" },
      { status: 400, headers }
    );
  }

  const { error } = await deleteKnowledgeBySource(decoded);
  if (error) {
    return NextResponse.json(
      { error },
      { status: 500, headers }
    );
  }

  return NextResponse.json({ success: true }, { headers });
}
