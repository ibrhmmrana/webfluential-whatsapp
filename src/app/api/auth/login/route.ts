import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Server-side login: handles signInWithPassword entirely on the server
 * and sets the session cookie via Set-Cookie header. No client-side
 * Supabase auth needed — avoids dual-write cookie conflicts.
 */
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { email, password } = body;
  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password are required" },
      { status: 400 }
    );
  }

  // Collect cookies that the Supabase server client wants to set
  const cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[] = [];

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll().map((c) => ({ name: c.name, value: c.value }));
      },
      setAll(toSet) {
        toSet.forEach((c) => cookiesToSet.push(c));
      },
    },
  });

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return NextResponse.json(
      { error: error.message === "Invalid login credentials"
          ? "Invalid email or password"
          : error.message },
      { status: 401 }
    );
  }

  // Build the response with Set-Cookie headers
  const response = NextResponse.json({
    ok: true,
    userId: data.user?.id ?? null,
    cookiesSet: cookiesToSet.length,
  });

  cookiesToSet.forEach(({ name, value, options }) =>
    response.cookies.set(name, value, options as Record<string, unknown>)
  );

  return response;
}
