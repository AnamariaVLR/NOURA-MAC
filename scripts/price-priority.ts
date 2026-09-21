/**
 * Which price checks would buy the most?
 *
 * Noura's promise ends with "...that I can actually buy in the UAE", and that
 * clause is the one it currently cannot complete: no product has a verified
 * price. Checking all of them is a lot of shoe leather; checking the right ones
 * is not.
 *
 * A product's score here is how many OTHER products would gain a quotable
 * alternative if this one had a verified price. That is the number that turns
 * an afternoon in a supermarket into working recommendations.
 */
import "../lib/load-env";
import { prisma } from "../lib/db";
import { pricePriority } from "../lib/retail/priority";

async function main(): Promise<void> {
  const { rows, productsWithAlternatives, totalProducts, slotsCovered } = await pricePriority(25);

  console.log(
    `${productsWithAlternatives} of ${totalProducts} products produce at least one alternative.\n`,
  );
  console.log("Highest-value price checks — each row is a product recommended to N others:");
  for (const row of rows) {
    console.log(
      `  ${String(row.recommendedTo).padStart(3)}  ${(row.brand ?? "?").slice(0, 18).padEnd(18)} ` +
        `${row.name.slice(0, 38).padEnd(38)} ${row.category}`,
    );
  }
  console.log(`\nVerifying a price for these ${rows.length} products would give a quotable`);
  console.log(`price to ${slotsCovered} recommendation slots.\n`);
  console.log("To turn this into a shopping list:");
  console.log("  npm run listings:export -- trip.csv --priority 15");
}

void main().finally(() => prisma.$disconnect());
