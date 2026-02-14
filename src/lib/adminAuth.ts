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
 *
 * Returns { ok: true } or { ok: false, reason: string }.
 */
export function checkAuth(request: NextRequest): { ok: true } | { ok: false; reason: string } {
  const expectedPassword = process.env.ADMIN_DASH_PASSWORD;
  if (!expectedPassword) {
    return { ok: false, reason: "ADMIN_DASH_PASSWORD env var is not set on server" };
  }

  const secret = process.env.ADMIN_DASH_COOKIE_SECRET;
  if (!secret) {
    return { ok: false, reason: "ADMIN_DASH_COOKIE_SECRET env var is not set on server" };
  }

  const cookieValue = request.cookies.get(COOKIE_NAME)?.value;
  if (!cookieValue) {
    return { ok: false, reason: `No '${COOKIE_NAME}' cookie received. Browser may not be sending the cookie.` };
  }

  const expectedHash = hashToken(expectedPassword);
  if (cookieValue !== expectedHash) {
    return { ok: false, reason: "Cookie value does not match. Password or secret may differ between login and current env." };
  }

  return { ok: true };
}

/** Backward-compat boolean wrapper. */
export function isAuthed(request: NextRequest): boolean {
  return checkAuth(request).ok;
}

/**
 * Headers to prevent indexing of admin pages.
 */
export function noIndexHeaders(): Record<string, string> {
  return {
    "X-Robots-Tag": "noindex, nofollow",
  };
}
