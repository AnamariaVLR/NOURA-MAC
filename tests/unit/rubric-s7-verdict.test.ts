/**
 * RUBRIC.md §7 — Verdict mapping.
 *
 * V0 to V5, in the order they are applied, plus §7.1's two disqualifiers. Every
 * number here is POLICY and the tests say so: no retrieved scheme maps a pass
 * count to a verdict, and §9 Q7 still asks a nutritionist to set these.
 */
import { describe, expect, it } from "vitest";
import { VERDICT_LABEL, isVerified, verdictFor } from "@/lib/health/verdict";
import {
  ACCEPTABLE_PASS_RATE,
  GOOD_CHOICE_PASS_RATE,
  MIN_COVERAGE,
  MIN_KNOWN_FOR_GOOD_CHOICE,
} from "@/lib/health/rubric";
import { ruleFor } from "@/lib/health/categories";
import { VerdictResultSchema, type Check, type CheckStatus } from "@/lib/schemas";

const source = { name: "Open Food Facts", url: null, lastVerifiedAt: "2026-01-01T00:00:00.000Z" };

let seq = 0;
function check(status: CheckStatus, over: Partial<Check> = {}): Check {
  seq += 1;
  return {
    key: over.key ?? `dimension_${seq}`,
    label: "Dimension",
    status,
    claim: "A claim about the product",
    detail: "Some detail about the claim.",
    evidence: { label: "Dimension", value: status === "unknown" ? "unknown" : "1 g per 100 g" },
    source,
    ...over,
  };
}

/** n checks of each status, in one list. */
function list(pass: number, fail: number, unknown = 0): Check[] {
  return [
    ...Array.from({ length: pass }, () => check("pass")),
    ...Array.from({ length: fail }, () => check("fail")),
    ...Array.from({ length: unknown }, () => check("unknown")),
  ];
}

describe("the four verdicts", () => {
  it("has a display label for each", () => {
    expect(VERDICT_LABEL.good_choice).toBe("VERIFIED — GOOD CHOICE");
    expect(VERDICT_LABEL.acceptable).toBe("VERIFIED — ACCEPTABLE");
    expect(VERDICT_LABEL.not_recommended).toBe("NOT RECOMMENDED");
    expect(VERDICT_LABEL.could_not_verify).toBe("COULD NOT VERIFY");
  });

  it("counts only the two VERIFIED verdicts as something we stand behind", () => {
    expect(isVerified("good_choice")).toBe(true);
    expect(isVerified("acceptable")).toBe(true);
    expect(isVerified("not_recommended")).toBe(false);
    expect(isVerified("could_not_verify")).toBe(false);
  });

  it("returns a result that satisfies the schema", () => {
    expect(VerdictResultSchema.safeParse(verdictFor(list(4, 2, 1))).success).toBe(true);
  });
});

describe("rule 0-1 — not enough evidence", () => {
  it("returns COULD NOT VERIFY when there are no checks at all", () => {
    expect(verdictFor([]).verdict).toBe("could_not_verify");
  });

  it("returns COULD NOT VERIFY when every check is unknown", () => {
    const result = verdictFor(list(0, 0, 5));
    expect(result.verdict).toBe("could_not_verify");
    expect(result.counts.known).toBe(0);
  });

  it("returns COULD NOT VERIFY below the coverage floor, even with a perfect pass rate", () => {
    const result = verdictFor(list(3, 0, 5));
    expect(result.coverage).toBeLessThan(MIN_COVERAGE);
    expect(result.passRate).toBe(1);
    expect(result.verdict).toBe("could_not_verify");
  });

  it("clears the coverage floor exactly at the boundary", () => {
    const result = verdictFor(list(4, 0, 4));
    expect(result.coverage).toBe(MIN_COVERAGE);
    expect(result.verdict).not.toBe("could_not_verify");
  });
});

describe("rule 2 — disqualifying failures override everything", () => {
  it("returns NOT RECOMMENDED when a disqualifying check failed, whatever else passed", () => {
    const checks = [
      ...list(7, 0),
      check("fail", { key: "saturatedFat", claim: "High saturated fat", disqualifying: true }),
    ];
    const result = verdictFor(checks);
    expect(result.passRate).toBeGreaterThan(GOOD_CHOICE_PASS_RATE);
    expect(result.verdict).toBe("not_recommended");
  });

  it("explains itself with the disqualifying claim, not the tally", () => {
    const checks = [
      ...list(5, 0),
      check("fail", {
        key: "certification",
        claim: "Its EQM certificate is suspended",
        disqualifying: true,
      }),
    ];
    expect(verdictFor(checks).reason).toBe("Its EQM certificate is suspended");
  });

  it("ignores a disqualifying flag on a check that did not fail", () => {
    const checks = [...list(5, 1), check("pass", { disqualifying: true })];
    expect(verdictFor(checks).verdict).not.toBe("not_recommended");
  });

  it("does not let a disqualifier bypass the coverage floor", () => {
    const checks = [check("fail", { disqualifying: true }), ...list(0, 0, 7)];
    expect(verdictFor(checks).verdict).toBe("could_not_verify");
  });
});

