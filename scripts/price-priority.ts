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
import { findVerifiedAlternatives } from "../lib/recommend/alternatives";

async function main(): Promise<void> {
  const products = await prisma.product.findMany({
    select: { id: true, name: true, brand: true, category: true, subcategory: true },
    orderBy: { name: "asc" },
  });

  const appearsFor = new Map<string, number>();
  let withAlternatives = 0;

  for (const p of products) {
    const result = await findVerifiedAlternatives({ productId: p.id, limit: 3 });
    if (result.alternatives.length > 0) withAlternatives += 1;
    for (const alt of result.alternatives) {
      const key = alt.candidate.productId;
      appearsFor.set(key, (appearsFor.get(key) ?? 0) + 1);
    }
  }

  const byId = new Map(products.map((p) => [p.id, p]));
  const ranked = [...appearsFor.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25)
    .map(([id, n]) => ({ n, p: byId.get(id)! }));

  console.log(`${withAlternatives} of ${products.length} products produce at least one alternative.\n`);
  console.log("Highest-value price checks — each row is a product recommended to N others:");
  for (const { n, p } of ranked) {
    console.log(
      `  ${String(n).padStart(3)}  ${(p.brand ?? "?").slice(0, 18).padEnd(18)} ${p.name.slice(0, 38).padEnd(38)} ${p.category}`,
    );
  }
  const total = ranked.reduce((s, r) => s + r.n, 0);
  console.log(`\nVerifying a price for these ${ranked.length} products would give a quotable`);
  console.log(`price to ${total} recommendation slots.`);
}

void main().finally(() => prisma.$disconnect());
