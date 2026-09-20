import { describe, expect, it } from "vitest";
import {
  additiveSortKey,
  certificationStrength,
  compareCandidates,
  isBetterThan,
  passedCount,
  priceSortKey,
  rankCandidates,
  type Candidate,
} from "@/lib/recommend/rank";
import { buildWhy, NO_BETTER_OPTION } from "@/lib/recommend/alternatives";
import type { Check, CheckStatus, Listing } from "@/lib/schemas";

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

/** n passing checks, plus an optional certification check. */
function checks(passes: number, certification?: Check): Check[] {
  const base = Array.from({ length: passes }, (_, i) => check(`dim_${i}`, "pass"));
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
    verdict: "acceptable",
    checks: checks(3),
    additiveCount: 0,
    bestListing: listing(),
    evidenceSource: "Open Food Facts",
    lastVerifiedAt: new Date("2026-01-01"),
    ...over,
  };
}

describe("key 1: more passed checks wins", () => {
  it("ranks the candidate with more passes first", () => {
    const many = candidate({ name: "many", checks: checks(5) });
    const few = candidate({ name: "few", checks: checks(2) });
    expect(rankCandidates([few, many]).map((c) => c.name)).toEqual(["many", "few"]);
  });

  it("beats every later key", () => {
    // `few` wins on certification, additives AND price, and still loses.
    const many = candidate({
      name: "many",
      checks: checks(5),
      additiveCount: 9,
      bestListing: listing({ unitPriceFils: 9999 }),
    });
    const few = candidate({
      name: "few",
      checks: checks(2, check("certification", "pass", "ECAS, accredited body")),
      additiveCount: 0,
      bestListing: listing({ unitPriceFils: 1 }),
    });
    expect(compareCandidates(many, few)).toBeLessThan(0);
  });

  it("counts passes, not pass rate: publishing less must not win", () => {
    const broad = candidate({ name: "broad", checks: [...checks(5), check("x", "fail")] });
    const narrow = candidate({ name: "narrow", checks: checks(2) });
    expect(passedCount(broad.checks)).toBe(5);
    expect(rankCandidates([narrow, broad])[0].name).toBe("broad");
  });
});

describe("key 2: stronger certification evidence", () => {
  it("scores the certification ladder in the documented order", () => {
    expect(certificationStrength([check("certification", "pass", "ECAS, accredited body")])).toBe(3);
    expect(certificationStrength([check("certification", "pass", "ECAS")])).toBe(2);
    expect(certificationStrength([check("certification", "fail", "ECAS — expired")])).toBe(1);
    expect(certificationStrength([check("certification", "unknown", "not verified")])).toBe(0);
    expect(certificationStrength([check("certification", "fail", "EQM — suspended")])).toBe(-1);
  });

  it("treats a missing certification check as neutral", () => {
    expect(certificationStrength([])).toBe(0);
  });

  it("ranks a suspended certificate below having none at all", () => {
    const suspended = candidate({
      name: "suspended",
      checks: checks(3, check("certification", "fail", "EQM — suspended")),
    });
    const none = candidate({
      name: "none",
      checks: checks(3, check("certification", "unknown", "not verified")),
    });
    expect(passedCount(suspended.checks)).toBe(passedCount(none.checks));
    expect(rankCandidates([suspended, none]).map((c) => c.name)).toEqual(["none", "suspended"]);
  });

  it("breaks a tie before additives or price are consulted", () => {
    const accredited = candidate({
      name: "accredited",
      checks: checks(3, check("certification", "pass", "ECAS, accredited body")),
      additiveCount: 5,
      bestListing: listing({ unitPriceFils: 5000 }),
    });
    const unaccredited = candidate({
      name: "unaccredited",
      checks: checks(3, check("certification", "pass", "ECAS")),
      additiveCount: 0,
      bestListing: listing({ unitPriceFils: 10 }),
    });
    expect(compareCandidates(accredited, unaccredited)).toBeLessThan(0);
  });
});

describe("key 3: fewer additives", () => {
  it("prefers the shorter additive list", () => {
    const clean = candidate({ name: "clean", additiveCount: 0 });
    const busy = candidate({ name: "busy", additiveCount: 4 });
    expect(rankCandidates([busy, clean]).map((c) => c.name)).toEqual(["clean", "busy"]);
  });

  it("sorts an unknown additive count last, never first", () => {
    expect(additiveSortKey(null)).toBe(Number.POSITIVE_INFINITY);
    const unknown = candidate({ name: "unknown", additiveCount: null });
    const many = candidate({ name: "many", additiveCount: 7 });
    // Seven known additives still beat "we have no idea".
    expect(rankCandidates([unknown, many]).map((c) => c.name)).toEqual(["many", "unknown"]);
  });

  it("does not produce NaN when both counts are unknown", () => {
    const a = candidate({ name: "a", additiveCount: null, bestListing: listing({ unitPriceFils: 50 }) });
    const b = candidate({ name: "b", additiveCount: null, bestListing: listing({ unitPriceFils: 10 }) });
    expect(Number.isNaN(compareCandidates(a, b))).toBe(false);
    expect(rankCandidates([a, b]).map((c) => c.name)).toEqual(["b", "a"]);
  });
});

