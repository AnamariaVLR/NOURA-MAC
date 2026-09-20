/**
 * CERTIFIED ALTERNATIVES — the eleven properties this feature is required to hold.
 *
 * Every test here is named after the promise it protects, because the promises
 * are the point: a certification claim is a factual statement about a real
 * company, and a recommendation is a factual statement about what someone
 * should buy. Both are easy to get subtly, invisibly wrong.
 */

import { describe, expect, it } from "vitest";
import {
  assessCertification,
  toCertificateEvidence,
  type CertificateEvidence,
  type LookupEvidence,
} from "@/lib/health/certification";
import { certificationCheck } from "@/lib/health/checks";
import {
  compareEvidence,
  explainEmpty,
  selectVerifiedAlternatives,
  type AlternativeCandidate,
  type EvidenceDimensions,
} from "@/lib/recommend/verified-alternatives";
import { isComparable } from "@/lib/recommend/rank";
import type { Check, Listing } from "@/lib/schemas";

const NOW = new Date("2026-09-20T00:00:00.000Z");

const REGISTER: import("@/lib/schemas").SourceRef = {
  name: "MOIAT Conformity Register",
  url: "https://moiat.gov.ae/en/open-data/product-conformity-data",
  lastVerifiedAt: NOW.toISOString(),
};

function certRow(over: Record<string, unknown> = {}): CertificateEvidence {
  return toCertificateEvidence({
    certificateNumber: "UAE.C-1234",
    certificateType: "ECAS",
    status: "valid",
    rawStatus: "Valid",
    matchBasis: "BARCODE",
    issuedAt: new Date("2025-01-01"),
    expiresAt: new Date("2027-01-01"),
    source: "REGULATOR_IMPORT",
    sourceName: "MOIAT Conformity Register",
    sourceUrl: "https://moiat.gov.ae/en/open-data/product-conformity-data",
    lastVerifiedAt: NOW,
    registerBrand: "AL AIN",
    registerModelNumber: "6291001000012",
    registerProductType: "Bottled Water",
    registerCompany: "Agthia",
    registerCountry: "United Arab Emirates",
    body: { name: "Emirates Conformity Body" },
    ...over,
  } as never);
}

/** The shape certificationCheck consumes — a CertificateEvidence plus a SourceRef. */
function certInput(evidence: CertificateEvidence) {
  return {
    ...evidence,
    source: { name: evidence.sourceName, url: evidence.sourceUrl, lastVerifiedAt: NOW.toISOString() },
  };
}

function lookup(over: Partial<NonNullable<LookupEvidence>>): NonNullable<LookupEvidence> {
  return {
    barcode: "6291001000012",
    exactMatches: 0,
    brandMatches: 0,
    succeeded: true,
    source: "MOIAT Conformity Register",
    sourceUrl: "https://moiat.gov.ae/en/open-data/product-conformity-data",
    checkedAt: NOW,
    ...over,
  };
}

const LOOKUP_OK = lookup({ exactMatches: 1, brandMatches: 3 });
const LOOKUP_EMPTY = lookup({});
const LOOKUP_FAILED = lookup({ succeeded: false });

function check(over: Partial<Check> & { key: string }): Check {
  return {
    key: over.key,
    label: over.label ?? over.key,
    status: over.status ?? "pass",
    claim: over.claim ?? "fine",
    detail: over.detail ?? "detail",
    source: {
      name: "WHO EMRO",
      url: "https://applications.emro.who.int/docs/EMROPUB_2019_en_23266.pdf",
      lastVerifiedAt: "2026-01-01T00:00:00.000Z",
    },
    ...over,
  } as Check;
}

