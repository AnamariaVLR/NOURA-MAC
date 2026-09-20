/**
 * Points the Prisma datasource at whatever DATABASE_URL actually is.
 *
 * Prisma does not accept `env()` for `provider`, so the value has to be written
 * into the schema before `generate`, `db push` or `migrate` runs. This script does
 * that, idempotently, from the URL scheme:
 *
 *   postgresql:// | postgres://   → postgresql   (Neon, production)
 *   anything else                 → sqlite       (file:./dev.db, local dev)
 *
 * It runs in front of every Prisma command in package.json, so a developer with a
 * SQLite URL and a Vercel build with a Neon URL both get a schema that matches
 * their database without either having to remember.
 *
 * The committed value is `sqlite`, because that is what a fresh clone gets from
 * .env.example. A build against Postgres rewrites one line; the line is not
 * meant to be committed back, and `npm run db:local` puts it back.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import "../lib/load-env";

const SCHEMA = resolve(process.cwd(), "prisma/schema.prisma");

export type Provider = "postgresql" | "sqlite";

/** The single rule. Exported so it can be tested without touching the disk. */
export function providerFor(databaseUrl: string | undefined): Provider {
  const url = (databaseUrl ?? "").trim();
  return url.startsWith("postgresql://") || url.startsWith("postgres://")
    ? "postgresql"
    : "sqlite";
}

export function currentProvider(schema: string): Provider | null {
  const match = /datasource\s+db\s*\{[^}]*?provider\s*=\s*"([a-z]+)"/s.exec(schema);
  return match ? (match[1] as Provider) : null;
}

export function withProvider(schema: string, provider: Provider): string {
  return schema.replace(
    /(datasource\s+db\s*\{[^}]*?provider\s*=\s*")[a-z]+(")/s,
    `$1${provider}$2`,
  );
}

function main(): void {
  const forced = process.argv[2];
  const provider: Provider =
    forced === "sqlite" || forced === "postgresql"
      ? forced
      : providerFor(process.env.DATABASE_URL);

  const schema = readFileSync(SCHEMA, "utf8");
  const before = currentProvider(schema);
  if (before === provider) {
    console.log(`prisma provider: ${provider} (unchanged)`);
    return;
  }

  writeFileSync(SCHEMA, withProvider(schema, provider));
  console.log(`prisma provider: ${before} → ${provider}`);
}

// Only act when run directly, so the pure functions above stay importable.
if (process.argv[1]?.endsWith("prisma-provider.ts")) main();
