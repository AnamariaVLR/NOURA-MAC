/**
 * Added sugar vs total sugars.
 *
 * The rule under test, stated once: total sugars never establishes added sugar.
 * Lactose in plain milk, lactose in plain yoghurt and fructose in fruit are all
 * sugar that nobody added, and a rubric that cannot tell the difference converts
 * missing evidence into a negative claim.
 */
import { describe, expect, it } from "vitest";
import {
  ADDED_SUGAR_TERMS,
  coherentAddedSugars,
  detectAddedSugarIngredients,
  resolveAddedSugar,
} from "@/lib/health/added-sugar";
import { evaluateChecks, type EvidenceInput } from "@/lib/health/checks";
import { evaluateProduct } from "@/lib/health/evaluate";
import type { NutritionFacts } from "@/lib/schemas";

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
    nutrition: nutrition(),
    novaGroup: null,
    additives: [],
    allergens: [],
    ingredientsText: null,
    certifications: [],
    evidenceSource: source,
    ...overrides,
  };
}

const addedSugarCheck = (over: Partial<EvidenceInput> = {}) =>
  evaluateChecks(input(over)).find((c) => c.key === "addedSugars")!;

describe("plain, unflavoured milk", () => {
  // Real shape of the Al Rawabi low-fat milk record: lactose in the panel, a
  // published added-sugar figure of zero, and no ingredient list.
  const milk = input({
    category: "drink",
    nutrition: nutrition({
      basis: "per_100ml",
      energyKcal: 43,
      carbohydratesG: 4.8,
      sugarsG: 3.2,
      addedSugarsG: 0,
      fatG: 1.2,
      saturatedFatG: 0.9,
      proteinG: 3,
    }),
    ingredientsText: null,
  });

  it("does not fail the added-sugar check on lactose", () => {
    expect(addedSugarCheck(milk).status).not.toBe("fail");
  });

  it("passes on the published figure of zero, and says that is the basis", () => {
    const check = addedSugarCheck(milk);
    expect(check.status).toBe("pass");
    expect(check.claim).toBe("No added sugar");
    expect(check.evidence.value).toMatch(/published figure/);
  });

  it("still reports the total sugars, as a separate fact", () => {
    expect(addedSugarCheck(milk).detail).toMatch(/Total sugars are 3.2 g per 100 ml/);
  });

  it("is never disqualifying", () => {
    expect(addedSugarCheck(milk).disqualifying).toBeUndefined();
  });

  it("passes on the ingredient list alone when no figure is published", () => {
    const check = addedSugarCheck({
      ...milk,
      nutrition: nutrition({ basis: "per_100ml", sugarsG: 3.2, addedSugarsG: null }),
      ingredientsText: "Fresh cow's milk, vitamin A, vitamin D3",
    });
    expect(check.status).toBe("pass");
    expect(check.evidence.value).toMatch(/ingredient list/);
  });
});

describe("plain yoghurt and whole fruit — the same rule, no special case", () => {
  it("passes plain yoghurt whose list names no sweetener", () => {
    expect(
      addedSugarCheck({
        nutrition: nutrition({ sugarsG: 6.3, addedSugarsG: null }),
        ingredientsText: "Fresh cow's milk, Milk powder, Stabilizer (E440), Probiotic culture",
      }).status,
    ).toBe("pass");
  });

  it("passes whole fruit despite a high total-sugar figure", () => {
    // Dates: ~63 g of sugar per 100 g, none of it added by anyone.
    const check = addedSugarCheck({
      nutrition: nutrition({ sugarsG: 63, carbohydratesG: 75, addedSugarsG: null }),
      ingredientsText: "Dates",
    });
    expect(check.status).toBe("pass");
    expect(check.disqualifying).toBeUndefined();
  });

  it("passes an oat drink whose sugars come from starch, not a sugar bag", () => {
    expect(
      addedSugarCheck({
        category: "drink",
        nutrition: nutrition({ basis: "per_100ml", sugarsG: 3.4, addedSugarsG: null }),
        ingredientsText: "water, oats 10%, sea salt",
      }).status,
    ).toBe("pass");
  });
});

