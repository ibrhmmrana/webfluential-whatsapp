import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Supabase client for Client Components. Session is stored in cookies
 * so the server can read it. Use for auth (sign in/out) and Realtime.
 */
export function createClient() {
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
