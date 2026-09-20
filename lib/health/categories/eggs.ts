/**
 * RUBRIC.md §4.4 — Eggs.
 *
 * The honest category. S9 §1.2.3 exempts fresh eggs from nutrition labelling, so
 * there is usually no panel to read; S5 puts eggs with fresh meat and fish, whose
 * only threshold is salt; and no retrieved source distinguishes one egg from
 * another on a health basis.
 *
 * The consequence Noura accepts (C4.4.4): for plain eggs the correct output is
 * close to "nothing to check", and the product must say that rather than
 * manufacture a verdict. Free range, organic and omega-3 enrichment are
 * CERTIFICATION questions (§6), never nutrition ones, and must never be presented
 * as the latter.
 */

import type { CategoryRule } from "./types";

export const eggs: CategoryRule = {
  key: "eggs",
  label: "Eggs",
  section: "RUBRIC.md §4.4",
  supported: true,

  subcategories: [{ key: "eggs", label: "Eggs", basis: "solid" }],
  defaultSubcategory: "eggs",

  // C4.4.1 — SOURCED S9 §1.2.3. Nutrition labelling is not required, so no
  // nutrient check is applied beyond salt, and only where a figure exists.
  // C4.4.3 — U8 is not applied: a fresh egg has no ingredient list to publish.
  // Failing it, as the shipped code did, is a category error (B9).
  checks: ["salt", "certification"],

  lines: () => ({
    // C4.4.2 — SOURCED S5 category 13 · tier 1. The category's only threshold.
    // No "low" line exists, so 0.1 is the pass line.
    salt: { high: 0.1, tolerance: "salt", rule: "C4.4.2", source: "S5 #13 · tier 1" },
  }),

  // C4.4.4 — POLICY, and the point of it is the empty list. "Better" within eggs
  // is UNKNOWN, so nothing may break a tie and the ranker falls through to price
  // and name. Stated so the product does not manufacture a ranking. §9 Q9.
  better: [],

  notes: [
    {
      rule: "C4.4.4",
      text:
        "There is very little to check on a plain egg. Nutrition labelling is not required for " +
        "fresh eggs, and no source Noura holds distinguishes one egg from another on health " +
        "grounds. Free range, organic and omega-3 enrichment are certification questions, and " +
        "Noura will not present them as nutrition ones.",
      source: "S9 §1.2.3, S5 #13 · tier 1",
    },
  ],
};
