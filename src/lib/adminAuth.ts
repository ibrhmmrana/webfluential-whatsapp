/**
 * Headers to prevent indexing of admin pages.
 * Admin auth is now handled by Supabase Auth (see lib/supabase/server.ts).
 */
export function noIndexHeaders(): Record<string, string> {
  return {
    "X-Robots-Tag": "noindex, nofollow",
  };
}
