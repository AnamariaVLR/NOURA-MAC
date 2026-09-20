/**
 * The staleness rule.
 *
 * A price is real because a person looked at it on a date. This file pins down what
 * "recently enough" means and, more importantly, what happens on either side of the
 * line: inside it we say who checked and when, outside it we still show the number
 * but never call it current.
 */
import { describe, expect, it } from "vitest";
import {
  FRESHNESS_DAYS,
  MS_PER_DAY,
  ageInDays,
  daysUntilStale,
  freshnessLabel,
  isFreshCheck,
  stalenessOf,
} from "@/lib/retail/freshness";
import { bestPrice, freshListings, rankListings } from "@/lib/retail/search";
import type { Listing } from "@/lib/schemas";

const NOW = new Date("2026-09-19T12:00:00.000Z");
const daysAgo = (n: number, from: Date = NOW) => new Date(from.getTime() - n * MS_PER_DAY);

const check = (over: Partial<{ source: string; checkedAt: Date }> = {}) => ({
  source: "HAND_VERIFIED",
  checkedAt: daysAgo(1),
  ...over,
});

describe("ageInDays", () => {
  it("counts whole days, floored", () => {
    expect(ageInDays(daysAgo(0), NOW)).toBe(0);
    expect(ageInDays(new Date(NOW.getTime() - 23 * 60 * 60 * 1000), NOW)).toBe(0);
    expect(ageInDays(daysAgo(1), NOW)).toBe(1);
    expect(ageInDays(daysAgo(13.9), NOW)).toBe(13);
  });

  it("never ages a check up: 13.99 days old is 13, not 14", () => {
    expect(ageInDays(daysAgo(13.99), NOW)).toBe(13);
  });

  it("treats a future date as zero days old rather than negative", () => {
    expect(ageInDays(new Date(NOW.getTime() + 5 * MS_PER_DAY), NOW)).toBe(0);
  });
});

describe("isFreshCheck", () => {
  it("is fresh right up to the boundary and stale on it", () => {
    expect(isFreshCheck(check({ checkedAt: daysAgo(0) }), NOW)).toBe(true);
    expect(isFreshCheck(check({ checkedAt: daysAgo(FRESHNESS_DAYS - 1) }), NOW)).toBe(true);
    expect(isFreshCheck(check({ checkedAt: daysAgo(FRESHNESS_DAYS) }), NOW)).toBe(false);
    expect(isFreshCheck(check({ checkedAt: daysAgo(FRESHNESS_DAYS + 30) }), NOW)).toBe(false);
  });

  it("is never fresh for a synthetic row, however recent", () => {
    expect(isFreshCheck({ source: "SYNTHETIC", checkedAt: NOW }, NOW)).toBe(false);
  });

  it("is never fresh for a source we do not recognise", () => {
    expect(isFreshCheck({ source: "scraped", checkedAt: NOW }, NOW)).toBe(false);
    expect(isFreshCheck({ source: "", checkedAt: NOW }, NOW)).toBe(false);
  });

  it("accepts a live connector's check, for when one exists", () => {
    expect(isFreshCheck({ source: "RETAILER_API", checkedAt: daysAgo(2) }, NOW)).toBe(true);
  });

  it("does not treat open data or a register import as a price check", () => {
    expect(isFreshCheck({ source: "OPEN_DATA", checkedAt: NOW }, NOW)).toBe(false);
    expect(isFreshCheck({ source: "REGULATOR_IMPORT", checkedAt: NOW }, NOW)).toBe(false);
  });
});

describe("stalenessOf", () => {
  it("separates the four states", () => {
    expect(stalenessOf(null, NOW)).toBe("never-checked");
    expect(stalenessOf(undefined, NOW)).toBe("never-checked");
    expect(stalenessOf(check({ checkedAt: daysAgo(2) }), NOW)).toBe("fresh");
    expect(stalenessOf(check({ checkedAt: daysAgo(40) }), NOW)).toBe("stale");
    expect(stalenessOf({ source: "SYNTHETIC", checkedAt: NOW }, NOW)).toBe("not-evidence");
  });
});

