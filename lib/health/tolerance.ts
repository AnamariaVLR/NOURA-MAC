/**
 * Declared-value tolerance — RUBRIC.md §2.2.
 *
 * A declared figure and an analysed one are allowed to differ. GSO FDS 2233
 * Table 6 says by how much. Noura uses that allowance for exactly one purpose: to
 * stop a product being *disqualified* — the harshest output — for a difference
 * smaller than the law permits between a label and a laboratory.
 *
 * It is deliberately NOT used to rescue a failing product (rule D3). A shopper
 * reads the label, and the label is what the manufacturer stands behind.
 */

/** The Table 6 rows. Each names a GSO tolerance band. */
export type ToleranceNutrient =
  | "sugars"
  | "fibre"
  | "protein"
  | "carbohydrate"
  | "fat"
  | "saturatedFat"
  | "sodium"
  | "salt";

/**
 * Rule D2 — POLICY. The cap on the tolerance, as a share of the threshold.
 *
 * Taken literally, S9 is too permissive to be useful: saturated fat in a solid
 * food has a high line of 5 g and a stated tolerance above 4 g of ±8 g, so a
 * disqualifier could not fire until 13 g/100 g. 20% is the percentage figure S9
 * itself applies to most nutrients, and it puts the saturated-fat disqualifier at
 * 6.0 g/100 g — the worked example in RUBRIC.md §7.1.
 *
 * RUBRIC.md §2.2 D2 · POLICY · §9 Q2.
 */
export const TOLERANCE_CAP = 0.2;

/**
 * Rule D1 — SOURCED, S9 Table 6, tier 1.
 *
 * Every band below is transcribed from that table. Nothing here is interpolated.
 * `amount` is the figure the band is selected by — for a disqualifier that is the
 * threshold being crossed, not the product's declared value, so the allowance is a
 * property of the line rather than of the product.
 */
function gsoTolerance(nutrient: ToleranceNutrient, amount: number): number {
  switch (nutrient) {
    // "Sugars, fibre, protein, carbohydrate: ≤10 g/100 g → ±2 g; 10-40 g → ±20%; >40 g → ±8 g"
    case "sugars":
    case "fibre":
    case "protein":
    case "carbohydrate":
      if (amount <= 10) return 2;
      if (amount <= 40) return amount * 0.2;
      return 8;

    // "Fat: ≤10 g/100 g → ±1.5 g; 10-40 g → ±20%; >40 g → ±8 g"
    case "fat":
      if (amount <= 10) return 1.5;
      if (amount <= 40) return amount * 0.2;
      return 8;

    // "Saturated and monounsaturated fat: ≤4 g/100 g → ±20%; >4 g → ±8 g"
    case "saturatedFat":
      return amount <= 4 ? amount * 0.2 : 8;

    // "Sodium: ≤0.5 g/100 g → ±20%; >0.5 g → ±0.15 g"
    case "sodium":
      return amount <= 0.5 ? amount * 0.2 : 0.15;

    // "Salt: ≤1.25 g/100 g → ±20%; >1.25 g → ±0.375 g"
    case "salt":
      return amount <= 1.25 ? amount * 0.2 : 0.375;
  }
}

/**
 * The tolerance Noura actually applies: GSO's band, capped at D2's 20%.
 * RUBRIC.md §2.2 D1 + D2.
 */
export function declaredValueTolerance(nutrient: ToleranceNutrient, threshold: number): number {
  return Math.min(gsoTolerance(nutrient, threshold), threshold * TOLERANCE_CAP);
}

/**
 * The value a nutrient must exceed before it disqualifies — RUBRIC.md §7.1 V2.2.
 *
 * Strictly above. A product sitting exactly on the tolerance edge fails its check
 * like any other failure and does not trigger the override.
 */
export function disqualifyingAbove(nutrient: ToleranceNutrient, threshold: number): number {
  return threshold + declaredValueTolerance(nutrient, threshold);
}

/**
 * Is this declared value past the point where a failure becomes a disqualifier?
 * A null value never disqualifies: RUBRIC.md §7.1 — Noura does not apply its
 * harshest consequence to a quantity it does not know.
 */
export function isSevere(
  value: number | null,
  nutrient: ToleranceNutrient,
  threshold: number,
): boolean {
  if (value === null) return false;
  return value > disqualifyingAbove(nutrient, threshold);
}
