/**
 * The rules the section suites exercise without naming.
 *
 * rubric-s3, -s4, -s6, -s7 and -s8 test behaviour, and a rule is often covered by
 * a test that never says its identifier. rubric-coverage.test.ts insists that
 * every runtime rule is named by SOME test, because a rule nobody can point at a
 * test for is a rule nobody is maintaining. This file closes that gap with real
 * assertions rather than mentions — each one would fail if its rule were removed.
 */

import { describe, expect, it } from "vitest";
import { ruleFor } from "../../lib/health/categories";
import { isEnergyDrink, energyDrinkSignal, CAFFEINE_TERMS } from "../../lib/health/energy-drinks";
import { ADDED_SUGAR_TERMS, resolveAddedSugar } from "../../lib/health/added-sugar";
import { evaluateChecks, processingNote } from "../../lib/health/checks";
import { evaluateProduct } from "../../lib/health/evaluate";
import {
  ACCEPTABLE_PASS_RATE,
  FIBRE,
  GOOD_CHOICE_PASS_RATE,
  MIN_COVERAGE,
  MIN_KNOWN_FOR_GOOD_CHOICE,
  PROTEIN,
  SALT_BANDS,
  SATURATED_FAT_BANDS,
  SUGAR_BANDS,
} from "../../lib/health/rubric";
import { verdictFor } from "../../lib/health/verdict";
import type { Check } from "../../lib/schemas";
import { ALL_CATEGORIES, checkFor, input, nutrition, SOURCE, statusOf } from "./helpers";

function check(status: Check["status"], key = `d${Math.random()}`): Check {
  return {
    key,
    label: "Dimension",
    status,
    claim: "A claim",
    detail: "Some detail.",
    evidence: { label: "Dimension", value: status === "unknown" ? "unknown" : "1 g" },
    source: SOURCE,
  };
}
const list = (pass: number, fail: number, unknown = 0): Check[] => [
  ...Array.from({ length: pass }, (_, i) => check("pass", `p${i}`)),
  ...Array.from({ length: fail }, (_, i) => check("fail", `f${i}`)),
  ...Array.from({ length: unknown }, (_, i) => check("unknown", `u${i}`)),
];

describe("§2 — the minimum-evidence and conflict rules", () => {
  it("D5 — GOOD CHOICE needs three resolved checks, not just a high ratio", () => {
    expect(MIN_KNOWN_FOR_GOOD_CHOICE).toBe(3);
    expect(verdictFor(list(2, 0)).verdict).toBe("acceptable");
    expect(verdictFor(list(3, 0)).verdict).toBe("good_choice");
  });

  it("D11 — two credible sources in conflict produce UNKNOWN, not a tie-break", () => {
    const resolved = resolveAddedSugar(
      nutrition({ sugarsG: 9, addedSugarsG: 6 }),
      "milk, live cultures",
    );
    expect(resolved.state).toBe("unknown");
    expect(resolved.basis).toBe("conflicting-evidence");
  });
});

describe("§3 — the definitions and the notes", () => {
  it("U1.1 — added sugar includes syrups, honey and juice concentrate", () => {
    for (const term of ["honey", "glucose syrup", "fruit juice concentrate", "molasses"]) {
      expect(ADDED_SUGAR_TERMS).toContain(term);
    }
  });

  it("U1.2 — free sugars are wider, and it is the drink categories that apply them", () => {
    // The wider definition is applied through the TOTAL-sugars check, which is
    // why 100% juice is caught there and not by the added-sugar check.
    expect(ruleFor("drink").checks).toContain("totalSugars");
    const juice = evaluateChecks(
      input({
        category: "drink",
        ingredientsText: "100% apple juice",
        nutrition: nutrition({ basis: "per_100ml", sugarsG: 10 }),
      }),
    );
    expect(statusOf(juice, "addedSugars")).toBe("pass");
    expect(statusOf(juice, "totalSugars")).toBe("fail");
  });

  it("U2.5 — saturates alone, not saturates plus trans: no trans field is read", () => {
    // S12 defines the claim on the sum. Noura declares the deviation because the
    // data carries no trans figure at all — there is no field for one.
    const facts = nutrition({ saturatedFatG: 1.4 });
    expect(Object.keys(facts)).not.toContain("transFatG");
    expect(statusOf(evaluateChecks(input({ nutrition: facts })), "saturatedFat")).toBe("pass");
  });

  it("U4.2 — SOURCE OF FIBRE is below the pass line and does not pass", () => {
    expect(FIBRE.sourceOfPer100g).toBe(3);
    expect(FIBRE.sourceOfPer100g).toBeLessThan(FIBRE.highPer100g);
    // 4 g of fibre is a SOURCE OF FIBRE and is not HIGH FIBRE, so it does not pass.
    const checks = evaluateChecks(
      input({ nutrition: nutrition({ fibreG: 4, proteinG: 1, energyKcal: 300 }) }),
    );
    expect(statusOf(checks, "nutrientDensity")).toBe("fail");
  });

  it("U4.4 — HIGH PROTEIN is above the pass line and is a note, not a second pass", () => {
    expect(PROTEIN.highEnergyShare).toBe(0.2);
    expect(PROTEIN.highEnergyShare).toBeGreaterThan(PROTEIN.sourceOfEnergyShare);
  });

  it("U5.2 — the processing note says it is research, not a regulator's standard", () => {
    const note = processingNote(4);
    expect(note?.text).toMatch(/research literature/);
    expect(note?.text).toMatch(/rather than a regulator/);
    expect(note?.source).toContain("tier 3");
  });

  it("U8.3 — a cosmetic's transparency copy does not claim its ingredients were screened", () => {
    const checks = evaluateChecks(
      input({ category: "cosmetic", nutrition: null, ingredientsText: "aqua, glycerin, parfum" }),
    );
    const transparency = checkFor(checks, "transparency");
    expect(transparency?.status).toBe("pass");
    expect(transparency?.detail).toMatch(/has not checked those ingredients/);
  });

  it("U9.2 — no per-portion criterion exists anywhere in the model", () => {
    // S1's per-portion arm is unused because Noura holds no serving sizes, and
    // the nutrition record has no field one could be computed from. If a portion
    // line is ever added, this assertion is where it has to start.
    expect(Object.keys(nutrition())).not.toContain("servingSizeG");
    for (const category of ALL_CATEGORIES) {
      for (const basis of ["solid", "liquid"] as const) {
        for (const line of Object.values(ruleFor(category).lines(basis))) {
          expect(line, `${category} carries a per-portion line`).not.toHaveProperty("perPortion");
        }
      }
    }
  });
});

