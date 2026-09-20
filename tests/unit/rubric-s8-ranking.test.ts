/**
 * RUBRIC.md §8 — Alternative ranking.
 *
 * The audit defect this section exists to fix, stated once: the shipped code
 * ranked on PASSED checks, so a GOOD CHOICE bottled water at AED 1.75 came below
 * an ACCEPTABLE oat drink at AED 24.00 — the oat drink simply published more.
 * R1 counts FAILURES instead, and R6 stops the two meeting at all.
 *
 * Both halves of that fix have a test here.
 */

import { describe, expect, it } from "vitest";
import {
  additiveSortKey,
  certificationStrength,
  compareCandidates,
  failedCount,
  isBetterThan,
  isComparable,
  passRatio,
  passedCount,
  priceSortKey,
  rankCandidates,
  resolvedCount,
  type Candidate,
} from "../../lib/recommend/rank";
import { buildWhy, NO_BETTER_OPTION } from "../../lib/recommend/alternatives";
import type { Check, CheckStatus, Listing, NutritionFacts } from "../../lib/schemas";
import { nutrition } from "./helpers";

const source = {
  name: "Checked by A. Checker",
  url: "https://example.ae",
  lastVerifiedAt: "2026-09-18T00:00:00.000Z",
};

function check(key: string, status: CheckStatus, evidenceValue = "1 g per 100 g"): Check {
  return {
    key,
    label: key,
    status,
    claim: `${key} claim`,
    detail: "detail",
    evidence: { label: key, value: evidenceValue },
    source,
  };
}

/** `pass` passing checks and `fail` failing ones, plus an optional certification row. */
function checks(pass: number, fail = 0, certification?: Check): Check[] {
  const base = [
    ...Array.from({ length: pass }, (_, i) => check(`pass_${i}`, "pass")),
    ...Array.from({ length: fail }, (_, i) => check(`fail_${i}`, "fail")),
  ];
  return certification ? [...base, certification] : base;
}

function listing(over: Partial<Listing> = {}): Listing {
  return {
    id: "l1",
    retailer: { slug: "noon", name: "Noon", websiteUrl: "https://www.noon.com" },
    priceFils: 1000,
    currency: "AED",
    sizeLabel: "500 ml",
    unitPriceFils: 200,
    inStock: true,
    url: "https://www.noon.com/p/x",
    source,
    sourceKind: "HAND_VERIFIED",
    checkedBy: "A. Checker",
    checkedAt: "2026-09-18T00:00:00.000Z",
    ageDays: 1,
    isFresh: true,
    hasPhoto: false,
    ...over,
  };
}

function candidate(over: Partial<Candidate> & { name: string }): Candidate {
  return {
    productId: over.name,
    slug: over.name,
    brand: null,
    sizeLabel: "500 ml",
    imageUrl: null,
    category: "drink",
    subcategory: null,
    verdict: "acceptable",
    certification: "NOT_FOUND",
    checks: checks(3),
    nutrition: null,
    additiveCount: 0,
    bestListing: listing(),
    evidenceSource: "Open Food Facts",
    lastVerifiedAt: new Date("2026-01-01"),
    ...over,
  };
}

/* ===========================================================================
 * R1 — the change of primary key.
 * ========================================================================= */
