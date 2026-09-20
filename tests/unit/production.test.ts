/**
 * The pilot-readiness rules: admin authentication, rate limiting, image sizing,
 * the Prisma provider switch, and the secrets hygiene that has to hold before a
 * URL goes out to a phone.
 *
 * These are the parts where being wrong is not a bad verdict but an open door.
 */

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ADMIN_COOKIE,
  ADMIN_SESSION_DAYS,
  ADMIN_SESSION_MS,
  adminEnabled,
  issueToken,
  passwordMatches,
  safeEqual,
  tokenIsValid,
} from "../../lib/admin-auth";
import { HOUR_MS, clientAddress, limitKey, windowStartFor } from "../../lib/rate-limit";
import { CLIENT_MAX_EDGE_PX, CLIENT_SKIP_BELOW_BYTES, targetSize } from "../../lib/image-client";
import { currentProvider, providerFor, withProvider } from "../../scripts/prisma-provider";
import {
  MAX_IMAGE_EDGE_PX,
  MAX_INLINE_IMAGE_BYTES,
  MAX_UPLOAD_BYTES,
  scanLimitPerHour,
} from "../../lib/config";

const ORIGINAL = process.env.ADMIN_PASSWORD;
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.ADMIN_PASSWORD;
  else process.env.ADMIN_PASSWORD = ORIGINAL;
});

describe("admin authentication — no password closes the door", () => {
  it("is disabled when ADMIN_PASSWORD is unset", () => {
    delete process.env.ADMIN_PASSWORD;
    expect(adminEnabled()).toBe(false);
    expect(issueToken()).toBeNull();
    expect(passwordMatches("")).toBe(false);
    expect(passwordMatches("anything at all")).toBe(false);
  });

  it("is disabled when ADMIN_PASSWORD is too short to be worth having", () => {
    process.env.ADMIN_PASSWORD = "short";
    expect(adminEnabled()).toBe(false);
    expect(passwordMatches("short")).toBe(false);
  });

  it("no token verifies while the door is closed, including one issued earlier", () => {
    process.env.ADMIN_PASSWORD = "a-long-enough-password";
    const token = issueToken()!;
    expect(tokenIsValid(token)).toBe(true);

    delete process.env.ADMIN_PASSWORD;
    expect(tokenIsValid(token)).toBe(false);
  });
});

describe("admin authentication — the cookie", () => {
  beforeEach(() => {
    process.env.ADMIN_PASSWORD = "a-long-enough-password";
  });

  it("round-trips a freshly issued token", () => {
    expect(tokenIsValid(issueToken()!)).toBe(true);
  });

  it("lasts thirty days and not a day more", () => {
    expect(ADMIN_SESSION_DAYS).toBe(30);
    const now = new Date("2026-01-01T00:00:00Z");
    const token = issueToken(now)!;
    const justBefore = new Date(now.getTime() + ADMIN_SESSION_MS - 1000);
    const justAfter = new Date(now.getTime() + ADMIN_SESSION_MS + 1000);
    expect(tokenIsValid(token, justBefore)).toBe(true);
    expect(tokenIsValid(token, justAfter)).toBe(false);
  });

  it("rejects a tampered expiry — the signature covers it", () => {
    const token = issueToken()!;
    const [expiry, signature] = token.split(".");
    const forged = `${Number(expiry) + 10 * ADMIN_SESSION_MS}.${signature}`;
    expect(tokenIsValid(forged)).toBe(false);
  });

  it("rejects a tampered signature", () => {
    const token = issueToken()!;
    const [expiry, signature] = token.split(".");
    const flipped = signature.slice(0, -1) + (signature.endsWith("a") ? "b" : "a");
    expect(tokenIsValid(`${expiry}.${flipped}`)).toBe(false);
  });

  it("rejects malformed shapes rather than throwing on them", () => {
    for (const bad of ["", ".", "abc", "abc.def", "12x3.aaaa", "nodot", undefined, null]) {
      expect(tokenIsValid(bad as string | undefined)).toBe(false);
    }
  });

  it("changing the password invalidates every cookie already issued", () => {
    const token = issueToken()!;
    process.env.ADMIN_PASSWORD = "a-different-long-password";
    expect(tokenIsValid(token)).toBe(false);
  });

  it("is not the password — the password never leaves the server", () => {
    const token = issueToken()!;
    expect(token).not.toContain("a-long-enough-password");
  });

  it("names the cookie once, so the middleware and the app cannot disagree", () => {
    expect(ADMIN_COOKIE).toBe("noura_admin");
    const middleware = readFileSync(new URL("../../middleware.ts", import.meta.url), "utf8");
    expect(middleware).toContain('ADMIN_COOKIE = "noura_admin"');
  });

  it("compares in constant time, including for different lengths", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(safeEqual("", "")).toBe(true);
  });
});

