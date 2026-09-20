/**
 * Synthetic data cannot pass as real.
 *
 * The app ships with demo scaffolding — SAMPLE- certificates, sample accreditation
 * bodies — because the real registers are not imported yet. None of it may ever
 * reach a user as verification. These tests hold that line at every place a
 * synthetic row could leak through: the check engine, the freshness rule, and the
 * enum itself.
 */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DataSourceSchema, isVerifiableSource, type NutritionFacts } from "@/lib/schemas";
import { evaluateChecks, type EvidenceInput } from "@/lib/health/checks";
import { evaluateProduct } from "@/lib/health/evaluate";
import { isFreshCheck, stalenessOf } from "@/lib/retail/freshness";

const source = { name: "MOIAT (sample)", url: null, lastVerifiedAt: "2026-01-01T00:00:00.000Z" };

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
    nutrition: nutrition({ sugarsG: 2, saturatedFatG: 1, saltG: 0.2, fibreG: 6, proteinG: 8 }),
    novaGroup: 1,
    additives: [],
    allergens: [],
    ingredientsText: "oats, water, sea salt",
    certifications: [],
    evidenceSource: { name: "Open Food Facts", url: null, lastVerifiedAt: "2026-01-01" },
    ...overrides,
  };
}

const cert = (over: Record<string, unknown> = {}) => ({
  certificateType: "ECAS",
  status: "valid" as const,
  bodyName: "SAMPLE — Food Safety Certification Body",
  certificateNumber: "SAMPLE-ECAS-2025-004112",
  sourceKind: "SYNTHETIC",
  source,
  ...over,
});

const certificationCheck = (over: Partial<EvidenceInput> = {}) =>
  evaluateChecks(input(over)).find((c) => c.key === "certification")!;

describe("isVerifiableSource", () => {
  it("accepts every real source and rejects SYNTHETIC", () => {
    expect(isVerifiableSource("HAND_VERIFIED")).toBe(true);
    expect(isVerifiableSource("REGULATOR_IMPORT")).toBe(true);
    expect(isVerifiableSource("OPEN_DATA")).toBe(true);
    expect(isVerifiableSource("RETAILER_API")).toBe(true);
    expect(isVerifiableSource("SYNTHETIC")).toBe(false);
  });

  it("rejects anything outside the enum, so a typo fails closed", () => {
    for (const bad of ["", "synthetic", "Hand_Verified", "scraped", "trust me"]) {
      expect(isVerifiableSource(bad)).toBe(false);
    }
  });

  it("includes SYNTHETIC in the enum, so the distinction is structural", () => {
    expect(DataSourceSchema.options).toContain("SYNTHETIC");
  });
});

describe("a synthetic certificate never verifies anything", () => {
  it("returns unknown, not a pass, for a valid-looking synthetic certificate", () => {
    expect(certificationCheck({ certifications: [cert()] }).status).toBe("unknown");
  });

  it("returns unknown, not a fail: demo data is not a finding against a product", () => {
    const check = certificationCheck({ certifications: [cert({ status: "expired" })] });
    expect(check.status).toBe("unknown");
  });

  it("does not let a synthetic suspension disqualify a product", () => {
    const check = certificationCheck({ certifications: [cert({ status: "suspended" })] });
    expect(check.status).toBe("unknown");
    expect(check.disqualifying).toBeUndefined();
  });

  it("never names the sample body or certificate number in what the user reads", () => {
    const check = certificationCheck({ certifications: [cert()] });
    const rendered = `${check.claim} ${check.detail} ${check.evidence.value}`;
    expect(rendered).not.toContain("SAMPLE");
  });

  it("still admits that demo rows exist rather than pretending nothing is on file", () => {
    expect(certificationCheck({ certifications: [cert()] }).detail).toMatch(/demo data/i);
  });

  it("uses a real certificate when one is present, ignoring the synthetic ones", () => {
    const check = certificationCheck({
      certifications: [
        cert(),
        cert({
          certificateNumber: "ECAS-REAL-1",
          sourceKind: "REGULATOR_IMPORT",
          bodyName: "A Real Body",
        }),
      ],
    });
    expect(check.status).toBe("pass");
    expect(check.detail).toContain("A Real Body");
    expect(check.detail).not.toContain("SAMPLE");
  });

  it("does not claim a certificate makes a product nutritionally better", () => {
    const check = certificationCheck({
      certifications: [cert({ sourceKind: "REGULATOR_IMPORT", bodyName: "A Real Body" })],
    });
    expect(check.detail).toMatch(/not a statement that the product is nutritionally better/i);
  });
});

describe("synthetic certificates do not move a verdict", () => {
  it("gives the same verdict with and without them", () => {
    const without = evaluateProduct(input({ certifications: [] }));
    const withSynthetic = evaluateProduct({ ...input(), certifications: [cert()] });

    expect(withSynthetic.verdict.verdict).toBe(without.verdict.verdict);
    expect(withSynthetic.verdict.counts).toEqual(without.verdict.counts);
  });

  it("keeps certification out of the known count", () => {
    const evaluation = evaluateProduct({ ...input(), certifications: [cert()] });
    expect(evaluation.checks.find((c) => c.key === "certification")!.status).toBe("unknown");
    expect(evaluation.unknowns.join(" ")).toMatch(/certification/i);
  });
});

describe("a synthetic price is never a price", () => {
  const now = new Date("2026-09-19T12:00:00.000Z");

  it("is never fresh, even when recorded a second ago", () => {
    expect(isFreshCheck({ source: "SYNTHETIC", checkedAt: now }, now)).toBe(false);
  });

  it("is reported as example data rather than as stale", () => {
    // "Stale" would imply it was once a real price.
    expect(stalenessOf({ source: "SYNTHETIC", checkedAt: now }, now)).toBe("not-evidence");
  });
});

describe("the shipped demo data is labelled at both levels", () => {
  it("ships no certificate rows at all — every one now comes from the register", () => {
    // There used to be a file of SAMPLE- prefixed certificates here, labelled
    // honestly but still invented. It is gone: a certificate number is a
    // factual claim about a real company, so the safe number to invent is zero.
    // Certificates now come from the live MOIAT register or they do not exist.
    expect(existsSync("prisma/seed-data/regulator.ts")).toBe(false);

    const seed = readFileSync("prisma/seed.ts", "utf8");
    // The seed reports a count, and that count is hard-coded to nothing.
    expect(seed).toMatch(/summary\.certificates = 0/);
    // It creates no certificate rows, and actively removes any left behind.
    expect(seed).not.toMatch(/certification\.(create|upsert|createMany)/);
    expect(seed).toMatch(/deleteMany/);
  });

  it("relies on the enum rather than the prefix for the actual rule", () => {
    const check = certificationCheck({
      certifications: [cert({ certificateNumber: "ECAS-2025-004112" })],
    });
    expect(check.status).toBe("unknown");
  });
});