describe("flavoured milk and flavoured yoghurt", () => {
  it("fails flavoured milk whose list names sugar", () => {
    const check = addedSugarCheck({
      category: "drink",
      nutrition: nutrition({ basis: "per_100ml", sugarsG: 9.5, addedSugarsG: null }),
      ingredientsText: "Fresh cow's milk, sugar, cocoa powder, stabiliser (E407), flavouring",
    });
    expect(check.status).toBe("fail");
    expect(check.claim).toMatch(/Contains added sugar/);
  });

  it("fails flavoured yoghurt, and quotes the quantity when one is published", () => {
    const check = addedSugarCheck({
      nutrition: nutrition({ sugarsG: 13, addedSugarsG: 9.75 }),
      ingredientsText: "Skimmed yoghurt, sugar, mango puree, mango, water, modified starch",
    });
    expect(check.status).toBe("fail");
    expect(check.evidence.value).toBe("9.8 g per 100 g");
  });

  it("separates the two milks purely on the ingredient list, not on total sugars", () => {
    const panel = nutrition({ basis: "per_100ml", sugarsG: 9.5, addedSugarsG: null });
    const plain = addedSugarCheck({
      category: "drink",
      nutrition: panel,
      ingredientsText: "Fresh cow's milk",
    });
    const flavoured = addedSugarCheck({
      category: "drink",
      nutrition: panel,
      ingredientsText: "Fresh cow's milk, sugar, cocoa",
    });
    // Identical nutrition panels, opposite conclusions.
    expect(plain.status).toBe("pass");
    expect(flavoured.status).toBe("fail");
  });
});

describe("products with explicit added sugar", () => {
  it("fails on a published added-sugar figure above zero", () => {
    const check = addedSugarCheck({
      category: "drink",
      nutrition: nutrition({ basis: "per_100ml", sugarsG: 10.6, addedSugarsG: 10.6 }),
      ingredientsText: "carbonated water, sugar, colour (caramel e150d), acid (phosphoric acid)",
    });
    expect(check.status).toBe("fail");
    expect(check.evidence.value).toBe("10.6 g per 100 ml");
  });

  it("fails on a sweetener named in another language", () => {
    for (const list of [
      "Eau, sucre, fructose, acidifiants",
      "Riz (47%), blé complet (37%), sucre, orge (5%)",
      "Harina de trigo, azúcar, aceite de girasol",
      "Wasser, Zucker, Säuerungsmittel",
    ]) {
      expect(addedSugarCheck({ ingredientsText: list }).status).toBe("fail");
    }
  });

  it("fails on syrups and honey, not just the word sugar", () => {
    for (const list of [
      "Oats, honey, sunflower oil",
      "Water, high fructose corn syrup, citric acid",
      "Puffed rice, barley malt extract, salt",
      "Almonds, date syrup, sea salt",
    ]) {
      expect(addedSugarCheck({ ingredientsText: list }).status).toBe("fail");
    }
  });

  it("disqualifies only a known quantity clearly past the high mark", () => {
    // Food high mark is 22.5 g; the margin puts the disqualifier at 23.625 g.
    const under = addedSugarCheck({
      nutrition: nutrition({ sugarsG: 30, addedSugarsG: 23 }),
      ingredientsText: "wheat flour, sugar",
    });
    const over = addedSugarCheck({
      nutrition: nutrition({ sugarsG: 60, addedSugarsG: 55 }),
      ingredientsText: "wheat flour, sugar",
    });
    expect(under.disqualifying).toBeUndefined();
    expect(over.disqualifying).toBe(true);
  });

  it("cannot disqualify on presence alone, with no quantity to judge", () => {
    const check = addedSugarCheck({
      nutrition: nutrition({ sugarsG: 60, addedSugarsG: null }),
      ingredientsText: "wheat flour, sugar, salt",
    });
    expect(check.status).toBe("fail");
    expect(check.disqualifying).toBeUndefined();
  });
});