describe("§4 — the category rules each section names", () => {
  it("C4.1.6 — olive oil grade is a note that sets no rule", () => {
    const grade = ruleFor("fats_oils").notes.find((n) => n.rule === "C4.1.6");
    expect(grade?.text).toMatch(/sets no rule/);
    expect(grade?.source).toMatch(/unsourced/);
  });

  it("C4.2.1, C4.2.3, C4.2.4, C4.2.5 — milk takes the universal liquid lines", () => {
    const lines = ruleFor("milk").lines("liquid");
    expect(lines.addedSugars!.low).toBe(SUGAR_BANDS.liquid.low); // C4.2.1
    expect(lines.saturatedFat).toEqual({ ...SATURATED_FAT_BANDS.liquid, rule: "C4.2.3", source: lines.saturatedFat!.source }); // C4.2.3
    expect(lines.salt!.high).toBe(SALT_BANDS.liquid.high); // C4.2.4
    expect(ruleFor("milk").checks).toContain("nutrientDensity"); // C4.2.5
  });

  it("C4.3.1, C4.3.5, C4.3.6 — yogurt's added sugar, protein and the EMRO fat note", () => {
    expect(ruleFor("yogurt").lines("solid").addedSugars!.rule).toBe("C4.3.1");
    expect(ruleFor("yogurt").checks).toContain("nutrientDensity"); // C4.3.5
    const fatNote = ruleFor("yogurt").notes.find((n) => n.rule === "C4.3.6");
    expect(fatNote?.text).toContain("2.5 g total fat");
  });

  it("C4.5.3, C4.5.4, C4.5.5, C4.5.6, C4.5.7 — bread's remaining rules", () => {
    const bread = ruleFor("bread");
    expect(bread.lines("solid").addedSugars!.rule).toBe("C4.5.3");
    expect(bread.lines("solid").saturatedFat!.high).toBe(SATURATED_FAT_BANDS.solid.high); // C4.5.4
    expect(bread.notes.find((n) => n.rule === "C4.5.5")?.text).toContain("high fibre"); // C4.5.5
    expect(bread.notes.find((n) => n.rule === "C4.5.6")?.text).toContain("10 g total fat"); // C4.5.6
    expect(bread.notes.find((n) => n.rule === "C4.5.7")?.text).toMatch(/sets no rule/); // C4.5.7
  });

  it("C4.6.3, C4.6.5, C4.6.6, C4.6.7 — cereal's remaining rules", () => {
    const cereal = ruleFor("cereal");
    expect(cereal.lines("solid").addedSugars!.rule).toBe("C4.6.3");
    expect(cereal.lines("solid").saturatedFat!.high).toBe(SATURATED_FAT_BANDS.solid.high); // C4.6.5
    expect(cereal.notes.find((n) => n.rule === "C4.6.6")?.text).toContain("6 g of fibre"); // C4.6.6
    expect(cereal.notes.find((n) => n.rule === "C4.6.7")?.text).toContain("beta-glucans"); // C4.6.7
  });

  it("C4.7.2, C4.7.3, C4.7.4 — snacks take the universal solid lines", () => {
    const snacks = ruleFor("snacks");
    expect(snacks.lines("solid").saturatedFat!.rule).toBe("C4.7.2");
    expect(snacks.lines("solid").addedSugars!.rule).toBe("C4.7.3");
    expect(snacks.checks).toContain("nutrientDensity"); // C4.7.4
  });

  it("C4.8.1, C4.8.3, C4.8.4 — drinks take the universal liquid lines", () => {
    const lines = ruleFor("drink").lines("liquid");
    expect(lines.addedSugars!.rule).toBe("C4.8.1");
    expect(lines.saturatedFat!.high).toBe(SATURATED_FAT_BANDS.liquid.high); // C4.8.3
    expect(lines.salt!.high).toBe(SALT_BANDS.liquid.high); // C4.8.4
  });

  it("C4.8.7 — an energy drink is disqualified, and an iced tea is not", () => {
    const energy = evaluateChecks(
      input({
        category: "drink",
        ingredientsText: "carbonated water, sucrose, taurine, caffeine, glucuronolactone",
        nutrition: nutrition({ basis: "per_100ml", sugarsG: 11 }),
      }),
    );
    const classification = checkFor(energy, "classification");
    expect(classification?.disqualifying).toBe(true);
    expect(classification?.claim).toMatch(/energy drink/i);

    // Caffeine alone must not fire: an iced tea is not an energy drink.
    const tea = evaluateChecks(
      input({
        category: "drink",
        ingredientsText: "water, black tea extract, caffeine, lemon juice",
        nutrition: nutrition({ basis: "per_100ml", sugarsG: 3 }),
      }),
    );
    expect(checkFor(tea, "classification")).toBeUndefined();
  });

  it("C4.8.7 — the conjunction, and the case it deliberately misses", () => {
    expect(CAFFEINE_TERMS).toContain("caffeine");
    expect(isEnergyDrink("water, sugar, caffeine, taurine")).toBe(true);
    expect(isEnergyDrink("water, sugar, guarana, caffeine")).toBe(true);
    // Caffeine alone: the declared cost of the conjunction (RUBRIC §9 Q14).
    expect(isEnergyDrink("water, sugar, caffeine")).toBe(false);
    // No list at all is not a "no": it is an absence, and it cannot disqualify.
    expect(energyDrinkSignal(null)).toBeNull();
    expect(isEnergyDrink(null)).toBe(false);
  });

  it("C4.9.1, C4.9.2 — a cosmetic's labelling duties are what transparency means there", () => {
    expect(ruleFor("cosmetic").checks).toContain("transparency");
    expect(ruleFor("cosmetic").section).toBe("RUBRIC.md §4.9");
  });

  it("C4.10.1, C4.10.3 — supplements are outside the labelling scope and unevaluable", () => {
    const supplement = ruleFor("supplement");
    expect(supplement.supported).toBe(false); // C4.10.1 removes the §3 lines
    expect(supplement.lines("solid")).toEqual({});
    expect(supplement.notes.find((n) => n.rule === "C4.10.2")).toBeTruthy(); // C4.10.3's gap
  });
});

