/**
 * RUBRIC.md §4.11 — General food.
 *
 * The fallback for a food inside none of the eight pilot categories: cheese, deli
 * items, composite dishes. It receives the universal checks of §3 on the solid
 * basis and nothing more.
 *
 * C4.11.1 is POLICY, and the honest part of it is what the category's existence
 * SAYS: Noura has not written a rule for these products, not that they have been
 * assessed against one. H4 holds that a specific rule beats a generic one, so
 * where no specific rule exists the reader should be told (C4.11.2).
 *
 * Cheese is the live case. The S5 re-extraction recovered usable thresholds for
 * it — category 9, total fat 20 g and salt 1.3 g per 100 g — and no cheese rule
 * is written in this version, because a rule needs more than one number and the
 * category's "better" ordering has not been decided. RUBRIC §9 L8 records that
 * rather than half-implementing it.
 */

import { SALT_BANDS, SATURATED_FAT_BANDS, SUGAR_BANDS } from "../rubric";
import type { Basis, CategoryRule } from "./types";

export const food: CategoryRule = {
  key: "food",
  label: "Food",
  section: "RUBRIC.md §4.11",
  supported: true,

  /**
   * C4.0.1 — subcategories here do NOT change the thresholds. Every one of them
   * is judged by the same universal solid lines, because that is all §4.11
   * claims to offer. They exist for one reason: they bound the alternative
   * comparison. Without them "the same kind of product" would put a jar of
   * pasta sauce and a bag of rice in the same pool, and Noura would offer rice
   * to someone holding a jar of sauce.
   */
  subcategories: [
    { key: "food", label: "Food", basis: "solid" },
    { key: "rice", label: "Rice", basis: "solid" },
    { key: "pasta", label: "Pasta", basis: "solid" },
    { key: "canned_food", label: "Canned food", basis: "solid" },
    { key: "sauce", label: "Sauce", basis: "solid" },
  ],
  defaultSubcategory: "food",

  checks: [
    "addedSugars",
    "saturatedFat",
    "salt",
    "nutrientDensity",
    "additives",
    "certification",
    "transparency",
  ],

  lines: (basis: Basis) => ({
    addedSugars: { ...SUGAR_BANDS[basis], rule: "U1.3/U1.4", source: "S12, S1 · tier 1" },
    saturatedFat: { ...SATURATED_FAT_BANDS[basis], rule: "U2.1/U2.2", source: "S12, S1 · tier 1" },
    salt: { ...SALT_BANDS[basis], rule: "U3.1/U3.2", source: "S12, S1 · tier 1" },
  }),

  better: ["noAddedSugar", "lowerSaturatedFat", "lowerSalt", "higherFibre"],

  notes: [
    {
      rule: "C4.11.2",
      text:
        "This product does not fall into one of the categories Noura has written a rule for, so " +
        "it is judged by the general lines for food. Those lines are real and sourced, but a " +
        "category rule would be a better guide, and there is not one for this product yet.",
      source: "RUBRIC.md §4.11 · policy",
    },
  ],
};
