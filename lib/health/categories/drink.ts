/**
 * RUBRIC.md §4.8 — Drinks.
 *
 * S5 category 3, beverages other than milk drinks. Milk, plant drinks, laban and
 * ayran are NOT here — they are in §4.2 and §4.3, following S5's own category
 * boundaries, which is what stops a bottled water from being ranked against an
 * oat drink (the audit defect §8 R1 exists to fix).
 *
 * The most consequential change in this specification lives here: under the
 * shipped code juice sugars were not free sugars (DECISIONS §34). Under S2 —
 * whose definition names fruit juice explicitly — and S5 footnote d, they are,
 * and C4.8.2 counts them.
 */

import { energyDrinkSignal } from "../energy-drinks";
import { SALT_BANDS, SATURATED_FAT_BANDS, SUGAR_BANDS } from "../rubric";
import type { Basis, CategoryRule } from "./types";

export const drink: CategoryRule = {
  key: "drink",
  label: "Drinks",
  section: "RUBRIC.md §4.8",
  supported: true,

  subcategories: [{ key: "drink", label: "Drinks", basis: "liquid" }],
  defaultSubcategory: "drink",

  checks: [
    "addedSugars",
    "totalSugars",
    "saturatedFat",
    "salt",
    "nutrientDensity",
    "additives",
    "certification",
    "transparency",
  ],

  lines: (basis: Basis) => ({
    // C4.8.1 — U1 liquid lines, presence-decided (U1.7).
    addedSugars: { ...SUGAR_BANDS[basis], rule: "C4.8.1", source: "S9, S12, S1 · tier 1" },

    // C4.8.2 — SOURCED S10 · tier 1, BINDING UAE. Assessed on TOTAL sugars,
    // because the excise band is defined on "natural sugar plus added sugar and
    // other sweeteners combined". The high line is also the disqualifier.
    //
    // C4.8.6: this is where 100% juice is caught. Its sugars are free sugars
    // (S2's definition names fruit juice; S5 footnote d agrees), so they are
    // counted here. The S10 excise EXCLUSION for 100% juice is fiscal and does
    // not govern the health rule — hierarchy H5 — and is disclosed as context.
    totalSugars: { ...SUGAR_BANDS[basis], rule: "C4.8.2", source: "S10, S12, S1 · tier 1" },

    // C4.8.3, C4.8.4 — the universal liquid lines, unmodified.
    saturatedFat: { ...SATURATED_FAT_BANDS[basis], rule: "C4.8.3", source: "S12, S1 · tier 1" },
    salt: { ...SALT_BANDS[basis], rule: "C4.8.4", source: "S12, S1 · tier 1" },
  }),

  // C4.8.7 — SOURCED, S5 #3d (marketing not permitted at any level) and S10
  // (taxed at 100% of retail price, where even a high-sugar drink is taxed per
  // litre). An energy drink is a CLASS, not a composition, so it cannot be a
  // nutrient line; it is the one class disqualifier in the model. The
  // identification rule and its cost are in lib/health/energy-drinks.ts.
  classDisqualifier: ({ ingredientsText }) => {
    const signal = energyDrinkSignal(ingredientsText);
    if (signal === null) return null;
    if (signal.caffeine.length === 0 || signal.stimulants.length === 0) return null;
    return {
      rule: "C4.8.7",
      claim: "This is an energy drink",
      detail:
        `The ingredients name caffeine alongside ${signal.stimulants.join(" and ")}. ` +
        "The WHO Eastern Mediterranean model does not permit energy drinks to be marketed to " +
        "children at any level, and the UAE taxes them at 100% of the retail price rather than " +
        "by sugar content.",
      source: "S5 #3d, S10 · tier 1",
    };
  },

  // C4.8.8 — POLICY. "Water ranks above every sweetened drink" is not a separate
  // rule in the ranker; it FOLLOWS from this ordering, because water has no added
  // sugar and no total sugar. Stated in RUBRIC so the outcome is predictable.
  better: ["noAddedSugar", "lowerTotalSugars", "fewerAdditives"],

  notes: [
    {
      rule: "C4.8.5",
      text:
        "Non-sugar sweeteners are reported, not counted against the product. The WHO Eastern " +
        "Mediterranean model sets beverages at zero sweeteners for marketing to children, and " +
        "Nutri-Score treats them as a negative. Neither is a general-population limit, and no " +
        "source Noura holds sets one. Whether a sweetener should fail a drink is an open question.",
      source: "S5 #3c/#3e, S7 · tier 1",
    },
    {
      rule: "C4.8.6",
      text:
        "The sugar in 100% fruit juice counts here. The WHO definition of free sugars names fruit " +
        "juice explicitly. The UAE excise excludes 100% juice from the sweetened-drink tax, which " +
        "is a decision about what to tax rather than about what is healthy, so it is shown as " +
        "context and does not move the check.",
      source: "S2, S5 footnote d, S10 · tier 1",
    },
  ],
};