describe("key 4: cheaper per unit", () => {
  it("compares per 100 g/ml, not by pack price", () => {
    const bigPack = candidate({
      name: "big",
      bestListing: listing({ priceFils: 1500, sizeLabel: "1 L", unitPriceFils: 150 }),
    });
    const smallPack = candidate({
      name: "small",
      bestListing: listing({ priceFils: 500, sizeLabel: "250 ml", unitPriceFils: 200 }),
    });
    expect(rankCandidates([smallPack, bigPack]).map((c) => c.name)).toEqual(["big", "small"]);
  });

  it("falls back to pack price when the size could not be parsed", () => {
    expect(priceSortKey(listing({ unitPriceFils: null, priceFils: 700 }))).toBe(700);
  });

  it("sorts a candidate with no listing last", () => {
    expect(priceSortKey(null)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("the comparator as a whole", () => {
  it("is a stable total order: equal candidates always sort the same way round", () => {
    const a = candidate({ name: "Aisle" });
    const z = candidate({ name: "Zoom" });
    expect(rankCandidates([a, z]).map((c) => c.name)).toEqual(["Aisle", "Zoom"]);
    expect(rankCandidates([z, a]).map((c) => c.name)).toEqual(["Aisle", "Zoom"]);
  });

  it("does not mutate the array it was given", () => {
    const rows = [candidate({ name: "b", checks: checks(1) }), candidate({ name: "a", checks: checks(9) })];
    rankCandidates(rows);
    expect(rows.map((c) => c.name)).toEqual(["b", "a"]);
  });

  it("treats an equal candidate as not better — no padding the list", () => {
    expect(isBetterThan(candidate({ name: "scanned" }), candidate({ name: "scanned" }))).toBe(false);
  });

  it("treats a worse candidate as not better", () => {
    const scanned = candidate({ name: "scanned", checks: checks(4) });
    const worse = candidate({ name: "worse", checks: checks(1) });
    expect(isBetterThan(worse, scanned)).toBe(false);
  });

  it("treats a strictly better candidate as better", () => {
    const scanned = candidate({ name: "scanned", checks: checks(1) });
    const better = candidate({ name: "better", checks: checks(6) });
    expect(isBetterThan(better, scanned)).toBe(true);
  });
});

describe("buildWhy", () => {
  it("names the checks the alternative passes that the scanned product fails", () => {
    const scanned = [check("addedSugars", "fail"), check("processing", "fail"), check("salt", "pass")];
    const alternative = [check("addedSugars", "pass"), check("processing", "pass"), check("salt", "pass")];

    const { why, whyKeys } = buildWhy(alternative, scanned);
    expect(whyKeys).toEqual(["addedSugars", "processing"]);
    expect(why).toContain("Passes where this one fails");
  });

  it("never credits a check the scanned product also passes", () => {
    const scanned = [check("salt", "pass"), check("addedSugars", "fail")];
    const alternative = [check("salt", "pass"), check("addedSugars", "pass")];
    expect(buildWhy(alternative, scanned).whyKeys).toEqual(["addedSugars"]);
  });

  it("never credits an unknown as a win", () => {
    const { whyKeys, why } = buildWhy([check("addedSugars", "unknown")], [check("addedSugars", "fail")]);
    expect(whyKeys).toEqual([]);
    expect(why).not.toContain("Passes where this one fails");
  });

  it("falls back to a true statement when there is no direct overlap", () => {
    const scanned = [check("addedSugars", "pass"), check("salt", "unknown")];
    const alternative = [check("addedSugars", "pass"), check("salt", "pass")];
    const { why, whyKeys } = buildWhy(alternative, scanned);
    expect(whyKeys).toEqual([]);
    expect(why).toBe("Passes 2 checks against this product's 1.");
  });

  it("lists at most three wins, so the line stays one line", () => {
    const keys = ["a", "b", "c", "d", "e"];
    const { why, whyKeys } = buildWhy(
      keys.map((k) => check(k, "pass")),
      keys.map((k) => check(k, "fail")),
    );
    expect(whyKeys).toHaveLength(5);
    expect(why.match(/claim/g)).toHaveLength(3);
  });
});

describe("the empty case", () => {
  it("has a fixed message rather than a padded list", () => {
    expect(NO_BETTER_OPTION).toBe("No better verified option found.");
  });
});
