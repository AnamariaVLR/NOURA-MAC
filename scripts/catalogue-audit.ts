/**
 * §10 — catalogue quality, measured. Nothing here is estimated or filled in.
 */
import "../lib/load-env";
import { prisma } from "../lib/db";
import { evidenceCoverage } from "../lib/evidence/coverage";
import { findVerifiedAlternatives } from "../lib/recommend/alternatives";
import { isFreshCheck } from "../lib/retail/freshness";

const pct = (n: number, d: number) => (d === 0 ? "n/a" : `${((n / d) * 100).toFixed(1)}%`);

async function main(): Promise<void> {
  const now = new Date();
  const products = await prisma.product.findMany({
    include: {
      evidenceLookups: true,
      listings: { include: { checks: { orderBy: { checkedAt: "desc" }, take: 1 } } },
    },
  });
  const n = products.length;

  console.log(`# Catalogue audit — ${n} products\n`);

  const byCat = new Map<string, number>();
  for (const p of products) byCat.set(p.category, (byCat.get(p.category) ?? 0) + 1);
  console.log("## By category");
  for (const [k, v] of [...byCat].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(v).padStart(4)}  ${pct(v, n).padStart(6)}  ${k}`);
  }

  const withBarcode = products.filter((p) => p.barcode && /^\d{8,14}$/.test(p.barcode)).length;
  const withNutrition = products.filter((p) => p.nutritionJson).length;
  const withIngredients = products.filter((p) => p.ingredientsText).length;
  const withLookup = products.filter((p) => p.evidenceLookups.length > 0).length;
  const withListing = products.filter((p) => p.listings.length > 0).length;

  const checks = products.map((p) => p.listings.flatMap((l) => l.checks));
  const withPrice = checks.filter((cs) => cs.some((c) => c.priceFils !== null)).length;
  const withAvailability = checks.filter((cs) => cs.some((c) => c.inStock !== null)).length;
  const withFresh = checks.filter((cs) => cs.some((c) => isFreshCheck(c as never, now))).length;

  console.log("\n## Identity and evidence");
  console.log(`  exact identifier (GTIN)  ${String(withBarcode).padStart(4)}  ${pct(withBarcode, n)}`);
  console.log(`  nutrition panel          ${String(withNutrition).padStart(4)}  ${pct(withNutrition, n)}`);
  console.log(`  ingredient list          ${String(withIngredients).padStart(4)}  ${pct(withIngredients, n)}`);
  console.log(`  certification lookup     ${String(withLookup).padStart(4)}  ${pct(withLookup, n)}`);

  const { summary } = await evidenceCoverage(now);
  console.log("\n## Certification state (exclusive, strongest first)");
  console.log(`  A verified exact product ${String(summary.verified).padStart(4)}  ${pct(summary.verified, n)}`);
  console.log(`  B brand-level only       ${String(summary.brandLevelOnly).padStart(4)}  ${pct(summary.brandLevelOnly, n)}`);
  console.log(`  C not found in source    ${String(summary.notFoundInSource).padStart(4)}  ${pct(summary.notFoundInSource, n)}`);
  console.log(`  D unknown / never asked  ${String(summary.unknown).padStart(4)}  ${pct(summary.unknown, n)}`);

  console.log("\n## Commerce");
  console.log(`  retailer listing         ${String(withListing).padStart(4)}  ${pct(withListing, n)}`);
  console.log(`  any recorded price       ${String(withPrice).padStart(4)}  ${pct(withPrice, n)}`);
  console.log(`  any recorded availability${String(withAvailability).padStart(4)}  ${pct(withAvailability, n)}`);
  console.log(`  FRESH commerce data      ${String(withFresh).padStart(4)}  ${pct(withFresh, n)}`);

  let withAlternatives = 0;
  for (const p of products) {
    const r = await findVerifiedAlternatives({ productId: p.id, limit: 3 });
    if (r.alternatives.length > 0) withAlternatives += 1;
  }
  console.log(`\n## Alternatives`);
  console.log(`  produce >=1 alternative  ${String(withAlternatives).padStart(4)}  ${pct(withAlternatives, n)}`);

  console.log("\n## Data-quality problems");
  const problems: string[] = [];
  const noNutrition = products.filter((p) => !p.nutritionJson);
  if (noNutrition.length) problems.push(`${noNutrition.length} product(s) with no nutrition panel: ${noNutrition.slice(0, 3).map((p) => p.slug).join(", ")}`);
  const noIngredients = products.filter((p) => !p.ingredientsText).length;
  if (noIngredients) problems.push(`${noIngredients} product(s) with no ingredient list — transparency check fails for each`);
  const thin = [...byCat].filter(([, v]) => v < 5).map(([k, v]) => `${k} (${v})`);
  if (thin.length) problems.push(`thin categories, too few to compare within: ${thin.join(", ")}`);
  const nonLatin = products.filter((p) => /[؀-ۿ]/.test(p.name)).length;
  if (nonLatin) problems.push(`${nonLatin} product name(s) are Arabic script — correct, but name matching is Latin-biased`);
  for (const p of problems) console.log(`  - ${p}`);
}

void main().finally(() => prisma.$disconnect());
