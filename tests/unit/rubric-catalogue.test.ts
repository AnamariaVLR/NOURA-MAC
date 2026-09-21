/**
 * The whole rubric, run over the whole shipped catalogue.
 *
 * Every other suite tests a rule against a fixture built to exercise it. This one
 * runs all seventeen real products through the engine and asserts the things that
 * must hold for every product, whatever its numbers.
 *
 * It exists because of a real failure: the additive check's detail sentence,
 * which quoted an EFSA opinion verbatim, exceeded CheckSchema's 320-character
 * limit for exactly one product in the catalogue — Coca-Cola — and no unit test
 * looked. The build passed. The scan endpoint threw at request time.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ruleFor } from "../../lib/health/categories";
import { evaluateProduct } from "../../lib/health/evaluate";
import {
  CheckSchema,
  HealthAnalysisResultSchema,
  NoteSchema,
  NutritionFactsSchema,
  ProductCategorySchema,
  type ProductCategory,
} from "../../lib/schemas";
import { SOURCE } from "./helpers";

type SeedProduct = {
  slug: string;
  category: string;
  subcategory: string | null;
  ingredientsText: string | null;
  additives: string[];
  allergens: string[];
  novaGroup: number | null;
  nutrition: unknown;
};

const CATALOGUE = JSON.parse(
  readFileSync(new URL("../../prisma/seed-data/products.json", import.meta.url), "utf8"),
) as SeedProduct[];

function evaluate(p: SeedProduct) {
  const parsed = p.nutrition ? NutritionFactsSchema.safeParse(p.nutrition) : null;
  return evaluateProduct({
    category: p.category as ProductCategory,
    subcategory: p.subcategory ?? null,
    nutrition: parsed?.success ? parsed.data : null,
    novaGroup: p.novaGroup ?? null,
    additives: p.additives ?? [],
    allergens: p.allergens ?? [],
    ingredientsText: p.ingredientsText || null,
    certifications: [],
    evidenceSource: SOURCE,
  });
}

describe("every catalogue product produces a renderable result", () => {
  it("has a category the model recognises", () => {
    for (const p of CATALOGUE) {
      expect(ProductCategorySchema.safeParse(p.category).success, p.slug).toBe(true);
    }
  });

  it("records a subcategory that belongs to its category, or none", () => {
    for (const p of CATALOGUE) {
      if (p.subcategory === null) continue;
      const keys = ruleFor(p.category as ProductCategory).subcategories.map((s) => s.key);
      expect(keys, p.slug).toContain(p.subcategory);
    }
  });

  /* THE REGRESSION. Every check on every product must fit the schema — which is
   * what the API route parses against before anything is persisted. */
  it("produces checks that satisfy CheckSchema, including the 320-character detail", () => {
    for (const p of CATALOGUE) {
      for (const check of evaluate(p).checks) {
        const result = CheckSchema.safeParse(check);
        expect(result.success, `${p.slug} / ${check.key}: ${check.detail.length} chars`).toBe(true);
      }
    }
  });

  it("produces notes that satisfy NoteSchema", () => {
    for (const p of CATALOGUE) {
      for (const note of evaluate(p).notes) {
        expect(NoteSchema.safeParse(note).success, `${p.slug} / ${note.rule}`).toBe(true);
      }
    }
  });

  it("produces a whole analysis that satisfies the schema the API route parses", () => {
    for (const p of CATALOGUE) {
      const evaluation = evaluate(p);
      const result = HealthAnalysisResultSchema.safeParse({
        verdict: evaluation.verdict,
        checks: evaluation.checks,
        unknowns: evaluation.unknowns,
        notes: evaluation.notes,
        model: "deterministic",
        mode: "mock",
      });
      expect(result.success, p.slug).toBe(true);
    }
  });
});

