import { describe, expect, it } from "vitest";
import {
  CheckSchema,
  HealthAnalysisResultSchema,
  IdentificationSchema,
  ListingSchema,
  ModelCheckProseSchema,
  NutritionFactsSchema,
  OffByBarcodeSchema,
  SourceRefSchema,
  UploadSchema,
  UserKeySchema,
  VerdictResultSchema,
  VerdictSchema,
  parseJsonColumn,
} from "@/lib/schemas";

const source = { name: "Open Food Facts", url: null, lastVerifiedAt: "2026-01-01T00:00:00.000Z" };

describe("IdentificationSchema", () => {
  const valid = {
    name: "Coca-Cola",
    brand: "Coca-Cola",
    barcode: "5449000000996",
    category: "drink",
    sizeLabel: "330 ml",
    confidence: 0.9,
    visibleText: "Coca-Cola 330ml",
  };

  it("accepts a well-formed identification", () => {
    expect(IdentificationSchema.parse(valid).barcode).toBe("5449000000996");
  });

  it("rejects a barcode that is not 8-14 digits", () => {
    for (const barcode of ["123", "54490000009961234567", "544900000099x", "544-900"]) {
      expect(IdentificationSchema.safeParse({ ...valid, barcode }).success).toBe(false);
    }
  });

  it("accepts a null barcode, because unreadable is a valid answer", () => {
    expect(IdentificationSchema.parse({ ...valid, barcode: null }).barcode).toBeNull();
  });

  it("rejects a category outside the four the rubric knows", () => {
    expect(IdentificationSchema.safeParse({ ...valid, category: "electronics" }).success).toBe(false);
  });

  it("rejects confidence outside 0..1", () => {
    expect(IdentificationSchema.safeParse({ ...valid, confidence: 1.4 }).success).toBe(false);
    expect(IdentificationSchema.safeParse({ ...valid, confidence: -0.1 }).success).toBe(false);
  });
});

describe("NutritionFactsSchema", () => {
  it("defaults every absent nutrient to null rather than zero", () => {
    const parsed = NutritionFactsSchema.parse({ basis: "per_100g" });
    expect(parsed.sugarsG).toBeNull();
    expect(parsed.carbohydratesG).toBeNull();
    expect(parsed.energyKcal).toBeNull();
  });

  it("rejects negative quantities", () => {
    expect(NutritionFactsSchema.safeParse({ basis: "per_100g", sugarsG: -1 }).success).toBe(false);
  });

  it("requires a stated basis, so per-100g is never confused with per-100ml", () => {
    expect(NutritionFactsSchema.safeParse({ sugarsG: 5 }).success).toBe(false);
  });
});

describe("UploadSchema", () => {
  it("accepts the image types the pipeline can decode", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp", "image/gif"]) {
      expect(UploadSchema.safeParse({ type, size: 1024 }).success).toBe(true);
    }
  });

  it("rejects non-images and oversized files", () => {
    expect(UploadSchema.safeParse({ type: "application/pdf", size: 1024 }).success).toBe(false);
    expect(UploadSchema.safeParse({ type: "image/png", size: 9_000_000 }).success).toBe(false);
    expect(UploadSchema.safeParse({ type: "image/png", size: 0 }).success).toBe(false);
  });
});

describe("ModelCheckProseSchema", () => {
  const entry = { key: "addedSugars", claim: "Contains added sugar", detail: "34 g per 100 g." };

  it("accepts one rewrite per check", () => {
    expect(ModelCheckProseSchema.safeParse({ checks: Array(4).fill(entry) }).success).toBe(true);
  });

  it("rejects an empty or oversized list", () => {
    expect(ModelCheckProseSchema.safeParse({ checks: [] }).success).toBe(false);
    expect(ModelCheckProseSchema.safeParse({ checks: Array(9).fill(entry) }).success).toBe(false);
  });

  it("rejects prose that runs past the space the UI has", () => {
    expect(
      ModelCheckProseSchema.safeParse({ checks: [{ ...entry, claim: "x".repeat(200) }] }).success,
    ).toBe(false);
  });

  it("has no field for a status or a verdict: the model cannot supply either", () => {
    const parsed = ModelCheckProseSchema.parse({ checks: [entry] });
    expect(Object.keys(parsed)).toEqual(["checks"]);
    expect(Object.keys(parsed.checks[0]).sort()).toEqual(["claim", "detail", "key"]);
  });
});

describe("CheckSchema", () => {
  const base = {
    key: "saturatedFat",
    label: "Saturated fat",
    status: "pass",
    claim: "Low saturated fat",
    detail: "0 g per 100 ml. Low is 0.75 g or less.",
    evidence: { label: "Saturated fat", value: "0 g per 100 ml" },
    source,
  };

  it("accepts a complete check", () => {
    expect(CheckSchema.parse(base).status).toBe("pass");
  });

  it("accepts only the three statuses", () => {
    for (const status of ["pass", "fail", "unknown"]) {
      expect(CheckSchema.safeParse({ ...base, status }).success).toBe(true);
    }
    for (const status of ["partial", "maybe", "ok", true, 1]) {
      expect(CheckSchema.safeParse({ ...base, status }).success).toBe(false);
    }
  });

  it("requires a measured value and a source: no check renders without attribution", () => {
    expect(CheckSchema.safeParse({ ...base, evidence: { label: "x", value: "" } }).success).toBe(false);
    const { source: _omitted, ...noSource } = base;
    expect(CheckSchema.safeParse(noSource).success).toBe(false);
  });
});

