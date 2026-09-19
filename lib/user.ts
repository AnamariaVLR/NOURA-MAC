/**
 * Anonymous local identity. No accounts in the MVP: /history is "this browser's
 * scans", held in an httpOnly cookie so page code cannot read it either.
 */
import { cookies, headers } from "next/headers";
import { UserKeySchema } from "./schemas";

export const USER_COOKIE = "noura_user";
const ONE_YEAR = 60 * 60 * 24 * 365;

/** Reads the current key, or null when this browser has never scanned. */
export async function currentUserKey(): Promise<string | null> {
  const store = await cookies();
  const raw = store.get(USER_COOKIE)?.value;
  const parsed = UserKeySchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/**
 * Whether to mark the cookie Secure.
 *
 * Keyed on the scheme the request actually arrived on, not on NODE_ENV. Tying it
 * to NODE_ENV marks the cookie Secure on every production build, including one
 * served over plain http — a LAN demo, a container behind a proxy that does not
 * terminate TLS — where a Secure cookie is set but then withheld, and the user
 * silently loses their history and their uploaded image.
 */
async function requestIsSecure(): Promise<boolean> {
  const store = await headers();
  const forwarded = store.get("x-forwarded-proto");
  if (forwarded) return forwarded.split(",")[0].trim() === "https";
  // No proxy header: Next's own server speaks http, so this is an http request.
  return false;
}

/** Reads the key, minting one if needed. Only callable where cookies are writable. */
export async function ensureUserKey(): Promise<string> {
  const existing = await currentUserKey();
  if (existing) return existing;

  const key = crypto.randomUUID();
  const store = await cookies();
  store.set(USER_COOKIE, key, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: ONE_YEAR,
    secure: await requestIsSecure(),
  });
  return key;
}
