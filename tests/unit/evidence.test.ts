import { describe, expect, it } from "vitest";
import {
  NAME_MATCH_THRESHOLD,
  nameSimilarity,
  pickBestLocalMatch,
  tokenise,
} from "@/lib/pipeline/evidence";
import { nutritionIsUsable, toEvidence } from "@/lib/evidence/openfoodfacts";
import { mockIdentification } from "@/lib/pipeline/identify";
import { IdentificationSchema, NutritionFactsSchema } from "@/lib/schemas";
import { CATALOGUE } from "@/prisma/seed-data/catalogue";

describe("tokenise", () => {
  it("drops punctuation, short words and filler", () => {
    expect(tokenise("The Original Coca-Cola 330ml!")).toEqual(["coca", "cola", "330ml"]);
  });
});

describe("nameSimilarity", () => {
  it("scores an exact name as 1", () => {
    expect(nameSimilarity({ name: "Oat Drink", brand: "Alpro" }, { name: "Oat Drink", brand: "Alpro" })).toBe(
      1,
    );
  });

  it("scores unrelated products near zero", () => {
    expect(
      nameSimilarity(
        { name: "Corn Flakes", brand: "Kellogg's" },
        { name: "Sunscreen Spray", brand: "Nivea" },
      ),
    ).toBe(0);
  });

  it("weights a brand match, because brand is the strongest non-barcode cue", () => {
    const withBrand = nameSimilarity(
      { name: "Oat Drink", brand: "Alpro" },
      { name: "Oat Drink No Sugars", brand: "Alpro" },
    );
    const withoutBrand = nameSimilarity(
      { name: "Oat Drink", brand: null },
      { name: "Oat Drink No Sugars", brand: "Alpro" },
    );
    expect(withBrand).toBeGreaterThan(withoutBrand);
  });

  it("never exceeds 1 even when the brand bonus applies", () => {
    expect(
      nameSimilarity({ name: "Laban", brand: "Al Rawabi" }, { name: "Laban", brand: "Al Rawabi" }),
    ).toBeLessThanOrEqual(1);
  });

  it("returns 0 when either side has no usable tokens", () => {
    expect(nameSimilarity({ name: "a", brand: null }, { name: "Corn Flakes", brand: null })).toBe(0);
  });
});

describe("pickBestLocalMatch", () => {
  const candidates = [
    { name: "Corn Flakes", brand: "Kellogg's" },
    { name: "Unsweetened Oat Drink", brand: "Alpro" },
    { name: "Organic Oat Drink", brand: "Oatly" },
  ];

  it("picks the closest candidate above the threshold", () => {
    const result = pickBestLocalMatch({ name: "Organic Oat Drink", brand: "Oatly" }, candidates);
    expect(result?.match.brand).toBe("Oatly");
    expect(result!.score).toBeGreaterThanOrEqual(NAME_MATCH_THRESHOLD);
  });

  it("returns null rather than the wrong product when nothing is close enough", () => {
    expect(pickBestLocalMatch({ name: "Sunscreen Spray", brand: "Nivea" }, candidates)).toBeNull();
  });

  it("returns null for an empty catalogue", () => {
    expect(pickBestLocalMatch({ name: "Anything", brand: null }, [])).toBeNull();
  });
});

describe("nutritionIsUsable", () => {
  const facts = (o: Record<string, number | null>) => NutritionFactsSchema.parse({ basis: "per_100g", ...o });

  it("rejects a panel where every macro is missing", () => {
    expect(nutritionIsUsable(facts({}))).toBe(false);
  });

  it("rejects an all-zero panel with no energy figure, which is 'no data' in disguise", () => {
    expect(nutritionIsUsable(facts({ sugarsG: 0, fatG: 0, proteinG: 0, saltG: 0 }))).toBe(false);
  });

  it("accepts an all-zero panel that is corroborated by an energy figure", () => {
    expect(nutritionIsUsable(facts({ energyKcal: 0, sugarsG: 0, fatG: 0, saltG: 0.0005 }))).toBe(true);
  });

  it("accepts any panel with a real positive value", () => {
    expect(nutritionIsUsable(facts({ sugarsG: 10.6 }))).toBe(true);
  });
});

describe("toEvidence", () => {
  it("stamps the open database and the exact product URL onto what it returns", () => {
    const record = toEvidence(
      { code: "123", product_name: "Thing", nutriments: { sugars_100g: 10 } },
      "food",
      "Open Food Facts",
      "https://world.openfoodfacts.org/product/123",
    );
    expect(record).not.toBeNull();
    expect(record!.sourceName).toBe("Open Food Facts");
    expect(record!.sourceUrl).toContain("/product/123");
    expect(record!.lastVerifiedAt).toBeInstanceOf(Date);
  });

  it("refuses a record with no product name rather than inventing one", () => {
    expect(toEvidence({ code: "123" }, "food", "Open Food Facts", "https://x")).toBeNull();
  });

  it("does not fabricate a nutrition panel for a cosmetic", () => {
    const record = toEvidence(
      { code: "1", product_name: "Shampoo", nutriments: { sugars_100g: 0 } },
      "cosmetic",
      "Open Beauty Facts",
      "https://x",
    );
    expect(record!.nutrition).toBeNull();
  });
});

describe("mock identification", () => {
  it("returns a catalogue product, so evidence always exists for the fixture", () => {
    const id = mockIdentification("al-ain-water-500ml");
    expect(id.barcode).toBe("6291100850044");
    expect(IdentificationSchema.safeParse(id).success).toBe(true);
  });

  it("falls back to a real catalogue entry when the slug is unknown", () => {
    const id = mockIdentification("no-such-product");
    expect(IdentificationSchema.safeParse(id).success).toBe(true);
    expect(CATALOGUE.some((c) => c.barcode === id.barcode)).toBe(true);
  });

  it("only ever names products the seed actually carries", () => {
    for (const entry of CATALOGUE) {
      const id = mockIdentification(entry.slug);
      expect(id.barcode).toBe(entry.barcode);
      expect(IdentificationSchema.safeParse(id).success).toBe(true);
    }
  });
});
