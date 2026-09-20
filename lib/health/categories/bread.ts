/**
 * RUBRIC.md §4.5 — Bread.
 *
 * S5 category 11. The one category where an EMRO line is also the disqualifier —
 * a declared exception to C0, written at C4.5.1 rather than assumed, because
 * bread is the single largest dietary salt source in the region and the line
 * still discriminates: most breads sit below 1 g.
 */

import { FIBRE, SALT_BANDS, SATURATED_FAT_BANDS, SUGAR_BANDS } from "../rubric";
import type { Basis, CategoryRule } from "./types";

export const bread: CategoryRule = {
  key: "bread",
  label: "Bread",
  section: "RUBRIC.md §4.5",
  supported: true,

  subcategories: [{ key: "bread", label: "Bread", basis: "solid" }],
  defaultSubcategory: "bread",

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
    // C4.5.3 — U1 solid lines.
    addedSugars: { ...SUGAR_BANDS[basis], rule: "C4.5.3", source: "S9, S12 · tier 1" },

    // C4.5.2 — C0. S5 #11 total sugars 10 fails; U1.4's 22.5 disqualifies.
    totalSugars: {
      high: 10,
      disqualifyAbove: SUGAR_BANDS.solid.high,
      tolerance: "sugars",
      rule: "C4.5.2",
      source: "S5 #11 (fail), S1 via U1.4 (disqualify) · tier 1",
    },

    // C4.5.4 — U2 solid lines, unmodified.
    saturatedFat: { ...SATURATED_FAT_BANDS[basis], rule: "C4.5.4", source: "S12, S1 · tier 1" },

    // C4.5.1 — SOURCED. Low is S12/S1's general line; high is S5 #11's salt 1,
    // regional and more conservative than U3.2's 1.5, so H1 and H3 select it.
    // THE DECLARED C0 EXCEPTION: here the EMRO line is also the disqualifier.
    salt: {
      low: SALT_BANDS.solid.low,
      high: 1,
      tolerance: "salt",
      rule: "C4.5.1",
      source: "S12/S1 (low), S5 #11 (high and disqualify) · tier 1",
    },
  }),

  better: ["higherFibre", "lowerSalt", "noAddedSugar"],

  notes: [
    {
      rule: "C4.5.5",
      text:
        `Bread carrying ${FIBRE.highPer100g} g of fibre or more per 100 g counts as high fibre, ` +
        "which is the closest thing to a whole-grain signal that any source Noura holds defines. " +
        "Rye fibre carries an authorised bowel-function claim at exactly that level.",
      source: "S12, S13 · tier 1; corroborated by S5 footnote g",
    },
    {
      rule: "C4.5.6",
      text:
        "For marketing to children, the WHO Eastern Mediterranean model sets bread at no more " +
        "than 10 g total fat per 100 g. Shown for context; Noura runs no total-fat check.",
      source: "S5 #11 · tier 1",
    },
    {
      rule: "C4.5.7",
      text:
        "A declared whole-grain percentage is shown where the pack gives one. It sets no rule: " +
        "no source Noura retrieved defines a whole-grain threshold.",
      source: "unsourced, and displayed as such",
    },
  ],
};
