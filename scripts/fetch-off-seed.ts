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

/**
 * THE RULE FOR THE PILOT CATALOGUE: a product stays only if Open Food Facts
 * returned ingredients OR nutrition for it.
 *
 * A record with neither is a barcode and a name. Noura would render it as a wall
 * of "unknown" — technically correct, since unknown is never a pass, and
 * useless: a shopper who scans three products and gets three shrugs stops
 * scanning. Keeping such a row would also quietly inflate the catalogue with
 * products the app cannot say anything about.
 *
 * Every barcode tried and every one dropped is written to catalogue-report.md,
 * so the catalogue's size is a fact about Open Food Facts' coverage rather than
 * a number someone picked.
 */
function hasEvidence(product: FetchedProduct): boolean {
  const ingredients = (product.ingredientsText ?? "").trim();
  return ingredients.length > 3 || product.nutrition !== null;
}

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
  type Row = {
    slug: string;
    barcode: string;
    category: string;
    outcome: "kept" | "kept-from-cache" | "dropped-no-evidence" | "dropped-not-found";
    detail: string;
  };
  const report: Row[] = [];

  for (const entry of CATALOGUE) {
    process.stdout.write(`fetching ${entry.slug} (${entry.barcode}) ... `);
    const product = await fetchOne(entry);

    if (product) {
      if (product.nutrition && !nutritionIsUsable(product.nutrition as Record<string, number | null>)) {
        // A panel of zeroes is not a panel. Recording it as null is the same
        // rule as everywhere else: absent data is unknown, never a value.
        product.nutrition = null;
      }

      if (!hasEvidence(product)) {
        report.push({
          slug: entry.slug,
          barcode: entry.barcode,
          category: entry.category,
          outcome: "dropped-no-evidence",
          detail: "record exists but carries neither an ingredient list nor a nutrition panel",
        });
        console.log("DROPPED (no ingredients, no nutrition)");
      } else {
        const has = [
          (product.ingredientsText ?? "").trim().length > 3 ? "ingredients" : null,
          product.nutrition ? "nutrition" : null,
        ].filter(Boolean).join(" + ");
        report.push({
          slug: entry.slug,
          barcode: entry.barcode,
          category: entry.category,
          outcome: "kept",
          detail: has,
        });
        results.push(product);
        console.log(`ok (${has})`);
      }
    } else {
      // Keep whatever we already had rather than silently losing a product.
      const previous = existing.find((p) => p.slug === entry.slug);
      if (previous) {
        results.push(previous);
        report.push({
          slug: entry.slug,
          barcode: entry.barcode,
          category: entry.category,
          outcome: "kept-from-cache",
          detail: `fetch failed; kept the row from ${previous.fetchedAt.slice(0, 10)}`,
        });
        console.log("FAILED (kept previous row)");
      } else {
        report.push({
          slug: entry.slug,
          barcode: entry.barcode,
          category: entry.category,
          outcome: "dropped-not-found",
          detail: "no record returned for this barcode after four attempts",
        });
        console.log("DROPPED (not found)");
      }
    }
    await new Promise((r) => setTimeout(r, 600));
  }

  writeFileSync(outPath, JSON.stringify(results, null, 2) + "\n");
  writeFileSync(resolve(__dirname, "../catalogue-report.md"), renderReport(report));

  const kept = report.filter((r) => r.outcome.startsWith("kept")).length;
  const dropped = report.length - kept;
  console.log(`\nwrote ${results.length} products to ${outPath}`);
  console.log(`tried ${report.length} barcodes: ${kept} kept, ${dropped} dropped`);
  console.log("catalogue-report.md updated");
}

function renderReport(rows: {
  slug: string;
  barcode: string;
  category: string;
  outcome: string;
  detail: string;
}[]): string {
  const kept = rows.filter((r) => r.outcome.startsWith("kept"));
  const dropped = rows.filter((r) => !r.outcome.startsWith("kept"));
  const byCategory = new Map<string, number>();
  for (const row of kept) byCategory.set(row.category, (byCategory.get(row.category) ?? 0) + 1);

  const table = (list: typeof rows) =>
    [
      "| Barcode | Slug | Category | Outcome | Detail |",
      "|---|---|---|---|---|",
      ...list.map((r) => `| \`${r.barcode}\` | ${r.slug} | ${r.category} | ${r.outcome} | ${r.detail} |`),
    ].join("\n");

  return `# Catalogue report

Generated by \`npm run seed:fetch\` on ${new Date().toISOString().slice(0, 10)}.

Every barcode in \`prisma/seed-data/catalogue.ts\` is fetched from Open Food Facts
by barcode. **A product is kept only if the record came back with an ingredient
list or a nutrition panel.** A record with neither is a barcode and a name; Noura
would render it as a wall of "unknown", which is technically correct and useless
to a shopper.

Nothing here is invented. Every barcode was found in Open Food Facts' own search
before it was added, and is fetched again by barcode here.

**${kept.length} kept, ${dropped.length} dropped, ${rows.length} tried.**

## Kept, by category

| Category | Products |
|---|---|
${[...byCategory.entries()].sort().map(([c, n]) => `| ${c} | ${n} |`).join("\n")}

## Tried and kept

${table(kept)}

## Tried and dropped

${dropped.length === 0 ? "_None. Every barcode tried returned usable evidence._" : table(dropped)}

## Known limits of this catalogue

- **Open Food Facts' UAE coverage is uneven.** Milk, yoghurt, water and bread have
  real UAE-tagged records with Arabic names on them. Eggs, cereal and crisps do
  not, so those entries are European records for the same product kind. The
  checklist they produce is correct for that record; the barcode will not match
  the pack on a Dubai shelf, and a scan of the UAE pack will fall back to a name
  match or find nothing.
- **A nutrition panel of zeroes is recorded as no panel.** Open Food Facts
  contains many records where a contributor saved the form without filling it in.
  Treating those zeroes as values would let a product pass checks on data that
  does not exist.
- **No prices.** Listings are created empty; a price exists only once a person
  records a check. See README, "Recording price checks".
`;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
