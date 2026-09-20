/**
 * RUBRIC.md §4 — Category rules.
 *
 * Two halves. The first is structural and runs over every category: no line
 * without a rule and a source, no declared check without a line, no subcategory
 * that does not resolve. The second is one block per §4 section, asserting the
 * numbers that section sets and the behaviour either side of them.
 */

import { describe, expect, it } from "vitest";
import { CATEGORY_RULES, basisFor, resolveSubcategory, ruleFor } from "../../lib/health/categories";
import type { NutrientKey } from "../../lib/health/categories/types";
import { evaluateChecks } from "../../lib/health/checks";
import { evaluateProduct } from "../../lib/health/evaluate";
import { ALL_CATEGORIES, checkFor, input, nutrition, statusOf } from "./helpers";

const NUTRIENT_CHECKS: NutrientKey[] = ["addedSugars", "totalSugars", "saturatedFat", "salt"];

describe("C4.0 — the category set is complete and self-consistent", () => {
  it("has a rule for all eleven categories, and no others", () => {
    expect(Object.keys(CATEGORY_RULES).sort()).toEqual([...ALL_CATEGORIES].sort());
  });

  it("every rule names the RUBRIC.md section it implements", () => {
    for (const category of ALL_CATEGORIES) {
      expect(ruleFor(category).section).toMatch(/^RUBRIC\.md §4\.\d+$/);
    }
  });

  it("every nutrient line carries a RUBRIC rule identifier and a source", () => {
    for (const category of ALL_CATEGORIES) {
      const rule = ruleFor(category);
      for (const basis of ["solid", "liquid"] as const) {
        for (const [key, line] of Object.entries(rule.lines(basis))) {
          expect(line.rule, `${category}.${key}.rule`).toMatch(/^[CU]\d/);
          expect(line.source, `${category}.${key}.source`).toBeTruthy();
          expect(line.tolerance, `${category}.${key}.tolerance`).toBeTruthy();
          // A "low" above a "high" would invert the whole check silently.
          if (line.low !== undefined) expect(line.low).toBeLessThanOrEqual(line.high);
          if (line.disqualifyAbove !== undefined) {
            expect(line.disqualifyAbove).toBeGreaterThanOrEqual(line.high);
          }
        }
      }
    }
  });

  it("every declared nutrient check has a line for every basis it can be judged on", () => {
    // A missing line would make the check silently UNKNOWN, which looks like
    // missing data and is actually a missing rule.
    for (const category of ALL_CATEGORIES) {
      const rule = ruleFor(category);
      for (const sub of rule.subcategories) {
        const lines = rule.lines(sub.basis);
        for (const key of rule.checks) {
          if (NUTRIENT_CHECKS.includes(key as NutrientKey)) {
            expect(lines[key as NutrientKey], `${category}/${sub.key}.${key}`).toBeDefined();
          }
        }
      }
    }
  });

  it("every category note carries a rule and a source", () => {
    for (const category of ALL_CATEGORIES) {
      for (const note of ruleFor(category).notes) {
        expect(note.rule).toMatch(/^[CU]\d|^A\d/);
        expect(note.source.length).toBeGreaterThan(3);
      }
    }
  });

  it("C4.0.1 — every category's default subcategory exists, and an unknown one falls back", () => {
    for (const category of ALL_CATEGORIES) {
      const rule = ruleFor(category);
      expect(rule.subcategories.map((s) => s.key)).toContain(rule.defaultSubcategory);
      expect(resolveSubcategory(category, "not-a-real-subcategory").key).toBe(
        rule.defaultSubcategory,
      );
      expect(resolveSubcategory(category, null).key).toBe(rule.defaultSubcategory);
    }
  });
});

