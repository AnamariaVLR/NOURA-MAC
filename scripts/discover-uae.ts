/**
 * Harvest real UAE-market products from Open Food Facts for the pilot catalogue.
 *
 * Every candidate must survive four filters before it is written down:
 *   1. tagged as sold in the United Arab Emirates
 *   2. a real name, a real brand and a plausible GTIN
 *   3. enough nutrition to run the category's checks — otherwise the product
 *      would land in the catalogue only to return COULD NOT VERIFY
 *   4. not already present
 *
 * Nothing is invented. A product that fails a filter is dropped and counted,
 * because a padded catalogue is worse than a small one.
 */
import "../lib/load-env";
import { writeFileSync } from "node:fs";

const UA = { "User-Agent": "Noura/1.0 (UAE pilot catalogue)" };

type Off = {
  code: string;
  product_name?: string;
  brands?: string;
  quantity?: string;
  nutriments?: Record<string, number | undefined>;
  ingredients_text?: string;
  categories_tags?: string[];
};

/** category tag → [Noura category, subcategory] */
const TARGETS: [string, string, string | null][] = [
  ["Olive oils", "fats_oils", "olive_oil"],
  ["Milks", "milk", "dairy_milk"],
  ["Plant-based milk alternatives", "milk", "plant_milk"],
  ["Yogurts", "yogurt", "spoonable_yogurt"],
  ["Eggs", "eggs", null],
  ["Breads", "bread", null],
  ["Breakfast cereals", "cereal", null],
  ["Rices", "food", "rice"],
  ["Pastas", "food", "pasta"],
  ["Sauces", "food", "sauce"],
  ["Canned foods", "food", "canned_food"],
  ["Waters", "drink", null],
  ["Crisps", "snacks", null],
  ["Biscuits", "snacks", null],
  // A second pass over the same pilot categories with narrower tags. Open Food
  // Facts' taxonomy is uneven: "Rices" returns almost nothing usable while
  // "Basmati rice" returns real UAE stock, so the tag list is empirical.
  ["Basmati rice", "food", "rice"],
  ["White rices", "food", "rice"],
  ["Cooking oils", "fats_oils", "other_fats_oils"],
  ["Sunflower oils", "fats_oils", "other_fats_oils"],
  ["Cheeses", "food", null],
  ["Fruit juices", "drink", null],
  ["Sodas", "drink", null],
  ["Chocolates", "snacks", null],
  ["Nuts", "snacks", null],
  ["Legumes", "food", "canned_food"],
  ["Canned fish", "food", "canned_food"],
  ["Tomato sauces", "food", "sauce"],
  ["Drinking yogurts", "yogurt", "drinking_yogurt"],
  ["Flatbreads", "bread", null],
];

async function search(tag: string, page: number): Promise<Off[]> {
  const url =
    "https://world.openfoodfacts.org/api/v2/search?" +
    new URLSearchParams({
      countries_tags_en: "United Arab Emirates",
      categories_tags_en: tag,
      fields: "code,product_name,brands,quantity,nutriments,ingredients_text,categories_tags",
      page_size: "100",
      page: String(page),
      sort_by: "unique_scans_n",
    });
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(60_000) });
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as { products?: Off[] };
      return body.products ?? [];
    } catch {
      if (attempt === 3) return [];
      await new Promise((r) => setTimeout(r, attempt * 3_000));
    }
  }
  return [];
}

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 54);

/** Enough evidence to be worth judging: energy plus at least two other nutrients. */
function hasUsableNutrition(n: Record<string, number | undefined> | undefined): boolean {
  if (!n) return false;
  if (n["energy-kcal_100g"] === undefined) return false;
  const others = ["fat_100g", "saturated-fat_100g", "sugars_100g", "salt_100g", "proteins_100g"];
  return others.filter((k) => n[k] !== undefined).length >= 2;
}

async function main(): Promise<void> {
  const kept: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  const dropped: Record<string, number> = {};
  const drop = (why: string) => (dropped[why] = (dropped[why] ?? 0) + 1);

  for (const [tag, category, subcategory] of TARGETS) {
    let found = 0;
    for (let page = 1; page <= 3; page += 1) {
      const products = await search(tag, page);
      if (products.length === 0) break;

      for (const p of products) {
        const code = (p.code ?? "").trim();
        const name = (p.product_name ?? "").trim();
        const brand = (p.brands ?? "").split(",")[0]?.trim() ?? "";
        const size = (p.quantity ?? "").trim();

        if (!/^\d{8,14}$/.test(code)) { drop("no usable barcode"); continue; }
        if (seen.has(code)) { drop("duplicate"); continue; }
        if (!name || !brand) { drop("no name or brand"); continue; }
        if (!size) { drop("no pack size"); continue; }
        if (!hasUsableNutrition(p.nutriments)) { drop("not enough nutrition to judge"); continue; }

        seen.add(code);
        found += 1;
        kept.push({
          slug: `${slugify(brand)}-${slugify(name)}`.slice(0, 60),
          barcode: code,
          db: "off",
          category,
          subcategory,
          sizeLabel: size,
          fallbackName: name,
          fallbackBrand: brand,
          hasIngredients: Boolean((p.ingredients_text ?? "").trim()),
        });
      }
      await new Promise((r) => setTimeout(r, 1_200));
    }
    console.log(`  ${tag.padEnd(34)} kept ${found}`);
  }

  writeFileSync("/tmp/uae-candidates.json", JSON.stringify(kept, null, 2));
  console.log(`\nkept ${kept.length} candidates`);
  console.log("dropped:");
  for (const [k, v] of Object.entries(dropped).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(v).padStart(5)}  ${k}`);
  }
}

void main();
