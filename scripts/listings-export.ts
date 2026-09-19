/**
 * Writes the check queue as CSV.
 *
 *   npm run listings:export -- checks.csv
 *
 * One row per listing, identifying columns pre-filled, three columns to type into:
 * price_aed, checked_by, checked_at. Rows you do not fill in are skipped on import,
 * so exporting everything and checking six of them is the expected workflow.
 */
import "../lib/load-env";
import { writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { listingQueue } from "../lib/retail/listings-admin";
import { toCsv } from "../lib/retail/listings-csv";

const prisma = new PrismaClient();

async function main() {
  const out = process.argv[2] ?? "listing-checks.csv";
  const { rows } = await listingQueue();
  const today = new Date().toISOString().slice(0, 10);

  const csv = toCsv(
    rows.map((row) => ({
      listing_id: row.listingId,
      product_slug: row.productSlug,
      retailer_slug: row.retailerSlug,
      size_label: row.sizeLabel,
      // Left blank on purpose: a price is the one thing a person must supply.
      price_aed: "",
      in_stock: "yes",
      checked_by: "",
      checked_at: today,
      retailer_url: row.retailerUrl ?? "",
      note: "",
    })),
  );

  writeFileSync(out, csv);
  console.log(`wrote ${rows.length} listings to ${out}`);
  console.log("Fill in price_aed and checked_by for the ones you checked, then:");
  console.log(`  npm run listings:import -- ${out}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