describe("products where added-sugar information is unavailable", () => {
  it("returns unknown when there is no ingredient list and no figure", () => {
    const check = addedSugarCheck({
      category: "drink",
      nutrition: nutrition({ basis: "per_100ml", sugarsG: 0, addedSugarsG: null }),
      ingredientsText: null,
    });
    expect(check.status).toBe("unknown");
    expect(check.evidence.value).toBe("unknown");
  });

  it("returns unknown when there is no nutrition panel at all", () => {
    expect(addedSugarCheck({ nutrition: null, ingredientsText: null }).status).toBe("unknown");
  });

  it("returns unknown rather than guessing from a high total-sugar figure", () => {
    const check = addedSugarCheck({
      nutrition: nutrition({ sugarsG: 45, addedSugarsG: null }),
      ingredientsText: null,
    });
    expect(check.status).toBe("unknown");
    expect(check.detail).toMatch(/sugar figure alone cannot answer it/);
  });

  it("does not treat a scrap of text as a published ingredient list", () => {
    expect(addedSugarCheck({ ingredientsText: "n/a" }).status).toBe("unknown");
  });

  it("never renders an unknown as a pass", () => {
    const check = addedSugarCheck({ nutrition: null, ingredientsText: null });
    expect(check.status).not.toBe("pass");
    expect(check.evidence.value).toBe("unknown");
  });
});

describe("total sugars never decides the check", () => {
  it("gives the same answer at 0 g and 60 g of total sugars, given the same list", () => {
    const withList = (sugarsG: number) =>
      addedSugarCheck({ nutrition: nutrition({ sugarsG }), ingredientsText: "oats, water, salt" }).status;
    expect(withList(0)).toBe("pass");
    expect(withList(60)).toBe("pass");
  });

  it("gives the same answer at 0 g and 60 g of total sugars, given no evidence", () => {
    const noEvidence = (sugarsG: number) =>
      addedSugarCheck({ nutrition: nutrition({ sugarsG }), ingredientsText: null }).status;
    expect(noEvidence(0)).toBe("unknown");
    expect(noEvidence(60)).toBe("unknown");
  });
});

describe("coherentAddedSugars", () => {
  it("discards a figure larger than total sugars, which is impossible", () => {
    // The real Kellogg's Corn Flakes record: 16.61 g added against 8 g total.
    expect(coherentAddedSugars(nutrition({ sugarsG: 8, addedSugarsG: 16.61 }))).toBeNull();
  });

  it("tolerates rounding between two independently entered fields", () => {
    expect(coherentAddedSugars(nutrition({ sugarsG: 3, addedSugarsG: 3.12 }))).toBe(3.12);
  });

  it("never reads an absent figure as zero", () => {
    expect(coherentAddedSugars(nutrition({ sugarsG: 5, addedSugarsG: null }))).toBeNull();
    expect(coherentAddedSugars(null)).toBeNull();
  });

  it("accepts a zero figure as a real datum", () => {
    expect(coherentAddedSugars(nutrition({ sugarsG: 3.2, addedSugarsG: 0 }))).toBe(0);
  });

  it("accepts a figure when total sugars is itself unknown", () => {
    expect(coherentAddedSugars(nutrition({ sugarsG: null, addedSugarsG: 4 }))).toBe(4);
  });
});

