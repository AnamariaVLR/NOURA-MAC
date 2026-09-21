/**
 * Loads hand-verified checks from CSV.
 *
 *   npm run listings:import -- checks.csv
 *
 * Every imported row becomes a HAND_VERIFIED ListingCheck, so only import rows
 * somebody actually checked. A row with no price is skipped, not rejected: that is
 * the normal state of an exported queue.
 *
 * Nothing is written until the whole file parses, so a typo on line 40 cannot leave
 * you with half an import.
 */
import "../lib/load-env";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { csvToRecords, parseRow, type ImportReport, type ParsedCheck } from "../lib/retail/listings-csv";
import { recordCheck } from "../lib/retail/listings-admin";
import { formatAed } from "../lib/format";

const prisma = new PrismaClient();

async function main() {
  const path = process.argv[2];
  if (!path) {
    console.error("usage: npm run listings:import -- path/to/checks.csv");
    process.exit(1);
  }

  const records = csvToRecords(readFileSync(path, "utf8"));
  if (records.length === 0) {
    console.error("That file has no data rows.");
    process.exit(1);
  }

  const report: ImportReport = {
    imported: 0,
    skipped: 0,
    rejected: 0,
    unknownListing: 0,
    problems: [],
  };

  const accepted: ParsedCheck[] = [];
  const now = new Date();

  records.forEach((record, index) => {
    const line = index + 2; // +1 for the header, +1 for 1-based line numbers
    const outcome = parseRow(record, now);
    if (outcome.ok) {
      accepted.push(outcome.check);
      return;
    }
    if (outcome.kind === "skipped") {
      report.skipped += 1;
      return;
    }
    report.rejected += 1;
    report.problems.push(`line ${line}: ${outcome.reason}`);
  });

  // Check every listing exists before writing any of them.
  const ids = [...new Set(accepted.map((c) => c.listingId))];
  const known = new Set(
    (await prisma.productListing.findMany({ where: { id: { in: ids } }, select: { id: true } })).map(
      (l) => l.id,
    ),
  );
  const writable = accepted.filter((check) => {
    if (known.has(check.listingId)) return true;
    report.unknownListing += 1;
    report.problems.push(`unknown listing_id ${check.listingId}`);
    return false;
  });

  if (report.rejected > 0) {
    console.error(`Refusing to import: ${report.rejected} row(s) could not be read.`);
    for (const problem of report.problems.slice(0, 20)) console.error(`  ${problem}`);
    process.exit(1);
  }

  for (const check of writable) {
    await recordCheck({ ...check, photoPath: null, photoMime: null });
    report.imported += 1;
  }

  console.log(
    `imported ${report.imported}, skipped ${report.skipped} (no price), ` +
      `unknown listing ${report.unknownListing}`,
  );
  for (const problem of report.problems.slice(0, 20)) console.log(`  ${problem}`);

  if (report.imported > 0) {
    // Availability-only rows carry no price and are counted separately rather
    // than summed as zero, which would understate the total silently.
    const priced = writable.filter((c) => c.priceFils !== null);
    const total = priced.reduce((sum, c) => sum + (c.priceFils ?? 0), 0);
    console.log(
      `Recorded ${report.imported} check(s): ${priced.length} with a price, ` +
        `totalling ${formatAed(total)}.`,
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