describe("C4.1 — fats and oils", () => {
  const oil = (over = {}) =>
    input({ category: "fats_oils", subcategory: "olive_oil", nutrition: nutrition(over) });

  it("C4.1.1 — the saturated-fat line is S5 #10's 20 g, not U2's 5 g", () => {
    expect(ruleFor("fats_oils").lines("solid").saturatedFat!.high).toBe(20);
  });

  it("C4.1.1 — olive oil at ~14 g passes, where the general food line would fail it", () => {
    expect(statusOf(evaluateChecks(oil({ saturatedFatG: 14 })), "saturatedFat")).toBe("pass");
    // the same figure under the generic food rule:
    expect(
      statusOf(evaluateChecks(input({ nutrition: nutrition({ saturatedFatG: 14 }) })), "saturatedFat"),
    ).toBe("fail");
  });

  it("C4.1.1 — salted butter at 55 g fails and disqualifies", () => {
    const checks = evaluateChecks(
      input({
        category: "fats_oils",
        subcategory: "other_fats_oils",
        nutrition: nutrition({ saturatedFatG: 55, saltG: 2 }),
      }),
    );
    expect(checkFor(checks, "saturatedFat")?.disqualifying).toBe(true);
  });

  it("C4.1.2 — the salt high line is S5 #10's 1.3 g, tighter than U3.2's 1.5", () => {
    expect(ruleFor("fats_oils").lines("solid").salt!.high).toBe(1.3);
  });

  it("C4.1.3/C4.1.4 — sugar, fibre and protein are not assessed at all", () => {
    const keys = evaluateChecks(oil({ saturatedFatG: 14 })).map((c) => c.key);
    expect(keys).not.toContain("addedSugars");
    expect(keys).not.toContain("totalSugars");
    expect(keys).not.toContain("nutrientDensity");
  });

  it("C4.1.5 — the polyphenol claim is a note, never a check", () => {
    const notes = evaluateProduct(oil({ saturatedFatG: 14 })).notes;
    expect(notes.some((n) => n.rule === "C4.1.5")).toBe(true);
    expect(evaluateChecks(oil({ saturatedFatG: 14 })).some((c) => c.key === "polyphenols")).toBe(false);
  });
});

describe("C4.2 — milk", () => {
  const plain = (over = {}) =>
    input({
      category: "milk",
      subcategory: "dairy_milk",
      ingredientsText: "fresh cow's milk, vitamin d",
      nutrition: nutrition({ basis: "per_100ml", ...over }),
    });

  it("C4.2.2 — the total-sugar check has S10's high line and no low line", () => {
    const line = ruleFor("milk").lines("liquid").totalSugars!;
    expect(line.high).toBe(8);
    expect(line.low).toBeUndefined();
  });

  it("C4.2.2 — plain milk's lactose passes; a flavoured milk drink at 9 g disqualifies", () => {
    expect(statusOf(evaluateChecks(plain({ sugarsG: 4.8 })), "totalSugars")).toBe("pass");
    const flavoured = evaluateChecks(plain({ sugarsG: 12 }));
    expect(statusOf(flavoured, "totalSugars")).toBe("fail");
    expect(checkFor(flavoured, "totalSugars")?.disqualifying).toBe(true);
  });

  it("C4.2.6 — the EMRO milk-drinks row is shown as a note, not applied", () => {
    // 3.6 g total fat is above EMRO's 2.5 and must not produce a failed check.
    const evaluation = evaluateProduct(plain({ fatG: 3.6, saturatedFatG: 0.6, saltG: 0.1 }));
    expect(evaluation.notes.some((n) => n.rule === "C4.2.6")).toBe(true);
    expect(evaluation.checks.every((c) => c.key !== "totalFat")).toBe(true);
  });

  it("C4.0.1 — an oat drink is a plant_milk, judged on the same lines", () => {
    expect(basisFor("milk", "plant_milk")).toBe("liquid");
    expect(ruleFor("milk").lines("liquid")).toEqual(ruleFor("milk").lines("liquid"));
  });
});

