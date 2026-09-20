/**
 * RUBRIC.md §4.3 — Yogurt.
 *
 * S5 category 7, "Yoghurts, sour milk, cream and other similar foods". The
 * category's "included in category" column names "drinking yoghurt (e.g. labneh,
 * ayran, doogh)", which is why laban sits here and not in drinks — and why the
 * subcategory split is SOURCED for the grouping and POLICY only for the ranking.
 *
 * Two of this file's lines exist because of the 20 September re-extraction: S5 #7
 * was recorded as "2.5 / 10 / 2 / 0.1, column mapping unknown" and was therefore
 * unusable. It is now total fat 2.5, total sugars 10, saturated fat 2, salt 0.1.
 */

import { SALT_BANDS, SATURATED_FAT_BANDS, SUGAR_BANDS } from "../rubric";
import type { Basis, CategoryRule } from "./types";

export const SPOONABLE_YOGURT = "spoonable_yogurt";
export const DRINKING_YOGURT = "drinking_yogurt";

export const yogurt: CategoryRule = {
  key: "yogurt",
  label: "Yogurt",
  section: "RUBRIC.md §4.3",
  supported: true,

  // C4.3.7 — SOURCED for the categorisation (S5 #7 names them); POLICY for the
  // liquid basis, because they are drunk and a shopper compares them with other
  // drinks. §9 Q8 asked this and the approving decision settled it.
  subcategories: [
    { key: SPOONABLE_YOGURT, label: "Yogurt", basis: "solid" },
    { key: DRINKING_YOGURT, label: "Laban, ayran and drinking yogurt", basis: "liquid" },
  ],
  defaultSubcategory: SPOONABLE_YOGURT,

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
    // C4.3.1 — the discriminator between plain and flavoured yoghurt. Plain
    // yoghurt's sugars are lactose (U1.9).
    addedSugars: { ...SUGAR_BANDS[basis], rule: "C4.3.1", source: "S9 §3.5.1 · tier 1" },

    // C4.3.2 — C0's two-strength rule, worked. S5 #7's total-sugars line of 10 is
    // the FAIL line; U1.4's general 22.5 remains the disqualifier. A fruit yoghurt
    // at 13 g fails and is not condemned; a dessert at 30 g is.
    totalSugars: {
      high: 10,
      disqualifyAbove: SUGAR_BANDS.solid.high,
      tolerance: "sugars",
      rule: "C4.3.2",
      source: "S5 #7 (fail), S1 via U1.4 (disqualify) · tier 1",
    },

    // C4.3.3 — C0 again. Low is the universal line for the basis; high is S5 #7's
    // saturated fat 2, more conservative than U2.2's 5, which stays the
    // disqualifier. Full-cream yoghurt at 2.3 g fails without being condemned.
    saturatedFat: {
      low: SATURATED_FAT_BANDS[basis].low,
      high: 2,
      disqualifyAbove: SATURATED_FAT_BANDS.solid.high,
      tolerance: "saturatedFat",
      rule: "C4.3.3",
      source: "S12/S1 (low), S5 #7 (high), S1 via U2.2 (disqualify) · tier 1",
    },

    // C4.3.4 — S5 #7's salt line of 0.1 g is DECLINED, for the same reason
    // C4.7.1 declines it for snacks: it would fail plain unsweetened yoghurt,
    // which is the product this category exists to reward. It is shown as a note.
    salt: { ...SALT_BANDS[basis], rule: "C4.3.4", source: "S12, S1 · tier 1" },
  }),

  better: ["noAddedSugar", "higherProtein", "lowerTotalSugars", "lowerSaturatedFat"],

  notes: [
    {
      rule: "C4.3.4",
      text:
        "For marketing to children, the WHO Eastern Mediterranean model sets yogurt at no more " +
        "than 0.1 g of salt per 100 g. Noura does not apply that line: it would fail plain " +
        "unsweetened yogurt, which is exactly the product worth recommending. The general line " +
        "of 0.3 g is used instead, and this is a judgement Noura has made rather than a rule it found.",
      source: "S5 #7 · tier 1, declined",
    },
    {
      rule: "C4.3.6",
      text:
        "The same model sets yogurt at no more than 2.5 g total fat per 100 g for marketing to " +
        "children. Shown for context; Noura runs no total-fat check.",
      source: "S5 #7 · tier 1",
    },
  ],
};
