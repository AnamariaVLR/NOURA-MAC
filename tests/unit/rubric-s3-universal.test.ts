/**
 * RUBRIC.md §3 — Universal checks.
 *
 * One describe block per rule identifier. Where a rule is a threshold, the test
 * asserts the number AND the behaviour either side of it; where a rule is a
 * procedure, it asserts the branch.
 */

import { describe, expect, it } from "vitest";
import { evaluateChecks } from "../../lib/health/checks";
import { FIBRE, PROTEIN, SALT_BANDS, SALT_PER_SODIUM, SATURATED_FAT_BANDS, SUGAR_BANDS } from "../../lib/health/rubric";
import { CheckSchema } from "../../lib/schemas";
import { ruleFor } from "../../lib/health/categories";
import { ALL_CATEGORIES, checkFor, input, nutrition, statusOf } from "./helpers";

describe("U1 — added sugar", () => {
  it("U1.3/U1.4 — the solid bands are S12's 5 g and S1's 22.5 g", () => {
    expect(SUGAR_BANDS.solid.low).toBe(5);
    expect(SUGAR_BANDS.solid.high).toBe(22.5);
  });

  it("U1.5/U1.6 — the liquid bands are S12's 2.5 g and S10's 8 g, not S1's 11.25", () => {
    expect(SUGAR_BANDS.liquid.low).toBe(2.5);
    expect(SUGAR_BANDS.liquid.high).toBe(8);
  });

  it("U1.8 clause 1 — a sweetener in the ingredient list fails the check", () => {
    const checks = evaluateChecks(input({ ingredientsText: "corn, sugar, salt" }));
    expect(statusOf(checks, "addedSugars")).toBe("fail");
  });

  it("U1.8 clause 2 — a full list naming no sweetener is positive evidence of absence", () => {
    const checks = evaluateChecks(input({ ingredientsText: "milk, live cultures" }));
    expect(statusOf(checks, "addedSugars")).toBe("pass");
  });

  it("U1.8 clause 4 — a clean list against a positive figure is UNKNOWN, not a guess", () => {
    const checks = evaluateChecks(
      input({
        ingredientsText: "milk, live cultures",
        nutrition: nutrition({ sugarsG: 9, addedSugarsG: 6 }),
      }),
    );
    expect(statusOf(checks, "addedSugars")).toBe("unknown");
  });

  it("U1.8 clause 5 — no list and no figure is UNKNOWN", () => {
    const checks = evaluateChecks(
      input({ ingredientsText: null, nutrition: nutrition({ sugarsG: 4 }) }),
    );
    expect(statusOf(checks, "addedSugars")).toBe("unknown");
  });

  it("U1.7 — presence decides, so a small added quantity still fails", () => {
    const checks = evaluateChecks(
      input({
        ingredientsText: "water, sugar",
        nutrition: nutrition({ sugarsG: 0.5, addedSugarsG: 0.5 }),
      }),
    );
    expect(statusOf(checks, "addedSugars")).toBe("fail");
  });

  it("U1.7 — an unquantified failure can never disqualify", () => {
    const checks = evaluateChecks(
      input({ ingredientsText: "wheat flour, sugar, salt", nutrition: null }),
    );
    expect(checkFor(checks, "addedSugars")?.disqualifying).toBeUndefined();
  });

  /* THE LACTOSE CASE — the rule this whole module exists for. */
  it("U1.9 — lactose in plain milk is not added sugar", () => {
    const checks = evaluateChecks(
      input({
        category: "milk",
        subcategory: "dairy_milk",
        ingredientsText: "fresh cow's milk, vitamin a, vitamin d",
        nutrition: nutrition({ basis: "per_100ml", sugarsG: 4.8, saturatedFatG: 0.6, saltG: 0.1 }),
      }),
    );
    expect(statusOf(checks, "addedSugars")).toBe("pass");
    // And the total-sugar check must not fail it either: C4.2.2 takes S10's high
    // line only, because S10 excludes milk products from the excise altogether.
    expect(statusOf(checks, "totalSugars")).toBe("pass");
  });

  it("U1.9 — the sugars an oat drink's own starch releases are not added either", () => {
    const checks = evaluateChecks(
      input({
        category: "milk",
        subcategory: "plant_milk",
        ingredientsText: "water, oats 10%, sea salt",
        nutrition: nutrition({ basis: "per_100ml", sugarsG: 3.4, saturatedFatG: 0.1, saltG: 0.1 }),
      }),
    );
    expect(statusOf(checks, "addedSugars")).toBe("pass");
    expect(statusOf(checks, "totalSugars")).toBe("pass");
  });

  it("U1.9 — 63 g of intrinsic sugar in dates is still not added sugar", () => {
    const checks = evaluateChecks(
      input({ ingredientsText: "Dates", nutrition: nutrition({ sugarsG: 63 }) }),
    );
    expect(statusOf(checks, "addedSugars")).toBe("pass");
  });
});

