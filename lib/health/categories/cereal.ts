/**
 * RUBRIC.md §4.6 — Cereal and granola.
 *
 * S5 category 5, breakfast cereals — the one row the EMRO document's own prose
 * confirms ("in the case of breakfast cereals, a product must not exceed the
 * criteria for total fat, total sugars or salt"), which is why it was usable even
 * before the re-extraction.
 *
 * This is the worked instance of C0. Two sugar lines, each honoured at its own
 * strength: fail above 15, disqualify only above 22.5. The approving decision
 * kept both.
 */

import { FIBRE, SALT_BANDS, SATURATED_FAT_BANDS, SUGAR_BANDS } from "../rubric";
import type { Basis, CategoryRule } from "./types";

export const cereal: CategoryRule = {
  key: "cereal",
  label: "Cereal and granola",
  section: "RUBRIC.md §4.6",
  supported: true,

  subcategories: [{ key: "cereal", label: "Cereal and granola", basis: "solid" }],
  defaultSubcategory: "cereal",

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
    // C4.6.3 — U1 solid lines.
    addedSugars: { ...SUGAR_BANDS[basis], rule: "C4.6.3", source: "S9 · tier 1" },

    // C4.6.1 — SOURCED S5 #5, total sugars 15, confirmed by the document's own
    // worked example.
    // C4.6.2 — SOURCED S1 red via U1.4. Both lines at their own strength.
    totalSugars: {
      high: 15,
      singleLine: {
        noun: "the total-sugar line for breakfast cereal",
        because:
          "It is the level above which the WHO regional model does not permit a cereal to be " +
          "marketed to children. It is not a low-sugar mark: 15 g per 100 g is a great deal of " +
          "sugar, and the line exists to catch the worst rather than to praise the rest.",
      },
      disqualifyAbove: SUGAR_BANDS.solid.high,
      tolerance: "sugars",
      rule: "C4.6.1/C4.6.2",
      source: "S5 #5 (fail), S1 via U1.4 (disqualify) · tier 1",
    },

    // C4.6.5 — U2 solid lines, unmodified.
    saturatedFat: { ...SATURATED_FAT_BANDS[basis], rule: "C4.6.5", source: "S12, S1 · tier 1" },

    // C4.6.4 — S5 #5 gives salt 1.6; U3.2's 1.5 is more conservative, so H3
    // selects the general line and the regional one is the cross-check.
    salt: { ...SALT_BANDS[basis], rule: "C4.6.4", source: "S1, S12; S5 #5 cross-checked · tier 1" },
  }),

  better: ["noAddedSugar", "higherFibre", "lowerTotalSugars", "lowerSalt"],

  notes: [
    {
      rule: "C4.6.6",
      text: `A cereal with ${FIBRE.highPer100g} g of fibre or more per 100 g counts as high fibre.`,
      source: "S12 · tier 1; corroborated by S5 footnote g",
    },
    {
      rule: "C4.6.7",
      text:
        "An oat or barley product carrying at least 4 g of beta-glucans for each 30 g of " +
        "available carbohydrate may make the authorised claim that beta-glucans reduce the rise " +
        "in blood glucose after a meal. That figure is not published in the data Noura reads, so " +
        "this has not been assessed.",
      source: "S13 · tier 1",
    },
    {
      rule: "C4.6.8",
      text:
        "For marketing to children, the WHO Eastern Mediterranean model sets breakfast cereals at " +
        "no more than 10 g total fat per 100 g. Granola is assessed in this category and its nut " +
        "and seed fat will usually cross that line. Noura shows it rather than applying it: nut " +
        "and seed fat is not what the line was drawn against. This is an open question.",
      source: "S5 #5 · tier 1",
    },
  ],
};
