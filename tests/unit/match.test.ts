/**
 * Stage 3 — deciding which product the shopper is holding.
 *
 * The rule this file exists to protect:
 *
 *     A TIE IS A QUESTION FOR THE SHOPPER. NEVER A GUESS, NEVER A DEAD END.
 *
 * Each of the three named pilot cases has a test here, and so does the direction
 * that matters more than any of them: that a scan which did not establish the
 * variant is never resolved on the shopper's behalf.
 */

import { describe, expect, it } from "vitest";
import {
  MAX_CONFIRM_CANDIDATES,
  brandMatches,
  containment,
  decideMatch,
  sizesAgree,
  type MatchProduct,
  type MatchQuery,
} from "../../lib/pipeline/match";
import { tokenise } from "../../lib/pipeline/evidence";

function product(over: Partial<MatchProduct> & { name: string }): MatchProduct {
  return {
    id: over.name,
    slug: over.name.toLowerCase().replace(/\s+/g, "-"),
    brand: null,
    sizeLabel: null,
    imageUrl: null,
    ...over,
  };
}

function query(over: Partial<MatchQuery> & { name: string }): MatchQuery {
  return { brand: null, sizeLabel: null, visibleText: null, ...over };
}

/* ===========================================================================
 * The three named cases.
 * ========================================================================= */

describe("Almarai milk resolves to a question, not a guess", () => {
  // Both of these are real Open Food Facts records for Almarai milk.
  const candidates = [
    product({ name: "Almarai milk full fat", brand: "Almarai", sizeLabel: "1 L" }),
    product({ name: "Almarai lacto free milk full fat", brand: "Almarai", sizeLabel: "1 L" }),
  ];

  // Exactly what the model returned from a live scan of the carton.
  const scan = query({
    name: "Milk",
    brand: "Almarai",
    sizeLabel: "1 L",
    visibleText: "Almarai حليب",
  });

  it("finds both, where the old similarity score found neither", () => {
    const decision = decideMatch(scan, candidates);
    expect(decision.kind).toBe("confirm");
    expect(decision.candidates).toHaveLength(2);
  });

  it("asks rather than choosing a variant the scan never read", () => {
    const decision = decideMatch(scan, candidates);
    expect(decision.kind).toBe("confirm");
    if (decision.kind !== "confirm") return;
    // "full", "fat", "lacto", "free" were never on screen.
    for (const candidate of decision.candidates) {
      expect(candidate.unseenTokens.length).toBeGreaterThan(0);
    }
  });

  it("still asks when only one of them is in the catalogue", () => {
    // The shipped catalogue holds one Almarai milk. One candidate the scan
    // cannot separate is still a question — with one option — never an
    // automatic match and never a dead end.
    const decision = decideMatch(scan, [candidates[0]]);
    expect(decision.kind).toBe("confirm");
    expect(decision.candidates).toHaveLength(1);
  });
});

describe("Weetabix still matches automatically", () => {
  const scan = query({
    name: "Weetabix",
    brand: "Weetabix",
    sizeLabel: "430 g",
    visibleText: "Weetabix 430g 100% Volkoren",
  });

  it("auto-matches when the scan established the size and added nothing unseen", () => {
    const decision = decideMatch(scan, [
      product({ name: "Weetabix Original", brand: "Weetabix", sizeLabel: "430 g" }),
    ]);
    expect(decision.kind).toBe("auto");
    if (decision.kind === "auto") expect(decision.product.name).toBe("Weetabix Original");
  });

  it("drops to a question the moment a second size exists", () => {
    const decision = decideMatch(query({ ...scan, sizeLabel: null }), [
      product({ name: "Weetabix Original", brand: "Weetabix", sizeLabel: "430 g" }),
      product({ name: "Weetabix Original", brand: "Weetabix", sizeLabel: "860 g" }),
    ]);
    expect(decision.kind).toBe("confirm");
    expect(decision.candidates).toHaveLength(2);
  });

  it("never auto-matches a different size from the one on the pack", () => {
    const decision = decideMatch(scan, [
      product({ name: "Weetabix Original", brand: "Weetabix", sizeLabel: "860 g" }),
    ]);
    expect(decision.kind).toBe("confirm");
  });
});

describe("a generic name with no brand never auto-matches", () => {
  const milks = [
    product({ name: "Al Rawabi low fat milk", brand: "Al Rawabi", sizeLabel: "1 L" }),
    product({ name: "Almarai milk full fat", brand: "Almarai", sizeLabel: "1 L" }),
  ];

  it("asks, even with a size, because a brandless read identifies nothing", () => {
    const decision = decideMatch(query({ name: "milk", sizeLabel: "1 L" }), milks);
    expect(decision.kind).toBe("confirm");
  });

  it("asks even when only one product in the catalogue could match", () => {
    const decision = decideMatch(query({ name: "milk", sizeLabel: "1 L" }), [milks[0]]);
    expect(decision.kind).toBe("confirm");
  });

  it("offers at most four options — beyond that it is a list, not a question", () => {
    const many = Array.from({ length: 9 }, (_, i) =>
      product({ name: `Brand ${i} milk`, brand: `Brand ${i}`, sizeLabel: "1 L" }),
    );
    const decision = decideMatch(query({ name: "milk", sizeLabel: "1 L" }), many);
    expect(decision.kind).toBe("confirm");
    expect(decision.candidates).toHaveLength(MAX_CONFIRM_CANDIDATES);
  });
});

