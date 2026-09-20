import { describe, expect, it } from "vitest";
import { bestPrice, filterListings, rankListings } from "@/lib/retail/search";
import { ListingQuerySchema, type Listing } from "@/lib/schemas";
import { formatAed, parseSizeToBase, unitPriceFils } from "@/lib/format";

const source = {
  name: "Checked by A. Checker",
  url: "https://www.example.ae",
  lastVerifiedAt: "2026-09-18T00:00:00.000Z",
};

function listing(overrides: Partial<Listing> & { id: string }): Listing {
  return {
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
    ...overrides,
  };
}

describe("rankListings", () => {
  it("puts anything in stock ahead of anything that is not, however cheap", () => {
    const ranked = rankListings([
      listing({ id: "cheap-oos", priceFils: 100, unitPriceFils: 20, inStock: false }),
      listing({ id: "dear-in-stock", priceFils: 9000, unitPriceFils: 1800, inStock: true }),
    ]);
    expect(ranked.map((l) => l.id)).toEqual(["dear-in-stock", "cheap-oos"]);
  });

  it("orders by unit price, so pack sizes are actually comparable", () => {
    const ranked = rankListings([
      listing({ id: "small", priceFils: 500, sizeLabel: "250 ml", unitPriceFils: 200 }),
      listing({ id: "big", priceFils: 1500, sizeLabel: "1 L", unitPriceFils: 150 }),
    ]);
    // The bigger pack costs more but less per 100 ml, and wins.
    expect(ranked[0].id).toBe("big");
  });

  it("falls back to pack price when a size could not be parsed", () => {
    const ranked = rankListings([
      listing({ id: "b", priceFils: 800, unitPriceFils: null }),
      listing({ id: "a", priceFils: 400, unitPriceFils: null }),
    ]);
    expect(ranked.map((l) => l.id)).toEqual(["a", "b"]);
  });

  it("is a stable, total order: equal listings always render the same way round", () => {
    const rows = [
      listing({ id: "z", retailer: { slug: "z", name: "Zoom", websiteUrl: "https://z.ae" } }),
      listing({ id: "a", retailer: { slug: "a", name: "Aisle", websiteUrl: "https://a.ae" } }),
    ];
    expect(rankListings(rows).map((l) => l.id)).toEqual(["a", "z"]);
    expect(rankListings([...rows].reverse()).map((l) => l.id)).toEqual(["a", "z"]);
  });

  it("does not mutate the array it was given", () => {
    const rows = [listing({ id: "b", priceFils: 900 }), listing({ id: "a", priceFils: 100 })];
    rankListings(rows);
    expect(rows.map((l) => l.id)).toEqual(["b", "a"]);
  });

  it("handles an empty list", () => {
    expect(rankListings([])).toEqual([]);
  });
});

describe("filterListings", () => {
  const rows = [
    listing({ id: "a", priceFils: 300, unitPriceFils: 60, inStock: true }),
    listing({ id: "b", priceFils: 200, unitPriceFils: 40, inStock: false }),
    listing({ id: "c", priceFils: 400, unitPriceFils: 80, inStock: true }),
  ];

  it("keeps out-of-stock rows by default, ranked last", () => {
    expect(filterListings(rows, ListingQuerySchema.parse({ productId: "p" })).map((l) => l.id)).toEqual([
      "a",
      "c",
      "b",
    ]);
  });

  it("drops out-of-stock rows when asked", () => {
    expect(
      filterListings(rows, ListingQuerySchema.parse({ productId: "p", inStockOnly: true })).map(
        (l) => l.id,
      ),
    ).toEqual(["a", "c"]);
  });

  it("honours the limit after ranking, not before", () => {
    expect(
      filterListings(rows, ListingQuerySchema.parse({ productId: "p", limit: 1 })).map((l) => l.id),
    ).toEqual(["a"]);
  });

  it("rejects an absurd limit at the schema boundary", () => {
    expect(ListingQuerySchema.safeParse({ productId: "p", limit: 5000 }).success).toBe(false);
    expect(ListingQuerySchema.safeParse({ productId: "p", limit: 0 }).success).toBe(false);
  });
});

describe("bestPrice", () => {
  it("returns the cheapest listing that can actually be bought", () => {
    const result = bestPrice([
      listing({ id: "oos", priceFils: 100, unitPriceFils: 20, inStock: false }),
      listing({ id: "in", priceFils: 500, unitPriceFils: 100, inStock: true }),
    ]);
    expect(result?.id).toBe("in");
  });

  it("returns null when nothing is in stock, rather than a price you cannot pay", () => {
    expect(bestPrice([listing({ id: "oos", inStock: false })])).toBeNull();
    expect(bestPrice([])).toBeNull();
  });
});

describe("money and pack sizes", () => {
  it("formats fils as AED without floating-point drift", () => {
    expect(formatAed(0)).toBe("AED 0.00");
    expect(formatAed(5)).toBe("AED 0.05");
    expect(formatAed(250)).toBe("AED 2.50");
    expect(formatAed(123456)).toBe("AED 1234.56");
  });

  it("parses the pack sizes the catalogue actually uses", () => {
    expect(parseSizeToBase("500 ml")).toBe(500);
    expect(parseSizeToBase("1 L")).toBe(1000);
    expect(parseSizeToBase("1.5 L")).toBe(1500);
    expect(parseSizeToBase("250g")).toBe(250);
    expect(parseSizeToBase("1 kg")).toBe(1000);
    expect(parseSizeToBase("6 x 200 ml")).toBe(1200);
  });

  it("returns null for a size it cannot parse, instead of guessing", () => {
    expect(parseSizeToBase("family pack")).toBeNull();
    expect(unitPriceFils(1000, "family pack")).toBeNull();
  });

  it("computes price per 100 g/ml", () => {
    expect(unitPriceFils(1795, "1 L")).toBe(180);
    expect(unitPriceFils(250, "330 ml")).toBe(76);
  });
});
