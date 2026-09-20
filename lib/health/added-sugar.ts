/**
 * Added sugar, as distinct from total sugars.
 *
 * ── Why these are two different things ──────────────────────────────────────
 *
 * Total sugars is a measurement of everything sweet in the product, whatever its
 * origin. Added sugar is a statement about what the manufacturer put in. Plain milk
 * carries ~3-5 g of lactose per 100 ml, plain yoghurt carries lactose, and fruit
 * carries fructose — none of it added by anyone. Treating total sugars as if it
 * were added sugar converts an absence of evidence into a negative claim, which is
 * the one thing this app exists not to do.
 *
 * So: we NEVER infer added sugar from a total-sugars figure. Presence of sugar is
 * not evidence that sugar was added.
 *
 * ── What counts as evidence ─────────────────────────────────────────────────
 *
 * Two sources, in this order of authority:
 *
 *  1. THE INGREDIENT LIST. A legally required document, transcribed verbatim. If it
 *     names sugar, syrup, honey or another sweetener, added sugar is present. If it
 *     is published in full and names none of them, that is genuine positive
 *     evidence of absence — which is what makes plain milk, plain yoghurt and whole
 *     fruit pass without a special case for any of them.
 *
 *  2. A PUBLISHED added-sugars FIGURE, but only when it is coherent. Open Food
 *     Facts' `added-sugars_100g` is crowd-entered and demonstrably unreliable: the
 *     Kellogg's Corn Flakes record in our own seed claims 16.61 g of added sugar
 *     against 8 g of TOTAL sugar, which is impossible, since added sugars are a
 *     subset of total sugars. Any figure exceeding total sugars is discarded
 *     outright. An absent figure arrives as null and is never read as zero.
 *
 * Where the two disagree — the list names sugar but the figure says zero, as on the
 * All-Bran record — the ingredient list wins. It is the primary document; the
 * number is a crowd-sourced annotation of it.
 *
 * Where neither is available, the answer is UNKNOWN. It is never a pass.
 */

import type { NutritionFacts } from "../schemas";

/**
 * Ingredient terms that establish added sugar.
 *
 * Multilingual because Open Food Facts is: our own seed carries French ("sucre"),
 * Spanish ("azúcar") and English lists for products sold in the UAE. Extend this
 * list rather than adding logic elsewhere.
 *
 * Deliberately ABSENT, and each for a reason:
 *   - "lactose"      — the intrinsic sugar of milk. Including it would recreate the
 *                      exact bug this module exists to fix.
 *   - "caramel"      — "colour (caramel e150d)" is a colouring, not a sweetener.
 *                      Coca-Cola's own list would false-positive on it (it fails on
 *                      "sugar" regardless, which is the honest reason).
 *   - "malt"  alone  — "aroma of malt of barley" is a flavouring. "malt extract" is
 *                      a sweetening ingredient and IS listed below.
 *   - "maltodextrin" — a starch derivative whose classification as an added sugar is
 *                      genuinely contested. We do not assert a contested claim.
 *   - "fruit"/"juice" alone — whole fruit and purée are not added sugar. Only
 *                      concentrated juice, used as a sweetener, is listed.
 */
export const ADDED_SUGAR_TERMS: readonly string[] = [
  // English
  "sugar",
  "sugars",
  "cane sugar",
  "brown sugar",
  "icing sugar",
  "invert sugar",
  "caster sugar",
  "glucose",
  "glucose syrup",
  "fructose",
  "high fructose corn syrup",
  "corn syrup",
  "dextrose",
  "sucrose",
  "maltose",
  "honey",
  "molasses",
  "treacle",
  "agave syrup",
  "agave nectar",
  "date syrup",
  "maple syrup",
  "rice syrup",
  "malt extract",
  "barley malt extract",
  "fruit juice concentrate",
  "juice concentrate",
  // French
  "sucre",
  "sucres",
  "sirop de glucose",
  "sirop de sucre",
  "sirop de fructose",
  "saccharose",
  "miel",
  "mélasse",
  "extrait de malt",
  // Spanish / Portuguese
  "azúcar",
  "azucar",
  "azúcares",
  "açúcar",
  "jarabe de glucosa",
  "miel de caña",
  // German / Italian
  "zucker",
  "zuckersirup",
  "glukosesirup",
  "zucchero",
  "sciroppo di glucosio",
  // Arabic
  "سكر",
];