/* ===========================================================================
 * Containment itself, and what it must not do.
 * ========================================================================= */

describe("containment is asymmetric, which is the whole point", () => {
  it("scores a short correct read against a long name as complete", () => {
    expect(containment(tokenise("Milk"), tokenise("Almarai milk full fat"))).toBe(1);
  });

  it("is not symmetric — the long name against the short one is partial", () => {
    expect(containment(tokenise("Almarai milk full fat"), tokenise("Milk"))).toBeCloseTo(0.25, 6);
  });

  it("rejects a product missing any token the model read", () => {
    expect(containment(tokenise("oat milk"), tokenise("Almarai milk full fat"))).toBeLessThan(1);
    expect(decideMatch(query({ name: "oat milk", brand: "Alpro" }), [
      product({ name: "Almarai milk full fat", brand: "Almarai" }),
    ]).kind).toBe("none");
  });

  it("an empty or unreadable name matches nothing rather than everything", () => {
    expect(decideMatch(query({ name: "" }), [product({ name: "Anything" })]).kind).toBe("none");
    // Arabic-only names tokenise to nothing under the ASCII tokeniser.
    expect(containment(tokenise("حليب"), tokenise("Almarai milk"))).toBe(0);
  });
});

describe("brand is required whenever the model returned one", () => {
  it("excludes a different brand entirely", () => {
    const decision = decideMatch(query({ name: "milk", brand: "Almarai", sizeLabel: "1 L" }), [
      product({ name: "Al Rawabi low fat milk", brand: "Al Rawabi", sizeLabel: "1 L" }),
    ]);
    expect(decision.kind).toBe("none");
  });

  it("excludes a row with no brand when the model read one", () => {
    expect(brandMatches("Almarai", null)).toBe(false);
  });

  it("does not require a brand the model never read", () => {
    expect(brandMatches(null, "Almarai")).toBe(true);
  });

  it("matches on any shared brand token, since brands are written many ways", () => {
    expect(brandMatches("Al Rawabi", "al rawabi dairy")).toBe(true);
    expect(brandMatches("Kellogg's", "Kelloggs")).toBe(false); // apostrophes differ; asking is correct
  });
});

describe("sizes agree on quantity, not on spelling", () => {
  it("treats 1 L, 1l and 1000 ml as the same pack", () => {
    expect(sizesAgree("1 L", "1l")).toBe(true);
    expect(sizesAgree("1 L", "1000 ml")).toBe(true);
    expect(sizesAgree("500 ml", "0.5 L")).toBe(true);
  });

  it("does not treat different quantities as the same", () => {
    expect(sizesAgree("430 g", "860 g")).toBe(false);
    expect(sizesAgree("1 L", "500 ml")).toBe(false);
  });

  it("is false when either side is missing — absent is not agreement", () => {
    expect(sizesAgree(null, "1 L")).toBe(false);
    expect(sizesAgree("1 L", null)).toBe(false);
  });

  it("falls back to exact text when neither parses", () => {
    expect(sizesAgree("6 eggs", "6 eggs")).toBe(true);
    expect(sizesAgree("6 eggs", "12 eggs")).toBe(false);
  });
});

/* ===========================================================================
 * Annotations the model adds to what it read.
 * ========================================================================= */
describe("a gloss the model added is not part of the product's name", () => {
  // Verbatim from a live scan of an Almarai carton: the model transliterated the
  // Arabic as a courtesy, and the parenthetical turned a correct read into a
  // dead end because "halib" appears in no catalogue name.
  const scan = query({
    name: "Milk (Halib)",
    brand: "Almarai",
    sizeLabel: null,
    visibleText: "المراعي Almarai حليب",
  });

  it("strips the parenthetical and finds the product", () => {
    const decision = decideMatch(scan, [
      product({ name: "Almarai milk full fat", brand: "Almarai", sizeLabel: "1 L" }),
    ]);
    expect(decision.kind).toBe("confirm");
    expect(decision.candidates).toHaveLength(1);
  });

  it("does not loosen containment — every remaining token must still be there", () => {
    const decision = decideMatch(query({ ...scan, name: "Oat Milk (Halib)" }), [
      product({ name: "Almarai milk full fat", brand: "Almarai" }),
    ]);
    expect(decision.kind).toBe("none");
  });

  it("keeps the stripped words as something the scan saw", () => {
    // If a candidate genuinely contained "halib", it would not count against it
    // as an unread variant, because the model did read it.
    const decision = decideMatch(
      query({ ...scan, sizeLabel: "1 L" }),
      [product({ name: "Almarai milk halib", brand: "Almarai", sizeLabel: "1 L" })],
    );
    expect(decision.kind).toBe("auto");
  });
});
