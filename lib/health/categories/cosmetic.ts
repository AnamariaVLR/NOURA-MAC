/**
 * RUBRIC.md §4.9 — Cosmetics.
 *
 * Noura cannot assess a cosmetic, and this file exists to say so rather than to
 * hide it behind an empty checklist.
 *
 * S14 gives three dimensions — a labelling duty, a substance-restriction regime,
 * and conformity — and the substance annexes were not retrieved (C4.9.4). Without
 * that screen a cosmetic has at most two resolvable checks, below D5's minimum of
 * three, so the strongest thing Noura could honestly say is "it lists its
 * ingredients and we found no certificate". Publishing that as VERIFIED —
 * ACCEPTABLE would be the least defensible output in the whole specification.
 *
 * So C4.9.6 sets `supported: false`, and D12 turns that into COULD NOT VERIFY
 * with a message that names the reason.
 */

import type { CategoryRule } from "./types";

export const cosmetic: CategoryRule = {
  key: "cosmetic",
  label: "Cosmetics",
  section: "RUBRIC.md §4.9",

  // C4.9.6 + D12.
  supported: false,
  unsupportedMessage:
    "Noura cannot assess cosmetics yet. Judging one means checking its ingredients against the " +
    "EU lists of prohibited and restricted substances, and Noura does not hold those lists. " +
    "What is shown below is the product's own label information, not an assessment of it.",

  subcategories: [{ key: "cosmetic", label: "Cosmetics", basis: "solid" }],
  defaultSubcategory: "cosmetic",

  // C4.9.1 and C4.9.2 are what transparency means here: an ingredient list using
  // INCI names, with nanomaterials suffixed "(nano)" (U8.3).
  // C4.9.5 — additives are NOT applicable: the E-number taxonomy is a food
  // instrument and does not extend to cosmetic ingredients.
  checks: ["transparency", "certification"],

  lines: () => ({}),
  better: [],

  notes: [
    {
      rule: "C4.9.4",
      text:
        "The EU regulates which substances a cosmetic may contain through five annexes of " +
        "prohibited, restricted and permitted ingredients. Noura has not retrieved those lists, " +
        "so it has not checked this product against them and does not imply that it has.",
      source: "S14 Art. 14 · tier 1; the annexes themselves were not retrieved",
    },
  ],
};
