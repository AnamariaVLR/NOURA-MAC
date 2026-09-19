/**
 * Open Food Facts / Open Beauty Facts client.
 *
 * Contract: never throws, never blocks a page for long, never returns a shape the
 * rest of the app has not validated. A failed lookup returns null and the pipeline
 * falls back to seeded evidence.
 */
import { OPEN_FOOD_FACTS_BASE, isOffline } from "../config";
import {
  NutritionFactsSchema,
  OffByBarcodeSchema,
  OffSearchSchema,
  type NutritionFacts,
  type OffProduct,
  type ProductCategory,
} from "../schemas";

const BEAUTY_BASE = "https://world.openbeautyfacts.org";
const USER_AGENT = "Noura/0.1 (UAE healthy product MVP)";
const TIMEOUT_MS = 6000;

export type EvidenceRecord = {
  barcode: string | null;
  name: string;
  brand: string | null;
  sizeLabel: string | null;
  imageUrl: string | null;
  ingredientsText: string | null;
  allergens: string[];
  additives: string[];
  novaGroup: number | null;
  nutrition: NutritionFacts | null;
  sourceName: string;
  sourceUrl: string;
  lastVerifiedAt: Date;
};

function baseFor(category: ProductCategory): { url: string; name: string } {
  return category === "cosmetic"
    ? { url: BEAUTY_BASE, name: "Open Beauty Facts" }
    : { url: OPEN_FOOD_FACTS_BASE, name: "Open Food Facts" };
}

const FIELDS =
  "code,product_name,product_name_en,brands,quantity,image_front_url,ingredients_text," +
  "ingredients_text_en,allergens_tags,additives_tags,nova_group,categories_tags,nutriments";

async function getJson(url: string): Promise<unknown | null> {
  if (isOffline()) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: controller.signal,
      cache: "no-store",
    });
    const text = await res.text();
    // The service answers outages with an HTML holding page and a 200.
    if (!text.trimStart().startsWith("{")) return null;
    return JSON.parse(text);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function cleanTag(tag: string, upperE = false): string {
  const bare = tag.replace(/^[a-z]{2}:/, "").replace(/-/g, " ");
  if (upperE && /^e\s?\d/.test(bare)) return bare.replace(/\s/g, "").toUpperCase();
  return bare;
}

/**
 * An entirely empty nutrition panel must not be stored as a row of zeroes, or
 * "no data" silently becomes "no sugar".
 */
export function nutritionIsUsable(n: NutritionFacts): boolean {
  const macros = [n.sugarsG, n.carbohydratesG, n.fatG, n.saturatedFatG, n.proteinG, n.fibreG, n.saltG];
  if (macros.every((v) => v === null)) return false;
  return n.energyKcal !== null || macros.some((v) => (v ?? 0) > 0);
}

export function toEvidence(
  product: OffProduct,
  category: ProductCategory,
  sourceName: string,
  sourceUrl: string,
): EvidenceRecord | null {
  const name = product.product_name_en || product.product_name;
  if (!name) return null;

  const n = product.nutriments ?? {};
  const parsed = NutritionFactsSchema.safeParse({
    basis: category === "drink" ? "per_100ml" : "per_100g",
    energyKcal: num(n["energy-kcal_100g"]),
    carbohydratesG: num(n.carbohydrates_100g),
    sugarsG: num(n.sugars_100g),
    addedSugarsG: null,
    fatG: num(n.fat_100g),
    saturatedFatG: num(n["saturated-fat_100g"]),
    saltG: num(n.salt_100g),
    fibreG: num(n.fiber_100g),
    proteinG: num(n.proteins_100g),
  });

  const nutrition =
    category === "cosmetic" || !parsed.success || !nutritionIsUsable(parsed.data)
      ? null
      : parsed.data;

  return {
    barcode: product.code ?? null,
    name,
    brand: (product.brands ?? "").split(",")[0]?.trim() || null,
    sizeLabel: product.quantity ?? null,
    imageUrl: product.image_front_url ?? null,
    ingredientsText: product.ingredients_text_en || product.ingredients_text || null,
    allergens: (product.allergens_tags ?? []).map((t) => cleanTag(t)),
    additives: (product.additives_tags ?? []).map((t) => cleanTag(t, true)),
    novaGroup: num(product.nova_group),
    nutrition,
    sourceName,
    sourceUrl,
    lastVerifiedAt: new Date(),
  };
}

export async function lookupByBarcode(
  barcode: string,
  category: ProductCategory,
): Promise<EvidenceRecord | null> {
  const base = baseFor(category);
  const body = await getJson(`${base.url}/api/v2/product/${barcode}.json?fields=${FIELDS}`);
  if (!body) return null;

  const parsed = OffByBarcodeSchema.safeParse(body);
  if (!parsed.success || !parsed.data.product) return null;

  return toEvidence(parsed.data.product, category, base.name, `${base.url}/product/${barcode}`);
}

export async function searchByName(
  name: string,
  category: ProductCategory,
): Promise<EvidenceRecord | null> {
  const base = baseFor(category);
  const url =
    `${base.url}/cgi/search.pl?search_terms=${encodeURIComponent(name)}` +
    `&search_simple=1&action=process&json=1&page_size=3&fields=${FIELDS}`;

  const body = await getJson(url);
  if (!body) return null;

  const parsed = OffSearchSchema.safeParse(body);
  const first = parsed.success ? parsed.data.products?.[0] : undefined;
  if (!first) return null;

  const code = first.code ?? "";
  return toEvidence(first, category, base.name, `${base.url}/product/${code}`);
}
