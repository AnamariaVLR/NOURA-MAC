/**
 * Energy, and protein as a share of it — RUBRIC.md §3 U4.3 and U4.5.
 *
 * The EU defines the protein claims as a proportion of a food's energy, not as an
 * absolute mass (S12). That needs an energy figure, and crowd-sourced records
 * often lack one. Codex CXG 2-1985 §3.3.1 gives the conversion factors to derive
 * it, which is what U4.5 authorises.
 */

import type { NutritionFacts } from "../schemas";

/**
 * Rule U4.5 — SOURCED, S6 §3.3.1, tier 1. Verbatim:
 *   "Carbohydrates 4 kcal/g - 17 kJ · Protein 4 kcal/g - 17 kJ · Fat 9 kcal/g - 37 kJ"
 *
 * Alcohol (7) and organic acid (3) are in the same table and are omitted here
 * because neither is a field Noura holds.
 */
export const ATWATER_KCAL_PER_G = { carbohydrate: 4, protein: 4, fat: 9 } as const;

export type EnergyBasis = "declared" | "derived";
export type ResolvedEnergy = { kcal: number; basis: EnergyBasis };

/**
 * The energy figure to reason about, and where it came from.
 *
 * A DERIVED figure requires carbohydrate, fat AND protein to all be published.
 * A partial sum is not a smaller energy figure — it is a wrong one, and because
 * protein sits in the numerator of U4.3, an undercounted denominator would inflate
 * the protein share and manufacture a pass. So a missing macronutrient produces
 * null, which becomes UNKNOWN, which is the correct answer (D6).
 */
export function resolveEnergyKcal(nutrition: NutritionFacts | null): ResolvedEnergy | null {
  if (!nutrition) return null;

  if (nutrition.energyKcal !== null && nutrition.energyKcal > 0) {
    return { kcal: nutrition.energyKcal, basis: "declared" };
  }

  const { carbohydratesG, fatG, proteinG } = nutrition;
  if (carbohydratesG === null || fatG === null || proteinG === null) return null;

  const kcal =
    carbohydratesG * ATWATER_KCAL_PER_G.carbohydrate +
    fatG * ATWATER_KCAL_PER_G.fat +
    proteinG * ATWATER_KCAL_PER_G.protein;

  // A zero-energy product (bottled water) is a real answer, but it cannot be a
  // denominator. Callers read null as "the protein share is unknown".
  return kcal > 0 ? { kcal, basis: "derived" } : null;
}

/**
 * Protein as a share of energy, 0..1 — the basis of U4.3 and U4.4.
 * Null when either half is unresolvable.
 */
export function proteinEnergyShare(nutrition: NutritionFacts | null): number | null {
  const protein = nutrition?.proteinG ?? null;
  if (protein === null) return null;
  const energy = resolveEnergyKcal(nutrition);
  if (energy === null) return null;
  return (protein * ATWATER_KCAL_PER_G.protein) / energy.kcal;
}

/** Fibre per 100 kcal — the alternative basis S12 allows for the fibre claims. */
export function fibrePer100Kcal(nutrition: NutritionFacts | null): number | null {
  const fibre = nutrition?.fibreG ?? null;
  if (fibre === null) return null;
  const energy = resolveEnergyKcal(nutrition);
  if (energy === null) return null;
  return (fibre / energy.kcal) * 100;
}