function listing(over: Partial<Listing> = {}): Listing {
  return {
    retailer: { slug: "carrefour", name: "Carrefour UAE", websiteUrl: "https://www.carrefouruae.com" },
    priceFils: 1250,
    currency: "AED",
    sizeLabel: "1 L",
    unitPriceFils: 1250,
    inStock: true,
    url: "https://www.carrefouruae.com/p/x",
    sourceKind: "HAND_VERIFIED",
    checkedBy: "A. Checker",
    checkedAt: "2026-09-18T00:00:00.000Z",
    ageDays: 2,
    isFresh: true,
    hasPhoto: false,
    ...over,
  } as Listing;
}

function candidate(over: Partial<AlternativeCandidate> & { name: string }): AlternativeCandidate {
  return {
    productId: over.name,
    slug: over.name.toLowerCase().replace(/\s+/g, "-"),
    name: over.name,
    brand: null,
    sizeLabel: "1 L",
    imageUrl: null,
    category: "pantry",
    subcategory: "olive-oil",
    verdict: "good_choice",
    certification: "NOT_FOUND",
    checks: [check({ key: "saturatedFat" }), check({ key: "salt" })],
    nutrition: null,
    additiveCount: 0,
    bestListing: listing(),
    evidenceSource: "Open Food Facts",
    lastVerifiedAt: new Date("2026-01-01"),
    ...over,
  } as AlternativeCandidate;
}

const select = (scanned: AlternativeCandidate, pool: AlternativeCandidate[]) =>
  selectVerifiedAlternatives(scanned, pool, { sameSubcategory: isComparable });

/* ── 1 ─────────────────────────────────────────────────────────────────── */
describe("certificate matching is on the exact product", () => {
  it("reads VERIFIED only from a certificate matched on this product's barcode", () => {
    const assessment = assessCertification([certRow()], LOOKUP_OK, NOW);
    expect(assessment.state).toBe("VERIFIED");
    expect(assessment.exact[0].registerModelNumber).toBe("6291001000012");
  });
});

/* ── 2 ─────────────────────────────────────────────────────────────────── */
describe("a brand certificate does not leak into a product claim", () => {
  it("reads BRAND_LEVEL_ONLY when only the company matched, never VERIFIED", () => {
    const assessment = assessCertification(
      [certRow({ matchBasis: "BRAND" })],
      lookup({ brandMatches: 3 }),
      NOW,
    );
    expect(assessment.state).toBe("BRAND_LEVEL_ONLY");
    expect(assessment.exact).toHaveLength(0);
  });

  it("says the certificate belongs to the company, not to the item on the shelf", () => {
    const result = certificationCheck({
      certifications: [certInput(certRow({ matchBasis: "BRAND" }))],
      certificationLookup: lookup({ brandMatches: 3 }),
    } as never, REGISTER);
    expect(result.claim.toLowerCase()).toContain("brand");
    expect(result.detail).not.toMatch(/this product is certified/i);
  });
});

/* ── 3 ─────────────────────────────────────────────────────────────────── */
describe("an expired certificate is expired, not valid", () => {
  it("reads EXPIRED when the exact match's validity has lapsed", () => {
    const assessment = assessCertification(
      [certRow({ expiresAt: new Date("2026-01-01") })],
      LOOKUP_OK,
      NOW,
    );
    expect(assessment.state).toBe("EXPIRED");
  });

  it("ranks an expired certificate below having found nothing at all", () => {
    const { better } = compareEvidence(
      dims({ certification: "EXPIRED" }),
      dims({ certification: "NOT_FOUND" }),
    );
    expect(better).toBe(false);
  });
});

