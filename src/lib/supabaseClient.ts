import { createClient } from "@/lib/supabase/client";

/**
 * Client-side Supabase client for Realtime (and auth). Uses the SSR browser
 * client so the session is stored in cookies and works on all domains.
 */
export const supabaseClient =
  typeof window === "undefined" ? null : createClient();