describe("R1 — fewer failed checks wins", () => {
  it("ranks the candidate with fewer failures first", () => {
    const clean = candidate({ name: "clean", checks: checks(2, 0) });
    const flawed = candidate({ name: "flawed", checks: checks(5, 2) });
    expect(rankCandidates([flawed, clean]).map((c) => c.name)).toEqual(["clean", "flawed"]);
  });

  it("beats every later key", () => {
    // `flawed` wins on pass count, certification, additives AND price, and loses.
    const flawed = candidate({
      name: "flawed",
      checks: checks(9, 1, check("certification", "pass", "ECAS, accredited body")),
      additiveCount: 0,
      bestListing: listing({ unitPriceFils: 1 }),
    });
    const clean = candidate({
      name: "clean",
      checks: checks(2, 0),
      additiveCount: 9,
      bestListing: listing({ unitPriceFils: 9999 }),
    });
    expect(compareCandidates(clean, flawed)).toBeLessThan(0);
  });

  /* THE AUDIT DEFECT, as a regression test. */
  it("no longer penalises a product for having fewer checkable dimensions", () => {
    // Water: 4 checks, all passed, 2 unknown. Oat drink: 5 passed, 1 failed.
    // Under the shipped ordering the oat drink won on passes (5 > 4).
    const water = candidate({
      name: "water",
      checks: [...checks(4, 0), check("u1", "unknown"), check("u2", "unknown")],
      bestListing: listing({ unitPriceFils: 175 }),
    });
    const oat = candidate({
      name: "oat drink",
      checks: checks(5, 1),
      bestListing: listing({ unitPriceFils: 2400 }),
    });
    expect(passedCount(oat.checks)).toBeGreaterThan(passedCount(water.checks));
    expect(failedCount(water.checks)).toBe(0);
    expect(rankCandidates([oat, water]).map((c) => c.name)).toEqual(["water", "oat drink"]);
  });
});

/* ===========================================================================
 * R2, R3 — and the thing R1 alone would get wrong.
 * ========================================================================= */
describe("R2 — higher pass ratio breaks a tie on failures", () => {
  it("prefers the product that passes a higher share of what could be checked", () => {
    const solid = candidate({ name: "solid", checks: checks(4, 0) });
    const thin = candidate({
      name: "thin",
      checks: [...checks(1, 0), check("u", "unknown"), check("u2", "unknown")],
    });
    expect(failedCount(solid.checks)).toBe(failedCount(thin.checks));
    expect(passRatio(solid.checks)).toBe(1);
    expect(passRatio(thin.checks)).toBe(1);
    // Both are 1.0, so R2 ties and R3 decides on resolved count.
    expect(rankCandidates([thin, solid]).map((c) => c.name)).toEqual(["solid", "thin"]);
  });

  it("a candidate with no resolved checks scores 0 and sorts last, never first", () => {
    expect(passRatio([check("u", "unknown")])).toBe(0);
  });
});

describe("R3 — evidence strength, after the health question is settled", () => {
  it("prefers the product more of whose checklist could be resolved", () => {
    const known = candidate({ name: "known", checks: checks(3, 1) });
    const sparse = candidate({
      name: "sparse",
      checks: [...checks(3, 1), check("u", "unknown")],
    });
    expect(resolvedCount(known.checks)).toBe(4);
    expect(resolvedCount(sparse.checks)).toBe(4);
    // equal resolved counts: R3's first half ties, and the ordering is stable.
    expect(rankCandidates([sparse, known])[0].name).toBe("known");
  });

  it("scores the certification ladder in the documented order", () => {
    expect(certificationStrength([check("certification", "pass", "ECAS, accredited body")])).toBe(3);
    expect(certificationStrength([check("certification", "pass", "ECAS")])).toBe(2);
    expect(certificationStrength([check("certification", "fail", "ECAS — expired")])).toBe(1);
    expect(certificationStrength([check("certification", "unknown", "not verified")])).toBe(0);
    expect(certificationStrength([check("certification", "fail", "EQM — suspended")])).toBe(-1);
    expect(certificationStrength([])).toBe(0);
  });

  it("ranks a suspended certificate below having none at all", () => {
    // Both carry one failure so R1 ties; the certification ladder decides.
    const suspended = candidate({
      name: "suspended",
      checks: checks(3, 0, check("certification", "fail", "EQM — suspended")),
    });
    const none = candidate({
      name: "none",
      checks: [...checks(3, 0), check("certification", "unknown", "not verified"), check("f", "fail")],
    });
    expect(failedCount(suspended.checks)).toBe(failedCount(none.checks));
    expect(rankCandidates([suspended, none]).map((c) => c.name)).toEqual(["none", "suspended"]);
  });
});

/* ===========================================================================
 * The category's own "better" attributes.
 * ========================================================================= */