describe("U2 — saturated fat", () => {
  it("U2.1/U2.2 — solid lines are 1.5 g and 5 g", () => {
    expect(SATURATED_FAT_BANDS.solid.low).toBe(1.5);
    expect(SATURATED_FAT_BANDS.solid.high).toBe(5);
  });

  it("U2.3/U2.4 — liquid lines are 0.75 g and 2.5 g", () => {
    expect(SATURATED_FAT_BANDS.liquid.low).toBe(0.75);
    expect(SATURATED_FAT_BANDS.liquid.high).toBe(2.5);
  });

  it("passes at the low line exactly, and fails just above it", () => {
    expect(statusOf(evaluateChecks(input({ nutrition: nutrition({ saturatedFatG: 1.5 }) })), "saturatedFat")).toBe("pass");
    expect(statusOf(evaluateChecks(input({ nutrition: nutrition({ saturatedFatG: 1.51 }) })), "saturatedFat")).toBe("fail");
  });

  /* THE NEAR-MISS CASE — §2.2 D3 and §7.1 V2.2 together. */
  it("D3 — tolerance never rescues a failing value: 1.6 g fails, it is not forgiven", () => {
    const checks = evaluateChecks(input({ nutrition: nutrition({ saturatedFatG: 1.6 }) }));
    expect(statusOf(checks, "saturatedFat")).toBe("fail");
  });

  it("V2.2 — a hairline breach of the high line fails without disqualifying", () => {
    // 5.01 g is past the high line of 5 but inside the tolerance edge of 6.0.
    const near = evaluateChecks(input({ nutrition: nutrition({ saturatedFatG: 5.01 }) }));
    expect(statusOf(near, "saturatedFat")).toBe("fail");
    expect(checkFor(near, "saturatedFat")?.disqualifying).toBeUndefined();
  });

  it("V2.2 — a clear breach disqualifies", () => {
    const clear = evaluateChecks(input({ nutrition: nutrition({ saturatedFatG: 18 }) }));
    expect(checkFor(clear, "saturatedFat")?.disqualifying).toBe(true);
  });

  it("V2.2 — 6.0 g sits exactly on the edge and does not disqualify", () => {
    const edge = evaluateChecks(input({ nutrition: nutrition({ saturatedFatG: 6 }) }));
    expect(checkFor(edge, "saturatedFat")?.disqualifying).toBeUndefined();
    const past = evaluateChecks(input({ nutrition: nutrition({ saturatedFatG: 6.01 }) }));
    expect(checkFor(past, "saturatedFat")?.disqualifying).toBe(true);
  });
});

describe("U3 — salt", () => {
  it("U3.1/U3.2 — solid lines are 0.3 g and 1.5 g", () => {
    expect(SALT_BANDS.solid.low).toBe(0.3);
    expect(SALT_BANDS.solid.high).toBe(1.5);
  });

  it("U3.3/U3.4 — the liquid LOW line is 0.3 g, the same figure S12 applies per 100 ml", () => {
    // This is the change that flips plain milk. The shipped value was 0.15 and
    // had no source. §9 Q11 keeps the question open.
    expect(SALT_BANDS.liquid.low).toBe(0.3);
    expect(SALT_BANDS.liquid.high).toBe(0.75);
  });

  it("U3.3 — a low-fat milk at 0.1575 g/100 ml passes the sourced line", () => {
    const checks = evaluateChecks(
      input({
        category: "milk",
        subcategory: "dairy_milk",
        nutrition: nutrition({ basis: "per_100ml", saltG: 0.1575 }),
      }),
    );
    expect(statusOf(checks, "salt")).toBe("pass");
  });

  it("U3.5 — 1 g of sodium is 2.5 g of salt, as S5 states verbatim", () => {
    expect(SALT_PER_SODIUM).toBe(2.5);
    // and the LOW SODIUM claim of 0.12 g sodium is the 0.3 g salt line.
    expect(0.12 * SALT_PER_SODIUM).toBeCloseTo(SALT_BANDS.solid.low!, 6);
  });
});

