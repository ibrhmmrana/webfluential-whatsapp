export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/server";
import { noIndexHeaders } from "@/lib/adminAuth";
import { getAIModeSettings, setAIModeSettings, type AIModeSettings } from "@/lib/whatsapp/aiModeSettings";

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

  const settings = await getAIModeSettings();
  return NextResponse.json(settings, { headers });
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

  let body: Partial<AIModeSettings>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers });
  }

  const { error } = await setAIModeSettings(body);
  if (error) {
    return NextResponse.json(
      { error: "Failed to save settings", reason: error },
      { status: 500, headers }
    );
  }

  const settings = await getAIModeSettings();
  return NextResponse.json(settings, { headers });
}
