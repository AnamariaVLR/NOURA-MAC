/**
 * Puts the local SQLite database into WAL mode.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 *
 * SQLite's default rollback journal takes an exclusive lock for every write, so
 * two processes writing the same file serialise hard — and the end-to-end suite
 * is exactly that shape: the test process writes ListingCheck fixtures while the
 * Next server writes a Scan, a RateLimit row and sometimes a MissingProduct for
 * the same request.
 *
 * It surfaced as a POST to /api/scan that never returned, which looks like an
 * application hang and is a lock. Adding the rate limiter put a write on the hot
 * path of every scan and made an existing contention problem visible.
 *
 * WAL lets readers proceed during a write and makes writers queue rather than
 * fail, which is what a dev database wants. It is a property of the FILE and
 * persists, so this runs once after the schema is pushed.
 *
 * On Postgres it is a no-op: the pragma does not apply and the query is skipped.
 */
import "../lib/load-env";
import { prisma } from "../lib/db";

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL ?? "";
  if (url.startsWith("postgres")) {
    console.log("sqlite-wal: Postgres, nothing to do");
    return;
  }

  // Both pragmas RETURN a row, so they go through $queryRaw — $executeRaw
  // refuses a statement that produces results.
  const [mode] = await prisma.$queryRawUnsafe<{ journal_mode: string }[]>(
    "PRAGMA journal_mode=WAL;",
  );
  // busy_timeout makes a blocked writer WAIT rather than fail immediately. Five
  // seconds is far longer than any query here and shorter than a test timeout.
  // Unlike journal_mode it is per-connection, so it is set again in lib/db.ts.
  await prisma.$queryRawUnsafe("PRAGMA busy_timeout=5000;");
  console.log(`sqlite-wal: journal_mode=${mode?.journal_mode ?? "?"}`);
  await prisma.$disconnect();
}

main().catch((error) => {
  // Never fatal: a database that will not take the pragma still works, just
  // with more contention.
  console.warn("sqlite-wal: skipped —", error instanceof Error ? error.message : error);
});
