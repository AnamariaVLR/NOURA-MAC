/**
 * RUBRIC.md §4.7 — Packaged snacks.
 *
 * S5 category 2, savoury snacks, whose salt line is 0.1 g/100 g. Noura DECLINES
 * that line and applies the general-population lines instead.
 *
 * This is a departure from H3 — Noura is not taking the most conservative
 * available number — and it is declared rather than buried. EMRO's 0.1 g would
 * fail essentially every savoury snack on a UAE shelf, plain salted nuts
 * included, and a check that everything fails carries no information. The
 * approving decision confirmed it (§9 Q5), and C4.7.5 requires the declined line
 * to be SHOWN to the reader: a decline the user cannot see is a decision taken on
 * their behalf in private.
 */

import { SALT_BANDS, SATURATED_FAT_BANDS, SUGAR_BANDS } from "../rubric";
import type { Basis, CategoryRule } from "./types";

export const snacks: CategoryRule = {
  key: "snacks",
  label: "Packaged snacks",
  section: "RUBRIC.md §4.7",
  supported: true,

  subcategories: [{ key: "snacks", label: "Packaged snacks", basis: "solid" }],
  defaultSubcategory: "snacks",

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
    // C4.7.3 — U1 solid lines.
    addedSugars: { ...SUGAR_BANDS[basis], rule: "C4.7.3", source: "S9, S12 · tier 1" },
    // C4.7.2 — U2 solid lines.
    saturatedFat: { ...SATURATED_FAT_BANDS[basis], rule: "C4.7.2", source: "S1, S12 · tier 1" },
    // C4.7.1 — the general lines. S5 #2's 0.1 is declined; see the note.
    salt: { ...SALT_BANDS[basis], rule: "C4.7.1", source: "S1, S12 · tier 1" },
    // C4.7.4 — fibre and protein are U4, unmodified.
  }),

  better: ["lowerSalt", "lowerSaturatedFat", "noAddedSugar", "fewerAdditives"],

  notes: [
    {
      rule: "C4.7.5",
      text:
        "For marketing to children, the WHO Eastern Mediterranean model sets savoury snacks at no " +
        "more than 0.1 g of salt per 100 g. Noura does not apply that line. It would fail almost " +
        "every savoury snack sold here, plain salted nuts included, and a check that everything " +
        "fails tells you nothing. The general line of 0.3 g is used instead. That is Noura's " +
        "judgement, not a rule it found.",
      source: "S5 #2 · tier 1, declined",
    },
  ],
};