/**
 * Phrases that NEGATE a sugar term rather than declaring one. "no added sugar" and
 * "sugar free" both contain "sugar"; neither means the product contains any. These
 * are removed from the text before matching.
 */
const NEGATION_PATTERNS: readonly RegExp[] = [
  /\bno\s+added\s+sugars?\b/gi,
  /\bwithout\s+added\s+sugars?\b/gi,
  /\bno\s+sugars?\s+added\b/gi,
  /\bno\s+sugars?\b/gi,
  /\bsugars?[-\s]free\b/gi,
  /\bzero\s+sugars?\b/gi,
  /\bunsweetened\b/gi,
  /\bsans\s+sucres?\s+ajoutés?\b/gi,
  /\bsans\s+sucres?\b/gi,
  /\bsin\s+azúcares?\s+añadidos?\b/gi,
  /\bsin\s+azúcar(es)?\b/gi,
  /\bohne\s+zuckerzusatz\b/gi,
  /\bsenza\s+zuccheri\s+aggiunti\b/gi,
];

export type IngredientEvidence =
  | { kind: "present"; terms: string[] }
  | { kind: "absent" }
  | { kind: "no-list" };

/**
 * Strings that appear in an ingredients field but are not an ingredients list.
 * These must not be read as positive evidence that nothing was added.
 *
 * A length threshold alone cannot do this job: "Dates" is five characters and is a
 * complete, honest ingredient list for a bag of dates, while "n/a" is three
 * characters and is the absence of one. So we reject known placeholders by name.
 */
const PLACEHOLDER_LISTS = new Set([
  "n/a",
  "na",
  "n.a.",
  "-",
  "--",
  "none",
  "unknown",
  "tbc",
  "tbd",
  "see pack",
  "see packaging",
  "see label",
  "refer to pack",
  "not available",
  "no data",
]);

/** Below this, the field cannot be a real ingredient name. */
const MIN_INGREDIENT_LENGTH = 3;

/**
 * Is there a real, readable ingredient list here?
 *
 * The single predicate for "a list was published", shared by the added-sugar
 * resolution (U1.8) and the transparency check (U8.1) so the two cannot disagree
 * about the same field. Before this existed, transparency used a minimum length
 * of 10 characters while added sugar rejected placeholders by name, so "Dates" —
 * a complete and honest ingredient list for a bag of dates — passed one and
 * failed the other.
 *
 * A length threshold cannot do this job (DECISIONS §31): "Dates" is five
 * characters and is a list, "n/a" is three and is the absence of one. So
 * placeholders are rejected BY NAME.
 */
export function hasIngredientList(ingredientsText: string | null): boolean {
  return detectAddedSugarIngredients(ingredientsText).kind !== "no-list";
}

/**
 * Looks for added-sugar ingredients in a published list.
 *
 * Returns "absent" only for a list we actually have and could read: that is the
 * positive evidence of absence that lets plain milk, plain yoghurt and whole fruit
 * pass. "no-list" is not a pass and not a fail — it is the input to an UNKNOWN.
 */
