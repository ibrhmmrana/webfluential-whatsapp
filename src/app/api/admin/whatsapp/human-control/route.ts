export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/server";
import { noIndexHeaders } from "@/lib/adminAuth";
import { isHumanInControl, setHumanControl } from "@/lib/whatsapp/humanControl";

export async function GET(request: NextRequest) {
  const headers = new Headers();
  Object.entries(noIndexHeaders()).forEach(([k, v]) => headers.set(k, v));

  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  }

  const sessionId = request.nextUrl.searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json(
      { error: "sessionId required" },
      { status: 400, headers }
    );
  }

  const isHumanControlled = await isHumanInControl(sessionId);
  return NextResponse.json({ isHumanInControl: isHumanControlled }, { headers });
}

export async function POST(request: NextRequest) {
  const headers = new Headers();
  Object.entries(noIndexHeaders()).forEach(([k, v]) => headers.set(k, v));

  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  }

  let body: { sessionId?: string; isHumanInControl?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers });
  }

  const sessionId = body.sessionId?.trim();
  if (!sessionId) {
    return NextResponse.json(
      { error: "sessionId required" },
      { status: 400, headers }
    );
  }

  if (typeof body.isHumanInControl !== "boolean") {
    return NextResponse.json(
      { error: "isHumanInControl must be a boolean" },
      { status: 400, headers }
    );
  }

  const { error } = await setHumanControl(sessionId, body.isHumanInControl);
  if (error) {
    return NextResponse.json(
      { error: "Failed to update human control" },
      { status: 500, headers }
    );
  }

  return NextResponse.json({ success: true }, { headers });
}