describe("U4 — fibre and protein", () => {
  it("U4.1 — HIGH FIBRE is 6 g/100 g or 3 g/100 kcal", () => {
    expect(FIBRE.highPer100g).toBe(6);
    expect(FIBRE.highPer100Kcal).toBe(3);
  });

  it("U4.3 — SOURCE OF PROTEIN is 12% of energy, not an absolute mass", () => {
    expect(PROTEIN.sourceOfEnergyShare).toBe(0.12);
    expect(PROTEIN.highEnergyShare).toBe(0.2);
  });

  it("U4.6 — high fibre alone passes the check", () => {
    const checks = evaluateChecks(
      input({ nutrition: nutrition({ fibreG: 27, energyKcal: 334, proteinG: null }) }),
    );
    expect(statusOf(checks, "nutrientDensity")).toBe("pass");
  });

  it("U4.6 — a protein share of 12% alone passes the check", () => {
    // 4.2 g protein at 71 kcal is 23.7% of energy.
    const checks = evaluateChecks(
      input({ nutrition: nutrition({ proteinG: 4.2, energyKcal: 71, fibreG: 0 }) }),
    );
    expect(statusOf(checks, "nutrientDensity")).toBe("pass");
  });

  it("U4.3 — an absolute protein mass no longer passes on its own", () => {
    // 8 g/100 g was the shipped line and had no source. At 392 kcal that is 8.2%
    // of energy, below S12's 12%, so this now fails — which is the point of B4.
    const checks = evaluateChecks(
      input({ nutrition: nutrition({ proteinG: 8, energyKcal: 392, fibreG: 0 }) }),
    );
    expect(statusOf(checks, "nutrientDensity")).toBe("fail");
  });

  it("U4.5 — energy is derived from the macros when it is not published", () => {
    // 4 g protein, 2 g carbohydrate, 1 g fat = 16 + 8 + 9 = 33 kcal; 16/33 = 48%.
    const checks = evaluateChecks(
      input({
        nutrition: nutrition({ proteinG: 4, carbohydratesG: 2, fatG: 1, fibreG: 0 }),
      }),
    );
    expect(statusOf(checks, "nutrientDensity")).toBe("pass");
  });

  it("D6 — neither published is UNKNOWN, never a fail", () => {
    const checks = evaluateChecks(input({ nutrition: nutrition({ saltG: 0.1 }) }));
    expect(statusOf(checks, "nutrientDensity")).toBe("unknown");
  });

  it("D6 — a protein mass with no resolvable energy is not evidence of anything", () => {
    const checks = evaluateChecks(input({ nutrition: nutrition({ proteinG: 20 }) }));
    expect(statusOf(checks, "nutrientDensity")).toBe("unknown");
  });
});

describe("U5 — processing is a note, not a check", () => {
  it("never appears in the checklist for any category", () => {
    for (const nova of [1, 2, 3, 4]) {
      const checks = evaluateChecks(input({ novaGroup: nova }));
      expect(checks.some((c) => c.key === "processing")).toBe(false);
    }
  });

  it("U5.1 — an ultra-processed classification cannot move the verdict arithmetic", () => {
    const a = evaluateChecks(input({ novaGroup: 1 }));
    const b = evaluateChecks(input({ novaGroup: 4 }));
    expect(a.map((c) => c.status)).toEqual(b.map((c) => c.status));
  });
});

describe("U8 — ingredient transparency", () => {
  it("U8.1 — absence is observable, so this check never returns unknown", () => {
    expect(statusOf(evaluateChecks(input({ ingredientsText: null })), "transparency")).toBe("fail");
    expect(statusOf(evaluateChecks(input({ ingredientsText: "oats, salt" })), "transparency")).toBe("pass");
  });

  it("U8.2 — it is not applied at all to a category outside the labelling scope", () => {
    // A fresh egg has no ingredient list to publish. The shipped code failed it.
    const checks = evaluateChecks(input({ category: "eggs", ingredientsText: null }));
    expect(checks.some((c) => c.key === "transparency")).toBe(false);
  });
});

