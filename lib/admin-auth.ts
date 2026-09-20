/**
 * Authentication for /admin — the whole of it.
 *
 * ── The rule ────────────────────────────────────────────────────────────────
 *
 * NO PASSWORD SET MEANS /admin IS CLOSED, not open. This is the inversion of what
 * the app did before, where the tool was open in development and gated on a flag
 * elsewhere. For a deployed pilot that shape is wrong: it makes "did anyone
 * remember to set the flag?" the only thing between the public and the
 * price-entry form. Now the question is "is there a password?", and the answer
 * being no locks the door for everybody including the operator.
 *
 * ── What the cookie is ──────────────────────────────────────────────────────
 *
 * Not the password, and not a random session id either — there is no session
 * store to look one up in. It is `<expiry>.<HMAC-SHA256(expiry, password)>`. The
 * server can verify it with nothing but the password it already has in its
 * environment, it expires on its own, and changing ADMIN_PASSWORD invalidates
 * every cookie ever issued, which is what you want the day you change it.
 *
 * httpOnly, so page JavaScript cannot read it. SameSite=Lax, so it is not sent on
 * a cross-site POST. Secure follows the request scheme rather than NODE_ENV, for
 * the reason in DECISIONS.md §14: a production build served over plain http — a
 * LAN demo, a proxy that does not terminate TLS — would otherwise set a cookie
 * the browser then refuses to send back.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { adminPassword } from "./config";

export const ADMIN_COOKIE = "noura_admin";

/** Thirty days: long enough that the operator signs in once a month. */
export const ADMIN_SESSION_DAYS = 30;
export const ADMIN_SESSION_MS = ADMIN_SESSION_DAYS * 24 * 60 * 60 * 1000;

function sign(payload: string, password: string): string {
  return createHmac("sha256", password).update(payload).digest("hex");
}

/**
 * Constant-time compare. A `===` on a hex digest leaks, through timing, how many
 * leading characters were right, which is enough to forge one byte at a time.
 */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    // Still compare something, so the failure takes the same time either way.
    timingSafeEqual(left, left);
    return false;
  }
  return timingSafeEqual(left, right);
}

/** True when the submitted password is the configured one. False when there is none. */
export function passwordMatches(submitted: string): boolean {
  const password = adminPassword();
  if (!password) return false;
  return safeEqual(submitted, password);
}

export function issueToken(now: Date = new Date()): string | null {
  const password = adminPassword();
  if (!password) return null;
  const expiry = String(now.getTime() + ADMIN_SESSION_MS);
  return `${expiry}.${sign(expiry, password)}`;
}

export function tokenIsValid(token: string | undefined | null, now: Date = new Date()): boolean {
  const password = adminPassword();
  if (!password || !token) return false;

  const dot = token.lastIndexOf(".");
  if (dot <= 0) return false;

  const expiry = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  if (!/^\d+$/.test(expiry)) return false;
  if (!safeEqual(signature, sign(expiry, password))) return false;

  return Number(expiry) > now.getTime();
}

/** Whether /admin exists at all for this deployment. */
export function adminEnabled(): boolean {
  return adminPassword() !== null;
}
