export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/server";
import { noIndexHeaders } from "@/lib/adminAuth";
import { ingestKnowledge } from "@/lib/knowledge/ingest";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(request: NextRequest) {
  const headers = new Headers();
  Object.entries(noIndexHeaders()).forEach(([k, v]) => headers.set(k, v));

  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized", reason: "Not signed in" },
      { status: 401, headers }
    );
  }

  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Database not configured", sources: [] },
      { status: 500, headers }
    );
  }

  const { data: rows, error } = await supabaseAdmin
    .from("knowledge_base")
    .select("source, created_at");

  if (error) {
    return NextResponse.json(
      { error: error.message, sources: [] },
      { status: 500, headers }
    );
  }

  const bySource = new Map<string, { chunkCount: number; createdAt: string }>();
  for (const row of rows ?? []) {
    const s = row.source ?? "";
    const existing = bySource.get(s);
    const createdAt = row.created_at ?? "";
    if (!existing) {
      bySource.set(s, { chunkCount: 1, createdAt });
    } else {
      existing.chunkCount += 1;
      if (createdAt && (!existing.createdAt || createdAt > existing.createdAt)) {
        existing.createdAt = createdAt;
      }
    }
  }

  const sources = Array.from(bySource.entries()).map(([source, { chunkCount, createdAt }]) => ({
    source,
    chunkCount,
    createdAt,
  }));

  return NextResponse.json({ sources }, { headers });
}

export async function POST(request: NextRequest) {
  const headers = new Headers();
  Object.entries(noIndexHeaders()).forEach(([k, v]) => headers.set(k, v));

  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized", reason: "Not signed in" },
      { status: 401, headers }
    );
  }

  let body: { source?: string; content?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers });
  }

  const source = typeof body.source === "string" ? body.source.trim() : "";
  const content = typeof body.content === "string" ? body.content : "";

  if (!source) {
    return NextResponse.json(
      { error: "source is required" },
      { status: 400, headers }
    );
  }

  const result = await ingestKnowledge(source, content);
  if (result.error) {
    return NextResponse.json(
      { error: result.error },
      { status: 500, headers }
    );
  }

  return NextResponse.json(
    { success: true, chunksInserted: result.chunksInserted },
    { headers }
  );
}
