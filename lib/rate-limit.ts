/**
 * Request limits for the endpoints that cost money.
 *
 * ── Why the database ────────────────────────────────────────────────────────
 *
 * The obvious implementation is a Map in module scope. On a serverless platform
 * that is wrong in a way that looks right in testing: every instance keeps its own
 * Map, so a limit of 30 becomes 30 × however many lambdas happened to warm up.
 * Counting in the database is slower per request and is the only version that
 * means what it says.
 *
 * ── Why there is no IP in the table ─────────────────────────────────────────
 *
 * The key is a SHA-256 of the client address with a per-deployment salt. That is
 * enough to count requests from one client and not enough to say who they were. A
 * rate limiter is not a reason to start keeping a log of who scanned what.
 *
 * ── What it does when it cannot decide ──────────────────────────────────────
 *
 * If the database is unreachable the limiter ALLOWS the request. A scan is worth
 * a few cents; refusing every shopper because the counter is down is the worse
 * failure. The limit protects a bill, not a secret.
 */

import { createHash } from "node:crypto";
import { prisma } from "./db";
import { rateLimitSalt } from "./config";

/**
 * Identification calls the Anthropic API, so this is the one that costs money.
 * 30/hour is far above a shopper's real rate — a supermarket trip might produce
 * fifteen scans — and far below what a script would want.
 */
export const SCAN_LIMIT_PER_HOUR = 30;

export const HOUR_MS = 60 * 60 * 1000;

export type LimitResult = {
  allowed: boolean;
  /** How many of the window's allowance are left after this request. */
  remaining: number;
  limit: number;
  /** When the window resets, for the Retry-After header. */
  resetAt: Date;
};

/**
 * The client address, from the proxy headers Vercel sets.
 *
 * `x-forwarded-for` is a list appended to by each hop, and only the LAST entry is
 * attributable — the earlier ones are whatever the client claimed. Vercel puts the
 * real address in `x-real-ip`, so that wins where it exists.
 */
export function clientAddress(headers: Headers): string {
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;

  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  }
  return "unknown";
}

/** The stored key: hashed, salted, and bucketed by hour. Never reversible to an IP. */
export function limitKey(address: string, bucket: string, windowStart: Date): string {
  const hash = createHash("sha256")
    .update(`${rateLimitSalt()}:${address}`)
    .digest("hex")
    .slice(0, 32);
  return `${hash}:${bucket}:${windowStart.toISOString()}`;
}

export function windowStartFor(now: Date): Date {
  return new Date(Math.floor(now.getTime() / HOUR_MS) * HOUR_MS);
}

/**
 * Count one request against a client's hourly allowance.
 *
 * The upsert-then-read order matters: the increment is atomic in the database, so
 * two simultaneous requests cannot both read 29 and both proceed.
 */
export async function consume(
  headers: Headers,
  bucket: string,
  limit: number,
  now: Date = new Date(),
): Promise<LimitResult> {
  const windowStart = windowStartFor(now);
  const resetAt = new Date(windowStart.getTime() + HOUR_MS);
  const id = limitKey(clientAddress(headers), bucket, windowStart);

  try {
    const row = await prisma.rateLimit.upsert({
      where: { id },
      create: { id, count: 1, windowStart },
      update: { count: { increment: 1 } },
    });
    return {
      allowed: row.count <= limit,
      remaining: Math.max(0, limit - row.count),
      limit,
      resetAt,
    };
  } catch {
    // Fail open — see the header comment.
    return { allowed: true, remaining: limit, limit, resetAt };
  }
}

/**
 * Drop windows that closed more than a day ago. Called opportunistically rather
 * than on a schedule: there is no cron in this deployment, and a table of a few
 * thousand rows costs nothing until someone gets around to it.
 */
export async function prune(now: Date = new Date()): Promise<number> {
  try {
    const cutoff = new Date(now.getTime() - 24 * HOUR_MS);
    const result = await prisma.rateLimit.deleteMany({ where: { windowStart: { lt: cutoff } } });
    return result.count;
  } catch {
    return 0;
  }
}
