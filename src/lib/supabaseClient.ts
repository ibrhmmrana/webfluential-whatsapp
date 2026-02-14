import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Client-side Supabase client for Realtime subscriptions.
 * Use for dashboard only. RLS should allow read/subscribe on chatbot_history if needed.
 */
export const supabaseClient =
  url && anonKey ? createClient(url, anonKey) : null;
