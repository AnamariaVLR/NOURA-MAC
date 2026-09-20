/**
 * Noura's health rubric — the universal half.
 *
 * ── What this file is ───────────────────────────────────────────────────────
 *
 * The thresholds of RUBRIC.md §3, which apply to every food and drink unless a
 * category rule in lib/health/categories/ overrides them (H4). Each constant
 * carries the RUBRIC.md rule identifier that sets it and the source that rule
 * cites. NO THRESHOLD MAY EXIST HERE THAT IS NOT IN RUBRIC.md, and no rule in
 * RUBRIC.md may lack a test — tests/unit/rubric-s3-universal.test.ts is the one
 * that checks the §3 half.
 *
 * Two tags, and they mean different things to a reader:
 *
 *   SOURCED — a retrieved instrument sets this number. The tag names the source
 *             ID in SOURCES.md and its reliability tier.
 *   POLICY  — Noura decided this. It is not a standard and must never be shown
 *             to a user as one. The tag gives the reason.
 *
 * ── Four rules that keep the rubric honest ──────────────────────────────────
 *
 *  1. UNKNOWN IS NEVER PASSED (D6). A missing value is reported as unknown and is
 *     excluded from the verdict arithmetic. A product never earns a tick for
 *     having published nothing.
 *
 *  2. AN ADDITIVE COUNT IS A PROCESSING SIGNAL, NOT A SAFETY CLAIM (A1). See
 *     lib/health/additives.ts, which is where the additive rules now live.
 *
 *  3. THE PASS LINE IS THE "LOW" MARK where a category has one. Where it has only
 *     one sourced line — fats and oils, C4.1.1 — that line is the pass line, and
 *     the category rule says so.
 *
 *  4. TOTAL SUGARS IS NOT ADDED SUGAR (U1.9). The added-sugar check asks whether
 *     sugar was ADDED, which is a claim about the ingredient list. Lactose in milk
 *     and fructose in fruit are not added by anyone. Where a category also needs a
 *     quantity line — the UAE excise band, C4.8.2 — that is a SEPARATE check on
 *     total sugars, because S10's band is defined on total sugar.
 */

import type { Basis, NutrientLine } from "./categories/types";

export type ComponentKey =
  | "addedSugars"
  | "totalSugars"
  | "saturatedFat"
  | "salt"
  | "nutrientDensity"
  | "additives"
  | "certification"
  | "transparency";

export const LABELS: Record<ComponentKey, string> = {
  addedSugars: "Added sugar",
  totalSugars: "Total sugar",
  saturatedFat: "Saturated fat",
  salt: "Salt",
  nutrientDensity: "Fibre and protein",
  additives: "Additives",
  certification: "UAE certification",
  transparency: "Ingredient transparency",
};

/* -------------------------------------------------------------------------
 * U1 — sugar bands (RUBRIC.md §3 U1.3-U1.6)
 *
 * Used two ways. For the ADDED-sugar check the pass is decided on presence
 * (U1.7) and these bands only decide whether a known quantity is severe enough
 * to disqualify. For a category that carries a TOTAL-sugars check they are the
 * check's own lines.
 * ----------------------------------------------------------------------- */

export const SUGAR_BANDS: Record<Basis, NutrientLine> = {
  // U1.3 low ≤5 g/100 g — SOURCED S12 LOW SUGARS, S1 green · tier 1
  // U1.4 high >22.5 g/100 g — SOURCED S1 red · tier 1
  solid: { low: 5, high: 22.5, tolerance: "sugars", rule: "U1.3/U1.4", source: "S12, S1 · tier 1" },
  // U1.5 low ≤2.5 g/100 ml — SOURCED S12, S1 green · tier 1
  // U1.6 high ≥8 g/100 ml — SOURCED S10, the binding UAE excise high-sugar band,
  // in force 1 Jan 2026. H1 and H3 both select it over S1's 11.25.
  liquid: { low: 2.5, high: 8, tolerance: "sugars", rule: "U1.5/U1.6", source: "S10, S12, S1 · tier 1" },
};

/* -------------------------------------------------------------------------
 * U2 — saturated fat (RUBRIC.md §3 U2.1-U2.4)
 *
 * U2.5, POLICY: assessed on saturates ALONE, not saturates + trans as S12
 * defines the claim, because trans figures are effectively never published in
 * the data Noura reads. A declared deviation from the source — §9 Q3.
 * ----------------------------------------------------------------------- */

