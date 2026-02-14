import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Supabase client for Server Components and Server Actions.
 * Session is read from cookies(); use middleware to refresh the session.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Ignore when called from Server Component (middleware will refresh)
        }
      },
    },
  });
}

/**
 * Supabase client for Route Handlers (API routes).
 * Reads cookies directly from the request so we see the same cookies
 * the browser sent (Next.js cookies() in route handlers can differ from
 * the request). Use this in API routes and pass the request.
 */
export function createClientFromRequest(request: NextRequest) {
  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll().map((c) => ({
          name: c.name,
          value: c.value,
        }));
      },
      setAll() {
        // Route handlers: we can't reliably set cookies here; middleware
        // handles refresh and sets response cookies.
      },
    },
  });
}

export type User = Awaited<
  ReturnType<Awaited<ReturnType<typeof createClientFromRequest>>["auth"]["getUser"]>
>["data"]["user"];

/**
 * Get the authenticated user in an API route. Tries cookies first, then
 * Authorization: Bearer <token> so client can send the session token when
 * cookies are not sent (e.g. same request timing / custom domain).
 */
export async function getAuthUser(request: NextRequest): Promise<User | null> {
  const supabase = createClientFromRequest(request);
  const { data: { user } } = await supabase.auth.getUser();
  if (user) return user;

  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return null;

  const { data: { user: userFromToken } } = await supabase.auth.getUser(token);
  return userFromToken;
}
