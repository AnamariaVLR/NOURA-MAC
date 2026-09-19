/**
 * Noura's published health rubric.
 *
 * IMPORTANT — what this is and is not.
 *
 * These thresholds are NOURA'S OWN rubric. They are calibrated on the shape of
 * widely used front-of-pack nutrition conventions (low/medium/high bands per 100 g
 * for sugars, saturated fat and salt, and the NOVA processing classification), but
 * they are not a quotation of any regulator's standard and must not be presented as
 * one. Before any real launch they need review by a qualified nutritionist —
 * see DECISIONS.md §5.
 *
 * ── The dimensions are checks, not points ──────────────────────────────────
 *
 * Each dimension below resolves to one of three states: passed, failed, or
 * unknown. They are NOT weighted and NOT summed into a score. A single number
 * averages away the thing a shopper actually needs — *which* claim is true and
 * *what* evidence backs it — and invites a product to buy back a failed check with
 * an unrelated good one. See DECISIONS.md §19.
 *
 * Four rules keep the rubric honest:
 *
 *  1. UNKNOWN IS NEVER PASSED. A missing value is reported as unknown and is
 *     excluded from the verdict arithmetic entirely. A product never earns a tick
 *     for having published nothing.
 *
 *  2. ADDITIVE COUNT IS A PROCESSING SIGNAL, NOT A SAFETY CLAIM. Every additive in
 *     these products is legally permitted. We count them because a long additive
 *     list is a reliable marker of heavy processing, and we say exactly that in the
 *     check text. We never assert that a specific additive is harmful.
 *
 *  3. THE PASS LINE IS THE RUBRIC'S OWN "LOW" MARK. A nutrient check passes at or
 *     below the `good` threshold — the same number the rubric has always called
 *     low. `bad` is no longer a scoring anchor; it separates "some" from "high" in
 *     the wording a reader sees, and marks the severe failures that disqualify
 *     (with a margin — see DISQUALIFIER_MARGIN).
 *
 *  4. TOTAL SUGARS IS NOT ADDED SUGAR. The sugars dimension asks whether sugar was
 *     ADDED, which is a claim about the ingredient list, not a reading of the
 *     nutrition panel. Lactose in milk and fructose in fruit are not added by
 *     anyone. See lib/health/added-sugar.ts, and DECISIONS.md §29.
 */

import type { ProductCategory } from "../schemas";

export type ComponentKey =
  | "addedSugars"
  | "saturatedFat"
  | "salt"
  | "nutrientDensity"
  | "processing"
  | "additives"
  | "certification"
  | "transparency";

/**
 * Which dimensions apply to each category, in the order they are shown to the
 * reader. A dimension absent from a category's list is not assessed for it at all
 * and never appears as "unknown": a shampoo has no sugar figure to be missing.
 *
 * This replaces a per-category weight map. The information that mattered — which
 * checks apply where — is kept; the numbers that existed only to be summed are gone.
 */
export const DIMENSIONS: Record<ProductCategory, ComponentKey[]> = {
  food: [
    "addedSugars",
    "saturatedFat",
    "salt",
    "nutrientDensity",
    "processing",
    "additives",
    "certification",
    "transparency",
  ],
  drink: [
    "addedSugars",
    "saturatedFat",
    "salt",
    "nutrientDensity",
    "processing",
    "additives",
    "certification",
    "transparency",
  ],
  // No meaningful per-100 g nutrition panel. What can be checked is who certified
  // it and whether it tells you what is in it.
  supplement: ["processing", "additives", "certification", "transparency"],
  cosmetic: ["additives", "certification", "transparency"],
};

export const LABELS: Record<ComponentKey, string> = {
  addedSugars: "Added sugar",
  saturatedFat: "Saturated fat",
  salt: "Salt",
  nutrientDensity: "Fibre and protein",
  processing: "Level of processing",
  additives: "Additives",
  certification: "UAE certification",
  transparency: "Ingredient transparency",
};

