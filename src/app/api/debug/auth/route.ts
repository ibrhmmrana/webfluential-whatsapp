import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/server";

/**
 * Temporary debug endpoint to diagnose auth on production.
 * GET /api/debug/auth — returns what the server sees (no secrets).
 * Remove or protect this before going fully public.
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const cookieNames = request.cookies.getAll().map((c) => c.name);
  const hasAuthHeader = request.headers.get("Authorization")?.startsWith("Bearer ");
  const envOk =
    !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const user = await getAuthUser(request);

  return NextResponse.json({
    cookieNames,
    cookieCount: cookieNames.length,
    hasAuthHeader,
    envOk,
    hasUser: !!user,
    userId: user?.id ?? null,
  });
}