export const SATURATED_FAT_BANDS: Record<Basis, NutrientLine> = {
  // U2.1 ≤1.5 — SOURCED S12 LOW SATURATED FAT, S1 green · tier 1
  // U2.2 >5 — SOURCED S1 red · tier 1
  solid: {
    low: 1.5,
    high: 5,
    tolerance: "saturatedFat",
    rule: "U2.1/U2.2",
    source: "S12, S1 · tier 1",
  },
  // U2.3 ≤0.75 — SOURCED S12, S1 green · tier 1
  // U2.4 >2.5 — SOURCED S1 red · tier 1
  liquid: {
    low: 0.75,
    high: 2.5,
    tolerance: "saturatedFat",
    rule: "U2.3/U2.4",
    source: "S12, S1 · tier 1",
  },
};

/* -------------------------------------------------------------------------
 * U3 — salt (RUBRIC.md §3 U3.1-U3.4)
 *
 * The liquid LOW line of 0.3 is the change that most affects the catalogue: a
 * typical low-fat milk at ~0.16 g salt/100 ml failed the shipped unsourced 0.15
 * and passes this one. S12 states 0.12 g sodium "per 100 g or per 100 ml", and
 * U3.5 converts at 2.5. The approving decision confirmed 0.3 on that reading and
 * left the question open at §9 Q11.
 * ----------------------------------------------------------------------- */

export const SALT_BANDS: Record<Basis, NutrientLine> = {
  // U3.1 ≤0.3 g salt (=0.12 g sodium) — SOURCED S12 LOW SODIUM, S1 green · tier 1
  // U3.2 >1.5 — SOURCED S1 red · tier 1
  solid: { low: 0.3, high: 1.5, tolerance: "salt", rule: "U3.1/U3.2", source: "S12, S1 · tier 1" },
  // U3.3 ≤0.3 — SOURCED S12, which applies the figure per 100 g OR per 100 ml
  // U3.4 >0.75 — SOURCED S1 red (drinks) · tier 1
  liquid: { low: 0.3, high: 0.75, tolerance: "salt", rule: "U3.3/U3.4", source: "S12, S1 · tier 1" },
};

/** U3.5 — SOURCED S5, verbatim: "1 g of sodium is equivalent to about 2.5 g of salt." */
export const SALT_PER_SODIUM = 2.5;

/* -------------------------------------------------------------------------
 * U4 — fibre and protein (RUBRIC.md §3 U4.1-U4.6)
 * ----------------------------------------------------------------------- */

/** U4.1 HIGH FIBRE, U4.2 SOURCE OF FIBRE — SOURCED S12 · tier 1. */
export const FIBRE = {
  /** The pass line: HIGH FIBRE. */
  highPer100g: 6,
  highPer100Kcal: 3,
  /** Reported as a note, not a pass (U4.2). */
  sourceOfPer100g: 3,
  sourceOfPer100Kcal: 1.5,
  rule: "U4.1/U4.2",
  source: "S12 · tier 1; corroborated for cereals and bread by S5 footnote g",
} as const;

/** U4.3 SOURCE OF PROTEIN, U4.4 HIGH PROTEIN — SOURCED S12 · tier 1. Shares of energy. */
export const PROTEIN = {
  /** The pass line: ≥12% of the energy value from protein. */
  sourceOfEnergyShare: 0.12,
  /** Reported as a note (U4.4). */
  highEnergyShare: 0.2,
  rule: "U4.3/U4.4",
  source: "S12 · tier 1; energy factors S6 §3.3.1",
} as const;

/* -------------------------------------------------------------------------
 * §2 and §7 — the policy constants
 *
 * Every one of these is UNSOURCED. No retrieved scheme maps a pass count to a
 * verdict: Nutri-Score and HSR both aggregate points, which Noura deliberately
 * does not do (DECISIONS §19). The approving decision retained them and tagged
 * them POLICY. §9 Q7 still asks a nutritionist to set them.
 * ----------------------------------------------------------------------- */

/**
 * D4 — POLICY. Below this share of a category's applicable checks being resolved,
 * Noura declines to give a verdict at all. Half the rubric missing is not a
 * product that scored badly; it is a product we cannot speak about.
 */
export const MIN_COVERAGE = 0.5;

/** V3, V4 — POLICY. Share of the RESOLVED checks that must pass for each verdict. */
export const GOOD_CHOICE_PASS_RATE = 0.8;
export const ACCEPTABLE_PASS_RATE = 0.5;

/**
 * D5 — POLICY. Our strongest statement needs a minimum of evidence in absolute
 * terms, not just a high ratio. Without it a cosmetic with three weak dimensions
 * reaches GOOD CHOICE on a pass rate of 1.0.
 */
export const MIN_KNOWN_FOR_GOOD_CHOICE = 3;
