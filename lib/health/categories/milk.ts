/**
 * RUBRIC.md §4.2 — Milk.
 *
 * S5 category 3c, whose "included in category" column reads "Milks and sweetened
 * milks; almond, rice and oat milks" — so plant drinks sit here too, in the
 * source. Both subcategories are judged on the same lines; they are separated
 * only so that ranking does not compare them (C4.0.1).
 */

import { SALT_BANDS, SATURATED_FAT_BANDS, SUGAR_BANDS } from "../rubric";
import type { Basis, CategoryRule } from "./types";

export const DAIRY_MILK = "dairy_milk";
export const PLANT_MILK = "plant_milk";

export const milk: CategoryRule = {
  key: "milk",
  label: "Milk",
  section: "RUBRIC.md §4.2",
  supported: true,

  // C4.0.1 — POLICY. S5 #3c puts both in one category and Noura assesses them on
  // one set of lines. They are separated for RANKING only: a plant drink loses to
  // dairy on protein by construction, for reasons unrelated to the choice the
  // shopper is actually making.
  subcategories: [
    { key: DAIRY_MILK, label: "Dairy milk", basis: "liquid" },
    { key: PLANT_MILK, label: "Plant drink", basis: "liquid" },
  ],
  defaultSubcategory: DAIRY_MILK,

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
    // C4.2.1 — U1 liquid lines. Plain milk contains lactose and no added sugar;
    // the ingredient list decides (U1.9), and these bands only decide severity.
    addedSugars: { ...SUGAR_BANDS[basis], rule: "C4.2.1", source: "S9 §3.5.1, S2 · tier 1" },
    // C4.2.2 — SOURCED S10 · tier 1, binding UAE. HIGH LINE ONLY, and that is the
    // whole point of the rule.
    //
    // S10's band is defined on TOTAL sugars — "natural sugar plus added sugar and
    // other sweeteners combined" — and above it a product is a flavoured milk
    // drink rather than milk, so the high line is also the disqualifier.
    //
    // The excise's LOW band is deliberately NOT applied here. S10 EXCLUDES milk
    // products from the excise altogether, so borrowing its 2.5 g line as a
    // pass/fail on total sugars would use an instrument against the products it
    // exempts — and it would mark plain milk down for its lactose and an oat
    // drink down for the sugars enzymes release from its own starch. That is
    // precisely the error DECISIONS §28-31 exist to prevent, arriving by a new
    // route. The sugars in plain milk are not added by anyone (U1.9), and whether
    // sugar was ADDED is C4.2.1's job.
    totalSugars: {
      high: SUGAR_BANDS[basis].high,
      tolerance: "sugars",
      rule: "C4.2.2",
      source: "S10 · tier 1, binding UAE",
    },
    // C4.2.3, C4.2.4 — the universal liquid lines, unmodified.
    saturatedFat: { ...SATURATED_FAT_BANDS[basis], rule: "C4.2.3", source: "S12, S1 · tier 1" },
    salt: { ...SALT_BANDS[basis], rule: "C4.2.4", source: "S12, S1 · tier 1" },
  }),

  // POLICY. Fat content is not a ranking axis beyond U2, because WHO's
  // saturated-fat guidance is a whole-diet proportion (S4), not a per-product ban.
  better: ["noAddedSugar", "lowerSaturatedFat", "higherProtein"],

  notes: [
    {
      rule: "C4.2.6",
      text:
        "For marketing to children, the WHO Eastern Mediterranean model sets milk drinks at no " +
        "more than 2.5 g total fat per 100 ml, no added sugars and no non-sugar sweeteners. " +
        "Noura shows this rather than applying it: the fat line would fail every whole milk sold, " +
        "and it was drawn to decide what may be advertised to children, not what an adult should buy.",
      source: "S5 #3c · tier 1",
    },
  ],
};