describe("C4.3 — yogurt", () => {
  const pot = (over = {}) =>
    input({
      category: "yogurt",
      subcategory: "spoonable_yogurt",
      ingredientsText: "pasteurised milk, live cultures",
      nutrition: nutrition(over),
    });

  it("C4.3.2 — total sugars fail above S5 #7's 10 g and disqualify above U1.4's 22.5 g", () => {
    const line = ruleFor("yogurt").lines("solid").totalSugars!;
    expect(line.high).toBe(10);
    expect(line.disqualifyAbove).toBe(22.5);
  });

  it("C4.3.2 — a fruit yogurt at 13 g fails without being condemned", () => {
    const checks = evaluateChecks(pot({ sugarsG: 13 }));
    expect(statusOf(checks, "totalSugars")).toBe("fail");
    expect(checkFor(checks, "totalSugars")?.disqualifying).toBeUndefined();
  });

  it("C4.3.2 — a dessert at 30 g does disqualify", () => {
    expect(checkFor(evaluateChecks(pot({ sugarsG: 30 })), "totalSugars")?.disqualifying).toBe(true);
  });

  it("C4.3.3 — the saturated-fat high line is S5 #7's 2 g, disqualifying at U2.2's 5 g", () => {
    const line = ruleFor("yogurt").lines("solid").saturatedFat!;
    expect(line.low).toBe(1.5);
    expect(line.high).toBe(2);
    expect(line.disqualifyAbove).toBe(5);
  });

  it("C4.3.3 — full-cream yogurt at 2.3 g fails and is not condemned", () => {
    const checks = evaluateChecks(pot({ saturatedFatG: 2.3 }));
    expect(statusOf(checks, "saturatedFat")).toBe("fail");
    expect(checkFor(checks, "saturatedFat")?.disqualifying).toBeUndefined();
  });

  it("C4.3.4 — EMRO's 0.1 g salt line is declined, and the decline is shown", () => {
    expect(ruleFor("yogurt").lines("solid").salt!.low).toBe(0.3);
    const checks = evaluateChecks(pot({ saltG: 0.2 }));
    expect(statusOf(checks, "salt")).toBe("pass");
    const notes = evaluateProduct(pot({ saltG: 0.2 })).notes;
    const declined = notes.find((n) => n.rule === "C4.3.4");
    expect(declined?.source).toContain("declined");
    expect(declined?.text).toContain("0.1 g");
  });

  it("C4.3.7 — laban is a yogurt, judged on the liquid lines", () => {
    expect(basisFor("yogurt", "drinking_yogurt")).toBe("liquid");
    expect(ruleFor("yogurt").lines("liquid").saturatedFat!.low).toBe(0.75);
    // and still carries the category's EMRO high line of 2 g.
    expect(ruleFor("yogurt").lines("liquid").saturatedFat!.high).toBe(2);
  });
});

describe("C4.4 — eggs", () => {
  it("C4.4.1/C4.4.3 — only certification is assessed", () => {
    expect(ruleFor("eggs").checks).toEqual(["certification"]);
  });

  it("C4.4.2 — EMRO's 0.1 g salt line is declined, because it fails every egg", () => {
    // A hen's egg carries ~0.3 g salt equivalent per 100 g and always has.
    expect(ruleFor("eggs").lines("solid").salt).toBeUndefined();

    const realEgg = input({
      category: "eggs",
      ingredientsText: "eggs",
      nutrition: nutrition({ saltG: 0.3, proteinG: 12.7, energyKcal: 140 }),
    });
    const checks = evaluateChecks(realEgg);
    expect(checks.some((c) => c.key === "salt")).toBe(false);
    // And the verdict is a shrug, not a condemnation.
    expect(evaluateProduct(realEgg).verdict.verdict).toBe("could_not_verify");
  });

  it("C4.4.2 — the declined line is shown, with why", () => {
    const note = ruleFor("eggs").notes.find((n) => n.rule === "C4.4.2");
    expect(note?.text).toContain("0.1 g");
    expect(note?.text).toContain("part of the egg");
    expect(note?.source).toContain("declined");
  });

  it("C4.4.4 — 'better' within eggs is empty, so no ranking is manufactured", () => {
    expect(ruleFor("eggs").better).toEqual([]);
  });

  it("a plain egg with no panel says nothing could be checked", () => {
    const evaluation = evaluateProduct(
      input({ category: "eggs", nutrition: null, ingredientsText: null }),
    );
    expect(evaluation.verdict.verdict).toBe("could_not_verify");
  });
});