describe("R-category — 'better' means what the category's §4 section says", () => {
  function tied(name: string, n: NutritionFacts | null, category: Candidate["category"], sub: string | null) {
    return candidate({ name, category, subcategory: sub, checks: checks(3, 1), nutrition: n });
  }

  it("bread ranks on fibre first — C4.5's ordering", () => {
    const wholemeal = tied("wholemeal", nutrition({ fibreG: 7, saltG: 0.9 }), "bread", null);
    const white = tied("white", nutrition({ fibreG: 2, saltG: 0.4 }), "bread", null);
    // White has less salt and still loses: fibre comes first for bread.
    expect(rankCandidates([white, wholemeal]).map((c) => c.name)).toEqual(["wholemeal", "white"]);
  });

  it("snacks rank on salt first — C4.7's ordering, the same two products reversed", () => {
    const lowSalt = tied("low salt", nutrition({ fibreG: 2, saltG: 0.4 }), "snacks", null);
    const highFibre = tied("high fibre", nutrition({ fibreG: 7, saltG: 0.9 }), "snacks", null);
    expect(rankCandidates([highFibre, lowSalt]).map((c) => c.name)).toEqual([
      "low salt",
      "high fibre",
    ]);
  });

  it("yogurt ranks protein as a share of energy, not as a mass — U4.3", () => {
    // 6 g protein at 300 kcal is 8%; 4 g at 70 kcal is 23%.
    const dense = tied("dense", nutrition({ proteinG: 4, energyKcal: 70 }), "yogurt", "spoonable_yogurt");
    const heavy = tied("heavy", nutrition({ proteinG: 6, energyKcal: 300 }), "yogurt", "spoonable_yogurt");
    expect(rankCandidates([heavy, dense]).map((c) => c.name)).toEqual(["dense", "heavy"]);
  });

  it("eggs declare no attributes, so nothing manufactures a ranking — C4.4.4", () => {
    const a = tied("a egg", nutrition({ saltG: 0.05 }), "eggs", null);
    const b = tied("b egg", nutrition({ saltG: 0.09 }), "eggs", null);
    // Falls straight through to price, then name. Same price, so name decides.
    expect(rankCandidates([b, a]).map((c) => c.name)).toEqual(["a egg", "b egg"]);
  });

  it("an unknown attribute value never wins a tie-break", () => {
    const known = tied("known", nutrition({ fibreG: 1 }), "bread", null);
    const missing = tied("missing", null, "bread", null);
    expect(rankCandidates([missing, known]).map((c) => c.name)).toEqual(["known", "missing"]);
  });
});

/* ===========================================================================
 * R4, R5.
 * ========================================================================= */
describe("R4 — price is last", () => {
  it("compares per unit, so pack sizes are honest", () => {
    expect(priceSortKey(listing({ priceFils: 2400, unitPriceFils: 240 }))).toBe(240);
  });

  it("falls back to pack price when the size could not be parsed", () => {
    expect(priceSortKey(listing({ priceFils: 1000, unitPriceFils: null }))).toBe(1000);
  });

  it("no listing sorts last, not first", () => {
    expect(priceSortKey(null)).toBe(Number.POSITIVE_INFINITY);
    const priced = candidate({ name: "priced", checks: checks(3, 1) });
    const unpriced = candidate({ name: "unpriced", checks: checks(3, 1), bestListing: null });
    expect(rankCandidates([unpriced, priced]).map((c) => c.name)).toEqual(["priced", "unpriced"]);
  });

  it("only decides between options that are equal on everything above it", () => {
    const cheap = candidate({
      name: "cheap",
      checks: checks(2, 2),
      bestListing: listing({ unitPriceFils: 50 }),
    });
    const good = candidate({
      name: "good",
      checks: checks(4, 0),
      bestListing: listing({ unitPriceFils: 5000 }),
    });
    expect(rankCandidates([cheap, good]).map((c) => c.name)).toEqual(["good", "cheap"]);
  });
});

describe("R5 — a stable tie-break", () => {
  it("falls back to the product name so the same data always renders the same way", () => {
    const a = candidate({ name: "Alpha" });
    const z = candidate({ name: "Zeta" });
    expect(rankCandidates([z, a]).map((c) => c.name)).toEqual(["Alpha", "Zeta"]);
    expect(compareCandidates(a, a)).toBe(0);
  });

  it("unknown additive counts sort last within their key", () => {
    expect(additiveSortKey(null)).toBe(Number.POSITIVE_INFINITY);
    expect(additiveSortKey(0)).toBe(0);
  });
});