describe("freshnessLabel", () => {
  it("names the checker and the date when fresh", () => {
    expect(freshnessLabel("fresh", "12 March 2026", "A. Checker")).toBe(
      "Verified by hand on 12 March 2026 by A. Checker",
    );
  });

  it("says plainly that a stale price is not recent, and still gives the date", () => {
    const label = freshnessLabel("stale", "12 March 2026");
    expect(label).toMatch(/not verified recently/i);
    expect(label).toContain("12 March 2026");
  });

  it("never describes any price as live or current", () => {
    for (const state of ["fresh", "stale", "never-checked", "not-evidence"] as const) {
      const label = freshnessLabel(state, "12 March 2026", "A. Checker");
      expect(label).not.toMatch(/\blive\b/i);
      expect(label).not.toMatch(/\bcurrent\b/i);
    }
  });

  it("calls a synthetic row example data, not a price", () => {
    expect(freshnessLabel("not-evidence", "12 March 2026")).toMatch(/example data/i);
  });
});

describe("daysUntilStale", () => {
  it("counts down and stops at zero", () => {
    expect(daysUntilStale(daysAgo(0), NOW)).toBe(FRESHNESS_DAYS);
    expect(daysUntilStale(daysAgo(13), NOW)).toBe(1);
    expect(daysUntilStale(daysAgo(14), NOW)).toBe(0);
    expect(daysUntilStale(daysAgo(99), NOW)).toBe(0);
  });
});

function listing(over: Partial<Listing> & { id: string }): Listing {
  return {
    retailer: { slug: "noon", name: "Noon", websiteUrl: "https://www.noon.com" },
    priceFils: 1000,
    currency: "AED",
    sizeLabel: "500 ml",
    unitPriceFils: 200,
    inStock: true,
    url: "https://www.noon.com/p/x",
    source: { name: "Checked by A", url: null, lastVerifiedAt: NOW.toISOString() },
    sourceKind: "HAND_VERIFIED",
    checkedBy: "A. Checker",
    checkedAt: NOW.toISOString(),
    ageDays: 1,
    isFresh: true,
    hasPhoto: false,
    ...over,
  };
}

describe("ranking respects freshness first", () => {
  it("puts a verified price above a lapsed one, however cheap the lapsed one is", () => {
    const ranked = rankListings([
      listing({ id: "stale-cheap", priceFils: 100, unitPriceFils: 20, isFresh: false }),
      listing({ id: "fresh-dear", priceFils: 9000, unitPriceFils: 1800, isFresh: true }),
    ]);
    expect(ranked.map((l) => l.id)).toEqual(["fresh-dear", "stale-cheap"]);
  });

  it("still puts in-stock above out-of-stock within the fresh group", () => {
    const ranked = rankListings([
      listing({ id: "fresh-oos", priceFils: 100, unitPriceFils: 20, inStock: false }),
      listing({ id: "fresh-in", priceFils: 500, unitPriceFils: 100, inStock: true }),
    ]);
    expect(ranked[0].id).toBe("fresh-in");
  });
});

describe("bestPrice", () => {
  it("ignores a lapsed check entirely", () => {
    const result = bestPrice([
      listing({ id: "stale", priceFils: 100, unitPriceFils: 20, isFresh: false }),
      listing({ id: "fresh", priceFils: 900, unitPriceFils: 180, isFresh: true }),
    ]);
    expect(result?.id).toBe("fresh");
  });

  it("returns null when every check has lapsed, rather than quoting an old number", () => {
    expect(bestPrice([listing({ id: "a", isFresh: false })])).toBeNull();
  });

  it("returns null when the only fresh check said out of stock", () => {
    expect(bestPrice([listing({ id: "a", isFresh: true, inStock: false })])).toBeNull();
  });
});

describe("freshListings", () => {
  it("keeps only what we may present as verified", () => {
    const rows = [
      listing({ id: "a", isFresh: true }),
      listing({ id: "b", isFresh: false }),
      listing({ id: "c", isFresh: true, inStock: false }),
    ];
    expect(
      freshListings(rows)
        .map((l) => l.id)
        .sort(),
    ).toEqual(["a", "c"]);
  });
});