describe("rules 3-5 — pass rate", () => {
  it("returns GOOD CHOICE at or above the good-choice pass rate", () => {
    const result = verdictFor(list(8, 2));
    expect(result.passRate).toBe(GOOD_CHOICE_PASS_RATE);
    expect(result.verdict).toBe("good_choice");
  });

  it("returns ACCEPTABLE between the two rates", () => {
    expect(verdictFor(list(5, 5)).verdict).toBe("acceptable");
    expect(verdictFor(list(7, 3)).verdict).toBe("acceptable");
  });

  it("returns NOT RECOMMENDED below the acceptable rate", () => {
    const result = verdictFor(list(4, 6));
    expect(result.passRate).toBeLessThan(ACCEPTABLE_PASS_RATE);
    expect(result.verdict).toBe("not_recommended");
  });

  it("is monotonic: turning a failure into a pass never makes the verdict worse", () => {
    const rank = { could_not_verify: 0, not_recommended: 1, acceptable: 2, good_choice: 3 };
    let previous = -1;
    for (let passed = 0; passed <= 8; passed++) {
      const current = rank[verdictFor(list(passed, 8 - passed)).verdict];
      expect(current).toBeGreaterThanOrEqual(previous);
      previous = current;
    }
  });
});

describe("GOOD CHOICE needs a minimum of evidence, not just a high ratio", () => {
  it("withholds GOOD CHOICE when too few checks were actually made", () => {
    const result = verdictFor(list(2, 0, 1));
    expect(result.passRate).toBe(1);
    expect(result.counts.known).toBeLessThan(MIN_KNOWN_FOR_GOOD_CHOICE);
    expect(result.verdict).toBe("acceptable");
  });

  it("grants GOOD CHOICE once the minimum is met", () => {
    expect(verdictFor(list(MIN_KNOWN_FOR_GOOD_CHOICE, 0)).verdict).toBe("good_choice");
  });
});

describe("the arithmetic excludes unknowns from the pass rate", () => {
  it("gives the same verdict whether or not unknown checks are present", () => {
    const withoutUnknowns = verdictFor(list(4, 1));
    const withUnknowns = verdictFor(list(4, 1, 3));
    expect(withUnknowns.passRate).toBe(withoutUnknowns.passRate);
    expect(withUnknowns.verdict).toBe(withoutUnknowns.verdict);
  });

  it("counts unknowns against coverage but never against the pass rate", () => {
    const result = verdictFor(list(4, 1, 3));
    expect(result.counts).toEqual({ applicable: 8, passed: 4, failed: 1, unknown: 3, known: 5 });
    expect(result.passRate).toBe(0.8);
    expect(result.coverage).toBe(0.63);
  });

  it("mentions the unchecked dimensions in its reason", () => {
    expect(verdictFor(list(4, 1, 3)).reason).toMatch(/3 could not be checked/);
    expect(verdictFor(list(4, 1)).reason).not.toMatch(/could not/);
  });
});


/* ===========================================================================
 * V0 — D12, the categories Noura declines to judge at all.
 * ========================================================================= */
describe("V0 — an unsupported category declines before any arithmetic", () => {
  it("cosmetics return COULD NOT VERIFY even on a perfect pass rate", () => {
    const result = verdictFor(list(4, 0), ruleFor("cosmetic"));
    expect(result.verdict).toBe("could_not_verify");
    expect(result.reason).toContain("cannot assess cosmetics");
  });

  it("supplements do the same", () => {
    const result = verdictFor(list(5, 0), ruleFor("supplement"));
    expect(result.verdict).toBe("could_not_verify");
  });

  it("a supported category is unaffected by the new argument", () => {
    expect(verdictFor(list(4, 0), ruleFor("cereal")).verdict).toBe("good_choice");
    expect(verdictFor(list(4, 0)).verdict).toBe("good_choice");
  });

  it("the counts are still reported, so the page can show what was checked", () => {
    const result = verdictFor(list(2, 1), ruleFor("cosmetic"));
    expect(result.counts.known).toBe(3);
    expect(result.counts.applicable).toBe(3);
  });
});
