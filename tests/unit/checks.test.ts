import { describe, expect, it } from "vitest";
import { evaluateChecks, unexplainedEnergy, type EvidenceInput } from "@/lib/health/checks";
import { evaluateProduct } from "@/lib/health/evaluate";
import { DIMENSIONS, DISQUALIFIER_MARGIN, THRESHOLDS } from "@/lib/health/rubric";
import { CheckSchema, type NutritionFacts, type ProductCategory } from "@/lib/schemas";

const source = { name: "Open Food Facts", url: null, lastVerifiedAt: "2026-01-01T00:00:00.000Z" };

function nutrition(overrides: Partial<NutritionFacts> = {}): NutritionFacts {
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

function input(overrides: Partial<EvidenceInput> = {}): EvidenceInput {
  return {
    category: "food",
    nutrition: nutrition({ sugarsG: 5, saturatedFatG: 1, saltG: 0.2, fibreG: 6, proteinG: 8 }),
    novaGroup: 1,
    additives: [],
    allergens: [],
    ingredientsText: "oats, water, sea salt",
    certifications: [],
    evidenceSource: source,
    ...overrides,
  };
}

const statusOf = (checks: ReturnType<typeof evaluateChecks>, key: string) =>
  checks.find((c) => c.key === key)?.status;

describe("the checklist covers exactly the category's dimensions", () => {
  it("returns one check per applicable dimension, in rubric order", () => {
    for (const category of ["food", "drink", "supplement", "cosmetic"] as ProductCategory[]) {
      const checks = evaluateChecks(input({ category, nutrition: null }));
      expect(checks.map((c) => c.key)).toEqual(DIMENSIONS[category]);
    }
  });

  it("never assesses a dimension that does not apply to the category", () => {
    const cosmetic = evaluateChecks(input({ category: "cosmetic", nutrition: null }));
    // A shampoo has no sugar figure to be missing, so there is no "unknown" row for it.
    expect(cosmetic.some((c) => c.key === "addedSugars")).toBe(false);
    expect(cosmetic.some((c) => c.key === "saturatedFat")).toBe(false);
  });

  it("produces checks that satisfy the schema", () => {
    for (const check of evaluateChecks(input())) {
      expect(CheckSchema.safeParse(check).success).toBe(true);
    }
  });
});

/* ===========================================================================
 * The invariant the whole product rests on.
 * ========================================================================= */
describe("unknown never counts as passed", () => {
  it("marks every nutrition dimension unknown — not passed — when the panel is missing", () => {
    const checks = evaluateChecks(input({ nutrition: null, novaGroup: null, ingredientsText: null }));
    for (const key of ["addedSugars", "saturatedFat", "salt", "nutrientDensity", "processing"]) {
      expect(statusOf(checks, key)).toBe("unknown");
    }
    expect(checks.some((c) => c.status === "pass" && c.evidence.value === "unknown")).toBe(false);
  });

  it("distinguishes a measured zero from a missing value", () => {
    const measuredZero = evaluateChecks(input({ nutrition: nutrition({ saltG: 0 }) }));
    const missing = evaluateChecks(input({ nutrition: nutrition({}) }));

    expect(statusOf(measuredZero, "salt")).toBe("pass");
    expect(statusOf(missing, "salt")).toBe("unknown");
  });

  it("treats a missing certificate as unknown, not as a failure or a pass", () => {
    expect(statusOf(evaluateChecks(input()), "certification")).toBe("unknown");
  });

  it("treats an uncountable additive list as unknown, not as 'no additives'", () => {
    const noEvidence = evaluateChecks(input({ additives: [], ingredientsText: null }));
    expect(statusOf(noEvidence, "additives")).toBe("unknown");

    const withList = evaluateChecks(input({ additives: [], ingredientsText: "oats, water" }));
    expect(statusOf(withList, "additives")).toBe("pass");
  });

  it("does not claim a cosmetic is additive-free: our taxonomy does not cover cosmetics", () => {
    const checks = evaluateChecks(
      input({ category: "cosmetic", nutrition: null, additives: [], ingredientsText: "aqua, glycerin" }),
    );
    expect(statusOf(checks, "additives")).toBe("unknown");
  });

  it("holds across a sweep of partially-missing evidence", () => {
    const values = [null, 1] as const;
    for (const sugars of values) {
      for (const nova of values) {
        for (const ingredients of [null, "oats, water"] as const) {
          const checks = evaluateChecks(
            input({
              nutrition: sugars === null ? null : nutrition({ sugarsG: sugars }),
              novaGroup: nova,
              ingredientsText: ingredients,
              additives: [],
            }),
          );
          for (const check of checks) {
            if (check.status === "pass") {
              expect(check.evidence.value).not.toBe("unknown");
              expect(check.evidence.value).not.toBe("not verified");
            }
          }
        }
      }
    }
  });
});

/* ===========================================================================
 * Per-dimension behaviour
 * ========================================================================= */
describe("nutrient checks", () => {
  it("passes at or below the rubric's low mark and fails above it", () => {
    const good = THRESHOLDS.food.saturatedFat.good;
    expect(
      statusOf(evaluateChecks(input({ nutrition: nutrition({ saturatedFatG: good }) })), "saturatedFat"),
    ).toBe("pass");
    expect(
      statusOf(
        evaluateChecks(input({ nutrition: nutrition({ saturatedFatG: good + 0.1 }) })),
        "saturatedFat",
      ),
    ).toBe("fail");
  });

  it("applies the stricter drink thresholds to drinks", () => {
    // 1 g saturated fat: under the food line of 1.5, over the drink line of 0.75.
    const one = nutrition({ saturatedFatG: 1 });
    expect(statusOf(evaluateChecks(input({ category: "food", nutrition: one })), "saturatedFat")).toBe(
      "pass",
    );
    expect(
      statusOf(
        evaluateChecks(input({ category: "drink", nutrition: { ...one, basis: "per_100ml" } })),
        "saturatedFat",
      ),
    ).toBe("fail");
  });

  it("never states a threshold the value has not crossed", () => {
    const belowHigh = evaluateChecks(input({ nutrition: nutrition({ saltG: 1.0 }) })).find(
      (c) => c.key === "salt",
    )!;
    // It may name the high mark as context; it may not say the value has reached it.
    expect(belowHigh.detail).not.toMatch(/That counts as high/);
    expect(belowHigh.detail).toMatch(/below the 1.5 g that counts as high/);

    const aboveHigh = evaluateChecks(input({ nutrition: nutrition({ saltG: 2 }) })).find(
      (c) => c.key === "salt",
    )!;
    expect(aboveHigh.detail).toMatch(/That counts as high/);
  });
});

describe("the disqualifier margin", () => {
  const bad = THRESHOLDS.food.saturatedFat.bad;

  it("does not fire on a value exactly at the high mark", () => {
    const check = evaluateChecks(input({ nutrition: nutrition({ saturatedFatG: bad }) })).find(
      (c) => c.key === "saturatedFat",
    )!;
    expect(check.status).toBe("fail");
    expect(check.disqualifying).toBeUndefined();
  });

  it("does not fire anywhere inside the 5% margin — those are a plain cross", () => {
    for (const factor of [1, 1.01, 1.02, 1.049]) {
      const check = evaluateChecks(
        input({ nutrition: nutrition({ saturatedFatG: bad * factor }) }),
      ).find((c) => c.key === "saturatedFat")!;
      expect(check.status).toBe("fail");
      expect(check.disqualifying).toBeUndefined();
    }
  });

  it("fires once the value is clearly past the mark", () => {
    const check = evaluateChecks(
      input({ nutrition: nutrition({ saturatedFatG: bad * DISQUALIFIER_MARGIN }) }),
    ).find((c) => c.key === "saturatedFat")!;
    expect(check.disqualifying).toBe(true);
  });

  it("applies the same margin to salt", () => {
    const saltBad = THRESHOLDS.food.salt.bad;
    const inside = evaluateChecks(input({ nutrition: nutrition({ saltG: saltBad * 1.02 }) })).find(
      (c) => c.key === "salt",
    )!;
    const outside = evaluateChecks(input({ nutrition: nutrition({ saltG: saltBad * 1.2 }) })).find(
      (c) => c.key === "salt",
    )!;
    expect(inside.disqualifying).toBeUndefined();
    expect(outside.disqualifying).toBe(true);
  });

  it("still condemns a genuinely severe value", () => {
    // Salted butter: 55 g saturated fat per 100 g, eleven times the high mark.
    const check = evaluateChecks(input({ nutrition: nutrition({ saturatedFatG: 55 }) })).find(
      (c) => c.key === "saturatedFat",
    )!;
    expect(check.disqualifying).toBe(true);
  });
});

describe("fibre and protein", () => {
  it("passes on either target alone", () => {
    const fibreOnly = nutrition({ fibreG: THRESHOLDS.food.fibreTarget, proteinG: 0 });
    const proteinOnly = nutrition({ fibreG: 0, proteinG: THRESHOLDS.food.proteinTarget });
    expect(statusOf(evaluateChecks(input({ nutrition: fibreOnly })), "nutrientDensity")).toBe("pass");
    expect(statusOf(evaluateChecks(input({ nutrition: proteinOnly })), "nutrientDensity")).toBe("pass");
  });

  it("fails when both are below target but known", () => {
    expect(
      statusOf(evaluateChecks(input({ nutrition: nutrition({ fibreG: 1, proteinG: 1 }) })), "nutrientDensity"),
    ).toBe("fail");
  });

  it("is unknown only when neither figure exists", () => {
    expect(statusOf(evaluateChecks(input({ nutrition: nutrition({ fibreG: 1 }) })), "nutrientDensity")).toBe(
      "fail",
    );
    expect(statusOf(evaluateChecks(input({ nutrition: nutrition({}) })), "nutrientDensity")).toBe("unknown");
  });
});

describe("processing", () => {
  it("passes NOVA 1 and 2, fails 3 and 4, and is unknown otherwise", () => {
    expect(statusOf(evaluateChecks(input({ novaGroup: 1 })), "processing")).toBe("pass");
    expect(statusOf(evaluateChecks(input({ novaGroup: 2 })), "processing")).toBe("pass");
    expect(statusOf(evaluateChecks(input({ novaGroup: 3 })), "processing")).toBe("fail");
    expect(statusOf(evaluateChecks(input({ novaGroup: 4 })), "processing")).toBe("fail");
    expect(statusOf(evaluateChecks(input({ novaGroup: null })), "processing")).toBe("unknown");
    expect(statusOf(evaluateChecks(input({ novaGroup: 9 })), "processing")).toBe("unknown");
  });
});

describe("certification", () => {
  // REGULATOR_IMPORT, not SYNTHETIC: these tests are about certificate STATUS.
  // Synthetic rows have their own file, tests/unit/synthetic.test.ts.
  const cert = (over: Record<string, unknown> = {}) => ({
    certificateType: "ECAS",
    status: "valid" as const,
    bodyName: "A Body",
    certificateNumber: "C1",
    sourceKind: "REGULATOR_IMPORT",
    source,
    ...over,
  });

  it("passes on a valid certificate", () => {
    expect(statusOf(evaluateChecks(input({ certifications: [cert()] })), "certification")).toBe("pass");
  });

  it("fails on an expired certificate without disqualifying the product", () => {
    const check = evaluateChecks(input({ certifications: [cert({ status: "expired" })] })).find(
      (c) => c.key === "certification",
    )!;
    expect(check.status).toBe("fail");
    expect(check.disqualifying).toBeUndefined();
  });

  it("marks a suspended certificate as disqualifying", () => {
    const check = evaluateChecks(input({ certifications: [cert({ status: "suspended" })] })).find(
      (c) => c.key === "certification",
    )!;
    expect(check.status).toBe("fail");
    expect(check.disqualifying).toBe(true);
  });

  it("records whether an accredited body issued it, for the ranking tie-break", () => {
    const withBody = evaluateChecks(input({ certifications: [cert()] })).find(
      (c) => c.key === "certification",
    )!;
    const withoutBody = evaluateChecks(input({ certifications: [cert({ bodyName: null })] })).find(
      (c) => c.key === "certification",
    )!;
    expect(withBody.evidence.value).toMatch(/accredited body/);
    expect(withoutBody.evidence.value).not.toMatch(/accredited body/);
  });
});

describe("transparency", () => {
  it("never returns unknown: absence of an ingredient list is observable", () => {
    expect(statusOf(evaluateChecks(input({ ingredientsText: null })), "transparency")).toBe("fail");
    expect(statusOf(evaluateChecks(input({ ingredientsText: "oats, water" })), "transparency")).toBe("pass");
  });
});

describe("evaluateProduct", () => {
  it("is deterministic", () => {
    const shared = input({ nutrition: nutrition({ sugarsG: 12, saturatedFatG: 3, saltG: 0.9 }) });
    const runs = Array.from({ length: 5 }, () =>
      evaluateProduct(shared)
        .checks.map((c) => `${c.key}:${c.status}`)
        .join("|"),
    );
    expect(new Set(runs).size).toBe(1);
  });

  it("lists every unknown check in the unknowns", () => {
    const result = evaluateProduct(input({ nutrition: null, novaGroup: null }));
    for (const label of result.checks.filter((c) => c.status === "unknown").map((c) => c.label)) {
      expect(result.unknowns.join(" ")).toContain(label);
    }
  });

  it("never lets an allergen change a check", () => {
    const without = evaluateProduct(input());
    const with_ = evaluateProduct(input({ allergens: ["milk", "nuts"] }));
    expect(with_.checks.map((c) => c.status)).toEqual(without.checks.map((c) => c.status));
    expect(with_.verdict.verdict).toBe(without.verdict.verdict);
  });

  it("flags an energy figure the macros cannot account for, as an unknown", () => {
    const suspect = nutrition({ energyKcal: 250, carbohydratesG: 0, fatG: 0, proteinG: 0, saltG: 0.1 });
    const result = evaluateProduct(input({ nutrition: suspect }));
    expect(result.unknowns.join(" ")).toMatch(/Nutrition panel may be incomplete/);
    const noEnergy = evaluateProduct(input({ nutrition: { ...suspect, energyKcal: null } }));
    expect(result.checks.map((c) => c.status)).toEqual(noEnergy.checks.map((c) => c.status));
  });
});

describe("unexplainedEnergy", () => {
  it("does not fire on an ordinary starchy food", () => {
    expect(
      unexplainedEnergy(nutrition({ energyKcal: 377, carbohydratesG: 84, sugarsG: 8, fatG: 0.9, proteinG: 7 })),
    ).toBeNull();
  });

  it("fires when a real energy figure sits on a panel of zeroes", () => {
    expect(unexplainedEnergy(nutrition({ energyKcal: 250, carbohydratesG: 0, fatG: 0, proteinG: 0 }))).toEqual(
      { declared: 250, explained: 0 },
    );
  });

  it("declines to judge when total carbohydrate is missing", () => {
    expect(unexplainedEnergy(nutrition({ energyKcal: 400, sugarsG: 2, fatG: 1 }))).toBeNull();
  });
});
