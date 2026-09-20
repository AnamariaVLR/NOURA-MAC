import { PrismaClient } from "@prisma/client";

// Next's dev server re-evaluates modules on every edit; without the global cache
// each reload would open a new pool of SQLite connections.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/**
 * Make a blocked SQLite writer WAIT rather than fail.
 *
 * `busy_timeout` is PER CONNECTION, so setting it once with the CLI does
 * nothing for the app — every process that opens the database has to ask for
 * it. `journal_mode=WAL` is the opposite: a property of the file, set once by
 * `npm run db:wal` and persistent.
 *
 * Without this, two processes writing the same file — which is exactly what the
 * end-to-end suite does, the test writing fixtures while the server writes a
 * scan — race on the same lock and one of them errors immediately. Five seconds
 * is far longer than any query here and well short of any timeout.
 *
 * Fire-and-forget and silent on failure: on Postgres the pragma is meaningless
 * and the query simply errors, which is not a reason to fail a request.
 */
if (!process.env.DATABASE_URL?.startsWith("postgres")) {
  void prisma.$queryRawUnsafe("PRAGMA busy_timeout=5000;").catch(() => {});
}

/**
 * Which SQLite file is actually open — not which one you think is.
 *
 * A relative SQLite URL like `file:./dev.db` is resolved by the GENERATED CLIENT
 * against the directory of the schema it was generated from, not against the
 * current working directory. So if `prisma generate` was last run somewhere else
 * — in a git worktree of this repo, say — every query in the main checkout goes
 * silently to that other file.
 *
 * That happened during the pilot build and cost an hour. `npm run db:reset`
 * reported seeding 35 products; the app kept serving a stale 17, including a
 * product that had been deleted from the catalogue, because the client was bound
 * to `.claude/worktrees/…/prisma/dev.db`. Nothing errored. Both numbers were
 * real, for different files.
 *
 * `npm run db:where` prints the answer. Run it whenever a seed appears not to
 * have taken; the fix is `npx prisma generate` from the repo root.
 */
export async function databaseFile(): Promise<string> {
  try {
    const rows = await prisma.$queryRawUnsafe<{ file: string }[]>("PRAGMA database_list;");
    return rows[0]?.file || "(in memory)";
  } catch {
    // Not SQLite — Postgres has no such pragma, and the URL is not a local path.
    return process.env.DATABASE_URL?.replace(/:\/\/[^@]*@/, "://***@") ?? "(unknown)";
  }
}
