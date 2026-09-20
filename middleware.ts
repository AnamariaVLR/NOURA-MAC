/**
 * The door on /admin.
 *
 * Middleware rather than a check inside each page, because there is exactly one
 * rule and it should be impossible to add a route that forgets it. Every path
 * under /admin — and the two API routes the admin UI posts to — passes through
 * here before any page code runs.
 *
 * Three outcomes:
 *
 *   NO ADMIN_PASSWORD SET  → 404. Not a login form, not a 403: the tool does not
 *                            exist for this deployment. A missing password closes
 *                            the door rather than opening it, which is the
 *                            inversion of what the app used to do.
 *   NO VALID COOKIE        → /admin/login, with ?next= so the operator lands back
 *                            where they were going. API routes get 401 JSON
 *                            instead, because a fetch cannot follow a login.
 *   VALID COOKIE           → through.
 *
 * The cookie is verified here with Web Crypto rather than node:crypto: middleware
 * runs on the edge runtime, which has no node builtins. lib/admin-auth.ts holds
 * the same rule for the Node side, and tests/unit/admin-auth.test.ts asserts the
 * two agree on a token.
 */
import { NextResponse, type NextRequest } from "next/server";

export const ADMIN_COOKIE = "noura_admin";

/** Same HMAC as lib/admin-auth.ts, in the API the edge runtime actually has. */
async function sign(payload: string, password: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function tokenIsValid(token: string | undefined, password: string): Promise<boolean> {
  if (!token) return false;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return false;

  const expiry = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  if (!/^\d+$/.test(expiry)) return false;
  if (!constantTimeEqual(signature, await sign(expiry, password))) return false;
  return Number(expiry) > Date.now();
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // The login page itself must stay reachable, or there is no way in.
  if (pathname === "/admin/login") return NextResponse.next();

  const password = process.env.ADMIN_PASSWORD?.trim();
  const isApi = pathname.startsWith("/api/");

  if (!password || password.length < 8) {
    return isApi
      ? NextResponse.json({ error: "Not found" }, { status: 404 })
      : new NextResponse("Not found", { status: 404, headers: { "content-type": "text/plain" } });
  }

  if (await tokenIsValid(request.cookies.get(ADMIN_COOKIE)?.value, password)) {
    return NextResponse.next();
  }

  if (isApi) {
    return NextResponse.json({ error: "Sign in to /admin first." }, { status: 401 });
  }

  const login = new URL("/admin/login", request.url);
  login.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/admin/:path*", "/api/listing-check", "/api/listing-photo/:path*", "/api/seed"],
};
