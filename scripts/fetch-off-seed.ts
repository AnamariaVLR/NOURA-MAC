/**
 * Refreshes prisma/seed-data/products.json from Open Food Facts / Open Beauty Facts.
 *
 *   npm run seed:fetch
 *
 * The result is committed so `npm run db:seed` works with no network. Re-run this
 * when you want fresher evidence; the "last verified" date shown in the UI comes
 * from the `fetchedAt` written here, so it is a real claim about a real check.
 */
import "../lib/load-env";
import { basisFor } from "../lib/health/categories";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { CATALOGUE, type CatalogueEntry } from "../prisma/seed-data/catalogue";

const UA = "Noura/0.1 (UAE healthy product MVP) seed-builder";

const BASE = {
  off: "https://world.openfoodfacts.org",
  obf: "https://world.openbeautyfacts.org",
} as const;

const SOURCE_NAME = { off: "Open Food Facts", obf: "Open Beauty Facts" } as const;

const FIELDS = [
  "code","product_name","product_name_en","brands","quantity","image_front_url",
  "ingredients_text","ingredients_text_en","allergens_tags","additives_tags",
  "nova_group","categories_tags","nutriments",
].join(",");

type FetchedProduct = {
  slug: string;
  barcode: string;
  category: CatalogueEntry["category"];
  subcategory: string | null;
  name: string;
  brand: string | null;
  sizeLabel: string;
  imageUrl: string | null;
  ingredientsText: string | null;
  allergens: string[];
  additives: string[];
  novaGroup: number | null;
  nutrition: Record<string, unknown> | null;
  evidenceSource: string;
  evidenceSourceUrl: string;
  fetchedAt: string;
};

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** "en:milk" -> "milk", "en:e150d" -> "E150d". */
function cleanTag(tag: string, upperE = false): string {
  const bare = tag.replace(/^[a-z]{2}:/, "").replace(/-/g, " ");
  if (upperE && /^e\s?\d/.test(bare)) return bare.replace(/\s/g, "").toUpperCase();
  return bare;
}

/**
 * Open databases are crowd-sourced, so a record can exist with an entirely empty
 * nutrition panel. Storing that as a row of zeroes would let the checker read
 * "no data" as "no sugar" — the single worst failure mode this app has.
 */
function nutritionIsUsable(n: Record<string, number | null>): boolean {
  const macros = ["sugarsG","carbohydratesG","fatG","saturatedFatG","proteinG","fibreG","saltG"];
  const known = macros.filter((k) => n[k] !== null);
  if (known.length === 0) return false;
  const anyPositive = macros.some((k) => (n[k] ?? 0) > 0);
  return n.energyKcal !== null || anyPositive;
}

async function fetchOne(entry: CatalogueEntry): Promise<FetchedProduct | null> {
  const base = BASE[entry.db];
  const url = `${base}/api/v2/product/${entry.barcode}.json?fields=${FIELDS}`;

  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA } });
      const text = await res.text();
      if (!text.startsWith("{")) throw new Error(`non-JSON response (${res.status})`);
      const body = JSON.parse(text) as { product?: Record<string, any> };
      const p = body.product;
      if (!p) throw new Error("product not found");

      const n = p.nutriments ?? {};

      return {
        slug: entry.slug,
        barcode: entry.barcode,
        category: entry.category,
        name: p.product_name_en || p.product_name || entry.fallbackName,
        brand: (p.brands ?? "").split(",")[0]?.trim() || entry.fallbackBrand,
        sizeLabel: entry.sizeLabel,
        imageUrl: p.image_front_url ?? null,
        ingredientsText: p.ingredients_text_en || p.ingredients_text || null,
        allergens: (p.allergens_tags ?? []).map((t: string) => cleanTag(t)),
        additives: (p.additives_tags ?? []).map((t: string) => cleanTag(t, true)),
        novaGroup: num(p.nova_group),
        subcategory: entry.subcategory,
        // Cosmetics carry no nutrition panel; storing an empty one would invite the
        // checker to treat "no sugar data" as "no sugar".
        nutrition:
          entry.category === "cosmetic"
            ? null
            : {
                // U9.1 — the basis follows the product's SUBCATEGORY, not its
                // category: drinking yoghurt is a liquid and spoonable yoghurt is
                // not, and they share a category (C4.3.7).
                basis:
                  basisFor(entry.category, entry.subcategory) === "liquid"
                    ? "per_100ml"
                    : "per_100g",
                energyKcal: num(n["energy-kcal_100g"]),
                carbohydratesG: num(n["carbohydrates_100g"]),
                sugarsG: num(n["sugars_100g"]),
                addedSugarsG: num(n["added-sugars_100g"]),
                fatG: num(n["fat_100g"]),
                saturatedFatG: num(n["saturated-fat_100g"]),
                saltG: num(n["salt_100g"]),
                fibreG: num(n["fiber_100g"]),
                proteinG: num(n["proteins_100g"]),
              },
        evidenceSource: SOURCE_NAME[entry.db],
        evidenceSourceUrl: `${base}/product/${entry.barcode}`,
        fetchedAt: new Date().toISOString(),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`  attempt ${attempt} failed for ${entry.slug}: ${message}`);
      if (attempt === 4) return null;
      await new Promise((r) => setTimeout(r, attempt * 1500));
    }
  }
  return null;
}

async function main() {
  const outPath = resolve(__dirname, "../prisma/seed-data/products.json");
  const existing: FetchedProduct[] = existsSync(outPath)
    ? (JSON.parse(readFileSync(outPath, "utf8")) as FetchedProduct[])
    : [];

  const results: FetchedProduct[] = [];
  const failures: string[] = [];

  for (const entry of CATALOGUE) {
    process.stdout.write(`fetching ${entry.slug} (${entry.barcode}) ... `);
    const product = await fetchOne(entry);
    if (product) {
      if (product.nutrition && !nutritionIsUsable(product.nutrition as Record<string, number | null>)) {
        product.nutrition = null;
        console.log("ok (nutrition panel empty at source -> recorded as unknown)");
      } else {
        console.log("ok");
      }
      results.push(product);
    } else {
      // Keep whatever we already had rather than silently losing a product.
      const previous = existing.find((p) => p.slug === entry.slug);
      if (previous) results.push(previous);
      failures.push(entry.slug);
      console.log(previous ? "FAILED (kept previous row)" : "FAILED");
    }
    await new Promise((r) => setTimeout(r, 600));
  }

  writeFileSync(outPath, JSON.stringify(results, null, 2) + "\n");
  console.log(`\nwrote ${results.length} products to ${outPath}`);
  if (failures.length) console.log(`could not fetch: ${failures.join(", ")}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