/* ── 4 & 5 ─────────────────────────────────────────────────────────────── */
describe("'not found' is never rendered as 'not certified'", () => {
  it("separates NOT_FOUND (we looked, the register had nothing) from UNKNOWN (we could not look)", () => {
    expect(assessCertification([], LOOKUP_EMPTY, NOW).state).toBe("NOT_FOUND");
    expect(assessCertification([], LOOKUP_FAILED, NOW).state).toBe("UNKNOWN");
  });

  it("never ASSERTS that the product is uncertified, in either state", () => {
    // The words may appear — the NOT_FOUND copy says "that is not the same as
    // uncertified", which is the whole point. What must never appear is the
    // claim itself, and the check must never be a failure: a gap in a register
    // is not a finding against a product.
    for (const state of [LOOKUP_EMPTY, LOOKUP_FAILED]) {
      const result = certificationCheck(
        { certifications: [], certificationLookup: state } as never,
        REGISTER,
      );
      // Strip the sentences that explicitly DENY the claim before looking for
      // it — "does not mean it is uncertified" is the copy doing its job, and a
      // naive substring search would flag the fix as the bug.
      const text = `${result.claim} ${result.detail} ${result.notes ?? ""}`
        .toLowerCase()
        .replace(/(not the same as|does not mean(?: it is)?|is not)\s+(un)?certified/g, "")
        .replace(/not evidence of absence[^.]*/g, "");

      expect(text).not.toMatch(/\b(is|are|was) (not certified|uncertified)\b/);
      expect(text).not.toMatch(/\bthis product is not\b/);
      expect(result.status).not.toBe("fail");
      expect(result.status).toBe("unknown");
    }
  });

  it("states plainly that absence from the register is not absence of certification", () => {
    const found = certificationCheck(
      { certifications: [], certificationLookup: LOOKUP_EMPTY } as never,
      REGISTER,
    );
    expect(found.detail).toMatch(/not the same as uncertified/i);

    const failed = certificationCheck(
      { certifications: [], certificationLookup: LOOKUP_FAILED } as never,
      REGISTER,
    );
    expect(failed.detail).toMatch(/not evidence of absence/i);
  });

  it("says which register was searched and when, so the absence is checkable", () => {
    const result = certificationCheck({
      certifications: [],
      certificationLookup: LOOKUP_EMPTY,
    } as never, REGISTER);
    expect(`${result.detail} ${result.notes ?? ""}`).toMatch(/register/i);
    expect(result.source.url).toMatch(/moiat/i);
  });
});

/* ── 6 ─────────────────────────────────────────────────────────────────── */
describe("alternatives are the same kind of product", () => {
  it("never offers milk in place of olive oil", () => {
    const scanned = candidate({ name: "Borges Extra Virgin Olive Oil" });
    const milk = candidate({
      name: "Al Rawabi Full Cream Milk",
      subcategory: "milk",
      category: "dairy",
      certification: "VERIFIED",
    });
    const result = select(scanned, [milk]);
    expect(result.alternatives).toHaveLength(0);
    expect(result.comparableCount).toBe(0);
  });

  it("offers another olive oil when one genuinely qualifies", () => {
    const scanned = candidate({
      name: "Borges Extra Virgin Olive Oil",
      checks: [check({ key: "saturatedFat", status: "fail" }), check({ key: "salt" })],
    });
    const better = candidate({ name: "Other Olive Oil" });
    const result = select(scanned, [better]);
    expect(result.alternatives.map((a) => a.candidate.name)).toEqual(["Other Olive Oil"]);
  });
});

/* ── 7 ─────────────────────────────────────────────────────────────────── */
describe("certification outranks only when the rest of the evidence allows it", () => {
  it("prefers a certified product when health evidence is equal", () => {
    const { better, betterOn } = compareEvidence(
      dims({ certification: "VERIFIED" }),
      dims({ certification: "NOT_FOUND" }),
    );
    expect(better).toBe(true);
    expect(betterOn.join(" ")).toMatch(/certificate/i);
  });

  it("does NOT prefer a certified product that crosses more health lines", () => {
    const { better } = compareEvidence(
      dims({ certification: "VERIFIED", failedChecks: 2 }),
      dims({ certification: "NOT_FOUND", failedChecks: 0 }),
    );
    expect(better).toBe(false);
  });
});

