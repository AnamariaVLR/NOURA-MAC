/**
 * Energy drinks — RUBRIC.md §4.8 C4.8.7.
 *
 * Two tier-1 sources put energy drinks in a class of their own. S5 category 3d:
 * marketing to children is not permitted at any level. S10: they are taxed at
 * 100% of retail price, where even a high-sugar drink is taxed per litre. Neither
 * sets a composition threshold, because the category is not defined by
 * composition.
 *
 * ── How they are identified, and what that misses ───────────────────────────
 *
 * S5's footnote f says, verbatim:
 *
 *   "There is no agreement on a definition of energy drinks. However, such a
 *    category of drinks includes a variety of non-alcoholic beverages. While
 *    caffeine is considered the main ingredient, a number of other substances are
 *    often present. The most common of these include guarana, taurine,
 *    glucuronolactone and vitamins. A common feature is that these beverages are
 *    marketed for their actual or perceived effects as stimulants, energizers and
 *    performance enhancers."
 *
 * So the source itself declines to give a definition. Noura therefore uses the
 * only part of it that is checkable against an ingredient list: **added caffeine
 * together with at least one of the stimulant co-ingredients the footnote names.**
 *
 * The conjunction is the whole design. Caffeine alone would catch every iced tea,
 * cola and bottled coffee on the shelf, and none of those is what S5 category 3d
 * is about — a rule that fires on tea would be worse than no rule.
 *
 * THE COST, STATED: the conjunction is permissive. An energy drink formulated with
 * caffeine and nothing else on this list is not caught. Noura would rather miss one
 * than call an iced tea an energy drink, because this flag DISQUALIFIES, and the
 * asymmetry of a wrong disqualification is the worse error. The marketing claim
 * that footnote f actually rests on — "marketed for their effects as stimulants" —
 * is not something Noura ingests (RUBRIC §2.1 D0.5: a brand's own marketing claim
 * is not evidence), so it cannot be used.
 */

import { hasIngredientList } from "./added-sugar";

/**
 * C4.8.7 — SOURCED, S5 footnote f, tier 1. The substances the footnote names, plus
 * the caffeine it calls "the main ingredient".
 *
 * "vitamins" is in the footnote and is deliberately NOT here: a fortified fruit
 * juice is not an energy drink, and vitamins are added to a great many beverages
 * for unrelated reasons.
 */
export const CAFFEINE_TERMS: readonly string[] = ["caffeine", "caféine", "cafeina", "coffein"];

export const STIMULANT_CO_INGREDIENTS: readonly string[] = [
  "guarana",
  "guaraná",
  "taurine",
  "taurin",
  "glucuronolactone",
];

function names(text: string, terms: readonly string[]): string[] {
  const found: string[] = [];
  for (const term of terms) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, "iu").test(text)) {
      found.push(term);
    }
  }
  return found;
}

export type EnergyDrinkSignal = { caffeine: string[]; stimulants: string[] } | null;

/**
 * Does this ingredient list describe an energy drink?
 *
 * Returns null — not false — when there is no readable ingredient list, because
 * the two are different answers and only one of them may disqualify a product
 * (D6: unknown is never a pass, and it is never a fail either).
 */
export function energyDrinkSignal(ingredientsText: string | null): EnergyDrinkSignal {
  if (!hasIngredientList(ingredientsText)) return null;
  const text = (ingredientsText ?? "").toLowerCase();

  const caffeine = names(text, CAFFEINE_TERMS);
  if (caffeine.length === 0) return { caffeine: [], stimulants: [] };

  const stimulants = names(text, STIMULANT_CO_INGREDIENTS);
  return { caffeine, stimulants };
}

/** C4.8.7 — the conjunction. Caffeine alone is not an energy drink. */
export function isEnergyDrink(ingredientsText: string | null): boolean {
  const signal = energyDrinkSignal(ingredientsText);
  return signal !== null && signal.caffeine.length > 0 && signal.stimulants.length > 0;
}
