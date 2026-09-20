/**
 * Shared fixtures for the RUBRIC.md suites.
 *
 * Deliberately minimal: every field defaults to null, so a test that wants a
 * value has to say so. That is the same discipline the engine applies — absence
 * is the default state and has to be overridden, never assumed away.
 */

import type { EvidenceInput } from "../../lib/health/checks";
import type { Check, NutritionFacts, ProductCategory } from "../../lib/schemas";

export const SOURCE = {
  name: "Open Food Facts",
  url: null,
  lastVerifiedAt: "2026-01-01T00:00:00.000Z",
};

export function nutrition(overrides: Partial<NutritionFacts> = {}): NutritionFacts {
  return {
    basis: "per_100g",
    energyKcal: null,
    carbohydratesG: null,
    sugarsG: null,
    addedSugarsG: null,
    fatG: null,
    saturatedFatG: null,
    saltG: null,
    fibreG: null,
    proteinG: null,
    ...overrides,
  };
}

export function input(overrides: Partial<EvidenceInput> = {}): EvidenceInput {
  return {
    category: "food",
    subcategory: null,
    nutrition: nutrition({ sugarsG: 5, saturatedFatG: 1, saltG: 0.2, fibreG: 6, proteinG: 8 }),
    novaGroup: 1,
    additives: [],
    allergens: [],
    ingredientsText: "oats, water, sea salt",
    certifications: [],
    evidenceSource: SOURCE,
    ...overrides,
  };
}

export const ALL_CATEGORIES: ProductCategory[] = [
  "fats_oils",
  "milk",
  "yogurt",
  "eggs",
  "bread",
  "cereal",
  "snacks",
  "drink",
  "food",
  "cosmetic",
  "supplement",
];

export const statusOf = (checks: Check[], key: string) =>
  checks.find((c) => c.key === key)?.status;

export const checkFor = (checks: Check[], key: string) => checks.find((c) => c.key === key);