describe("the middleware agrees with the server-side rule", () => {
  const middleware = readFileSync(new URL("../../middleware.ts", import.meta.url), "utf8");

  it("guards every admin surface", () => {
    for (const path of ["/admin/:path*", "/api/listing-check", "/api/listing-photo/:path*", "/api/seed"]) {
      expect(middleware).toContain(path);
    }
  });

  it("lets the login page through, or there would be no way in", () => {
    expect(middleware).toContain('pathname === "/admin/login"');
  });

  it("treats a missing password as 404, not as a login prompt", () => {
    expect(middleware).toMatch(/if \(!password \|\| password\.length < 8\)/);
    expect(middleware).toContain("404");
  });
});

describe("rate limiting", () => {
  it("prefers x-real-ip, which a client cannot forge through the proxy", () => {
    const headers = new Headers({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "1.2.3.4" });
    expect(clientAddress(headers)).toBe("203.0.113.7");
  });

  it("takes the LAST x-forwarded-for entry, not the first", () => {
    // The first entries are whatever the client claimed; only the last hop is ours.
    const headers = new Headers({ "x-forwarded-for": "9.9.9.9, 8.8.8.8, 203.0.113.7" });
    expect(clientAddress(headers)).toBe("203.0.113.7");
  });

  it("degrades to a single shared bucket rather than throwing", () => {
    expect(clientAddress(new Headers())).toBe("unknown");
  });

  it("buckets by whole hours", () => {
    const start = windowStartFor(new Date("2026-03-04T15:42:13Z"));
    expect(start.toISOString()).toBe("2026-03-04T15:00:00.000Z");
    const next = windowStartFor(new Date("2026-03-04T16:00:00Z"));
    expect(next.getTime() - start.getTime()).toBe(HOUR_MS);
  });

  it("stores a hash, never the address", () => {
    const start = windowStartFor(new Date());
    const key = limitKey("203.0.113.7", "scan", start);
    expect(key).not.toContain("203.0.113.7");
    expect(key.startsWith("[a-f0-9]")).toBe(false);
    expect(/^[a-f0-9]{32}:scan:/.test(key)).toBe(true);
  });

  it("gives different clients different keys and the same client the same one", () => {
    const start = windowStartFor(new Date());
    expect(limitKey("1.1.1.1", "scan", start)).toBe(limitKey("1.1.1.1", "scan", start));
    expect(limitKey("1.1.1.1", "scan", start)).not.toBe(limitKey("2.2.2.2", "scan", start));
  });

  it("separates buckets, so a login attempt does not spend a scan", () => {
    const start = windowStartFor(new Date());
    expect(limitKey("1.1.1.1", "scan", start)).not.toBe(limitKey("1.1.1.1", "admin-login", start));
  });
});

