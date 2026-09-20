/**
 * Finds real Open Food Facts records to consider for the pilot catalogue.
 *
 * THIS SCRIPT INVENTS NOTHING. It queries Open Food Facts' v2 search for brands
 * and categories sold in UAE supermarkets, and prints what came back. Every
 * barcode it emits is a barcode Open Food Facts already has a record for; a
 * product a human then puts in prisma/seed-data/catalogue.ts is verified again,
 * by barcode, by scripts/fetch-off-seed.ts.
 *
 * The free-text search endpoint is the unreliable one (DECISIONS.md §18) and is
 * not used. /api/v2/search with brands_tags or categories_tags is solid.
 *
 * Usage:  npx tsx scripts/discover-products.ts <query-file.json>
 * where the file is [{ label, params: { brands_tags?, categories_tags? } }, …]
 */
import { readFileSync } from "node:fs";

const BASE = "https://world.openfoodfacts.org";
const UA = "Noura/pilot (UAE supermarket pilot; contact: pilot@noura.local)";

const FIELDS = [
  "code",
  "product_name",
  "product_name_en",
  "brands",
  "quantity",
  "countries_tags",
  "categories_tags",
  "ingredients_text",
  "ingredients_text_en",
  "nutriments",
  "nova_group",
].join(",");

export type Candidate = {
  code: string;
  name: string;
  brand: string;
  quantity: string;
  uae: boolean;
  hasIngredients: boolean;
  hasNutrition: boolean;
  categories: string[];
};

type Raw = {
  code?: string;
  product_name?: string;
  product_name_en?: string;
  brands?: string;
  quantity?: string;
  countries_tags?: string[];
  categories_tags?: string[];
  ingredients_text?: string;
  ingredients_text_en?: string;
  nutriments?: Record<string, unknown>;
};

/** A record is worth considering only if it actually carries evidence. */
export function isUsable(raw: Raw): { hasIngredients: boolean; hasNutrition: boolean } {
  const ingredients = (raw.ingredients_text_en || raw.ingredients_text || "").trim();
  const n = raw.nutriments ?? {};
  const hasNutrition = ["energy-kcal_100g", "sugars_100g", "fat_100g", "proteins_100g", "salt_100g"]
    .some((key) => typeof n[key] === "number");
  return { hasIngredients: ingredients.length > 3, hasNutrition };
}

export async function search(params: Record<string, string>, pageSize = 40): Promise<Raw[]> {
  const query = new URLSearchParams({ ...params, page_size: String(pageSize), fields: FIELDS });
  try {
    const res = await fetch(`${BASE}/api/v2/search?${query}`, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(30_000),
    });
    const text = await res.text();
    if (!text.startsWith("{")) return [];
    return (JSON.parse(text) as { products?: Raw[] }).products ?? [];
  } catch {
    return [];
  }
}

export function toCandidate(raw: Raw): Candidate | null {
  if (!raw.code || !/^\d{8,14}$/.test(raw.code)) return null;
  const { hasIngredients, hasNutrition } = isUsable(raw);
  return {
    code: raw.code,
    name: (raw.product_name_en || raw.product_name || "").trim(),
    brand: (raw.brands ?? "").split(",")[0]?.trim() ?? "",
    quantity: (raw.quantity ?? "").trim(),
    uae: (raw.countries_tags ?? []).some((c) => c.includes("united-arab")),
    hasIngredients,
    hasNutrition,
    categories: raw.categories_tags ?? [],
  };
}

async function main(): Promise<void> {
  const file = process.argv[2];
  if (!file) {
    console.error("usage: tsx scripts/discover-products.ts <queries.json>");
    process.exitCode = 1;
    return;
  }

  const queries = JSON.parse(readFileSync(file, "utf8")) as {
    label: string;
    params: Record<string, string>;
  }[];

  for (const { label, params } of queries) {
    const raws = await search(params);
    const candidates = raws
      .map(toCandidate)
      .filter((c): c is Candidate => c !== null)
      .filter((c) => c.hasIngredients || c.hasNutrition)
      .filter((c) => c.name.length > 0);

    console.log(`\n### ${label}  (${candidates.length} usable of ${raws.length})`);
    for (const c of candidates.slice(0, 16)) {
      const flags = `${c.hasIngredients ? "I" : "-"}${c.hasNutrition ? "N" : "-"}${c.uae ? "U" : "-"}`;
      console.log(
        `  ${c.code}  ${flags}  ${c.brand.slice(0, 18).padEnd(18)} ${c.name.slice(0, 44).padEnd(44)} ${c.quantity.slice(0, 10)}`,
      );
    }
    await new Promise((r) => setTimeout(r, 600));
  }
}

if (process.argv[1]?.endsWith("discover-products.ts")) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