describe("§7 — the verdict cut-offs are the constants, not magic numbers", () => {
  it("V1 — coverage below the floor declines, whatever the pass rate", () => {
    expect(MIN_COVERAGE).toBe(0.5);
    // 2 resolved of 8, all passing: a pass rate of 1.0 and coverage of 0.25.
    const result = verdictFor(list(2, 0, 6));
    expect(result.coverage).toBeLessThan(MIN_COVERAGE);
    expect(result.verdict).toBe("could_not_verify");
  });

  it("V3 — the GOOD CHOICE line is the constant, and the boundary is inclusive", () => {
    expect(GOOD_CHOICE_PASS_RATE).toBe(0.8);
    expect(verdictFor(list(4, 1)).passRate).toBe(0.8);
    expect(verdictFor(list(4, 1)).verdict).toBe("good_choice");
    expect(verdictFor(list(3, 1)).verdict).toBe("acceptable");
  });

  it("V4 — the ACCEPTABLE line is the constant, and the boundary is inclusive", () => {
    expect(ACCEPTABLE_PASS_RATE).toBe(0.5);
    expect(verdictFor(list(2, 2)).verdict).toBe("acceptable");
    expect(verdictFor(list(1, 2)).verdict).toBe("not_recommended");
  });
});

describe("the whole thing still holds together", () => {
  it("an energy drink's disqualification reaches the verdict", () => {
    const evaluation = evaluateProduct(
      input({
        category: "drink",
        ingredientsText: "carbonated water, taurine, caffeine",
        nutrition: nutrition({ basis: "per_100ml", sugarsG: 0, saturatedFatG: 0, saltG: 0 }),
      }),
    );
    // It would otherwise pass almost everything.
    expect(evaluation.verdict.verdict).toBe("not_recommended");
    expect(evaluation.verdict.reason).toMatch(/energy drink/i);
  });
});
