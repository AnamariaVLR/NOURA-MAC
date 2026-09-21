/**
 * Writes the check queue as CSV.
 *
 *   npm run listings:export -- checks.csv
 *   npm run listings:export -- trip.csv --priority 15
 *
 * One row per listing, identifying columns pre-filled, three columns to type into:
 * price_aed, checked_by, checked_at. Rows you do not fill in are skipped on import,
 * so exporting everything and checking six of them is the expected workflow.
 *
 * `--priority N` narrows the file to the N products whose prices would unlock the
 * most recommendations, ordered by that weight and then grouped by retailer so one
 * walk down one shop is one run down the page. Without it you get all 1,013
 * listings, which is a week of shopping rather than an afternoon.
 */
import "../lib/load-env";
import { writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { listingQueue } from "../lib/retail/listings-admin";
import { pricePriority } from "../lib/retail/priority";
import { toCsv } from "../lib/retail/listings-csv";

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  const out = args.find((a) => !a.startsWith("--")) ?? "listing-checks.csv";
  const priorityFlag = args.indexOf("--priority");
  const priorityCount = priorityFlag === -1 ? 0 : Number(args[priorityFlag + 1] ?? 15);

  const { rows: allRows } = await listingQueue();
  const today = new Date().toISOString().slice(0, 10);

  let rows = allRows;
  let weightOf = new Map<string, number>();

  if (priorityCount > 0) {
    const { rows: priority, slotsCovered } = await pricePriority(priorityCount);
    weightOf = new Map(priority.map((p) => [p.slug, p.recommendedTo]));
    rows = allRows.filter((r) => weightOf.has(r.productSlug));
    // Highest weight first, then grouped by retailer within it.
    rows.sort(
      (a, b) =>
        (weightOf.get(b.productSlug) ?? 0) - (weightOf.get(a.productSlug) ?? 0) ||
        a.retailerSlug.localeCompare(b.retailerSlug) ||
        a.productSlug.localeCompare(b.productSlug),
    );
    console.log(
      `Priority: ${priority.length} products, covering ${slotsCovered} recommendation slots.`,
    );
  }

  const csv = toCsv(
    rows.map((row) => ({
      listing_id: row.listingId,
      product_slug: row.productSlug,
      brand: row.productBrand ?? "",
      product_name: row.productName,
      barcode: row.productBarcode ?? "",
      retailer_slug: row.retailerSlug,
      size_label: row.sizeLabel,
      // Left blank on purpose: a price is the one thing a person must supply.
      price_aed: "",
      in_stock: "yes",
      checked_by: "",
      checked_at: today,
      retailer_url: row.retailerUrl ?? "",
      // Why this row is worth your time. Ignored on import.
      note: weightOf.has(row.productSlug)
        ? `recommended to ${weightOf.get(row.productSlug)} other products`
        : "",
    })),
  );

  writeFileSync(out, csv);
  console.log(`wrote ${rows.length} listings to ${out}`);

  if (priorityCount > 0) {
    const products = new Set(rows.map((r) => r.productSlug)).size;
    console.log(
      `That is ${rows.length} rows for ${products} products — one row per retailer we track.\n` +
        `You only need ONE priced row per product: the engine quotes the cheapest listing that ` +
        `has a fresh in-stock check, so ${products} checks is enough to finish the job.`,
    );
  }
  console.log("Fill in price_aed and checked_by for the ones you checked, then:");
  console.log(`  npm run listings:import -- ${out}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
