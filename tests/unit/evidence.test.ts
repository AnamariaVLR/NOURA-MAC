import { describe, expect, it } from "vitest";
import { tokenise } from "@/lib/pipeline/evidence";
import { nutritionIsUsable, toEvidence } from "@/lib/evidence/openfoodfacts";
import { mockIdentification, salvage } from "@/lib/pipeline/identify";
import { IdentificationSchema, NutritionFactsSchema } from "@/lib/schemas";
import { CATALOGUE } from "@/prisma/seed-data/catalogue";

describe("tokenise", () => {
  it("drops punctuation, short words and filler", () => {
    expect(tokenise("The Original Coca-Cola 330ml!")).toEqual(["coca", "cola", "330ml"]);
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

/* ===========================================================================
 * Stage 2 — salvaging a good answer with one bad field.
 *
 * From a real failure on the first live scans of the pilot: the model read a box
 * of Weetabix correctly and transcribed the barcode with a space in it, the way
 * it is printed under an EAN. The whole identification was rejected and the
 * caller substituted the fixture product, so the shopper would have been shown a
 * confident NOT RECOMMENDED page for Coca-Cola.
 * ========================================================================= */
describe("salvage — one unusable field must not destroy a good identification", () => {
  const good = {
    name: "Weetabix",
    brand: "Weetabix",
    barcode: null as string | null,
    category: "cereal",
    subcategory: null as string | null,
    sizeLabel: "430 g",
    confidence: 0.9,
    visibleText: "Weetabix 430g",
  };

  it("nulls a barcode that is not 8-14 clean digits, and keeps everything else", () => {
    for (const bad of ["5010029 000023", "12345", "EAN5010029000023", "501002900002x", ""]) {
      const out = IdentificationSchema.safeParse(salvage({ ...good, barcode: bad }));
      expect(out.success, `barcode ${JSON.stringify(bad)}`).toBe(true);
      if (out.success) {
        expect(out.data.barcode).toBeNull();
        // The parts that were right are still there.
        expect(out.data.name).toBe("Weetabix");
        expect(out.data.category).toBe("cereal");
      }
    }
  });

  it("never repairs a barcode by cleaning it up", () => {
    // Stripping the space and hoping would attach another product's nutrition
    // panel to this photo on a single misread digit. Null, and match by name.
    const out = IdentificationSchema.safeParse(salvage({ ...good, barcode: "5010029 000023" }));
    expect(out.success && out.data.barcode).toBeNull();
  });

  it("keeps a barcode that is already valid", () => {
    const out = IdentificationSchema.safeParse(salvage({ ...good, barcode: "5010029000023" }));
    expect(out.success && out.data.barcode).toBe("5010029000023");
  });

  it("nulls a subcategory outside the model's vocabulary, and keeps a real one", () => {
    const invented = IdentificationSchema.safeParse(salvage({ ...good, subcategory: "wholegrain" }));
    expect(invented.success && invented.data.subcategory).toBeNull();

    const real = IdentificationSchema.safeParse(
      salvage({ ...good, category: "milk", subcategory: "plant_milk" }),
    );
    expect(real.success && real.data.subcategory).toBe("plant_milk");
  });

  it("still rejects an answer that is wrong about the thing that matters", () => {
    // A category outside the enum is not salvageable: it decides which rubric
    // runs, and guessing one would apply the wrong lines.
    expect(IdentificationSchema.safeParse(salvage({ ...good, category: "biscuits" })).success).toBe(
      false,
    );
  });

  it("passes through anything that is not an object rather than throwing", () => {
    expect(salvage(null)).toBeNull();
    expect(salvage("nonsense")).toBe("nonsense");
  });
});
