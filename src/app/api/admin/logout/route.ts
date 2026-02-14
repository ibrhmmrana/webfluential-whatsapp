export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { noIndexHeaders } from "@/lib/adminAuth";

export async function GET(request: NextRequest) {
  const headers = new Headers();
  Object.entries(noIndexHeaders()).forEach(([k, v]) => headers.set(k, v));

  const supabase = await createClient();
  await supabase.auth.signOut();

  const url = request.nextUrl;
  return NextResponse.redirect(new URL("/", url.origin), { headers });
}