/**
 * Thresholds in g per 100 g (solids) or 100 ml (liquids).
 *
 * `good` is the pass line: at or below it the check passes. `bad` distinguishes
 * "some" from "high" in the sentence the reader sees, and marks a severe failure.
 *
 * The `sugars` entry applies to ADDED sugar only, and only decides whether a known
 * added-sugar quantity is severe enough to disqualify. Whether the check passes at
 * all is decided by presence, not quantity — see lib/health/added-sugar.ts.
 */
export const THRESHOLDS = {
  food: {
    sugars: { good: 5, bad: 22.5 },
    saturatedFat: { good: 1.5, bad: 5 },
    salt: { good: 0.3, bad: 1.5 },
    fibreTarget: 6,
    proteinTarget: 8,
  },
  drink: {
    // Liquid sugar is the biggest lever in the category, so the line sits lower.
    sugars: { good: 1.5, bad: 11.25 },
    saturatedFat: { good: 0.75, bad: 2.5 },
    salt: { good: 0.15, bad: 0.75 },
    fibreTarget: 1.5,
    proteinTarget: 3,
  },
} as const;

/**
 * Processing passes at NOVA group 1 or 2 — unprocessed, minimally processed, or a
 * processed culinary ingredient. Groups 3 and 4 fail.
 */
export const NOVA_PASS_MAX = 2;

/**
 * The additive check is "free from additives": a factual, checkable claim. One
 * additive fails it. That is deliberately a low bar to clear and a plain thing to
 * report — it is not a judgement that any additive is unsafe (rule 2 above).
 */
export const ADDITIVE_PASS_MAX = 0;

/**
 * Below this share of a category's applicable dimensions being *known*, we decline
 * to give a verdict at all and return COULD NOT VERIFY. Half the rubric missing is
 * not a product that scored badly; it is a product we cannot speak about.
 */
export const MIN_COVERAGE = 0.5;

/**
 * Share of the KNOWN checks that must pass for each verdict. Unknown checks are not
 * in the denominator — see rule 1.
 */
export const GOOD_CHOICE_PASS_RATE = 0.8;
export const ACCEPTABLE_PASS_RATE = 0.5;

/**
 * Our strongest statement also needs a minimum amount of evidence in absolute
 * terms, not just a high ratio. Without this, a product with two checkable
 * dimensions that passes both outranks one that passes five of six — and a
 * cosmetic, which has only three applicable dimensions, could reach GOOD CHOICE on
 * the strength of "it publishes an ingredient list and holds a certificate".
 */
export const MIN_KNOWN_FOR_GOOD_CHOICE = 3;

/**
 * How far past the `bad` mark a value must sit before the disqualifier fires.
 *
 * A hairline crossing is not a severe failure. 1.05 of the high mark means a value
 * within 5% of the threshold is a plain ✗ like any other failure, and only a clear
 * breach triggers the override. Without this margin a product measured at 5.01 g of
 * saturated fat would be condemned as loudly as one measured at 55 g, and the
 * difference between those two is the entire point of having an override.
 *
 * Applied to every nutrient disqualifier rather than to saturated fat and salt
 * alone: the reasoning does not change with the nutrient, and a margin that applied
 * to two of the three would be arbitrary.
 */
export const DISQUALIFIER_MARGIN = 1.05;

/**
 * A nutrient clearly above its `bad` mark fails the check AND disqualifies the
 * product outright, exactly as a suspended certificate does.
 *
 * Why an override rather than a heavier weight: counting checks equally means a
 * product can offset a severe failure with easy ticks. Salted butter passes "low
 * sugars", "minimally processed", "no additives" and "publishes ingredients" — four
 * true statements — while carrying 55 g of saturated fat per 100 g. Four ticks must
 * not add up to a recommendation over that. The `bad` threshold is the rubric's own
 * long-standing "high" mark, so this introduces no new number.
 */
export const SEVERE_NUTRIENT_DISQUALIFIES = true;
