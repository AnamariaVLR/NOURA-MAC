/**
 * The shape of a category rule — RUBRIC.md §4.
 *
 * "Healthy is category-specific." A single rubric judging olive oil, eggs and
 * bread by the same lines is the root of several of the misverdicts the audit
 * found. Each file in this directory is one section of RUBRIC.md §4, and exports
 * the four things that section defines: which checks apply, which lines they use,
 * what disqualifies, and what "better" means inside the category.
 *
 * Nothing in here invents a number. Every NutrientLine carries the RUBRIC.md rule
 * identifier that sets it and the source that rule cites; `tests/unit/
 * rubric-s4-categories.test.ts` asserts that no line exists without both.
 */

import type { ProductCategory } from "../../schemas";
import type { ToleranceNutrient } from "../tolerance";

/**
 * Which per-100 basis a product is judged on — RUBRIC.md §3 U9.1.
 * Chosen per subcategory, because drinking yoghurt and spoonable yoghurt are the
 * same category judged on different bases (C4.3.7).
 */
export type Basis = "solid" | "liquid";

/** A threshold pair, with the rule that sets it and the source that rule cites. */
export type NutrientLine = {
  /**
   * Pass at or below this. Absent where the category has only one sourced line,
   * in which case `high` is also the pass line — see C4.1.1 for the worked case.
   */
  low?: number;
  /** Above this the check reads "high", and fails. */
  high: number;
  /**
   * Above this, plus the §2.2 tolerance, the failure disqualifies.
   * Defaults to `high`. Set higher to implement C0's two-strength rule: an EMRO
   * marketing line fails, and the general-population line disqualifies.
   */
  disqualifyAbove?: number;
  /**
   * Required when `low` is absent — RUBRIC.md §3 U10.
   *
   * A category with a single sourced threshold has no "low" mark, and the
   * passing side of it MUST NOT be described as low. Extra virgin olive oil at
   * 16 g of saturated fat per 100 g sits below the line for fats and oils; it is
   * not "low saturated fat", and calling it that is a health claim Noura has not
   * earned. `noun` names what the line is; `because` explains why this category
   * has its own.
   */
  singleLine?: { noun: string; because: string };
  /** Which GSO Table 6 row governs the tolerance (§2.2 D1). */
  tolerance: ToleranceNutrient;
  /** RUBRIC.md rule identifier, e.g. "C4.6.1". */
  rule: string;
  /** The source that rule cites, e.g. "S5 #5 · tier 1". */
  source: string;
};

export type NutrientKey = "addedSugars" | "totalSugars" | "saturatedFat" | "salt";

/** Every check Noura can make. `processing` is absent: U5.1 demoted it to a note. */
export type CheckKey =
  | NutrientKey
  | "nutrientDensity"
  | "additives"
  | "certification"
  | "transparency";

export type NutrientLines = Partial<Record<NutrientKey, NutrientLine>>;

/** RUBRIC.md §4 C4.0.1. A subcategory changes the basis and bounds the ranking. */
export type Subcategory = {
  key: string;
  label: string;
  basis: Basis;
};

/**
 * Something shown to the reader that is not a check: a declined threshold, a
 * regional cross-check, an authorised claim Noura cannot evaluate, a fiscal fact.
 * Notes never touch the pass rate and never disqualify.
 */
export type CategoryNote = {
  rule: string;
  text: string;
  source: string;
};

/**
 * The attributes a category's "better" ordering is built from, applied after
 * §8's R1-R3 and before R4's price. Each names a rule in the category's section.
 */
export type BetterAttribute =
  | "noAddedSugar"
  | "lowerTotalSugars"
  | "lowerSaturatedFat"
  | "lowerSalt"
  | "higherProtein"
  | "higherFibre"
  | "fewerAdditives"
  | "polyphenolClaim"
  | "extraVirginGrade";

export type CategoryRule = {
  key: ProductCategory;
  /** Shown to the reader, e.g. "Yogurt". */
  label: string;
  /** The section of RUBRIC.md this file implements, e.g. "RUBRIC.md §4.3". */
  section: string;
  /**
   * RUBRIC.md §2.4 D12. False means the category returns COULD NOT VERIFY with
   * `unsupportedMessage`, whatever its checks say — because Noura has no sourced
   * basis for a verdict and publishing one built from two weak checks would be
   * worse than saying so.
   */
  supported: boolean;
  unsupportedMessage?: string;
  subcategories: readonly Subcategory[];
  /** Used when no subcategory is recorded. Never a guess about the product. */
  defaultSubcategory: string;
  /** Which checks apply, in the order they are shown. */
  checks: readonly CheckKey[];
  /** The thresholds, for the basis the product's subcategory selects. */
  lines: (basis: Basis) => NutrientLines;
  /** §8, applied within a subcategory. Price and name are appended by the ranker. */
  better: readonly BetterAttribute[];
  /**
   * A disqualifier that is not a nutrient crossing a line — RUBRIC.md §7.1.
   * Today there is exactly one: C4.8.7, energy drinks, which are a class rather
   * than a composition. Returns the claim to show, or null.
   */
  classDisqualifier?: (input: { ingredientsText: string | null }) => {
    rule: string;
    claim: string;
    detail: string;
    source: string;
  } | null;
  notes: readonly CategoryNote[];
};

/** Resolves a recorded subcategory key, falling back to the category's default. */
export function subcategoryOf(rule: CategoryRule, key: string | null): Subcategory {
  const found = key ? rule.subcategories.find((s) => s.key === key) : undefined;
  return found ?? rule.subcategories.find((s) => s.key === rule.defaultSubcategory)!;
}