export function detectAddedSugarIngredients(ingredientsText: string | null): IngredientEvidence {
  const trimmed = (ingredientsText ?? "").trim();
  if (trimmed.length < MIN_INGREDIENT_LENGTH) return { kind: "no-list" };
  if (PLACEHOLDER_LISTS.has(trimmed.toLowerCase().replace(/\.$/, ""))) return { kind: "no-list" };

  let text = trimmed.toLowerCase();
  for (const negation of NEGATION_PATTERNS) text = text.replace(negation, " ");

  const found = new Set<string>();
  for (const term of ADDED_SUGAR_TERMS) {
    // Word-boundary matching so "sugar" does not fire inside another word, and so
    // multi-word terms match as phrases. \b is unreliable for non-ASCII (Arabic,
    // accented Latin), so those are matched against separator characters instead.
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const ascii = /^[\x20-\x7e]+$/.test(term);
    const pattern = ascii
      ? new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`, "i")
      : new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, "iu");
    if (pattern.test(text)) found.add(term);
  }

  return found.size > 0 ? { kind: "present", terms: [...found] } : { kind: "absent" };
}

/**
 * The published added-sugars figure, or null when there is none we can trust.
 *
 * Added sugars are by definition a subset of total sugars, so a figure exceeding
 * total sugars is impossible and is discarded rather than used. The small tolerance
 * absorbs rounding between two independently entered fields.
 */
export const ADDED_SUGAR_COHERENCE_TOLERANCE_G = 0.5;

export function coherentAddedSugars(nutrition: NutritionFacts | null): number | null {
  if (!nutrition) return null;
  const added = nutrition.addedSugarsG;
  // Absent arrives as null and must never be read as zero.
  if (added === null) return null;
  if (added < 0) return null;

  const total = nutrition.sugarsG;
  if (total !== null && added > total + ADDED_SUGAR_COHERENCE_TOLERANCE_G) return null;

  return added;
}

export type AddedSugarVerdict = {
  /** "present" and "absent" are conclusions; "unknown" is the refusal to conclude. */
  state: "present" | "absent" | "unknown";
  /** Grams per 100 g/ml when a trustworthy figure exists, else null. */
  grams: number | null;
  /** Which evidence produced the conclusion, for the sentence the reader sees. */
  basis:
    | "ingredient-list"
    | "published-figure"
    | "ingredient-list-over-figure"
    | "no-evidence"
    | "conflicting-evidence";
  /** The ingredient terms found, when that is what decided it. */
  terms: string[];
};

/**
 * Resolves the two evidence sources into one conclusion.
 *
 * The order matters and is the whole point: the ingredient list is consulted first
 * because it is the primary document, and a total-sugars figure is never consulted
 * at all.
 */
export function resolveAddedSugar(
  nutrition: NutritionFacts | null,
  ingredientsText: string | null,
): AddedSugarVerdict {
  const ingredients = detectAddedSugarIngredients(ingredientsText);
  const figure = coherentAddedSugars(nutrition);

  // 1. The list names a sweetener. Conclusive, whatever the figure says.
  if (ingredients.kind === "present") {
    return {
      state: "present",
      grams: figure !== null && figure > 0 ? figure : null,
      basis: figure === 0 ? "ingredient-list-over-figure" : "ingredient-list",
      terms: ingredients.terms,
    };
  }

  // 2. A full list naming no sweetener is positive evidence of absence.
  if (ingredients.kind === "absent") {
    // Unless a trustworthy figure says otherwise, in which case we have two
    // credible sources disagreeing and no basis to pick a winner.
    if (figure !== null && figure > 0) {
      return { state: "unknown", grams: figure, basis: "conflicting-evidence", terms: [] };
    }
    return { state: "absent", grams: figure, basis: "ingredient-list", terms: [] };
  }

  // 3. No list at all. A published figure can still settle it.
  if (figure !== null) {
    return {
      state: figure > 0 ? "present" : "absent",
      grams: figure,
      basis: "published-figure",
      terms: [],
    };
  }

  // 4. Nothing to go on. Never a pass.
  return { state: "unknown", grams: null, basis: "no-evidence", terms: [] };
}

/**
 * Which categories carry an added-sugar check is no longer decided here: it is a
 * property of the category rule (RUBRIC.md §4), so there is one list rather than
 * two that can drift. See lib/health/categories/.
 */