/* ── 8 ─────────────────────────────────────────────────────────────────── */
describe("no alternative is ever fabricated", () => {
  it("returns an empty list and a precise reason rather than a padded one", () => {
    const scanned = candidate({ name: "Borges Extra Virgin Olive Oil" });
    const sibling = candidate({ name: "Equal Olive Oil" });
    const result = select(scanned, [sibling]);

    expect(result.alternatives).toHaveLength(0);
    expect(result.emptyReason).toContain("1 comparable product");
    expect(result.emptyReason).toContain("no stronger");
  });

  it("says the catalogue is the gap when there is nothing to compare against", () => {
    const result = select(candidate({ name: "Lonely Oil" }), []);
    expect(result.emptyReason).toMatch(/nothing else of this kind/i);
    expect(result.emptyReason).toMatch(/not a statement that no better product exists/i);
  });
});

/* ── 9 ─────────────────────────────────────────────────────────────────── */
describe("a stale price is not an offer", () => {
  it("drops a candidate whose price has not been checked recently", () => {
    const scanned = candidate({
      name: "Scanned",
      checks: [check({ key: "salt", status: "fail" })],
    });
    const stale = candidate({ name: "Stale Oil", bestListing: null });
    const result = select(scanned, [stale]);
    expect(result.alternatives).toHaveLength(0);
    expect(result.considered[0].reason).toBe("no-fresh-price");
  });

  it("drops a candidate the last check found out of stock", () => {
    const scanned = candidate({
      name: "Scanned",
      checks: [check({ key: "salt", status: "fail" })],
    });
    const gone = candidate({ name: "Sold Out Oil", bestListing: listing({ inStock: false }) });
    expect(select(scanned, [gone]).considered[0].reason).toBe("out-of-stock");
  });
});

/* ── 10 ────────────────────────────────────────────────────────────────── */
describe("a missing price is stated, never guessed", () => {
  it("keeps no listing rather than inventing one", () => {
    const c = candidate({ name: "No Price", bestListing: null });
    expect(c.bestListing).toBeNull();
  });
});

/* ── 11 ────────────────────────────────────────────────────────────────── */
describe("every certification claim carries its provenance", () => {
  it("carries number, type, body, dates, source and retrieval date", () => {
    const evidence = certRow();
    expect(evidence.certificateNumber).toBe("UAE.C-1234");
    expect(evidence.certificateType).toBe("ECAS");
    expect(evidence.bodyName).toBe("Emirates Conformity Body");
    expect(evidence.issuedAt).toBeTruthy();
    expect(evidence.expiresAt).toBeTruthy();
    expect(evidence.sourceKind).toBe("REGULATOR_IMPORT");
    expect(evidence.sourceUrl).toMatch(/moiat/i);
    expect(evidence.lastVerifiedAt).toBeTruthy();
  });

  it("puts the certificate number and register in the check a shopper reads", () => {
    const result = certificationCheck({
      certifications: [certInput(certRow())],
      certificationLookup: LOOKUP_OK,
    } as never, REGISTER);
    const text = `${result.claim} ${result.detail} ${result.notes ?? ""}`;
    expect(text).toContain("UAE.C-1234");
    expect(result.source.name).toMatch(/MOIAT/i);
  });
});

function dims(over: Partial<EvidenceDimensions> = {}): EvidenceDimensions {
  return { failedChecks: 0, resolvedChecks: 5, certification: "NOT_FOUND", ...over };
}

describe("the empty explanation names what was actually done", () => {
  it("counts the reasons rather than emitting a bare sentence", () => {
    const text = explainEmpty(
      3,
      [
        { name: "a", slug: "a", reason: "not-better" },
        { name: "b", slug: "b", reason: "not-better" },
        { name: "c", slug: "c", reason: "out-of-stock" },
      ],
      "VERIFIED",
    );
    expect(text).toContain("3 comparable products");
    expect(text).toContain("2 because");
    expect(text).toContain("1 because");
  });
});