describe("image limits", () => {
  it("caps uploads at 8 MB", () => {
    expect(MAX_UPLOAD_BYTES).toBe(8 * 1024 * 1024);
  });

  it("resizes to 1600px, on both sides of the wire", () => {
    expect(MAX_IMAGE_EDGE_PX).toBe(1600);
    expect(CLIENT_MAX_EDGE_PX).toBe(MAX_IMAGE_EDGE_PX);
  });

  it("keeps an inline image under 300 KB", () => {
    expect(MAX_INLINE_IMAGE_BYTES).toBe(300 * 1024);
  });

  it("scales the long edge and keeps the aspect ratio", () => {
    expect(targetSize(4032, 3024)).toEqual({ width: 1600, height: 1200 });
    expect(targetSize(3024, 4032)).toEqual({ width: 1200, height: 1600 });
  });

  it("never enlarges a small image", () => {
    expect(targetSize(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it("does not bother decoding an image already small enough", () => {
    expect(CLIENT_SKIP_BELOW_BYTES).toBeLessThan(MAX_INLINE_IMAGE_BYTES * 2);
  });
});

describe("the Prisma provider follows DATABASE_URL", () => {
  it("selects postgresql for a Postgres URL, in either spelling", () => {
    expect(providerFor("postgresql://user:pw@host/db?sslmode=require")).toBe("postgresql");
    expect(providerFor("postgres://user:pw@host/db")).toBe("postgresql");
  });

  it("selects sqlite for a file URL, an empty value, or nothing at all", () => {
    expect(providerFor("file:./dev.db")).toBe("sqlite");
    expect(providerFor("")).toBe("sqlite");
    expect(providerFor(undefined)).toBe("sqlite");
  });

  it("is not fooled by a Postgres URL mentioned later in the string", () => {
    expect(providerFor("file:./dev.db#postgresql://")).toBe("sqlite");
  });

  it("rewrites only the provider line, leaving the rest of the schema alone", () => {
    const schema = readFileSync(new URL("../../prisma/schema.prisma", import.meta.url), "utf8");
    const swapped = withProvider(schema, "postgresql");
    expect(currentProvider(swapped)).toBe("postgresql");
    expect(swapped.length).toBeCloseTo(schema.length, -2);
    expect(currentProvider(withProvider(swapped, "sqlite"))).toBe("sqlite");
    // Round-tripping is lossless.
    expect(withProvider(withProvider(schema, "postgresql"), currentProvider(schema)!)).toBe(schema);
  });
});

describe("secrets", () => {
  it(".env has never been committed, anywhere in history", () => {
    const log = execFileSync("git", ["log", "--all", "--full-history", "--oneline", "--", ".env", ".env.local"], {
      cwd: new URL("../../", import.meta.url).pathname,
      encoding: "utf8",
    });
    expect(log.trim()).toBe("");
  });

  it("is ignored by git, so it cannot be committed by accident", () => {
    const ignore = readFileSync(new URL("../../.gitignore", import.meta.url), "utf8");
    expect(ignore).toMatch(/^\.env$/m);
  });

  it("documents every variable the app reads, and reads no others", () => {
    const example = readFileSync(new URL("../../.env.example", import.meta.url), "utf8");
    const config = readFileSync(new URL("../../lib/config.ts", import.meta.url), "utf8");
    const middleware = readFileSync(new URL("../../middleware.ts", import.meta.url), "utf8");

    const used = new Set(
      [...`${config}\n${middleware}`.matchAll(/process\.env\.([A-Z0-9_]+)/g)].map((m) => m[1]),
    );
    // NODE_ENV is set by the runtime, not by an operator.
    used.delete("NODE_ENV");

    for (const name of used) {
      expect(example, `${name} is missing from .env.example`).toContain(`${name}=`);
    }
  });

  it("carries no real secret in the example file", () => {
    const example = readFileSync(new URL("../../.env.example", import.meta.url), "utf8");
    expect(example).not.toMatch(/sk-ant-[A-Za-z0-9]/);
    expect(example).not.toMatch(/postgres(ql)?:\/\/[^"\s]*:[^"@\s]+@/);
    expect(example).toMatch(/^ADMIN_PASSWORD=""$/m);
  });
});

describe("the Postgres migration keeps up with the schema", () => {
  /**
   * A migration that silently falls behind the schema is a deploy that fails
   * after the environment variables are already pushed. This is a crude check —
   * it does not validate the SQL, only that every model and column the schema
   * declares is named somewhere in the migration — but it catches the failure
   * that actually happens: a column added weeks after the migration was written.
   *
   * It has already caught one: matchSource, candidatesJson and MissingProduct
   * were added after the init migration was generated, and the migration was
   * three changes stale.
   */
  const schema = readFileSync(new URL("../../prisma/schema.prisma", import.meta.url), "utf8");
  const migration = readFileSync(
    new URL("../../prisma/migrations/20260920000000_init/migration.sql", import.meta.url),
    "utf8",
  );

  it("creates a table for every model", () => {
    const models = [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map((m) => m[1]);
    expect(models.length).toBeGreaterThan(5);
    for (const model of models) {
      expect(migration, `no CREATE TABLE for ${model}`).toContain(`"${model}"`);
    }
  });

  it("names every field of every model", () => {
    // Field lines look like `  fieldName  Type  @attrs`. Relation fields and
    // block attributes are skipped: they produce no column.
    const body = schema.replace(/\/\/\/.*$/gm, "");
    const fields = [...body.matchAll(/^\s{2}(\w+)\s+(\w+)(\[\])?(\?)?\s*(.*)$/gm)]
      .filter(([, , type]) => /^(String|Int|Boolean|DateTime|Float|Bytes|Decimal|Json)$/.test(type))
      .map(([, name]) => name);

    expect(fields.length).toBeGreaterThan(30);
    const missing = [...new Set(fields)].filter((f) => !migration.includes(`"${f}"`));
    expect(missing, `columns missing from the migration: ${missing.join(", ")}`).toEqual([]);
  });

  it("is written for Postgres, whatever the schema currently says", () => {
    // scripts/prisma-provider.ts flips the schema's provider for local SQLite;
    // the committed migration must always be the Postgres one.
    expect(migration).toMatch(/CREATE TABLE/);
    expect(migration).toMatch(/TIMESTAMP\(3\)|TEXT|BYTEA/);
    expect(migration).not.toMatch(/AUTOINCREMENT/); // SQLite-only
  });
});

describe("the scan limit is a production protection, not a constant", () => {
  const ORIGINAL_LIMIT = process.env.SCAN_RATE_LIMIT_PER_HOUR;
  afterEach(() => {
    if (ORIGINAL_LIMIT === undefined) delete process.env.SCAN_RATE_LIMIT_PER_HOUR;
    else process.env.SCAN_RATE_LIMIT_PER_HOUR = ORIGINAL_LIMIT;
  });

  it("defaults to 30 an hour", () => {
    delete process.env.SCAN_RATE_LIMIT_PER_HOUR;
    expect(scanLimitPerHour()).toBe(30);
  });

  it("can be raised, because a test harness is not a shopper", () => {
    process.env.SCAN_RATE_LIMIT_PER_HOUR = "100000";
    expect(scanLimitPerHour()).toBe(100000);
  });

  it("ignores nonsense rather than disabling itself", () => {
    // A misconfigured value must not become "no limit".
    for (const bad of ["", "abc", "0", "-5", "NaN"]) {
      process.env.SCAN_RATE_LIMIT_PER_HOUR = bad;
      expect(scanLimitPerHour(), `value ${JSON.stringify(bad)}`).toBe(30);
    }
  });
});