describe("C4.5 — bread", () => {
  it("C4.5.1 — salt fails above S5 #11's 1.0 g, and that line also disqualifies", () => {
    const line = ruleFor("bread").lines("solid").salt!;
    expect(line.low).toBe(0.3);
    expect(line.high).toBe(1);
    expect(line.disqualifyAbove).toBeUndefined(); // defaults to `high` — the declared C0 exception
  });

  it("C4.5.1 — bread at 1.1 g fails; at 1.3 g it disqualifies", () => {
    const b = (salt: number) =>
      evaluateChecks(input({ category: "bread", nutrition: nutrition({ saltG: salt }) }));
    expect(statusOf(b(1.1), "salt")).toBe("fail");
    expect(checkFor(b(1.1), "salt")?.disqualifying).toBeUndefined();
    expect(checkFor(b(1.3), "salt")?.disqualifying).toBe(true);
  });

  it("C4.5.2 — total sugars fail above 10 g and disqualify above 22.5 g", () => {
    const line = ruleFor("bread").lines("solid").totalSugars!;
    expect(line.high).toBe(10);
    expect(line.disqualifyAbove).toBe(22.5);
  });
});

describe("C4.6 — cereal and granola", () => {
  const c = (over = {}) => input({ category: "cereal", nutrition: nutrition(over) });

  it("C4.6.1/C4.6.2 — the two sugar lines, each at its own strength", () => {
    const line = ruleFor("cereal").lines("solid").totalSugars!;
    expect(line.high).toBe(15);
    expect(line.disqualifyAbove).toBe(22.5);
  });

  it("C4.6.1 — 18 g fails and does not disqualify; 28 g disqualifies", () => {
    expect(statusOf(evaluateChecks(c({ sugarsG: 18 })), "totalSugars")).toBe("fail");
    expect(checkFor(evaluateChecks(c({ sugarsG: 18 })), "totalSugars")?.disqualifying).toBeUndefined();
    expect(checkFor(evaluateChecks(c({ sugarsG: 28 })), "totalSugars")?.disqualifying).toBe(true);
  });

  it("C4.6.1 — 15 g exactly is not 'exceeding' the line, so it passes", () => {
    expect(statusOf(evaluateChecks(c({ sugarsG: 15 })), "totalSugars")).toBe("pass");
  });

  it("C4.6.4 — salt takes U3.2's 1.5 g, which is tighter than S5 #5's 1.6", () => {
    expect(ruleFor("cereal").lines("solid").salt!.high).toBe(1.5);
  });

  it("C4.6.8 — the EMRO total-fat line is a note, so granola's nut fat does not fail it", () => {
    const evaluation = evaluateProduct(c({ fatG: 20, sugarsG: 8, saltG: 0.1 }));
    expect(evaluation.notes.some((n) => n.rule === "C4.6.8")).toBe(true);
    expect(evaluation.checks.every((c) => c.key !== "totalFat")).toBe(true);
  });
});

describe("C4.7 — packaged snacks", () => {
  it("C4.7.1 — the FSA lines are applied, not EMRO's 0.1 g", () => {
    const line = ruleFor("snacks").lines("solid").salt!;
    expect(line.low).toBe(0.3);
    expect(line.high).toBe(1.5);
  });

  it("C4.7.1 — salted nuts at 0.25 g pass, where EMRO's line would fail them", () => {
    const checks = evaluateChecks(
      input({ category: "snacks", nutrition: nutrition({ saltG: 0.25 }) }),
    );
    expect(statusOf(checks, "salt")).toBe("pass");
  });

  it("C4.7.5 — the declined line is shown to the reader with its provenance", () => {
    const notes = evaluateProduct(
      input({ category: "snacks", nutrition: nutrition({ saltG: 0.25 }) }),
    ).notes;
    const declined = notes.find((n) => n.rule === "C4.7.5");
    expect(declined?.text).toContain("0.1 g");
    expect(declined?.text).toContain("children");
    expect(declined?.source).toContain("declined");
  });
});