describe("detectAddedSugarIngredients", () => {
  it("does not match caramel colouring", () => {
    expect(detectAddedSugarIngredients("carbonated water, colour (caramel e150d), acid").kind).toBe(
      "absent",
    );
  });

  it("does not match lactose, the sugar this whole module exists to protect", () => {
    expect(ADDED_SUGAR_TERMS).not.toContain("lactose");
    expect(detectAddedSugarIngredients("milk solids, lactose, cultures").kind).toBe("absent");
  });

  it("does not match a bare malt flavouring, but does match malt extract", () => {
    expect(detectAddedSugarIngredients("corn, aroma of malt of barley, salt").kind).toBe("absent");
    expect(detectAddedSugarIngredients("wheat bran, barley malt extract, salt").kind).toBe("present");
  });

  it("does not match sugar inside a negation", () => {
    for (const list of [
      "Oat base (water, oats), no added sugar, sea salt",
      "Tea extract, sugar-free sweetener blend",
      "Milk, unsweetened cocoa",
      "Eau, thé, sans sucres ajoutés",
      "Leche, sin azúcares añadidos",
    ]) {
      expect(detectAddedSugarIngredients(list).kind).toBe("absent");
    }
  });

  it("does not match a sugar term inside a longer word", () => {
    expect(detectAddedSugarIngredients("water, sugarcanelike flavour compound").kind).toBe("absent");
  });

  it("reports which terms it found", () => {
    const result = detectAddedSugarIngredients("water, sugar, honey, salt");
    expect(result.kind).toBe("present");
    if (result.kind === "present") {
      expect(result.terms).toContain("sugar");
      expect(result.terms).toContain("honey");
    }
  });

  it("distinguishes no list from a list with nothing in it", () => {
    expect(detectAddedSugarIngredients(null).kind).toBe("no-list");
    expect(detectAddedSugarIngredients("").kind).toBe("no-list");
    expect(detectAddedSugarIngredients("water, oats, salt").kind).toBe("absent");
  });
});

describe("resolveAddedSugar — which evidence wins", () => {
  it("lets the ingredient list override a zero figure", () => {
    // The real All-Bran record: the list names sugar, the figure claims zero.
    const resolved = resolveAddedSugar(
      nutrition({ sugarsG: 18, addedSugarsG: 0 }),
      "Wheat bran (86%), sugar, barley malt extract, salt",
    );
    expect(resolved.state).toBe("present");
    expect(resolved.basis).toBe("ingredient-list-over-figure");
  });

  it("declines to conclude when a clean list meets a positive figure", () => {
    const resolved = resolveAddedSugar(
      nutrition({ sugarsG: 10, addedSugarsG: 6 }),
      "Fresh cow's milk, cultures",
    );
    expect(resolved.state).toBe("unknown");
    expect(resolved.basis).toBe("conflicting-evidence");
  });

  it("falls back to the figure when there is no list", () => {
    expect(resolveAddedSugar(nutrition({ sugarsG: 3.2, addedSugarsG: 0 }), null).basis).toBe(
      "published-figure",
    );
  });

  it("concludes nothing when there is nothing", () => {
    const resolved = resolveAddedSugar(nutrition({ sugarsG: 9 }), null);
    expect(resolved.state).toBe("unknown");
    expect(resolved.basis).toBe("no-evidence");
    expect(resolved.grams).toBeNull();
  });
});

describe("unknown still never counts as passed", () => {
  it("excludes an unknown added-sugar check from the verdict arithmetic", () => {
    const evaluation = evaluateProduct(
      input({
        category: "drink",
        nutrition: nutrition({ basis: "per_100ml", sugarsG: 0, addedSugarsG: null }),
        ingredientsText: null,
      }),
    );
    expect(evaluation.checks.find((c) => c.key === "addedSugars")!.status).toBe("unknown");
    expect(evaluation.verdict.counts.known).toBe(
      evaluation.checks.filter((c) => c.status !== "unknown").length,
    );
    expect(evaluation.unknowns.join(" ")).toMatch(/Added sugar/);
  });

  it("never returns a passing added-sugar check whose evidence reads unknown", () => {
    const panels = [null, nutrition(), nutrition({ sugarsG: 5 }), nutrition({ addedSugarsG: 0 })];
    const lists = [null, "", "n/a", "water, oats", "water, sugar"];
    for (const nutritionCase of panels) {
      for (const ingredientsText of lists) {
        const check = addedSugarCheck({ nutrition: nutritionCase, ingredientsText });
        if (check.status === "pass") expect(check.evidence.value).not.toBe("unknown");
      }
    }
  });
});
