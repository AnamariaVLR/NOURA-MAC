/**
 * Source attribution is the product's central promise: every fact on screen must
 * carry where it came from and when it was last checked. These tests hold the
 * pipeline to it at the points where a fact is manufactured.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { EvidenceInput } from "@/lib/health/checks";
import { evaluateProduct } from "@/lib/health/evaluate";
import { mergeModelProse, productSource, toCertificationEvidence } from "@/lib/pipeline/analyze";
import { ListingSchema, SourceRefSchema, type NutritionFacts } from "@/lib/schemas";
import { MOIAT_SOURCE, CERTIFICATES, isSampleCertificate } from "@/prisma/seed-data/regulator";

const evidenceSource = {
  name: "Open Food Facts",
  url: "https://world.openfoodfacts.org/product/5449000000996",
  lastVerifiedAt: "2026-01-01T00:00:00.000Z",
};

const moiatSource = {
  name: MOIAT_SOURCE.name,
  url: MOIAT_SOURCE.url,
  lastVerifiedAt: "2026-02-01T00:00:00.000Z",
};

function nutrition(overrides: Partial<NutritionFacts> = {}): NutritionFacts {
  return {
    basis: "per_100g",
    energyKcal: null,
    carbohydratesG: null,
    sugarsG: null,
    addedSugarsG: null,
    fatG: null,
    saturatedFatG: null,
    saltG: null,
    fibreG: null,
    proteinG: null,
    ...overrides,
  };
}

function input(overrides: Partial<EvidenceInput> = {}): EvidenceInput {
  return {
    category: "food",
    nutrition: nutrition({ sugarsG: 30, saturatedFatG: 6, saltG: 1.2, fibreG: 0, proteinG: 1 }),
    novaGroup: 4,
    additives: ["E150D"],
    allergens: ["milk"],
    ingredientsText: "sugar, water, milk",
    certifications: [],
    evidenceSource,
    ...overrides,
  };
}

describe("every check carries a source", () => {
  it("attributes each check to a named source with a verification date", () => {
    const cases: EvidenceInput[] = [
      input(),
      input({ nutrition: null, novaGroup: null, ingredientsText: null }),
      input({ category: "cosmetic", nutrition: null }),
      input({
        certifications: [
          {
            certificateType: "ECAS",
            status: "valid",
            bodyName: "A Body",
            certificateNumber: "C1",
            sourceKind: "REGULATOR_IMPORT",
            source: moiatSource,
          },
        ],
      }),
    ];

    for (const c of cases) {
      const result = evaluateProduct(c);
      expect(result.checks.length).toBeGreaterThan(0);
      for (const check of result.checks) {
        expect(SourceRefSchema.safeParse(check.source).success).toBe(true);
        expect(check.source.name.trim().length).toBeGreaterThan(0);
        expect(Number.isNaN(new Date(check.source.lastVerifiedAt).getTime())).toBe(false);
        // A check must also name the value it rests on — including an unknown,
        // which has to say plainly that it is unknown.
        expect(check.evidence.label.trim().length).toBeGreaterThan(0);
        expect(check.evidence.value.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("attributes the certification check to the register, not to the nutrition source", () => {
    const result = evaluateProduct(
      input({
        certifications: [
          {
            certificateType: "Halal",
            status: "valid",
            bodyName: "A Body",
            certificateNumber: "C9",
            sourceKind: "REGULATOR_IMPORT",
            source: moiatSource,
          },
        ],
      }),
    );
    const cert = result.checks.find((c) => c.key === "certification");
    expect(cert).toBeDefined();
    expect(cert!.source.name).toBe(MOIAT_SOURCE.name);
    expect(cert!.source.url).toBe(MOIAT_SOURCE.url);
  });
});

describe("model output cannot strip or rewrite attribution — or a status", () => {
  const result = evaluateProduct(input());

  it("keeps our evidence, status and source when the model rewrites the prose", () => {
    const merged = mergeModelProse(result, {
      checks: result.checks.slice(0, 3).map((c) => ({
        key: c.key,
        claim: "Rewritten claim",
        detail: "Rewritten detail.",
      })),
    });

    expect(merged.used).toBe(true);
    expect(merged.checks[0].claim).toBe("Rewritten claim");
    // Everything that is a fact, rather than a sentence, is unchanged.
    expect(merged.checks[0].status).toEqual(result.checks[0].status);
    expect(merged.checks[0].source).toEqual(result.checks[0].source);
    expect(merged.checks[0].evidence).toEqual(result.checks[0].evidence);
  });

  it("ignores a status the model tries to send back", () => {
    const merged = mergeModelProse(result, {
      checks: result.checks.map((c) => ({
        key: c.key,
        claim: "Rewritten",
        detail: "Rewritten.",
        status: "pass",
      })),
    });
    expect(merged.checks.map((c) => c.status)).toEqual(result.checks.map((c) => c.status));
  });

  it("discards rewrites for keys we never sent", () => {
    const merged = mergeModelProse(result, {
      checks: [
        { key: "invented_key", claim: "Contains a miracle nutrient", detail: "Trust me." },
        { key: "another_invention", claim: "x", detail: "y" },
      ],
    });
    expect(merged.used).toBe(false);
    expect(merged.checks).toEqual(result.checks);
  });

  it("falls back to our own wording when the model returns nonsense", () => {
    for (const bad of [null, undefined, {}, { checks: [] }, { checks: [{ key: "addedSugars" }] }, "text"]) {
      const merged = mergeModelProse(result, bad);
      expect(merged.used).toBe(false);
      expect(merged.checks).toEqual(result.checks);
    }
  });

  it("never lets the model add or drop a check", () => {
    const merged = mergeModelProse(result, {
      checks: [{ key: result.checks[0].key, claim: "a", detail: "b" }],
    });
    expect(merged.checks.map((c) => c.key)).toEqual(result.checks.map((c) => c.key));
  });
});

describe("certificates keep the register's attribution", () => {
  it("carries source name, url and date through to the checker", () => {
    const evidence = toCertificationEvidence([
      {
        id: "c1",
        productId: "p1",
        certificateNumber: "REAL-ECAS-1",
        certificateType: "ECAS",
        status: "valid",
        issuedAt: new Date("2025-01-01"),
        expiresAt: null,
        bodyId: "b1",
        source: "REGULATOR_IMPORT",
        sourceName: MOIAT_SOURCE.name,
        sourceUrl: MOIAT_SOURCE.url,
        lastVerifiedAt: new Date("2026-02-01"),
        body: {
          id: "b1",
          slug: "a-body",
          name: "A Body",
          scope: "Food",
          accreditationNo: "X-1",
          source: "REGULATOR_IMPORT",
          sourceName: "EIAC",
          sourceUrl: "https://eiac.gov.ae",
          lastVerifiedAt: new Date("2026-02-01"),
        },
      },
    ]);

    expect(evidence[0].bodyName).toBe("A Body");
    expect(evidence[0].sourceKind).toBe("REGULATOR_IMPORT");
    expect(SourceRefSchema.safeParse(evidence[0].source).success).toBe(true);
  });

  it("carries the status through unchanged", () => {
    const evidence = toCertificationEvidence([
      {
        id: "c2",
        productId: "p1",
        certificateNumber: "X",
        certificateType: "ECAS",
        status: "expired",
        issuedAt: new Date(),
        expiresAt: null,
        bodyId: null,
        source: "REGULATOR_IMPORT",
        sourceName: "n",
        sourceUrl: "https://x",
        lastVerifiedAt: new Date(),
        body: null,
      },
    ]);
    expect(evidence[0].status).toBe("expired");
  });
});

describe("shipped seed data is labelled honestly", () => {
  it("ships no synthetic prices at all: a price exists only as a recorded check", () => {
    // An earlier version generated 60 rows from a base price and a per-retailer
    // delta. Nothing in the catalogue can produce a price any more.
    const catalogue = readFileSync("prisma/seed-data/catalogue.ts", "utf8");
    expect(catalogue).not.toMatch(/basePriceAed|RETAILER_PRICE_DELTA|priceFils/);
  });

  it("marks every shipped certificate as a sample, so none can pass for a real one", () => {
    expect(CERTIFICATES.length).toBeGreaterThan(0);
    for (const cert of CERTIFICATES) {
      expect(isSampleCertificate(cert.certificateNumber)).toBe(true);
    }
    expect(MOIAT_SOURCE.name).toMatch(/SAMPLE/);
  });
});

describe("listings without attribution are not renderable", () => {
  const base = {
    id: "l1",
    retailer: { slug: "noon", name: "Noon", websiteUrl: "https://www.noon.com" },
    priceFils: 250,
    currency: "AED",
    sizeLabel: "330 ml",
    unitPriceFils: 75,
    inStock: true,
    url: "https://www.noon.com/p/x",
    sourceKind: "HAND_VERIFIED",
    checkedBy: "A. Checker",
    checkedAt: "2026-09-18T00:00:00.000Z",
    ageDays: 1,
    isFresh: true,
    hasPhoto: false,
  };

  it("rejects a listing with no source at all", () => {
    expect(ListingSchema.safeParse(base).success).toBe(false);
  });

  it("rejects a source with an empty name or no verification date", () => {
    expect(
      ListingSchema.safeParse({ ...base, source: { name: "", url: null, lastVerifiedAt: "2026-01-01" } })
        .success,
    ).toBe(false);
    expect(
      ListingSchema.safeParse({ ...base, source: { name: "Checked by A", url: null, lastVerifiedAt: "" } })
        .success,
    ).toBe(false);
  });
});

describe("productSource", () => {
  it("builds a source ref from the product's own columns", () => {
    const ref = productSource({
      evidenceSource: "Open Food Facts",
      evidenceSourceUrl: "https://x",
      lastVerifiedAt: new Date("2026-03-01"),
    } as never);
    expect(SourceRefSchema.safeParse(ref).success).toBe(true);
    expect(ref.name).toBe("Open Food Facts");
  });
});