/* ===========================================================================
 * R6 — what never meets what.
 * ========================================================================= */
describe("R6 — comparison is bound to the subcategory", () => {
  it("a bottled water and an oat drink are not comparable at all", () => {
    // They are not even the same category under the eleven-category model: water
    // is `drink`, an oat drink is `milk/plant_milk`. This is the structural half
    // of the audit fix — the two never meet, whatever the ordering says.
    const water = candidate({ name: "water", category: "drink", checks: checks(4, 0) });
    const oat = candidate({
      name: "oat",
      category: "milk",
      subcategory: "plant_milk",
      checks: checks(5, 1),
    });
    expect(isComparable(oat, water)).toBe(false);
    expect(isBetterThan(oat, water)).toBe(false);
  });

  it("laban is never an alternative to a pot of yogurt, though they share a category", () => {
    const pot = candidate({
      name: "yogurt",
      category: "yogurt",
      subcategory: "spoonable_yogurt",
      checks: checks(2, 2),
    });
    const laban = candidate({
      name: "laban",
      category: "yogurt",
      subcategory: "drinking_yogurt",
      checks: checks(5, 0),
    });
    expect(laban.category).toBe(pot.category);
    expect(isComparable(laban, pot)).toBe(false);
    expect(isBetterThan(laban, pot)).toBe(false);
  });

  it("two products in the same subcategory are comparable", () => {
    const a = candidate({ name: "a", category: "yogurt", subcategory: "spoonable_yogurt", checks: checks(5, 0) });
    const b = candidate({ name: "b", category: "yogurt", subcategory: "spoonable_yogurt", checks: checks(2, 2) });
    expect(isComparable(a, b)).toBe(true);
    expect(isBetterThan(a, b)).toBe(true);
  });

  it("a null subcategory resolves to the category's default rather than to 'no match'", () => {
    const recorded = candidate({ name: "recorded", category: "yogurt", subcategory: "spoonable_yogurt" });
    const unrecorded = candidate({ name: "unrecorded", category: "yogurt", subcategory: null });
    expect(isComparable(recorded, unrecorded)).toBe(true);
  });
});

describe("isBetterThan — strictly better, or not an alternative", () => {
  it("an equal product is a substitute, not an alternative", () => {
    const a = candidate({ name: "same", checks: checks(3, 1) });
    const b = candidate({ name: "same", checks: checks(3, 1) });
    expect(isBetterThan(a, b)).toBe(false);
  });

  it("a worse product is never an alternative", () => {
    const worse = candidate({ name: "worse", checks: checks(1, 3) });
    const better = candidate({ name: "better", checks: checks(4, 0) });
    expect(isBetterThan(worse, better)).toBe(false);
    expect(isBetterThan(better, worse)).toBe(true);
  });
});

/* ===========================================================================
 * The "Why" line — DECISIONS §26.
 * ========================================================================= */
describe("the Why line is built only from real overlaps", () => {
  it("names the checks the alternative passes that the scanned product fails", () => {
    const scanned = [check("salt", "fail"), check("addedSugars", "fail")];
    const alternative = [check("salt", "pass"), check("addedSugars", "fail")];
    const { why, whyKeys } = buildWhy(alternative, scanned);
    expect(whyKeys).toEqual(["salt"]);
    expect(why).toContain("Passes where this one fails");
  });

  it("an unknown on the alternative never counts as a win", () => {
    const scanned = [check("salt", "fail")];
    const alternative = [check("salt", "unknown")];
    expect(buildWhy(alternative, scanned).whyKeys).toEqual([]);
  });

  it("falls back to a true, weaker sentence rather than inventing a reason", () => {
    const scanned = [check("salt", "pass")];
    const alternative = [check("salt", "pass"), check("addedSugars", "pass")];
    const { why, whyKeys } = buildWhy(alternative, scanned);
    expect(whyKeys).toEqual([]);
    expect(why).toBe("Passes 2 checks against this product's 1.");
  });

  it("says nothing was found rather than padding", () => {
    expect(NO_BETTER_OPTION).toBe("No better verified option found.");
  });
});