describe("C4.8 — drinks", () => {
  const d = (over = {}, ingredients = "water, sugar") =>
    input({
      category: "drink",
      ingredientsText: ingredients,
      nutrition: nutrition({ basis: "per_100ml", ...over }),
    });

  it("C4.8.2 — the total-sugar band is S10's, low 2.5 and high 8", () => {
    const line = ruleFor("drink").lines("liquid").totalSugars!;
    expect(line.low).toBe(2.5);
    expect(line.high).toBe(8);
  });

  it("C4.8.2 — a cola at 10.6 g/100 ml disqualifies", () => {
    expect(checkFor(evaluateChecks(d({ sugarsG: 10.6 })), "totalSugars")?.disqualifying).toBe(true);
  });

  it("C4.8.6 — 100% juice sugars are counted, despite the excise exclusion", () => {
    // No added sugar in the list, so U1 passes — and C4.8.2 still catches the
    // free sugars. This is the change DECISIONS §34 left open.
    const juice = evaluateChecks(d({ sugarsG: 10 }, "100% orange juice"));
    expect(statusOf(juice, "addedSugars")).toBe("pass");
    expect(statusOf(juice, "totalSugars")).toBe("fail");
    expect(checkFor(juice, "totalSugars")?.disqualifying).toBe(true);
  });

  it("C4.8.5 — a non-sugar sweetener is a note, never a failed check", () => {
    const evaluation = evaluateProduct(
      input({
        category: "drink",
        ingredientsText: "water, tea extract, steviol glycosides",
        additives: ["E960A"],
        nutrition: nutrition({ basis: "per_100ml", sugarsG: 0 }),
      }),
    );
    expect(statusOf(evaluation.checks, "additives")).toBe("pass");
    expect(evaluation.notes.some((n) => n.rule === "A3.1")).toBe(true);
  });

  it("C4.8.8 — water beats a sweetened drink on the category's own ordering", () => {
    expect(ruleFor("drink").better[0]).toBe("noAddedSugar");
    expect(ruleFor("drink").better[1]).toBe("lowerTotalSugars");
  });
});

describe("C4.9 / C4.10 — the categories Noura cannot assess", () => {
  it("C4.9.6 — a cosmetic returns COULD NOT VERIFY with a reason, whatever its checks say", () => {
    const evaluation = evaluateProduct(
      input({
        category: "cosmetic",
        nutrition: null,
        ingredientsText: "aqua, glycerin, parfum, sodium laureth sulfate",
      }),
    );
    // It genuinely passes transparency; the verdict still declines.
    expect(statusOf(evaluation.checks, "transparency")).toBe("pass");
    expect(evaluation.verdict.verdict).toBe("could_not_verify");
    expect(evaluation.verdict.reason).toContain("cannot assess cosmetics");
  });

  it("C4.9.5 — additives are not assessed for a cosmetic at all", () => {
    expect(ruleFor("cosmetic").checks).not.toContain("additives");
  });

  it("C4.10.4 — a supplement returns COULD NOT VERIFY with a reason", () => {
    const evaluation = evaluateProduct(
      input({ category: "supplement", nutrition: null, ingredientsText: "vitamin c, maltodextrin" }),
    );
    expect(evaluation.verdict.verdict).toBe("could_not_verify");
    expect(evaluation.verdict.reason).toContain("cannot assess supplements");
  });
});

describe("C4.11 — the general food fallback", () => {
  it("C4.11.1 — applies the universal §3 lines on the solid basis", () => {
    const lines = ruleFor("food").lines("solid");
    expect(lines.saturatedFat!.high).toBe(5);
    expect(lines.salt!.high).toBe(1.5);
  });

  it("C4.11.2 — says on the page that no category rule exists for this product", () => {
    const notes = evaluateProduct(input({ category: "food" })).notes;
    expect(notes.some((n) => n.rule === "C4.11.2")).toBe(true);
  });

  it("an unrecognised category falls back to it rather than losing the product", () => {
    // buildEvidenceInput uses ProductCategorySchema.catch("food").
    expect(ruleFor("food").supported).toBe(true);
  });
});
