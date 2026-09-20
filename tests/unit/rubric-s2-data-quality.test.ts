/**
 * RUBRIC.md §2 — Data-quality rules.
 *
 * One describe block per rule identifier. D4-D12 are exercised where they bite,
 * in the verdict and checks suites; what is tested here is §2.2, the tolerance
 * arithmetic, plus §3 U4.5's energy derivation, which is the other rule in the
 * data-quality layer that can silently invent a pass.
 */

import { describe, expect, it } from "vitest";
import {
  TOLERANCE_CAP,
  declaredValueTolerance,
  disqualifyingAbove,
  isSevere,
} from "../../lib/health/tolerance";
import {
  ATWATER_KCAL_PER_G,
  fibrePer100Kcal,
  proteinEnergyShare,
  resolveEnergyKcal,
} from "../../lib/health/energy";
import type { NutritionFacts } from "../../lib/schemas";

function facts(over: Partial<NutritionFacts> = {}): NutritionFacts {
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
    ...over,
  };
}

describe("D1 — the GSO Table 6 tolerance bands", () => {
  it("sugars, fibre, protein and carbohydrate: +/-2 g at or below 10 g", () => {
    // Band gives 2 g; D2 caps at 20% of 10 = 2 g. Equal, so 2 g stands.
    expect(declaredValueTolerance("sugars", 10)).toBeCloseTo(2, 6);
    // At 8 g the cap bites: 20% of 8 = 1.6 < 2.
    expect(declaredValueTolerance("sugars", 8)).toBeCloseTo(1.6, 6);
  });

  it("sugars: 20% between 10 and 40 g, which D2 leaves untouched", () => {
    expect(declaredValueTolerance("sugars", 22.5)).toBeCloseTo(4.5, 6);
  });

  it("saturated fat: 20% at or below 4 g", () => {
    expect(declaredValueTolerance("saturatedFat", 4)).toBeCloseTo(0.8, 6);
    expect(declaredValueTolerance("saturatedFat", 2)).toBeCloseTo(0.4, 6);
  });

  it("saturated fat: +/-8 g above 4 g, which D2 cuts to 20%", () => {
    // This is the case RUBRIC.md §7.1 works through: 8 g would be absurd.
    expect(declaredValueTolerance("saturatedFat", 5)).toBeCloseTo(1, 6);
  });

  it("salt: 20% at or below 1.25 g, +/-0.375 g above it", () => {
    expect(declaredValueTolerance("salt", 1)).toBeCloseTo(0.2, 6);
    // 0.375 on a 1.5 g line is 25%, so D2 cuts it to 0.3.
    expect(declaredValueTolerance("salt", 1.5)).toBeCloseTo(0.3, 6);
  });

  it("sodium: 20% at or below 0.5 g, +/-0.15 g above it, capped", () => {
    expect(declaredValueTolerance("sodium", 0.5)).toBeCloseTo(0.1, 6);
    expect(declaredValueTolerance("sodium", 0.6)).toBeCloseTo(0.12, 6);
  });

  it("fat: +/-1.5 g at or below 10 g, capped by D2", () => {
    expect(declaredValueTolerance("fat", 10)).toBeCloseTo(1.5, 6);
    expect(declaredValueTolerance("fat", 5)).toBeCloseTo(1, 6);
  });
});

describe("D2 — the tolerance is capped at 20% of the threshold", () => {
  it("never exceeds the cap for any band or threshold", () => {
    const nutrients = ["sugars", "fat", "saturatedFat", "sodium", "salt"] as const;
    for (const n of nutrients) {
      for (const threshold of [0.1, 0.3, 0.75, 1, 1.5, 2, 5, 8, 10, 20, 22.5, 50]) {
        expect(declaredValueTolerance(n, threshold)).toBeLessThanOrEqual(
          threshold * TOLERANCE_CAP + 1e-9,
        );
      }
    }
  });

  it("puts the saturated-fat disqualifier at 6.0 g, the worked example in §7.1", () => {
    expect(disqualifyingAbove("saturatedFat", 5)).toBeCloseTo(6, 6);
  });
});

describe("V2.2 — severity, and the quantity we do not know", () => {
  it("fires strictly above the tolerance edge, never on it", () => {
    expect(isSevere(6, "saturatedFat", 5)).toBe(false);
    expect(isSevere(6.01, "saturatedFat", 5)).toBe(true);
  });

  it("an unquantified failure never disqualifies", () => {
    expect(isSevere(null, "saturatedFat", 5)).toBe(false);
  });

  it("55 g of saturated fat against the fats-and-oils line of 20 g disqualifies", () => {
    expect(isSevere(55, "saturatedFat", 20)).toBe(true);
  });
});

describe("U4.5 — energy, declared and derived", () => {
  it("prefers a declared figure", () => {
    const e = resolveEnergyKcal(facts({ energyKcal: 376, carbohydratesG: 84 }));
    expect(e).toEqual({ kcal: 376, basis: "declared" });
  });

  it("derives from the Codex factors when energy is absent", () => {
    const e = resolveEnergyKcal(facts({ carbohydratesG: 10, fatG: 2, proteinG: 5 }));
    expect(e?.basis).toBe("derived");
    expect(e?.kcal).toBeCloseTo(10 * 4 + 2 * 9 + 5 * 4, 6);
  });

  it("uses the factors S6 §3.3.1 states", () => {
    expect(ATWATER_KCAL_PER_G).toEqual({ carbohydrate: 4, protein: 4, fat: 9 });
  });

  it("refuses to derive from a partial panel, rather than undercounting energy", () => {
    // Protein alone would give a 100% protein share and a manufactured pass.
    expect(resolveEnergyKcal(facts({ proteinG: 5 }))).toBeNull();
    expect(resolveEnergyKcal(facts({ carbohydratesG: 10, proteinG: 5 }))).toBeNull();
    expect(proteinEnergyShare(facts({ proteinG: 5 }))).toBeNull();
  });

  it("treats a zero-energy panel as no denominator, not as a divide by zero", () => {
    expect(resolveEnergyKcal(facts({ carbohydratesG: 0, fatG: 0, proteinG: 0 }))).toBeNull();
    expect(proteinEnergyShare(facts({ carbohydratesG: 0, fatG: 0, proteinG: 0 }))).toBeNull();
  });

  it("computes the protein share from a declared energy figure", () => {
    // Plain yoghurt: 4.2 g protein at 71 kcal = 16.8/71 = 23.7% of energy.
    const share = proteinEnergyShare(facts({ energyKcal: 71, proteinG: 4.2 }));
    expect(share).toBeCloseTo(0.2366, 3);
  });

  it("computes fibre per 100 kcal", () => {
    expect(fibrePer100Kcal(facts({ energyKcal: 334, fibreG: 27 }))).toBeCloseTo(8.08, 2);
    expect(fibrePer100Kcal(facts({ fibreG: 27 }))).toBeNull();
  });
});
