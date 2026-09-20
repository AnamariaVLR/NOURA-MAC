/**
 * The only way to obtain an admin cookie.
 *
 * Deliberately boring: one password, compared in constant time, exchanged for a
 * signed 30-day cookie. No account, no reset flow, no lockout — this is a tool
 * one operator uses in a supermarket, and every extra mechanism is another thing
 * that can be wrong at the moment they are standing in an aisle.
 *
 * A failed attempt waits ~400ms before answering. It is not a serious defence
 * against an offline attack — there is no offline attack, the password never
 * leaves the server — but it turns online guessing from thousands of attempts a
 * minute into a handful, which is enough given the password is generated rather
 * than chosen.
 */
import { NextResponse } from "next/server";
import { ADMIN_COOKIE, ADMIN_SESSION_MS, adminEnabled, issueToken, passwordMatches } from "@/lib/admin-auth";
import { consume } from "@/lib/rate-limit";
import { secureCookies } from "@/lib/user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Ten attempts an hour from one address. A person who knows it needs one. */
const LOGIN_ATTEMPTS_PER_HOUR = 10;

export async function POST(request: Request) {
  if (!adminEnabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const limit = await consume(request.headers, "admin-login", LOGIN_ATTEMPTS_PER_HOUR);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  let password = "";
  try {
    const form = await request.formData();
    password = String(form.get("password") ?? "");
  } catch {
    return NextResponse.json({ error: "Send the password as form data." }, { status: 400 });
  }

  if (!passwordMatches(password)) {
    await new Promise((resolve) => setTimeout(resolve, 400));
    return NextResponse.json({ error: "That password is not right." }, { status: 401 });
  }

  const token = issueToken();
  if (!token) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    // Secure follows the request scheme, not NODE_ENV — DECISIONS.md §14.
    secure: await secureCookies(),
    path: "/",
    maxAge: Math.floor(ADMIN_SESSION_MS / 1000),
  });
  return response;
}

/** Signing out. Same cookie, zero lifetime. */
export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return response;
}