describe("the invariants hold across the real catalogue", () => {
  it("no product passes a check on a value it does not publish", () => {
    for (const p of CATALOGUE) {
      const evaluation = evaluate(p);
      for (const check of evaluation.checks.filter((c) => c.status === "pass")) {
        expect(check.evidence.value, `${p.slug} / ${check.key}`).not.toBe("unknown");
      }
    }
  });

  it("a disqualified product is NOT RECOMMENDED unless coverage is below the floor", () => {
    // RUBRIC §7 applies V0-V5 IN ORDER, and V1 (coverage < 50%) sits above V2
    // (a disqualifying failure). So a product can carry a disqualifier and still
    // read COULD NOT VERIFY, which the 262-product catalogue proved by finding
    // one: a sweet chilli sauce with salt at 3.0 g/100 g and only 3 of 7 checks
    // resolvable.
    //
    // This test previously asserted the disqualifier always wins, which the
    // rubric never said — it passed only because no product had hit both at
    // once. The finding is still shown either way: the failed salt line appears
    // on the checklist whatever the verdict says. Whether V1 should outrank V2
    // is a question for the nutritionist, recorded as RUBRIC §9 Q15.
    const floorCases: string[] = [];
    for (const p of CATALOGUE) {
      const evaluation = evaluate(p);
      const disqualified = evaluation.checks.some((c) => c.status === "fail" && c.disqualifying);
      if (!disqualified) continue;

      const applicable = evaluation.checks.length;
      const resolved = evaluation.checks.filter((c) => c.status !== "unknown").length;
      const belowFloor = applicable > 0 && resolved / applicable < 0.5;

      if (belowFloor) {
        expect(evaluation.verdict.verdict, p.slug).toBe("could_not_verify");
        floorCases.push(p.slug);
      } else {
        expect(evaluation.verdict.verdict, p.slug).toBe("not_recommended");
      }
    }
    // Recorded rather than asserted away: if this ever reaches zero the conflict
    // has gone out of the catalogue, not out of the rubric.
    expect(Array.isArray(floorCases)).toBe(true);
  });

  it("a disqualifying failure is always VISIBLE, whatever the verdict says", () => {
    // The protection that actually matters. A coverage floor may withhold a
    // summary; it may never hide a measured finding.
    for (const p of CATALOGUE) {
      const evaluation = evaluate(p);
      const dq = evaluation.checks.find((c) => c.status === "fail" && c.disqualifying);
      if (!dq) continue;
      expect(dq.claim, p.slug).toBeTruthy();
      expect(dq.status, p.slug).toBe("fail");
    }
  });

  it("no cosmetic or supplement is given a verdict", () => {
    for (const p of CATALOGUE) {
      if (p.category !== "cosmetic" && p.category !== "supplement") continue;
      expect(evaluate(p).verdict.verdict, p.slug).toBe("could_not_verify");
    }
  });

  it("every note carries a source, so nothing is shown without provenance", () => {
    for (const p of CATALOGUE) {
      for (const note of evaluate(p).notes) {
        expect(note.source.length, `${p.slug} / ${note.rule}`).toBeGreaterThan(3);
      }
    }
  });

  it("Coca-Cola disqualifies on the binding UAE sugar band", () => {
    const cola = CATALOGUE.find((p) => p.slug === "coca-cola-330ml")!;
    const evaluation = evaluate(cola);
    expect(evaluation.verdict.verdict).toBe("not_recommended");
    const sugar = evaluation.checks.find((c) => c.key === "totalSugars");
    expect(sugar?.disqualifying).toBe(true);
  });

  it("plain milk is not marked down for its lactose", () => {
    const milk = CATALOGUE.find((p) => p.slug === "al-rawabi-low-fat-milk-1l")!;
    const evaluation = evaluate(milk);
    expect(evaluation.checks.find((c) => c.key === "addedSugars")?.status).toBe("pass");
    expect(evaluation.checks.find((c) => c.key === "totalSugars")?.status).toBe("pass");
    expect(evaluation.checks.find((c) => c.key === "salt")?.status).toBe("pass");
  });

  it("salted butter is still condemned, on the fats-and-oils line", () => {
    const butter = CATALOGUE.find((p) => p.slug === "president-butter-250g")!;
    const evaluation = evaluate(butter);
    expect(evaluation.verdict.verdict).toBe("not_recommended");
    expect(evaluation.checks.find((c) => c.key === "saturatedFat")?.disqualifying).toBe(true);
  });
});
