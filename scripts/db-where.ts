/**
 * Prints which database the app is actually talking to, and what is in it.
 *
 *   npm run db:where
 *
 * Exists because a relative SQLite URL is resolved against the schema directory
 * the CLIENT was generated from, not the current directory — so a `prisma
 * generate` run in a git worktree silently redirects every query in the main
 * checkout. See the comment on databaseFile() in lib/db.ts.
 */
import "../lib/load-env";
import { resolve } from "node:path";
import { CATALOGUE } from "../prisma/seed-data/catalogue";
import { databaseFile, prisma } from "../lib/db";

async function main(): Promise<void> {
  const file = await databaseFile();
  const expected = resolve(process.cwd(), "prisma/dev.db");

  console.log(`DATABASE_URL  ${process.env.DATABASE_URL}`);
  console.log(`open file     ${file}`);

  if (file.startsWith("/") && file !== expected) {
    console.log(`EXPECTED      ${expected}`);
    console.log("");
    console.log("!! The client is bound to a different file than this checkout's.");
    console.log("!! Fix: npx prisma generate");
    process.exitCode = 1;
  }

  const [products, listings, checks, missing] = await Promise.all([
    prisma.product.count(),
    prisma.productListing.count(),
    prisma.listingCheck.count(),
    prisma.missingProduct.count(),
  ]);

  console.log("");
  console.log(`products      ${products}  (catalogue has ${CATALOGUE.length})`);
  console.log(`listings      ${listings}`);
  console.log(`price checks  ${checks}`);
  console.log(`missing queue ${missing}`);

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
