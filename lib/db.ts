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
