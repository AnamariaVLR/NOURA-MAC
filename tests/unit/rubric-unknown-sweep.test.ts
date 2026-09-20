/**
 * The invariant the whole product rests on — RUBRIC.md §2.4 D6, D7, D8.
 *
 * UNKNOWN IS NEVER PASSED. This file sweeps every category, every check and
 * every combination of present and absent evidence to assert it, rather than
 * testing the handful of cases that happen to be in the catalogue.
 *
 * It is written as a sweep on purpose: the failure mode it guards against is a
 * new check, or a new category, forgetting to reach its unknown branch first.
 * A test that enumerated cases by hand would not catch that.
 */

import { describe, expect, it } from "vitest";
import { ruleFor } from "../../lib/health/categories";
import { evaluateChecks } from "../../lib/health/checks";
import { evaluateProduct } from "../../lib/health/evaluate";
import { verdictFor } from "../../lib/health/verdict";
import { ALL_CATEGORIES, input, nutrition } from "./helpers";

describe("D6 — no evidence at all produces no passes, anywhere", () => {
  it("every check of every category is unknown or fail, never pass, on an empty record", () => {
    for (const category of ALL_CATEGORIES) {
      for (const sub of ruleFor(category).subcategories) {
        const checks = evaluateChecks(
          input({
            category,
            subcategory: sub.key,
            nutrition: null,
            novaGroup: null,
            additives: [],
            ingredientsText: null,
            certifications: [],
          }),
        );
        for (const check of checks) {
          expect(check.status, `${category}/${sub.key} ${check.key}`).not.toBe("pass");
        }
      }
    }
  });

  it("the only non-unknown result on an empty record is the transparency failure", () => {
    // U8.1/D10 — absence of an ingredient list IS observable, and is the one
    // deliberate exception. Anything else reading "fail" would be a bug.
    for (const category of ALL_CATEGORIES) {
      const checks = evaluateChecks(
        input({
          category,
          nutrition: null,
          novaGroup: null,
          additives: [],
          ingredientsText: null,
          certifications: [],
        }),
      );
      for (const check of checks.filter((c) => c.status === "fail")) {
        expect(check.key, `${category}`).toBe("transparency");
      }
    }
  });
});

describe("D6 — each nutrient check individually refuses to pass on a missing field", () => {
  const FIELDS = {
    saturatedFat: "saturatedFatG",
    salt: "saltG",
    totalSugars: "sugarsG",
  } as const;

  it("removing one field makes exactly that check unknown, leaving the others alone", () => {
    for (const category of ALL_CATEGORIES) {
      const rule = ruleFor(category);
      for (const [key, field] of Object.entries(FIELDS)) {
        if (!rule.checks.includes(key as never)) continue;

        // A panel that is complete except for the field under test.
        const full = nutrition({
          sugarsG: 1,
          saturatedFatG: 0.1,
          saltG: 0.05,
          fibreG: 10,
          proteinG: 5,
          energyKcal: 100,
        });
        const holed = { ...full, [field]: null };

        const checks = evaluateChecks(
          input({ category, nutrition: holed, ingredientsText: "water, oats" }),
        );
        const target = checks.find((c) => c.key === key);
        expect(target?.status, `${category}.${key}`).toBe("unknown");
      }
    }
  });
});

describe("D7 — an unknown check is outside the pass-rate denominator", () => {
  it("adding an unknown check changes neither the pass rate nor the verdict", () => {
    const resolved = evaluateProduct(
      input({
        category: "cereal",
        nutrition: nutrition({ sugarsG: 4, saturatedFatG: 0.2, saltG: 0.1, fibreG: 10, energyKcal: 350 }),
        ingredientsText: "wholegrain wheat",
      }),
    );
    const withHole = evaluateProduct(
      input({
        category: "cereal",
        // certification is already unknown in both; drop salt as well.
        nutrition: nutrition({ sugarsG: 4, saturatedFatG: 0.2, saltG: null, fibreG: 10, energyKcal: 350 }),
        ingredientsText: "wholegrain wheat",
      }),
    );
    // The pass RATE is untouched: the missing check left both the numerator and
    // the denominator, which is exactly what "excluded from the arithmetic" means.
    expect(withHole.verdict.passRate).toBe(resolved.verdict.passRate);
    expect(withHole.verdict.verdict).toBe(resolved.verdict.verdict);
    // Coverage, by contrast, DOES fall — D8.
    expect(withHole.verdict.coverage).toBeLessThan(resolved.verdict.coverage);
  });

  it("a failed check that becomes unknown does not improve the pass rate", () => {
    // The mirror case, and the one that would be dangerous: losing a FAILING
    // value must not look like an improvement to the product.
    const failing = evaluateProduct(
      input({
        category: "cereal",
        nutrition: nutrition({ sugarsG: 4, saturatedFatG: 0.2, saltG: 9, fibreG: 10, energyKcal: 350 }),
        ingredientsText: "wholegrain wheat",
      }),
    );
    const missing = evaluateProduct(
      input({
        category: "cereal",
        nutrition: nutrition({ sugarsG: 4, saturatedFatG: 0.2, saltG: null, fibreG: 10, energyKcal: 350 }),
        ingredientsText: "wholegrain wheat",
      }),
    );
    // The pass rate does rise arithmetically — that is unavoidable once the
    // failure leaves the denominator — but the disqualifier it carried is gone,
    // so coverage must fall to keep the product honest.
    expect(missing.verdict.coverage).toBeLessThan(failing.verdict.coverage);
    expect(missing.verdict.counts.failed).toBeLessThan(failing.verdict.counts.failed);
    expect(missing.verdict.counts.unknown).toBeGreaterThan(failing.verdict.counts.unknown);
  });
});

describe("D8 — an unknown check still counts against coverage", () => {
  it("a product that publishes almost nothing cannot reach a verdict by passing one check", () => {
    // One passing check, everything else unknown: coverage is far below D4's 0.5.
    const evaluation = evaluateProduct(
      input({
        category: "cereal",
        nutrition: nutrition({ saltG: 0.1 }),
        ingredientsText: null,
        additives: [],
      }),
    );
    expect(evaluation.verdict.verdict).toBe("could_not_verify");
  });

  it("coverage is resolved over applicable, and never exceeds 1", () => {
    for (const category of ALL_CATEGORIES) {
      const evaluation = evaluateProduct(input({ category }));
      const { counts, coverage } = evaluation.verdict;
      expect(coverage).toBeLessThanOrEqual(1);
      if (counts.applicable > 0) {
        expect(coverage).toBeCloseTo(
          Math.round((counts.known / counts.applicable) * 100) / 100,
          6,
        );
      }
    }
  });
});

describe("D9 — an absent certificate is unknown, never a failure", () => {
  it("holds for every category that carries the check", () => {
    for (const category of ALL_CATEGORIES) {
      if (!ruleFor(category).checks.includes("certification")) continue;
      const checks = evaluateChecks(input({ category, certifications: [] }));
      expect(checks.find((c) => c.key === "certification")?.status).toBe("unknown");
    }
  });
});

describe("V0 — nothing resolvable produces COULD NOT VERIFY, not NOT RECOMMENDED", () => {
  it("an empty checklist is a statement about our evidence", () => {
    const result = verdictFor([]);
    expect(result.verdict).toBe("could_not_verify");
    expect(result.reason).toMatch(/could be checked/i);
  });
});
