/**
 * RUBRIC.md §4.1 — Fats and oils.
 *
 * S5 category 10, "Butter, and other fats and oils". Covers olive oil, seed oils,
 * butter, margarines and spreads.
 *
 * The shipped code judged olive oil by the composite-food saturated-fat line of
 * 5 g/100 g, which is meaningless: olive oil is ~14 g and would near-disqualify.
 * RUBRIC v1.0 suspended U2 here, which left butter with no saturated-fat rule at
 * all. The 20 September re-extraction of S5 recovered the category's real line,
 * and that is what this file implements.
 */

import type { CategoryRule } from "./types";

export const OLIVE_OIL = "olive_oil";
export const OTHER_FATS_OILS = "other_fats_oils";

export const fatsOils: CategoryRule = {
  key: "fats_oils",
  label: "Fats and oils",
  section: "RUBRIC.md §4.1",
  supported: true,

  // C4.0.1 — POLICY. §4.1's polyphenol and grade attributes are specific to olive
  // oil; ranking a butter against an olive oil on them would be meaningless.
  subcategories: [
    { key: OLIVE_OIL, label: "Olive oil", basis: "solid" },
    { key: OTHER_FATS_OILS, label: "Other fats and oils", basis: "solid" },
  ],
  defaultSubcategory: OTHER_FATS_OILS,

  // C4.1.3 — added sugar is not applicable: S5 populates no sugar column for this
  // category, and a fat is not sweetened.
  // C4.1.4 — POLICY. Fibre and protein are not applicable: a fat has neither by
  // construction, and running U4 would manufacture a failure that says nothing.
  checks: ["saturatedFat", "salt", "additives", "certification", "transparency"],

  lines: () => ({
    // C4.1.1 — SOURCED, S5 category 10, saturated fat 20 g/100 g, column mapping
    // recovered 20 Sep 2026 · tier 1.
    //
    // This is the category's ONLY sourced saturated-fat line, so it is both the
    // pass line and the disqualifier. That is a declared exception to C0, written
    // here rather than assumed: with no "low" line there is nothing else it could
    // be. Olive oil at ~14 g passes; salted butter at 55 g disqualifies.
    saturatedFat: {
      high: 20,
      singleLine: {
        noun: "the line for fats and oils",
        because:
          "An oil is almost entirely fat, so it is not judged against the 5 g line used for " +
          "composite foods — that line would fail every oil on the shelf. This is not a claim " +
          "that the product is low in saturated fat.",
      },
      tolerance: "saturatedFat",
      rule: "C4.1.1",
      source: "S5 #10 · tier 1",
    },
    // C4.1.2 — low is U3.1's general line; high is S5 category 10's salt 1.3,
    // which is more conservative than U3.2's 1.5, so H1 and H3 both select it.
    salt: {
      low: 0.3,
      high: 1.3,
      tolerance: "salt",
      rule: "C4.1.2",
      source: "S12/S1 (low), S5 #10 (high) · tier 1",
    },
  }),

  // POLICY — C4.1.5 and C4.1.6 are sourced attributes, but the order in which
  // they break a tie is ours. Price and name are appended by the ranker.
  better: ["polyphenolClaim", "extraVirginGrade", "lowerSaturatedFat", "lowerSalt"],

  notes: [
    {
      rule: "C4.1.5",
      text:
        "An olive oil carrying at least 5 mg of hydroxytyrosol and its derivatives per 20 g may " +
        "make the authorised claim that olive oil polyphenols contribute to the protection of " +
        "blood lipids from oxidative stress. This figure is almost never published, so Noura " +
        "usually cannot tell. It has not been assessed here unless this note says otherwise.",
      source: "S13 · tier 1",
    },
    {
      rule: "C4.1.6",
      text:
        "Grade — extra virgin, virgin or refined — is recorded and shown where it is known. It " +
        "sets no rule: no source Noura retrieved defines the grades.",
      source: "unsourced, and displayed as such",
    },
  ],
};
