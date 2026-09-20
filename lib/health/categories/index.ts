/**
 * The category registry — RUBRIC.md §4 C4.0.
 *
 * Eleven categories. Eight of them are pilot categories whose BOUNDARIES follow
 * S5's own category structure (fats and oils #10, milk drinks #3c, yoghurts #7,
 * eggs within #13, bread #11, breakfast cereals #5, savoury snacks #2,
 * beverages #3) — SOURCED, tier 1. `food` is a declared POLICY fallback, and
 * cosmetics and supplements are the two Noura cannot evidence at all.
 *
 * This replaces the four-category model (food / drink / supplement / cosmetic),
 * under which a single `food` rubric judged olive oil, eggs, cheese and bread by
 * the same lines. That was the root of several of the misverdicts the audit found.
 */

import type { ProductCategory } from "../../schemas";
import { bread } from "./bread";
import { cereal } from "./cereal";
import { cosmetic } from "./cosmetic";
import { drink } from "./drink";
import { eggs } from "./eggs";
import { fatsOils } from "./fats-oils";
import { food } from "./food";
import { milk } from "./milk";
import { snacks } from "./snacks";
import { supplement } from "./supplement";
import { yogurt } from "./yogurt";
import { subcategoryOf, type Basis, type CategoryRule, type Subcategory } from "./types";

export const CATEGORY_RULES: Record<ProductCategory, CategoryRule> = {
  fats_oils: fatsOils,
  milk,
  yogurt,
  eggs,
  bread,
  cereal,
  snacks,
  drink,
  food,
  cosmetic,
  supplement,
};

export function ruleFor(category: ProductCategory): CategoryRule {
  return CATEGORY_RULES[category];
}

/** The subcategory a product is judged and ranked in. Never guessed (C4.0.1). */
export function resolveSubcategory(
  category: ProductCategory,
  subcategory: string | null,
): Subcategory {
  return subcategoryOf(CATEGORY_RULES[category], subcategory);
}

/** The per-100 basis for a product — U9.1, selected by subcategory (C4.3.7). */
export function basisFor(category: ProductCategory, subcategory: string | null): Basis {
  return resolveSubcategory(category, subcategory).basis;
}

/** Every subcategory key in the model, for validation at the write boundary. */
export const ALL_SUBCATEGORY_KEYS: readonly string[] = Object.values(CATEGORY_RULES).flatMap((r) =>
  r.subcategories.map((s) => s.key),
);

export { subcategoryOf };
export type { Basis, CategoryRule, Subcategory } from "./types";
export type { BetterAttribute, CategoryNote, CheckKey, NutrientKey, NutrientLine } from "./types";