describe("VerdictSchema", () => {
  it("accepts exactly the four verdicts", () => {
    for (const v of ["good_choice", "acceptable", "not_recommended", "could_not_verify"]) {
      expect(VerdictSchema.safeParse(v).success).toBe(true);
    }
    expect(VerdictSchema.safeParse("excellent").success).toBe(false);
    expect(VerdictSchema.safeParse("good").success).toBe(false);
  });

  it("rejects a verdict result whose ratios are out of range", () => {
    const base = {
      verdict: "acceptable",
      reason: "4 of 6 checks passed.",
      counts: { applicable: 8, passed: 4, failed: 2, unknown: 2, known: 6 },
      coverage: 0.75,
      passRate: 0.67,
    };
    expect(VerdictResultSchema.safeParse(base).success).toBe(true);
    expect(VerdictResultSchema.safeParse({ ...base, coverage: 1.4 }).success).toBe(false);
    expect(VerdictResultSchema.safeParse({ ...base, passRate: -0.1 }).success).toBe(false);
  });
});

describe("HealthAnalysisResultSchema", () => {
  const base = {
    verdict: {
      verdict: "acceptable",
      reason: "3 of 5 checks passed.",
      counts: { applicable: 8, passed: 3, failed: 2, unknown: 3, known: 5 },
      coverage: 0.63,
      passRate: 0.6,
    },
    checks: [
      {
        key: "addedSugars",
        label: "Added sugar",
        status: "fail",
        claim: "Contains added sugar",
        detail: "Sugar is named in the ingredients.",
        evidence: { label: "Added sugar", value: "34 g per 100 g" },
        source,
      },
    ],
    unknowns: [],
    model: "claude-sonnet-5",
    mode: "live",
  };

  it("accepts a complete analysis", () => {
    expect(HealthAnalysisResultSchema.parse(base).verdict.verdict).toBe("acceptable");
  });

  it("rejects an analysis with no checks at all", () => {
    expect(HealthAnalysisResultSchema.safeParse({ ...base, checks: [] }).success).toBe(false);
  });

  it("has no score field anywhere in the result", () => {
    const parsed = HealthAnalysisResultSchema.parse(base);
    expect(parsed).not.toHaveProperty("score");
    expect(parsed).not.toHaveProperty("band");
  });
});

describe("OffByBarcodeSchema", () => {
  it("tolerates the loose typing the open database actually returns", () => {
    const parsed = OffByBarcodeSchema.parse({
      status: "1",
      product: { code: "123", product_name: "Thing", nutriments: { sugars_100g: "10.6" } },
    });
    expect(parsed.product?.nutriments?.sugars_100g).toBe("10.6");
  });

  it("survives a response with no product at all", () => {
    expect(OffByBarcodeSchema.parse({ status: 0 }).product).toBeUndefined();
  });
});

describe("UserKeySchema", () => {
  it("accepts a uuid and rejects anything that could be smuggled into a query", () => {
    expect(UserKeySchema.safeParse(crypto.randomUUID()).success).toBe(true);
    expect(UserKeySchema.safeParse("../../etc/passwd").success).toBe(false);
    expect(UserKeySchema.safeParse("short").success).toBe(false);
  });
});

describe("parseJsonColumn", () => {
  it("returns null for null, malformed JSON, and JSON of the wrong shape", () => {
    expect(parseJsonColumn(null, SourceRefSchema)).toBeNull();
    expect(parseJsonColumn("{not json", SourceRefSchema)).toBeNull();
    expect(parseJsonColumn('{"nope":1}', SourceRefSchema)).toBeNull();
  });

  it("round-trips a valid column", () => {
    expect(parseJsonColumn(JSON.stringify(source), SourceRefSchema)?.name).toBe("Open Food Facts");
  });
});

describe("ListingSchema", () => {
  const listing = {
    id: "l1",
    retailer: { slug: "noon", name: "Noon", websiteUrl: "https://www.noon.com" },
    priceFils: 250,
    currency: "AED",
    sizeLabel: "330 ml",
    unitPriceFils: 75,
    inStock: true,
    url: "https://www.noon.com/p/x",
    source,
    sourceKind: "HAND_VERIFIED",
    checkedBy: "A. Checker",
    checkedAt: "2026-09-18T00:00:00.000Z",
    ageDays: 1,
    isFresh: true,
    hasPhoto: false,
  };

  it("accepts a complete listing", () => {
    expect(ListingSchema.parse(listing).priceFils).toBe(250);
  });

  it("refuses a source kind outside the enum, so a price cannot claim to be verified", () => {
    expect(ListingSchema.safeParse({ ...listing, sourceKind: "scraped" }).success).toBe(false);
    expect(ListingSchema.safeParse({ ...listing, sourceKind: "" }).success).toBe(false);
  });

  it("requires an author and a date for every price", () => {
    expect(ListingSchema.safeParse({ ...listing, checkedBy: "" }).success).toBe(false);
    expect(ListingSchema.safeParse({ ...listing, checkedAt: "" }).success).toBe(false);
  });

  it("refuses a currency other than AED: this app is UAE-only by design", () => {
    expect(ListingSchema.safeParse({ ...listing, currency: "USD" }).success).toBe(false);
  });

  it("refuses a fractional price, because money is stored in whole fils", () => {
    expect(ListingSchema.safeParse({ ...listing, priceFils: 250.5 }).success).toBe(false);
  });

  it("rejects a listing with no source at all", () => {
    const { source: _omitted, ...noSource } = listing;
    expect(ListingSchema.safeParse(noSource).success).toBe(false);
  });
});
