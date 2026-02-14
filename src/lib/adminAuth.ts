import { createHmac } from "crypto";
import { NextRequest } from "next/server";

const COOKIE_NAME = process.env.ADMIN_DASH_COOKIE_NAME ?? "app_admin_auth";

function getSecret(): string {
  const secret = process.env.ADMIN_DASH_COOKIE_SECRET;
  if (!secret) throw new Error("ADMIN_DASH_COOKIE_SECRET is required for admin auth");
  return secret;
}

export function hashToken(password: string): string {
  const secret = getSecret();
  return createHmac("sha256", secret).update(password).digest("hex");
}

export function getCookieName(): string {
  return COOKIE_NAME;
}

/**
 * Check if the request has a valid admin auth cookie.
 * Cookie value must equal HMAC-SHA256(ADMIN_DASH_PASSWORD, ADMIN_DASH_COOKIE_SECRET).
 */
export function isAuthed(request: NextRequest): boolean {
  const expectedPassword = process.env.ADMIN_DASH_PASSWORD;
  if (!expectedPassword) return false;

  const cookieValue = request.cookies.get(COOKIE_NAME)?.value;
  if (!cookieValue) return false;

  const expectedHash = hashToken(expectedPassword);
  return cookieValue === expectedHash;
}

/**
 * Headers to prevent indexing of admin pages.
 */
export function noIndexHeaders(): Record<string, string> {
  return {
    "X-Robots-Tag": "noindex, nofollow",
  };
}
