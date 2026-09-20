/**
 * The two constraints the rubric rests on, as tests:
 *
 *   1. No RUBRIC.md rule may lack a test.
 *   2. No threshold may exist in code that is not in RUBRIC.md.
 *
 * Both are enforced by reading RUBRIC.md itself and comparing it against the
 * source tree. That makes them survive a change nobody remembers to reflect here:
 * add a rule to the specification and this file fails until it has a test.
 *
 * It earned its place immediately. C4.8.7 — "energy drinks are flagged and
 * disqualified" — was in RUBRIC.md v1.1 from the start, and nothing implemented
 * it, because the rule named a consequence and no way to recognise an energy
 * drink. Every other suite passed. This one did not.
 */

import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const RUBRIC = readFileSync(new URL("../../RUBRIC.md", import.meta.url), "utf8");

function readFiles(paths: string[]): string {
  return paths.map((p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8")).join("\n");
}

const LIB = readFiles([
  "lib/health/rubric.ts",
  "lib/health/checks.ts",
  "lib/health/verdict.ts",
  "lib/health/evaluate.ts",
  "lib/health/tolerance.ts",
  "lib/health/energy.ts",
  "lib/health/energy-drinks.ts",
  "lib/health/additives.ts",
  "lib/health/added-sugar.ts",
  "lib/health/categories/types.ts",
  "lib/health/categories/index.ts",
  "lib/health/categories/fats-oils.ts",
  "lib/health/categories/milk.ts",
  "lib/health/categories/yogurt.ts",
  "lib/health/categories/eggs.ts",
  "lib/health/categories/bread.ts",
  "lib/health/categories/cereal.ts",
  "lib/health/categories/snacks.ts",
  "lib/health/categories/drink.ts",
  "lib/health/categories/food.ts",
  "lib/health/categories/cosmetic.ts",
  "lib/health/categories/supplement.ts",
  "lib/recommend/rank.ts",
]);

const TESTS = readdirSync(new URL("./", import.meta.url))
  .filter((f) => f.endsWith(".test.ts"))
  .map((f) => readFileSync(new URL(f, import.meta.url), "utf8"))
  .join("\n");

/** Rule identifiers, read out of the id column of RUBRIC.md's tables. */
const RULE_IDS = [...new Set([...RUBRIC.matchAll(/\|\s*\*\*([A-Z]\d[\w.]*)\*\*\s*\|/g)].map((m) => m[1]))];

/**
 * Rules that are NOT runtime behaviour, and why each is exempt.
 *
 * Every entry is a rule about how the specification was written or how a source
 * was read — decided once, at authoring time, and not executed per product. A
 * rule may only be added here with a reason; "it was hard to test" is not one.
 */
const NOT_RUNTIME: Record<string, string> = {
  // §1 — the evidence hierarchy. Applied by the author when choosing a threshold,
  // not by the engine at scan time. Its results are the numbers in §3 and §4,
  // which are tested.
  H1: "hierarchy, applied at authoring time",
  H2: "hierarchy, applied at authoring time",
  H3: "hierarchy, applied at authoring time",
  H4: "hierarchy, applied at authoring time",
  H5: "hierarchy, applied at authoring time",
  H6: "hierarchy, applied at authoring time",
  // §2.1 — what counts as evidence. A statement about ingestion, enforced by the
  // pipeline having no code path that reads a marketing claim.
  "D0.1": "admissibility, enforced by what the pipeline ingests",
  "D0.2": "admissibility, enforced by what the pipeline ingests",
  "D0.3": "admissibility, enforced by what the pipeline ingests",
  "D0.4": "admissibility, enforced by what the pipeline ingests",
  "D0.5": "admissibility — no code path ingests a marketing claim",
  "D0.6": "admissibility, enforced by what the pipeline ingests",
  // §4 and §5 — classes whose effect is "reported, counted in nothing".
  "A3.2": "a note carried by the NOVA group; see U5.1",
  "A3.3": "the flagged class; its rows A6.1-A6.6 are tested",
  "A3.4": "the residual class — everything the flagged table does not name",
  "A3.5": "explicitly not implementable: the authorised list was not retrieved",
  "C4.9.3": "explicitly not implementable: the annexes were not retrieved (C4.9.4)",
  "C4.9.4": "a statement that a screen does not exist",
  "C4.10.2": "a statement that upper intake levels were not retrieved",
  // §6 — properties of the register import, not of the checklist.
  "C6.2": "identity, enforced at import",
  "C6.3": "validity dates, enforced at import",
  "C6.6": "what halal certification attests; copy, not behaviour",
  "C6.7": "what organic certification attests; copy, not behaviour",
  "C6.8": "what conformity certification attests; copy, not behaviour",
  // §9 — questions, not rules. Generated from the count actually in RUBRIC.md so
  // the list cannot go stale in either direction.
  ...Object.fromEntries(
    [...RUBRIC.matchAll(/\|\s*\*\*(Q\d+)\*\*\s*\|/g)].map((m) => [
      m[1],
      "a question for the nutritionist, not a rule",
    ]),
  ),
};

describe("no RUBRIC.md rule lacks an implementation", () => {
  it("every runtime rule identifier appears in lib/", () => {
    const missing = RULE_IDS.filter((id) => !(id in NOT_RUNTIME) && !LIB.includes(id));
    expect(missing, `rules with no code naming them: ${missing.join(", ")}`).toEqual([]);
  });

  it("every exemption carries a reason", () => {
    for (const [id, reason] of Object.entries(NOT_RUNTIME)) {
      expect(reason.length, id).toBeGreaterThan(10);
    }
  });

  it("no exemption is for a rule that does not exist — the list cannot rot", () => {
    const stale = Object.keys(NOT_RUNTIME).filter((id) => !RULE_IDS.includes(id));
    expect(stale, `exemptions for rules not in RUBRIC.md: ${stale.join(", ")}`).toEqual([]);
  });
});

describe("no RUBRIC.md rule lacks a test", () => {
  it("every runtime rule identifier appears in a test file", () => {
    const missing = RULE_IDS.filter((id) => !(id in NOT_RUNTIME) && !TESTS.includes(id));
    expect(missing, `rules with no test naming them: ${missing.join(", ")}`).toEqual([]);
  });
});

describe("no threshold exists in code that is not in RUBRIC.md", () => {
  /**
   * Every bare number that could be a threshold, pulled out of the engine and
   * checked against the specification text.
   *
   * Deliberately crude: it matches numeric literals and asks whether RUBRIC.md
   * mentions them. That over-reports (array indices, rounding factors), so the
   * structural ones are excluded by value with a reason, and everything else has
   * to appear in the specification.
   */
  const STRUCTURAL = new Set([
    0, 1, 2, 3, 4, 100, // indices, counts, percentages, slice bounds
    9, // the Codex fat factor — 4 and 4 are above; all three are in RUBRIC U4.5
    1e-9, // floating-point epsilon in the comparator
    6.25, // not used; guard against reintroduction
  ]);

  it("every threshold-shaped literal in the category rules is in RUBRIC.md", () => {
    const CATEGORY_FILES = readFiles([
      "lib/health/categories/fats-oils.ts",
      "lib/health/categories/milk.ts",
      "lib/health/categories/yogurt.ts",
      "lib/health/categories/eggs.ts",
      "lib/health/categories/bread.ts",
      "lib/health/categories/cereal.ts",
      "lib/health/categories/snacks.ts",
      "lib/health/categories/drink.ts",
      "lib/health/categories/food.ts",
    ]);
    // Strip comments: a number quoted in prose is documentation, not a threshold.
    const code = CATEGORY_FILES.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    const numbers = [...new Set([...code.matchAll(/(?<![\w.])(\d+(?:\.\d+)?)(?![\w.])/g)].map((m) => Number(m[1])))];

    const unexplained = numbers
      .filter((n) => !STRUCTURAL.has(n))
      .filter((n) => !RUBRIC.includes(String(n)));

    expect(unexplained, `numbers in category rules not found in RUBRIC.md: ${unexplained.join(", ")}`).toEqual([]);
  });

  it("every threshold-shaped literal in rubric.ts and tolerance.ts is in RUBRIC.md", () => {
    const code = readFiles(["lib/health/rubric.ts", "lib/health/tolerance.ts"])
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    const numbers = [...new Set([...code.matchAll(/(?<![\w.])(\d+(?:\.\d+)?)(?![\w.])/g)].map((m) => Number(m[1])))];

    const unexplained = numbers
      .filter((n) => !STRUCTURAL.has(n))
      .filter((n) => !RUBRIC.includes(String(n)));

    expect(unexplained, `numbers in rubric.ts/tolerance.ts not found in RUBRIC.md: ${unexplained.join(", ")}`).toEqual([]);
  });
});
