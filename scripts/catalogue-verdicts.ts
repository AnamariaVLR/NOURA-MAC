/**
 * Runs the health engine across the whole seeded catalogue and prints one JSON
 * object per product: verdict plus every check's key and status.
 *
 * Used to produce verdict-changes.md — run it on the old engine, run it again on
 * the new one, diff. It reads prisma/seed-data/products.json directly rather than
 * the database, so it needs no seeding and no server.
 */
import { readFileSync } from "node:fs";
import { evaluateProduct } from "../lib/health/evaluate";
import { NutritionFactsSchema, type ProductCategory } from "../lib/schemas";

type SeedProduct = {
  slug: string;
  category: string;
  subcategory: string | null;
  name: string;
  brand: string | null;
  ingredientsText: string | null;
  additives: string[];
  allergens: string[];
  novaGroup: number | null;
  nutrition: unknown;
};

const seed = JSON.parse(
  readFileSync(new URL("../prisma/seed-data/products.json", import.meta.url), "utf8"),
) as SeedProduct[];

const source = { name: "Open Food Facts", url: null, lastVerifiedAt: "2026-09-19" };

const out = seed.map((p) => {
  const parsed = p.nutrition ? NutritionFactsSchema.safeParse(p.nutrition) : null;
  const evaluation = evaluateProduct({
    category: p.category as ProductCategory,
    subcategory: p.subcategory ?? null,
    nutrition: parsed?.success ? parsed.data : null,
    novaGroup: p.novaGroup ?? null,
    additives: p.additives ?? [],
    allergens: p.allergens ?? [],
    ingredientsText: p.ingredientsText || null,
    certifications: [],
    evidenceSource: source,
  });
  return {
    slug: p.slug,
    category: p.category,
    subcategory: evaluation.subcategory.key,
    section: evaluation.section,
    verdict: evaluation.verdict.verdict,
    reason: evaluation.verdict.reason,
    counts: evaluation.verdict.counts,
    checks: evaluation.checks.map((c) => ({
      key: c.key,
      status: c.status,
      claim: c.claim,
      disqualifying: c.disqualifying ?? false,
    })),
    notes: evaluation.notes.map((n) => n.rule),
  };
});

console.log(JSON.stringify(out, null, 2));