describe("U9 — the per-100 basis", () => {
  it("U9.1 — a liquid subcategory is judged per 100 ml", () => {
    const checks = evaluateChecks(
      input({
        category: "yogurt",
        subcategory: "drinking_yogurt",
        nutrition: nutrition({ basis: "per_100ml", saturatedFatG: 1 }),
      }),
    );
    expect(checkFor(checks, "saturatedFat")?.detail).toContain("per 100 ml");
  });

  it("U9.1 — the same category's solid subcategory is judged per 100 g", () => {
    const checks = evaluateChecks(
      input({
        category: "yogurt",
        subcategory: "spoonable_yogurt",
        nutrition: nutrition({ saturatedFatG: 1 }),
      }),
    );
    expect(checkFor(checks, "saturatedFat")?.detail).toContain("per 100 g");
  });

  it("every check satisfies the schema, so no rewrite can produce an unrenderable row", () => {
    for (const check of evaluateChecks(input())) {
      expect(CheckSchema.safeParse(check).success).toBe(true);
    }
  });
});

describe("U10 — a line that is not a low mark is never called low", () => {
  /**
   * From the first real scan of a real product: a 1 L bottle of Borges extra
   * virgin olive oil came back as "Low saturated fat: 16 g per 100 g… within the
   * low range, which is 20 g or less". 16 g is not low by any ordinary meaning.
   * It is below the line drawn FOR OILS, which is a different claim, and the
   * wording turned a category threshold into a health claim.
   */
  const olive = (saturatedFatG: number) =>
    input({
      category: "fats_oils",
      subcategory: "olive_oil",
      ingredientsText: "extra virgin olive oil",
      nutrition: nutrition({ saturatedFatG }),
    });

  it("U10.1 — olive oil at 16 g does not say 'low'", () => {
    const check = checkFor(evaluateChecks(olive(16)), "saturatedFat")!;
    expect(check.status).toBe("pass");
    // The claim must not assert lowness, and the detail must not use the
    // "Low is X or less" formula. The word itself may appear — it does, in the
    // sentence that explicitly DENIES the claim, which is the point.
    expect(check.claim.toLowerCase()).not.toMatch(/\blow\b/);
    expect(check.detail).not.toMatch(/low is .* or less/i);
    expect(check.claim).toContain("below the line for fats and oils");
  });

  it("U10.2 — and says why oils have their own line", () => {
    const check = checkFor(evaluateChecks(olive(16)), "saturatedFat")!;
    expect(check.detail).toContain("almost entirely fat");
    // The disclaimer that stops the pass over-claiming.
    expect(check.detail).toMatch(/not a claim that the product is low/i);
  });

  it("U10.3 — the explanation is on the passing side only", () => {
    const failed = checkFor(evaluateChecks(olive(55)), "saturatedFat")!;
    expect(failed.status).toBe("fail");
    expect(failed.detail).not.toMatch(/not a claim that the product is low/i);
    expect(failed.claim).toContain("above the line for fats and oils");
  });

  it("U10.1 — a cereal below 15 g of sugar is not described as low either", () => {
    const check = checkFor(
      evaluateChecks(input({ category: "cereal", nutrition: nutrition({ sugarsG: 14 }) })),
      "totalSugars",
    )!;
    expect(check.status).toBe("pass");
    expect(check.claim.toLowerCase()).not.toMatch(/\blow\b/);
    expect(check.detail).not.toMatch(/low is .* or less/i);
    // And it says outright that 15 g is a lot of sugar.
    expect(check.detail).toMatch(/great deal of sugar/i);
  });

  it("every single-threshold line in the model carries the wording it needs", () => {
    // A new category with one sourced line must not silently fall back to "low".
    for (const category of ALL_CATEGORIES) {
      const rule = ruleFor(category);
      for (const sub of rule.subcategories) {
        for (const [key, line] of Object.entries(rule.lines(sub.basis))) {
          if (line.low !== undefined) continue;
          expect(line.singleLine, `${category}/${sub.key}.${key} has no low mark and no wording`)
            .toBeDefined();
          expect(line.singleLine!.noun.length).toBeGreaterThan(5);
          expect(line.singleLine!.because.length).toBeGreaterThan(20);
        }
      }
    }
  });
});
