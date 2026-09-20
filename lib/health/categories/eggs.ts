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

  // C4.4.1 — SOURCED S9 §1.2.3. Nutrition labelling is not required for fresh
  // eggs, so there is usually no panel at all.
  // C4.4.2 — S5 category 13's salt line of 0.1 g/100 g is DECLINED. See below.
  // C4.4.3 — U8 is not applied: a fresh egg has no ingredient list to publish.
  // Failing it, as the shipped code did, is a category error (B9).
  //
  // What is left is certification, and for most eggs that is unknown, so the
  // verdict is COULD NOT VERIFY. That is not a gap — it is C4.4.4 working. The
  // honest output for a plain egg is "there is nothing here to check".
  checks: ["certification"],

  // C4.4.2 — DECLINED under C0, and this is the case that proves the rule.
  //
  // S5 category 13 sets 0.1 g of salt per 100 g for fresh meat, poultry, fish
  // and eggs, for marketing to children. A hen's egg contains about 0.3 g of
  // salt equivalent per 100 g and always has: that sodium is intrinsic, not
  // added by anyone. Applying the line condemns EVERY egg, and the two in this
  // catalogue were returning NOT RECOMMENDED on nothing but their own chemistry.
  //
  // That is the same error as counting lactose as added sugar (U1.9), in a
  // different nutrient, and C0 already says what to do with a line that fails
  // its whole category: decline it, and show it. The note below shows it.
  lines: () => ({}),

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
      source: "S9 §1.2.3 · tier 1",
    },
    {
      rule: "C4.4.2",
      text:
        "For marketing to children, the WHO Eastern Mediterranean model sets fresh meat, fish " +
        "and eggs at no more than 0.1 g of salt per 100 g. Noura does not apply that line to " +
        "eggs. An egg contains around 0.3 g of salt equivalent per 100 g and always has — that " +
        "sodium is part of the egg, not something a manufacturer added — so the line would fail " +
        "every egg ever laid. That is Noura's judgement, not a rule it found.",
      source: "S5 #13 · tier 1, declined",
    },
  ],
};
